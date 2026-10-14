/**
 * Photos LIBRES DE DROITS pour les pubs :
 *  - Pexels (si PEXELS_API_KEY) : photos pro, usage commercial libre, sans attribution ;
 *  - sinon Openverse : uniquement CC0 et domaine public (aucune obligation de crédit).
 * On ne cherche jamais la photo d'une personne précise.
 */
export type Hit = { url: string; thumb: string; credit: string; license: string; source: string; width?: number; height?: number };

const cache = new Map<string, { at: number; hits: Hit[] }>();

async function pexels(q: string, key: string, orientation: string): Promise<Hit[]> {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=${orientation}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { photos?: { src: { large2x: string; medium: string }; photographer: string; width: number; height: number }[] };
  return (data.photos ?? []).map((p) => ({ url: p.src.large2x, thumb: p.src.medium, credit: `${p.photographer} / Pexels`, license: 'Licence Pexels', source: 'pexels', width: p.width, height: p.height }));
}

/** Wikimedia : on demande une vignette de 1280 px (les originaux font souvent plus de 10 Mo). */
function lighter(url: string): string {
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/);
  if (!m) return url;
  const name = m[3];
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${name}/1280px-${name}${/\.svg$/i.test(name) ? '.png' : ''}`;
}

async function openverse(q: string): Promise<Hit[]> {
  const photo = !/\b(carte|plan|map|illustration|logo|ic[oô]ne|dessin|drawing|vector)\b/i.test(q);
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=16&mature=false${photo ? '&category=photograph' : ''}`, { headers: { 'User-Agent': 'izicut/1.0 (+https://izicut.vercel.app)' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { url: string; thumbnail?: string; creator?: string; license: string; width?: number; height?: number }[] };
  return (data.results ?? [])
    .filter((r) => /^https:\/\//.test(r.url) && (r.width ?? 1200) >= 800)
    .map((r) => ({ url: lighter(r.url), thumb: r.thumbnail ?? r.url, credit: r.creator ? `${r.creator} (${r.license.toUpperCase()})` : r.license.toUpperCase(), license: r.license.toUpperCase(), source: 'openverse', width: r.width, height: r.height }));
}

export async function searchImages(q: string, orientation = 'portrait'): Promise<Hit[]> {
  const key = `${q.toLowerCase()}|${orientation}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.hits;
  let hits: Hit[] = [];
  try {
    if (process.env.PEXELS_API_KEY) hits = await pexels(q, process.env.PEXELS_API_KEY, orientation);
    if (!hits.length) hits = await openverse(q);
  } catch {
    hits = [];
  }
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return hits;
}
