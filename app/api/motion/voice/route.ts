import { NextResponse } from 'next/server';
import { z } from 'zod';

import { synthesize } from '@/lib/ai/tts';
import { resolvePlanTier } from '@/lib/entitlements';
import { isAdminEmail } from '@/lib/motion/plan';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/voice — Voix-off de la pub (offres payantes).
 * Chaque réplique est synthétisée séparément pour être calée à la seconde
 * près sur l'animation (et faire baisser la musique pendant qu'elle parle).
 */
export const maxDuration = 60;

const Body = z.object({
  lines: z.array(z.object({ start: z.number().min(0).max(60), text: z.string().trim().min(1).max(220) })).min(1).max(6),
  voice: z.enum(['femme', 'homme']).default('femme'),
  tone: z.string().max(60).optional()
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', user.id).maybeSingle();
  const tier = isAdminEmail(user.email) ? 'agency' : resolvePlanTier(profile?.plan, profile?.subscription_status);
  if (tier === 'free') return NextResponse.json({ error: 'La voix-off intégrée à la vidéo fait partie de l’offre Pro.', code: 'pro' }, { status: 402 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { lines, voice, tone } = parsed.data;
  if (lines.reduce((n, l) => n + l.text.length, 0) > 600) return NextResponse.json({ error: 'Voix-off trop longue (35 à 40 mots pour 15 s).' }, { status: 400 });
  const clips = await Promise.all(
    lines.map(async (l) => {
      const audio = await synthesize(l.text.replace(/\[[^\]]*\]/g, '').trim(), voice, tone);
      return audio ? { start: l.start, data: audio.toString('base64') } : null;
    })
  );
  const ok = clips.filter(Boolean);
  if (!ok.length) return NextResponse.json({ error: 'La synthèse vocale est indisponible pour le moment.' }, { status: 502 });
  return NextResponse.json({ clips: ok, missing: clips.length - ok.length });
}
