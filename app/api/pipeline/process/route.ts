import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

// Schéma de validation strict pour la requête
const ProcessRequestSchema = z.object({
  source_type: z.enum(['upload_gallery', 'external_url']),
  source_url: z.string().optional(),
  storage_path: z.string().optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authentification
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 2. Parsing et validation du body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 }
      );
    }

    const parseResult = ProcessRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { source_type, source_url, storage_path, duration_seconds } = parseResult.data;

    // 3. Vérification des crédits (fonction atomique)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, video_credits_seconds, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profil utilisateur introuvable' },
        { status: 500 }
      );
    }

    // Estimation du coût en secondes (dépend du pipeline réel)
    // Pour MVP: 1 seconde de crédit par seconde de vidéo source
    const estimatedDuration = duration_seconds ?? (source_type === 'upload_gallery' ? 300 : 180);
    const costSeconds = Math.round(estimatedDuration * 1.2); // 20% buffer

    if (profile.video_credits_seconds < costSeconds) {
      return NextResponse.json(
        {
          error: 'Crédits insuffisants',
          required: costSeconds,
          available: profile.video_credits_seconds,
        },
        { status: 402 }
      );
    }

    // 4. Débit atomique des crédits
    const { data: deductResult, error: deductError } = await supabase.rpc('check_and_deduct_credits', {
      p_user_id: user.id,
      p_seconds: costSeconds,
    });

    if (deductError || deductResult === false) {
      return NextResponse.json(
        { error: 'Échec du débit des crédits' },
        { status: 500 }
      );
    }

    // 5. Création du project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        title: source_url ? `Clip from ${new URL(source_url).hostname}` : 'Vidéo uploadée',
        source_type,
        source_url,
        storage_path,
        duration_seconds: estimatedDuration,
        status: 'processing_audio',
      })
      .select()
      .single();

    if (projectError || !project) {
      // Rollback: crédit déjà débité, on ne peut pas annuler facilement ici
      console.error('Project creation error:', projectError);
      return NextResponse.json(
        { error: 'Erreur lors de la création du projet' },
        { status: 500 }
      );
    }

    // 6. Déclenchement du worker (pour MVP, on simule avec un log)
    // Dans la version production, on envoie un message à QStash/Upstash
    console.log(`[Pipeline] Starting processing for project ${project.id}`);
    // Exemple futur:
    // await fetch('https://qstash.upstash.io/v2/queue/...', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` },
    //   body: JSON.stringify({ project_id: project.id }),
    // });

    // 7. Réponse au client
    return NextResponse.json({
      projectId: project.id,
      status: project.status,
      cost_seconds: costSeconds,
      message: 'Projet créé, traitement en cours',
    });
  } catch (error) {
    console.error('[Pipeline/process] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}