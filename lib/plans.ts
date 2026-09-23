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
    features: [
      '30 minutes de vidéo / mois',
      'Découpage IA & Score de viralité',
      'Sous-titres animés mot-à-mot (style Hormozi)',
      'Recadrage automatique 9:16',
      'Export 1080x1920 HD'
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
      'Rendu Remotion prioritaire ultra-rapide',
      'Styles illimités & suppression des silences',
      'Overlay Safe Zones (TikTok, Reels, Shorts)',
      'Détection multi-locuteurs & split-screen',
      'Export HD sans filigrane'
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
      'Traitement parallèle multi-vidéos',
      'Marque blanche & polices personnalisées',
      'Accès API & intégrations webhooks',
      'Collaboration d’équipe (5 sièges)',
      'Support dédié prioritaire 7j/7'
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
