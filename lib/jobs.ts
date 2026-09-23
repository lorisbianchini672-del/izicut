/**
 * ============================================================
 * lib/jobs.ts — Mise en file des tâches du worker
 * ------------------------------------------------------------
 * Le front n'exécute JAMAIS de traitement vidéo : il insère une
 * ligne `render_jobs` que le worker (service séparé, hors
 * Vercel — voir docs/ARCHITECTURE.md) revendique via
 * claim_render_job (FOR UPDATE SKIP LOCKED).
 * ============================================================
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { JobKind } from '@/types';

export const JOB_KINDS: JobKind[] = ['ingest', 'transcribe', 'analyze', 'render'];

/** Nombre maximal de tentatives avant abandon définitif. */
export const DEFAULT_MAX_ATTEMPTS = 3;

export type EnqueueJobInput = {
  userId: string;
  kind: JobKind;
  projectId?: string | null;
  clipId?: string | null;
  /** Coût de la tâche, en secondes de vidéo source. */
  costSeconds?: number;
  maxAttempts?: number;
};

/** Insère un job `queued`. Retourne l'identifiant du job créé. */
export async function enqueueJob(input: EnqueueJobInput): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('render_jobs')
    .insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      clip_id: input.clipId ?? null,
      kind: input.kind,
      status: 'queued',
      attempts: 0,
      max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      progress: 0,
      cost_seconds: input.costSeconds ?? 0
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Impossible de mettre le job en file : ${error?.message ?? 'inconnu'}`);
  }

  return data.id as string;
}
