/**
 * ============================================================
 * lib/credits.ts — Mouvements de crédits (RPC Postgres)
 * ------------------------------------------------------------
 * Toutes les opérations passent par des fonctions plpgsql
 * SECURITY DEFINER : le solde n'est JAMAIS lu-puis-écrit côté
 * application (course critique = double dépense).
 *
 * Unité : la SECONDE de vidéo source (profiles.video_credits_seconds).
 * Les helpers acceptent des minutes et convertissent, pour rester
 * proches du vocabulaire commercial des plans.
 * ============================================================
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type CreditResult =
  | { ok: true; balance_seconds: number }
  | { ok: false; reason: 'insufficient' | 'error'; error?: string };

export function minutesToSeconds(minutes: number): number {
  return Math.max(0, Math.round(minutes * 60));
}

/**
 * Ajoute des crédits (abonnement, bonus, geste commercial).
 * Appelé par le webhook Stripe avec le client admin.
 */
export async function grantCredits(
  userId: string,
  seconds: number,
  reason = 'subscription'
): Promise<CreditResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_seconds: seconds,
    p_reason: reason
  });

  if (error) return { ok: false, reason: 'error', error: error.message };
  return { ok: true, balance_seconds: data as number };
}

/**
 * Débite atomiquement des crédits. Retourne false si le solde
 * est insuffisant — la décision revient alors à l'appelant.
 */
export async function reserveCredits(
  userId: string,
  seconds: number,
  jobId: string | null = null,
  reason = 'job_dispatch'
): Promise<CreditResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('reserve_credits', {
    p_user_id: userId,
    p_seconds: seconds,
    p_job_id: jobId,
    p_reason: reason
  });

  if (error) return { ok: false, reason: 'error', error: error.message };
  if (data === false) return { ok: false, reason: 'insufficient' };
  return { ok: true, balance_seconds: data as number };
}

/**
 * Rembourse les crédits d'un job terminé en échec. Idempotent :
 * un job déjà remboursé ne l'est pas deux fois.
 */
export async function releaseCreditsForJob(
  jobId: string,
  reason = 'job_failed'
): Promise<CreditResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('release_credits', {
    p_job_id: jobId,
    p_reason: reason
  });

  if (error) return { ok: false, reason: 'error', error: error.message };
  if (data === false) return { ok: false, reason: 'insufficient' };
  return { ok: true, balance_seconds: data as number };
}
