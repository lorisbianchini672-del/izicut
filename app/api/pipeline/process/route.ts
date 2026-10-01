import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createProjectWithJob } from '@/lib/jobs';
import { estimateCostSeconds } from '@/lib/pipeline-cost';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SourceType } from '@/types';

/**
 * ============================================================
 * POST /api/pipeline/process — Dépôt d'une vidéo
 * ------------------------------------------------------------
 * Un seul appel fait trois choses, dans UNE transaction SQL :
 *   1. débite le solde de secondes (atomique, jamais négatif) ;
 *   2. insère le projet (`processing_audio`) ;
 *   3. met en file le job `ingest` que le worker revendiquera, avec le
 *      coût réservé sur le job lui-même (donc remboursable par
 *      `release_credits` si le job échoue définitivement).
 *
 * L'URL signée d'upload n'est pas générée ici : le navigateur dépose
 * directement dans le bucket privé `raw-videos`, la RLS n'autorisant que
 * le dossier de l'utilisateur. Vercel ne voit jamais la vidéo.
 * ============================================================
 */

/** Bornes de sécurité : une durée vient du client, donc elle est arbitraire. */
const MAX_DECLARED_SECONDS = 24 * 60 * 60;

const ProcessRequestSchema = z
  .object({
    source_type: z.enum(['upload_gallery', 'external_url']),
    source_url: z.string().trim().url().max(2048).optional(),
    /** Clé d'objet DANS le bucket `raw-videos` : `<user_id>/<fichier>`. */
    storage_path: z.string().trim().min(3).max(1024).optional(),
    duration_seconds: z.number().int().min(0).max(MAX_DECLARED_SECONDS).optional()
  })
  .superRefine((value, ctx) => {
    if (value.source_type === 'upload_gallery' && !value.storage_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['storage_path'],
        message: 'storage_path est requis pour une vidéo téléversée'
      });
    }
    if (value.source_type === 'external_url' && !value.source_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_url'],
        message: 'source_url est requis pour un lien externe'
      });
    }
  });

/** Titre par défaut : lisible dans le dashboard, jamais vide. */
function buildProjectTitle(sourceType: SourceType, sourceUrl?: string): string {
  if (sourceType !== 'external_url' || !sourceUrl) return 'Vidéo téléversée';
  try {
    return `Clip de ${new URL(sourceUrl).hostname}`;
  } catch {
    return 'Vidéo importée';
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentification : la session Supabase vient des cookies, la RLS
    //    s'applique côté projet. Aucune identité n'est acceptée du corps.
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 2. Corps de requête : refus par défaut de tout champ inattendu.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parsed = ProcessRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { source_type, source_url, storage_path, duration_seconds } = parsed.data;

    // 3. Chemin Storage : premier segment = identifiant de l'utilisateur.
    //    C'est l'exigence de la politique RLS du bucket ; la vérifier ici
    //    évite de créer un projet dont le worker ne saurait pas lire la source.
    if (source_type === 'upload_gallery') {
      const expectedPrefix = `${user.id}/`;
      if (!storage_path?.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'Chemin Storage invalide : il doit commencer par votre identifiant.' },
          { status: 400 }
        );
      }
    }

    // 4. Coût réservé (durée annoncée + marge) — calculé côté serveur.
    const costSeconds = estimateCostSeconds(duration_seconds, source_type);

    // 5. Débit + projet + job, en une transaction.
    const result = await createProjectWithJob({
      userId: user.id,
      title: buildProjectTitle(source_type, source_url),
      sourceType: source_type,
      sourceUrl: source_url ?? null,
      storagePath: storage_path ?? null,
      durationSeconds: duration_seconds ?? null,
      costSeconds
    });

    if (!result.ok) {
      if (result.reason === 'insufficient_credits') {
        return NextResponse.json(
          {
            error: 'Crédits insuffisants',
            required: costSeconds,
            available: result.balanceSeconds
          },
          { status: 402 }
        );
      }
      console.error('[Pipeline/process] Échec du débit ou de la mise en file :', result.error);
      return NextResponse.json(
        { error: 'Impossible de lancer le traitement' },
        { status: 500 }
      );
    }

    // 6. Le worker (service séparé) prend le relais via claim_render_job.
    return NextResponse.json(
      {
        projectId: result.projectId,
        jobId: result.jobId,
        cost_seconds: costSeconds,
        balance_seconds: result.balanceSeconds,
        message: 'Projet créé, traitement en cours'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Pipeline/process] Erreur inattendue :', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
