import { NextResponse } from 'next/server';

import { safeUrl } from '@/lib/net/safe-url';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';

/**
 * GET /api/brand/image?url=… — Récupère une image du site du client (logo,
 * visuels) pour l'utiliser dans le Studio. Passer par le serveur évite que le
 * navigateur bloque l'export vidéo (images d'un autre domaine).
 * Images uniquement, 6 Mo maximum, adresses publiques uniquement.
 */
export const runtime = 'nodejs';

const MAX = 12 * 1024 * 1024;

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 });
  const limited = rateLimit(request, 'brand-image', 60, 60000, user.id);
  if (limited) return limited;
  const raw = new URL(request.url).searchParams.get('url') ?? '';
  let target = raw ? await safeUrl(raw) : null;
  if (!target) return NextResponse.json({ error: 'Adresse invalide.' }, { status: 400 });
  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 4 && target; hop++) {
      res = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 izicut/1.0 (+https://izicut.vercel.app)', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(12000) });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!loc) break;
      target = await safeUrl(new URL(loc, target).toString());
      res = null;
    }
    if (!res || !res.ok) return NextResponse.json({ error: 'Image introuvable.' }, { status: 502 });
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpe?g|webp|gif|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)/i.test(type)) return NextResponse.json({ error: 'Ce n’est pas une image.' }, { status: 415 });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX) { await reader.cancel(); return NextResponse.json({ error: 'Image trop lourde.' }, { status: 413 }); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    return new NextResponse(body, { headers: { 'Content-Type': type.split(';')[0], 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  } catch {
    return NextResponse.json({ error: 'Image indisponible.' }, { status: 502 });
  }
}
