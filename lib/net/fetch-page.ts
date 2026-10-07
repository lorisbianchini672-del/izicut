/**
 * Lecture sécurisée d'une page HTML : redirections revérifiées (anti-SSRF),
 * taille et durée limitées.
 */
import { safeUrl } from './safe-url';

export async function fetchHtml(start: URL, opts: { maxBytes?: number; timeoutMs?: number } = {}): Promise<{ url: URL; html: string } | null> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  let target: URL | null = start;
  let res: Response | null = null;
  for (let hop = 0; hop < 4 && target; hop++) {
    res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IziCutBot/1.0; +https://izicut.vercel.app)', Accept: 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000)
    }).catch(() => null);
    if (!res) return null;
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!loc) break;
    target = await safeUrl(new URL(loc, target).toString());
    res = null;
  }
  if (!res || !target || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
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
      if (size > maxBytes) { await reader.cancel(); break; }
    }
  }
  return { url: target, html };
}

/** Texte lisible d'une page (sans scripts, menus ni pieds de page). */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|div|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
