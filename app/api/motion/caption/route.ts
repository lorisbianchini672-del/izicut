import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { MotionProjectSchema } from '@/lib/motion/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/caption — Le texte qui accompagne la pub sur les réseaux :
 * légende, hashtags, 1er commentaire et conseil de publication. Ainsi le
 * client repart avec une publication complète, sans autre outil d'IA.
 */
export const maxDuration = 30;

const BodySchema = z.object({
  project: MotionProjectSchema,
  concept: z.string().max(1500).optional(),
  notes: z.string().max(2000).optional(),
  link: z.string().max(200).optional(),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin']).default('instagram')
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour utiliser l’IA.' }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { project, concept, notes, link, platform } = parsed.data;
  const texts = project.scenes
    .map((s) => ('title' in s ? s.title : 'text' in s ? s.text : 'caption' in s ? s.caption : 'label' in s ? s.label : ''))
    .filter(Boolean)
    .join(' / ')
    .replace(/\*/g, '');
  try {
    const raw = (await chatJson({
      system: `Tu es community manager senior en France. Tu rédiges la publication qui accompagne une pub vidéo sur ${platform}. Français naturel, ton de la marque, émojis avec parcimonie. N'invente aucun fait (prix, promo, chiffre, avis) qui n'est pas dans les informations fournies.
Réponds UNIQUEMENT en JSON : {"caption":"légende de 2 à 4 phrases courtes avec un appel à l'action (et le lien s'il est fourni)","hashtags":["8 à 12 hashtags pertinents, dont 2-3 locaux si une ville est connue, sans #"],"first_comment":"1er commentaire à épingler pour lancer l'engagement (question à la communauté)","tip":"1 conseil concret de publication (moment, format, interaction)"}`,
      user: `Marque : ${project.brand}\nTextes de la vidéo : ${texts}\n${concept ? `Concept : ${concept}\n` : ''}${notes ? `Infos du client : ${notes}\n` : ''}${link ? `Lien : ${link}\n` : ''}`,
      maxTokens: 900,
      temperature: 0.7
    })) as Record<string, unknown>;
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const hashtags = (Array.isArray(raw.hashtags) ? raw.hashtags : [])
      .map((h) => str(h, 40).replace(/^#/, '').replace(/\s+/g, ''))
      .filter(Boolean)
      .slice(0, 12);
    const caption = str(raw.caption, 700);
    if (!caption) return NextResponse.json({ error: "L'IA n'a pas réussi, réessayez." }, { status: 502 });
    return NextResponse.json({ caption, hashtags, first_comment: str(raw.first_comment, 280), tip: str(raw.tip, 280) });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
