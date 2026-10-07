import { NextResponse } from 'next/server';

import { safeUrl } from '@/lib/net/safe-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/brand/find-site?name=…&city=… — Retrouve le site web d'une
 * entreprise à partir de son nom : on teste les adresses les plus probables
 * (nom.fr, nom.com, nom-ville.fr…) et on garde celle dont la page parle
 * vraiment de cette entreprise.
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

const LEGAL = /\b(sarl|sas|sasu|eurl|sa|sci|scop|selarl|selas|snc|ets|etablissements|societe|ste|groupe|holding|france)\b/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function candidates(name: string, city?: string): string[] {
  const base = norm(name).replace(/\(.*?\)/g, ' ').replace(/[&+]/g, ' et ').replace(LEGAL, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = base.split(' ').filter(Boolean);
  if (!words.length) return [];
  const joined = words.join('');
  const dashed = words.join('-');
  const first = words[0];
  const c = city ? norm(city).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
  const stems = [...new Set([joined, dashed, ...(words.length > 2 ? [words.slice(0, 2).join(''), words.slice(0, 2).join('-')] : []), ...(first.length >= 4 ? [first] : []), ...(c ? [`${joined}-${c}`, `${dashed}-${c}`] : [])])].filter((s) => s.length >= 3 && s.length <= 50);
  const out: string[] = [];
  for (const s of stems) for (const tld of ['fr', 'com']) out.push(`${s}.${tld}`);
  return out.slice(0, 14);
}

async function probe(host: string, tokens: string[], city?: string): Promise<{ url: string; score: number } | null> {
  for (const h of [host, `www.${host}`]) {
    const u = await safeUrl(h);
    if (!u) continue;
    try {
      let target: URL | null = u;
      let res: Response | null = null;
      for (let hop = 0; hop < 3 && target; hop++) {
        res = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IziCutBot/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(5000) });
        const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!loc) break;
        target = await safeUrl(new URL(loc, target).toString());
        res = null;
      }
      if (!res?.ok || !target || !(res.headers.get('content-type') ?? '').includes('html')) continue;
      const html = norm((await res.text()).slice(0, 300_000));
      const title = html.match(/<title[^>]*>([^<]*)</)?.[1] ?? '';
      // Pages « domaine à vendre » / parking : on les écarte.
      if (/domaine (a vendre|en vente)|domain (is )?for sale|parked|this domain|godaddy|sedo|hostinger/i.test(title + html.slice(0, 5000))) continue;
      let score = 0;
      for (const t of tokens) {
        if (title.includes(t)) score += 3;
        else if (html.includes(t)) score += 1;
      }
      if (city && html.includes(norm(city))) score += 2;
      if (score >= Math.max(3, tokens.length)) return { url: target.toString(), score };
    } catch {
      /* site muet : candidat suivant */
    }
  }
  return null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const name = (sp.get('name') ?? '').slice(0, 120);
  const city = (sp.get('city') ?? '').slice(0, 80) || undefined;
  if (name.trim().length < 2) return NextResponse.json({ error: 'Nom manquant.' }, { status: 400 });
  const tokens = norm(name).replace(LEGAL, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3).slice(0, 4);
  const list = candidates(name, city);
  const results = (await Promise.all(list.map((h) => probe(h, tokens, city)))).filter((r): r is { url: string; score: number } => Boolean(r));
  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({ url: results[0]?.url ?? null, tried: list.length });
}
