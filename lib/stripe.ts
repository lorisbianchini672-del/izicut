/**
 * ============================================================
 * lib/stripe.ts — Client Stripe + résolution des plans
 * ------------------------------------------------------------
 * SERVEUR UNIQUEMENT (clé secrète). Le webhook est la SEULE source
 * de vérité de l'état d'abonnement : le front ne déduit jamais un
 * droit d'un paiement avant confirmation Stripe.
 * ============================================================
 */
import Stripe from 'stripe';
import { PLANS, type PlanKey } from '@/lib/plans';

let stripeClient: Stripe | null = null;

/** Client Stripe singleton (API version épinglée pour la reproductibilité). */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

/** Identifiant de prix Stripe du plan, lu depuis l'environnement. */
export function planPriceId(planKey: PlanKey): string | undefined {
  const envName = PLANS[planKey]?.priceEnv;
  if (!envName) return undefined;
  return process.env[envName];
}

/** Retrouve un plan à partir d'un price_id Stripe. */
export function planFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.priceEnv && process.env[plan.priceEnv] === priceId) {
      return key as PlanKey;
    }
  }
  return null;
}

/** Minutes incluses dans un plan, converties en SECONDES de crédits. */
export function planCreditsSeconds(planKey: PlanKey): number {
  return (PLANS[planKey]?.minutesPerPeriod ?? 0) * 60;
}

/** URL de base de l'application (callbacks Stripe). */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
