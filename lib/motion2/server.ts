/** Outils serveur du moteur pro : GSAP, images libres de droits, vérification d'une composition. */
import { searchImages } from '../media/search';
import { buildCompDocument } from './runtime';
import { compAssetKeys, COMP_SIZE, type Comp } from './types';

let gsapCode: string | null = null;
export async function gsapInline(origin: string): Promise<string> {
  if (gsapCode) return gsapCode;
  const res = await fetch(`${origin}/vendor/gsap.min.js`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('GSAP indisponible');
  gsapCode = await res.text();
  return gsapCode;
}

/** Trouve une vraie photo libre de droits pour chaque repère {{search:…}}. */
export async function resolveSearchAssets(comp: Comp): Promise<Record<string, string>> {
  const orientation = comp.format === '9:16' ? 'portrait' : comp.format === '16:9' ? 'landscape' : 'square';
  const keys = compAssetKeys(comp).filter((k) => k.startsWith('search:')).slice(0, 14);
  const out: Record<string, string> = { ...(comp.assets ?? {}) };
  const used = new Set(Object.values(out));
  await Promise.all(keys.map(async (k) => {
    if (out[k]) return;
    const hits = await searchImages(k.slice(7), orientation).catch(() => []);
    const pick = hits.find((h) => !used.has(h.url)) ?? hits[0];
    if (pick) { out[k] = pick.url; used.add(pick.url); }
  }));
  return out;
}

/** Joue la composition dans un vrai navigateur : renvoie les erreurs éventuelles (vide = OK). */
export async function verifyComp(comp: Comp, origin: string): Promise<string[] | null> {
  try {
    const { openComp } = await import('./chrome');
    const { w, h } = COMP_SIZE[comp.format];
    const html = buildCompDocument(comp, { assets: comp.assets ?? {}, gsap: { inline: await gsapInline(origin) }, mode: 'render' });
    const { page, errors } = await openComp(html, Math.round(w / 4), Math.round(h / 4));
    try {
      if (!errors.length) {
        for (const t of [0.5, comp.duration / 2, comp.duration - 0.3]) await page.evaluate(`window.__izSeek(${t})`);
        const more = (await page.evaluate('window.__izErrors || []')) as string[];
        errors.push(...more);
      }
    } finally { await page.close().catch(() => undefined); }
    return [...new Set(errors)].slice(0, 5);
  } catch {
    return null; // navigateur indisponible : on ne bloque pas
  }
}
