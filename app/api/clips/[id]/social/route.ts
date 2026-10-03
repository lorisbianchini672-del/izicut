import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/clips/[id]/social — Texte prêt à publier pour un clip :
 * description TikTok/Reels, hashtags et accroches alternatives.
 * Le clip doit appartenir à l'utilisateur (RLS).
 */

const ResultSchema = z.object({
  description: z.string().min(5).max(600),
  hashtags: z.array(z.string().min(2).max(40)).min(3).max(12),
  hooks: z.array(z.string().min(3).max(120)).min(1).max(5)
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant de clip invalide' }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: clip } = await supabase
    .from('clips')
    .select('id, title, hook_text, summary, transcript_json')
    .eq('id', id)
    .maybeSingle();
  if (!clip) return NextResponse.json({ error: 'Clip introuvable' }, { status: 404 });

  const words = Array.isArray(clip.transcript_json) ? (clip.transcript_json as { word?: string }[]) : [];
  const transcript = words.map((w) => w.word ?? '').join(' ').slice(0, 3500);

  try {
    const raw = await chatJson({
      system:
        "Tu es un expert des réseaux sociaux (TikTok, Instagram Reels, YouTube Shorts). Tu écris dans la langue de la transcription (français par défaut), avec un ton naturel et percutant, sans exagération mensongère. Réponds UNIQUEMENT en JSON.",
      user: `Voici un extrait vidéo court.
Titre : ${clip.title ?? ''}
Accroche : ${clip.hook_text ?? ''}
Résumé : ${clip.summary ?? ''}
Transcription : ${transcript}

Rédige :
- "description" : la légende à publier sous la vidéo (2 à 4 phrases courtes, 1 ou 2 emojis maximum, termine par une question ou un appel à l'action),
- "hashtags" : 5 à 8 hashtags pertinents (avec #, mélange de populaires et de niche),
- "hooks" : 3 phrases d'accroche alternatives (moins de 12 mots) à mettre en texte sur la vidéo.
Format : {"description": "...", "hashtags": ["#..."], "hooks": ["..."]}`,
      maxTokens: 900
    });
    const parsed = ResultSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "L'IA a renvoyé un texte incomplet, réessayez." }, { status: 502 });
    }
    const hashtags = parsed.data.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, ''));
    return NextResponse.json({ ...parsed.data, hashtags });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
