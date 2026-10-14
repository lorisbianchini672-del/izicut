import { NextResponse } from 'next/server';
import { z } from 'zod';

import { openComp } from '@/lib/motion2/chrome';
import { buildCompDocument } from '@/lib/motion2/runtime';
import { gsapInline } from '@/lib/motion2/server';
import { COMP_SIZE, CompSchema, checkComp } from '@/lib/motion2/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion2/frames — enregistre une tranche d'images d'une
 * composition dans un vrai navigateur (rendu identique à l'aperçu).
 * Le navigateur du client assemble ensuite les images en MP4.
 */
export const runtime = 'nodejs';
export const maxDuration = 120;

const BodySchema = z.object({
  comp: CompSchema,
  /** Images du client (data:) et photos trouvées sur le web. */
  assets: z.record(z.string().max(80), z.string().max(2_000_000)).optional(),
  from: z.number().int().min(0).max(3600),
  count: z.number().int().min(1).max(30),
  fps: z.number().int().min(12).max(60),
  /** 1 = 1080p, 0.5 = 540p (aperçu rapide). */
  scale: z.number().min(0.25).max(1).optional()
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour télécharger.' }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
  const { comp, from, count, fps } = parsed.data;
  const bad = checkComp(comp);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const scale = parsed.data.scale ?? 1;
  const { w, h } = COMP_SIZE[comp.format];
  const assets = { ...(comp.assets ?? {}), ...(parsed.data.assets ?? {}) };
  try {
    const html = buildCompDocument(comp, { assets, gsap: { inline: await gsapInline(new URL(request.url).origin) }, mode: 'render' });
    const { page } = await openComp(html, w, h);
    try {
      if (scale !== 1) await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = (from + i) / fps;
        if (t > comp.duration + 0.001) break;
        await page.evaluate(`window.__izSeek(${t.toFixed(4)})`);
        const shot = (await page.screenshot({ type: 'jpeg', quality: 86, encoding: 'base64', clip: { x: 0, y: 0, width: w, height: h } })) as string;
        frames.push(shot);
      }
      return NextResponse.json({ frames });
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (err) {
    console.error('[motion2] rendu :', err);
    return NextResponse.json({ error: 'Le rendu de la vidéo a échoué. Réessayez.' }, { status: 500 });
  }
}
