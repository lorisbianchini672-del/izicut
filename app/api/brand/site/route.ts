import { NextResponse } from 'next/server';

import { fetchHtml, visibleText } from '@/lib/net/fetch-page';
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
export const maxDuration = 30;

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
    const page = await fetchHtml(url);
    if (!page) return NextResponse.json({ error: 'Impossible de lire ce site (page introuvable ou protégée).' }, { status: 502 });
    const html = page.html;
    const res = { url: page.url.toString() };
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
    // Rayon de bordure dominant des boutons / cartes → style d'interface de la marque.
    const radii = [...html.matchAll(/border-radius\s*:\s*([\d.]+)(px|rem|em|%)/gi)].map((m) => (m[2] === '%' ? (Number(m[1]) >= 50 ? 999 : Number(m[1])) : m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const med = radii.length ? radii[Math.floor(radii.length / 2)] : null;
    const radius = med === null ? undefined : med <= 4 ? 'square' : med <= 16 ? 'rounded' : 'pill';
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
    // Visuels : on prend la plus grande version (srcset), on écarte icônes et miniatures,
    // et on explore jusqu'à 4 pages internes (club, équipe, galerie, actualités…).
    const scored = new Map<string, number>();
    const collect = (doc: string, baseUrl: string, bonus = 0) => {
      const absB = (v?: string | null) => { if (!v) return undefined; try { const u = new URL(v.replace(/&amp;/g, '&'), baseUrl); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 400) : undefined; } catch { return undefined; } };
      const ogI = absB(meta(doc, 'og:image'));
      if (ogI) scored.set(ogI, Math.max(scored.get(ogI) ?? 0, 1600 + bonus));
      for (const m of doc.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
        let best: string | undefined;
        let bestW = Number(attr(tag, 'width') ?? 0);
        if (srcset) {
          for (const part of srcset.split(',')) {
            const [u, d] = part.trim().split(/\s+/);
            const w = Number((d ?? '').replace(/w$/, '')) || 0;
            if (u && w >= bestW) { bestW = w; best = u; }
          }
        }
        const src = absB(best ?? attr(tag, 'data-src') ?? attr(tag, 'data-lazy-src') ?? attr(tag, 'src'));
        if (!src || /logo|icon|sprite|pixel|tracking|avatar|emoji|placeholder|\.svg(\?|$)|\.gif(\?|$)/i.test(src)) continue;
        if (bestW && bestW < 400) continue;
        const alt = (attr(tag, 'alt') ?? '').length;
        scored.set(src, Math.max(scored.get(src) ?? 0, (bestW || 800) + (alt ? 120 : 0) + bonus));
      }
      for (const m of doc.matchAll(/background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/gi)) {
        const src = absB(m[1]);
        if (src && !/logo|icon|sprite|\.svg/i.test(src)) scored.set(src, Math.max(scored.get(src) ?? 0, 1200 + bonus));
      }
    };
    collect(html, base, 200);
    // Pages internes intéressantes.
    const host = new URL(base).host;
    const links = [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)]
      .map((m) => ({ href: abs(m[1]), label: m[2].replace(/<[^>]+>/g, ' ').toLowerCase() }))
      .filter((l): l is { href: string; label: string } => Boolean(l.href) && new URL(l.href!).host === host)
      .filter((l) => /club|equipe|équipe|histoire|qui-sommes|a-propos|about|presentation|présentation|galerie|photo|actualit|news|services|offre|produit|cabinet|notre|nos-/i.test(l.href + ' ' + l.label))
      .map((l) => l.href))].slice(0, 4);
    const texts: string[] = [`[Accueil] ${visibleText(html).slice(0, 3500)}`];
    await Promise.all(links.map(async (href) => {
      const u = await safeUrl(href);
      if (!u) return;
      const pg = await fetchHtml(u, { maxBytes: 900_000, timeoutMs: 6000 }).catch(() => null);
      if (!pg) return;
      collect(pg.html, pg.url.toString(), 0);
      texts.push(`[${decode(pg.html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] ?? href)}] ${visibleText(pg.html).slice(0, 2500)}`);
    }));
    const images = [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, 12);
    const text = texts.join('\n\n').slice(0, 9000);
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
        images,
        text,
        radius
      }
    });
  } catch {
    return NextResponse.json({ error: 'Le site ne répond pas. Vérifiez l’adresse.' }, { status: 502 });
  }
}
