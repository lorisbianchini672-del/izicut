import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ENTITLEMENTS,
  PLAN_TIER_LABELS,
  resolvePlanTier,
  sanitizeRenderSettings
} from '@/lib/entitlements';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { wordsInRange } from '@/worker/timestamps';

/**
 * ============================================================
 * POST /api/clips/[id]/render — Enregistrer le montage et relancer le rendu
 * ------------------------------------------------------------
 *  1. Propriété du clip vérifiée via la RLS (client utilisateur).
 *  2. Réglages RABOTÉS selon l'offre effective (lib/entitlements.ts) :
 *     l'interface affiche des cadenas, mais c'est ici que ça se joue.
 *     Le worker rabote une seconde fois au rendu (défense en profondeur).
 *  3. Clip mis à jour + job `render` mis en file, par le client admin :
 *     la RLS interdit au client d'insérer lui-même un job.
 *
 * Un nouveau rendu ne consomme pas de minutes : elles ont été débitées
 * au dépôt de la vidéo. Il est limité en Free (maxRendersPerClip).
 * ============================================================
 */

const MIN_CLIP_SECONDS = 5;
const MAX_CLIP_SECONDS = 90;

const WordSchema = z.object({
  word: z.string().trim().min(1).max(60),
  start: z.number().min(0).max(MAX_CLIP_SECONDS + 5),
  end: z.number().min(0).max(MAX_CLIP_SECONDS + 5)
});

const BodySchema = z
  .object({
    settings: z.record(z.unknown()),
    start_time: z.number().min(0).max(24 * 60 * 60).optional(),
    end_time: z.number().min(0).max(24 * 60 * 60).optional(),
    words: z.array(WordSchema).max(3000).optional(),
    title: z.string().trim().min(1).max(80).optional()
  })
  .strict();

type ClipRow = {
  id: string;
  project_id: string;
  start_time: number;
  end_time: number;
  status: string;
  projects: { user_id: string; duration_seconds: number | null } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Identifiant de clip invalide' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // 1. Clip + projet, lus AVEC l'identité de l'utilisateur : la RLS ne
    //    renvoie rien si le clip ne lui appartient pas.
    const { data: clipData, error: clipError } = await supabase
      .from('clips')
      .select('id, project_id, start_time, end_time, status, projects ( user_id, duration_seconds )')
      .eq('id', id)
      .maybeSingle();
    const clip = clipData as unknown as ClipRow | null;
    if (clipError || !clip || clip.projects?.user_id !== user.id) {
      return NextResponse.json({ error: 'Clip introuvable' }, { status: 404 });
    }
    if (clip.status === 'queued' || clip.status === 'rendering') {
      return NextResponse.json(
        { error: 'Un rendu est déjà en cours pour ce clip. Réessayez dans un instant.' },
        { status: 409 }
      );
    }

    // 2. Offre effective et rabotage des réglages.
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, subscription_status')
      .eq('id', user.id)
      .maybeSingle();
    const tier = resolvePlanTier(profile?.plan, profile?.subscription_status);
    const { settings, removed } = sanitizeRenderSettings(input.settings, tier);

    const admin = createAdminClient();

    const maxRenders = ENTITLEMENTS[tier].maxRendersPerClip;
    if (maxRenders !== null) {
      const { count } = await admin
        .from('render_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('clip_id', id)
        .eq('kind', 'render');
      if ((count ?? 0) >= maxRenders) {
        return NextResponse.json(
          {
            error: `L'offre ${PLAN_TIER_LABELS[tier]} permet ${maxRenders} rendus par clip. Passez en Pro pour des rendus illimités.`,
            upgrade: true
          },
          { status: 403 }
        );
      }
    }

    // 3. Bornes : contrôlées côté serveur (durée de la source, min/max).
    const start = round2(input.start_time ?? clip.start_time);
    const end = round2(input.end_time ?? clip.end_time);
    const sourceDuration = clip.projects?.duration_seconds ?? null;
    const length = end - start;
    if (
      !(end > start) ||
      length < MIN_CLIP_SECONDS ||
      length > MAX_CLIP_SECONDS ||
      (sourceDuration !== null && end > sourceDuration + 0.5)
    ) {
      return NextResponse.json(
        { error: `Le clip doit durer entre ${MIN_CLIP_SECONDS} et ${MAX_CLIP_SECONDS} secondes, dans la vidéo source.` },
        { status: 400 }
      );
    }
    const boundsChanged =
      Math.abs(start - clip.start_time) > 0.01 || Math.abs(end - clip.end_time) > 0.01;

    // 4. Sous-titres : bornes modifiées → mots recalculés depuis la
    //    transcription (les corrections faites sur l'ancien découpage ne
    //    correspondent plus) ; sinon corrections de l'éditeur, bornées.
    let words: { word: string; start: number; end: number }[] | null = null;
    if (boundsChanged) {
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('words')
        .eq('project_id', clip.project_id)
        .maybeSingle();
      words = wordsInRange(transcript?.words ?? [], start, end);
    } else if (input.words) {
      words = input.words
        .filter((w) => w.start < length)
        .map((w) => ({
          word: w.word,
          start: round2(w.start),
          end: round2(Math.min(length, Math.max(w.end, w.start + 0.05)))
        }))
        .sort((a, b) => a.start - b.start);
    }

    const { error: updateError } = await admin
      .from('clips')
      .update({
        style_config: settings,
        start_time: start,
        end_time: end,
        status: 'queued',
        ...(input.title ? { title: input.title } : {}),
        ...(words ? { transcript_json: { words } } : {})
      })
      .eq('id', id);
    if (updateError) {
      console.error('[clips/render] mise à jour du clip :', updateError);
      return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 });
    }

    const { error: jobError } = await admin.from('render_jobs').insert({
      user_id: user.id,
      project_id: clip.project_id,
      clip_id: id,
      kind: 'render',
      status: 'queued',
      attempts: 0,
      max_attempts: 2,
      progress: 0,
      cost_seconds: 0
    });
    if (jobError) {
      console.error('[clips/render] mise en file :', jobError);
      await admin.from('clips').update({ status: 'failed' }).eq('id', id);
      return NextResponse.json({ error: 'Impossible de lancer le rendu' }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, tier, settings, removed, boundsChanged },
      { status: 202 }
    );
  } catch (error) {
    console.error('[clips/render] Erreur inattendue :', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
