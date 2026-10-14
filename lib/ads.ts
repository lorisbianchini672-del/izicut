/**
 * Suivi des publicités (TikTok, Meta / Instagram) : sert à savoir quelles pubs
 * amènent des inscriptions et des abonnements, et à optimiser les campagnes.
 * Ne fait rien tant que les identifiants de pixel ne sont pas configurés
 * (NEXT_PUBLIC_TIKTOK_PIXEL_ID, NEXT_PUBLIC_META_PIXEL_ID dans Vercel).
 */
export type AdEvent = 'ViewContent' | 'Lead' | 'CompleteRegistration' | 'InitiateCheckout' | 'Purchase';

type W = typeof window & { ttq?: { track: (e: string, d?: Record<string, unknown>) => void }; fbq?: (...a: unknown[]) => void };

const TT: Record<AdEvent, string> = { ViewContent: 'ViewContent', Lead: 'SubmitForm', CompleteRegistration: 'CompleteRegistration', InitiateCheckout: 'InitiateCheckout', Purchase: 'CompletePayment' };

export function trackAd(event: AdEvent, data: { value?: number; currency?: string; content_name?: string } = {}) {
  if (typeof window === 'undefined') return;
  const w = window as W;
  try { w.ttq?.track(TT[event], data); } catch { /* pixel indisponible */ }
  try { w.fbq?.('track', event, data); } catch { /* pixel indisponible */ }
}
