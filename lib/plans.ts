/**
 * ============================================================
 * lib/plans.ts — Offres commerciales Free, Pro & Agency
 * ============================================================
 */

export type PlanKey = 'free' | 'pro' | 'agency' | 'creator' | 'studio';

export type Plan = {
  key: PlanKey;
  name: string;
  amount: number; // en centimes (1900 = 19,00 €)
  minutesPerPeriod: number;
  description: string;
  free: boolean;
  priceEnv: string | null;
  features: string[];
};

export const DEFAULT_PLAN: PlanKey = 'free';
export const FREE_TRIAL_MINUTES = 30;

export const PLANS: Record<string, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    amount: 0,
    minutesPerPeriod: 30,
    description: 'Parfait pour tester sur vos premières vidéos',
    free: true,
    priceEnv: null,
    // Chaque ligne correspond à un droit réel de lib/entitlements.ts.
    features: [
      '30 minutes de vidéo / mois',
      'Jusqu’à 3 clips IA par vidéo, calés sur les phrases',
      'Sous-titres animés mot-à-mot (2 styles)',
      'Recadrage 9:16 & volume normalisé',
      'Export HD 1080×1920 avec filigrane IziCut'
    ]
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    amount: 1900,
    minutesPerPeriod: 150,
    description: 'Pour les créateurs réguliers (TikTok, Reels, Shorts)',
    free: false,
    priceEnv: 'STRIPE_PRICE_PRO',
    features: [
      '150 minutes de vidéo / mois',
      'Jusqu’à 6 clips IA par vidéo',
      'Suppression automatique des silences',
      'Zooms dynamiques & titre d’accroche animé',
      '6 styles de sous-titres + couleurs libres',
      'Fond flou, recadrage manuel & barre de progression',
      'Audio studio (débruitage, compression voix)',
      '60 fps, qualité maximale, sans filigrane, rendus illimités'
    ]
  },
  agency: {
    key: 'agency',
    name: 'Agency',
    amount: 5900,
    minutesPerPeriod: 600,
    description: 'Pour les équipes, agences et podcasteurs',
    free: false,
    priceEnv: 'STRIPE_PRICE_AGENCY',
    features: [
      '600 minutes de vidéo / mois',
      'Jusqu’à 10 clips IA par vidéo',
      'Toutes les fonctions Pro incluses',
      'Votre marque (@pseudo, nom) incrustée sur chaque vidéo',
      'Support dédié prioritaire'
    ]
  }
};

export const DISPLAY_PLAN_KEYS: ('free' | 'pro' | 'agency')[] = ['free', 'pro', 'agency'];

export function formatPrice(amountInCents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(amountInCents / 100);
}
