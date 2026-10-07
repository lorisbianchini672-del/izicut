import { NextResponse } from 'next/server';

import { safeUrl } from '@/lib/net/safe-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/brand/site?url=… — « ADN visuel » du site du client : titre,
 * description, couleurs dominantes, polices, image de partage. L'IA s'en sert
 * pour que la pub reprenne fidèlement la charte du site.
 * Sécurité : http(s) uniquement, adresses privées / locales refusées, page
 * limitée à 1,5 Mo et 8 s.
 */
export const runtime = 'nodejs';

const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']{1,400})["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1];

function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function colorsOf(text: string): string[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // On écarte les gris (peu révélateurs de la marque), on garde noir et blanc à part.
    if (max - min < 18 && max > 30 && max < 235) continue;
    counts.set(`#${h}`, (counts.get(`#${h}`) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour analyser votre site.' }, { status: 401 });
  const raw = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  let url = raw ? await safeUrl(raw) : null;
  // « monsite.fr » introuvable : on essaie « www.monsite.fr ».
  if (!url && raw && !/^(https?:\/\/)?www\./i.test(raw)) url = await safeUrl(`www.${raw.replace(/^https?:\/\//i, '')}`);
  if (!url) return NextResponse.json({ error: 'Site introuvable : vérifiez l’adresse (ex. monsite.fr).' }, { status: 400 });
  try {
    // Redirections suivies à la main : chaque étape est revérifiée (pas d'adresse interne).
    let target: URL | null = url;
    let res: Response | null = null;
    for (let hop = 0; hop < 4 && target; hop++) {
      res = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IziCutBot/1.0; +https://izicut.vercel.app)', Accept: 'text/html' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000)
      });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!loc) break;
      target = await safeUrl(new URL(loc, target).toString());
      if (!target) return NextResponse.json({ error: 'Ce site redirige vers une adresse non autorisée.' }, { status: 400 });
      res = null;
    }
    if (!res) return NextResponse.json({ error: 'Trop de redirections.' }, { status: 502 });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
      return NextResponse.json({ error: 'Impossible de lire ce site (page introuvable ou protégée).' }, { status: 502 });
    }
    // Lecture limitée à 1,5 Mo.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        html += dec.decode(value, { stream: true });
        if (size > 1_500_000) { await reader.cancel(); break; }
      }
    }
    const title = decode(html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? meta(html, 'og:title') ?? '');
    const description = decode(meta(html, 'description') ?? meta(html, 'og:description') ?? '').slice(0, 300);
    const themeColor = meta(html, 'theme-color');
    const image = meta(html, 'og:image');
    const fonts = [
      ...new Set(
        [...html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&:]+)/gi)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' '))
          .concat([...html.matchAll(/font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 -]{2,40})["']?/gi)].map((m) => m[1].trim()))
          .filter((f) => !/^(inherit|initial|sans-serif|serif|monospace|system-ui|var|-apple-system)$/i.test(f))
      )
    ].slice(0, 4);
    const colors = colorsOf(html);
    // Logo et visuels du site (utilisables seulement par le titulaire de la marque).
    const base = res.url || url.toString();
    const abs = (v?: string | null) => { if (!v) return undefined; try { const u = new URL(v.replace(/&amp;/g, '&'), base); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 400) : undefined; } catch { return undefined; } };
    const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
    const logoCandidates: string[] = [];
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      if (/logo/i.test(`${attr(tag, 'class') ?? ''} ${attr(tag, 'alt') ?? ''} ${attr(tag, 'src') ?? ''} ${attr(tag, 'id') ?? ''}`)) {
        const src = abs(attr(tag, 'src'));
        if (src) logoCandidates.push(src);
      }
    }
    for (const m of html.matchAll(/<link\b[^>]*rel=["'][^"']*(apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) {
      const href = abs(attr(m[0], 'href'));
      if (href) logoCandidates.push(href);
    }
    const images: string[] = [];
    const og = abs(image);
    if (og) images.push(og);
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = abs(attr(tag, 'src') ?? attr(tag, 'data-src'));
      if (!src || /logo|icon|sprite|pixel|tracking|\.svg(\?|$)/i.test(src)) continue;
      const w = Number(attr(tag, 'width') ?? 0);
      if (w && w < 300) continue;
      if (!images.includes(src)) images.push(src);
      if (images.length >= 8) break;
    }
    if (themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) && !colors.includes(themeColor.toLowerCase())) colors.unshift(themeColor.toLowerCase());
    return NextResponse.json({
      site: {
        url: url.toString().slice(0, 200),
        title: title.slice(0, 120),
        description,
        colors: colors.slice(0, 6),
        fonts,
        image: image && /^https?:\/\//.test(image) ? image.slice(0, 300) : undefined,
        logo: [...new Set(logoCandidates)][0],
        images: images.slice(0, 8)
      }
    });
  } catch {
    return NextResponse.json({ error: 'Le site ne répond pas. Vérifiez l’adresse.' }, { status: 502 });
  }
}
