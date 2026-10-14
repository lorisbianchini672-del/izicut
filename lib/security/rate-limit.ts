/**
 * Limiteur de débit (anti-abus) : fenêtre glissante en mémoire, par instance.
 * Il freine les robots qui martèlent les routes coûteuses (IA, rendu vidéo,
 * paiement). Sur Vercel chaque instance a sa propre mémoire : c'est une
 * barrière de premier niveau, suffisante contre le martèlement simple.
 */
import { NextResponse } from 'next/server';

type Bucket = { hits: number[] };
const store = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (!b.hits.length || now - b.hits[b.hits.length - 1] > windowMs * 2) store.delete(k);
  if (store.size > 50_000) store.clear();
}

/** Adresse IP du visiteur (Vercel renseigne x-forwarded-for / x-real-ip). */
export function clientIp(request: Request): string {
  const h = request.headers;
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (fwd || h.get('x-real-ip') || 'inconnue').slice(0, 64);
}

/** true si l'appel est autorisé, false s'il dépasse `max` appels sur `windowMs`. */
export function allow(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now, windowMs);
  const b = store.get(key) ?? { hits: [] };
  while (b.hits.length && now - b.hits[0] > windowMs) b.hits.shift();
  if (b.hits.length >= max) {
    store.set(key, b);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - b.hits[0])) / 1000)) };
  }
  b.hits.push(now);
  store.set(key, b);
  return { ok: true, retryAfter: 0 };
}

/**
 * Renvoie une réponse 429 prête à retourner si la limite est dépassée, sinon null.
 * `who` : identifiant utilisateur si connecté (sinon l'IP est utilisée).
 */
export function rateLimit(request: Request, name: string, max: number, windowMs: number, who?: string | null): NextResponse | null {
  const key = `${name}:${who ? `u:${who}` : `ip:${clientIp(request)}`}`;
  const r = allow(key, max, windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: 'Trop de demandes d’un coup. Patientez quelques secondes puis réessayez.', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfter) } }
  );
}
