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
import type { JobKind, SourceType } from '@/types';

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

export type CreateProjectWithJobInput = {
  userId: string;
  title: string;
  sourceType: SourceType;
  /** Obligatoire pour `external_url`. */
  sourceUrl?: string | null;
  /** Obligatoire pour `upload_gallery` : clé d'objet dans le bucket `raw-videos`. */
  storagePath?: string | null;
  durationSeconds?: number | null;
  /** Coût réservé sur le solde, en secondes (porté par le job → remboursable). */
  costSeconds: number;
  kind?: JobKind;
  maxAttempts?: number;
};

export type CreateProjectWithJobResult =
  | { ok: true; projectId: string; jobId: string; balanceSeconds: number }
  | { ok: false; reason: 'insufficient_credits'; balanceSeconds: number }
  | { ok: false; reason: 'error'; error: string };

/**
 * Crée le projet ET son job en file dans LA MÊME transaction que le débit
 * des crédits (RPC `create_project_with_job`, supabase/schema.sql).
 *
 * Pourquoi une seule RPC : deux transactions distinctes (débit puis
 * insertion) laisseraient un solde débité sans job si la seconde échouait,
 * et sans remboursement possible — `release_credits` rembourse à partir de
 * `render_jobs.cost_seconds`. Ici, soit tout est écrit, soit rien.
 *
 * Réservé au serveur : la RPC est révoquée pour `anon` et `authenticated`.
 */
export async function createProjectWithJob(
  input: CreateProjectWithJobInput
): Promise<CreateProjectWithJobResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('create_project_with_job', {
    p_user_id: input.userId,
    p_title: input.title,
    p_source_type: input.sourceType,
    p_source_url: input.sourceUrl ?? null,
    p_storage_path: input.storagePath ?? null,
    p_duration_seconds: input.durationSeconds ?? null,
    p_cost_seconds: input.costSeconds,
    p_kind: input.kind ?? 'ingest',
    p_max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  });

  if (error) {
    return { ok: false, reason: 'error', error: error.message };
  }

  // La RPC renvoie un jsonb : on en vérifie la forme plutôt que de faire
  // confiance à un cast (une évolution du SQL ne doit pas casser en silence).
  const result = data as Record<string, unknown> | null;

  if (!result || result.ok === false) {
    if (result?.reason === 'insufficient_credits') {
      return {
        ok: false,
        reason: 'insufficient_credits',
        balanceSeconds: Number(result.balance_seconds ?? 0)
      };
    }
    return { ok: false, reason: 'error', error: 'Réponse inattendue du débit de crédits' };
  }

  if (typeof result.project_id !== 'string' || typeof result.job_id !== 'string') {
    return { ok: false, reason: 'error', error: 'Identifiants manquants dans la réponse' };
  }

  return {
    ok: true,
    projectId: result.project_id,
    jobId: result.job_id,
    balanceSeconds: Number(result.balance_seconds ?? 0)
  };
}

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
