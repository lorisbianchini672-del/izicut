import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/media/search?q=… — Photo LIBRE DE DROITS pour une pub.
 *  - Pexels (si PEXELS_API_KEY) : photos pro, usage commercial libre, sans attribution ;
 *  - sinon Openverse : uniquement CC0 et domaine public (aucune obligation de crédit).
 * On ne cherche jamais de photo d'une personne précise : ces images servent
 * aux objets, lieux, ambiances et textures.
 */
export const runtime = 'nodejs';

type Hit = { url: string; thumb: string; credit: string; license: string; source: string; width?: number; height?: number };

const cache = new Map<string, { at: number; hits: Hit[] }>();

async function pexels(q: string, key: string, orientation: string): Promise<Hit[]> {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=8&orientation=${orientation}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { photos?: { src: { large2x: string; medium: string }; photographer: string; width: number; height: number }[] };
  return (data.photos ?? []).map((p) => ({ url: p.src.large2x, thumb: p.src.medium, credit: `${p.photographer} / Pexels`, license: 'Licence Pexels', source: 'pexels', width: p.width, height: p.height }));
}

async function openverse(q: string): Promise<Hit[]> {
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=12&mature=false`, { headers: { 'User-Agent': 'IziCut/1.0 (+https://izicut.vercel.app)' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { url: string; thumbnail?: string; creator?: string; license: string; width?: number; height?: number }[] };
  return (data.results ?? [])
    .filter((r) => /^https:\/\//.test(r.url) && (r.width ?? 1200) >= 800)
    .map((r) => ({ url: r.url, thumb: r.thumbnail ?? r.url, credit: r.creator ? `${r.creator} (${r.license.toUpperCase()})` : r.license.toUpperCase(), license: r.license.toUpperCase(), source: 'openverse', width: r.width, height: r.height }));
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').replace(/[^\p{L}\p{N} '’-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const orientation = ['portrait', 'landscape', 'square'].includes(params.get('o') ?? '') ? (params.get('o') as string) : 'portrait';
  if (q.length < 2) return NextResponse.json({ error: 'Recherche trop courte.' }, { status: 400 });
  const key = `${q.toLowerCase()}|${orientation}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return NextResponse.json({ hits: hit.hits });
  let hits: Hit[] = [];
  try {
    if (process.env.PEXELS_API_KEY) hits = await pexels(q, process.env.PEXELS_API_KEY, orientation);
    if (!hits.length) hits = await openverse(q);
  } catch {
    hits = [];
  }
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return NextResponse.json({ hits }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
