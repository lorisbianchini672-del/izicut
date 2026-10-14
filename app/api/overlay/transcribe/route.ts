import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';

/**
 * POST /api/overlay/transcribe — transcription mot à mot d'un extrait audio
 * (WAV mono 16 kHz préparé dans le navigateur, quelques Mo au plus).
 * Groq Whisper (gratuit, ne s'entraîne pas sur les données) ; l'audio n'est
 * ni enregistré ni journalisé.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour activer les sous-titres automatiques.' }, { status: 401 });
  const limited = rateLimit(request, 'transcribe', 10, 60000, user.id);
  if (limited) return limited;
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: 'Transcription non configurée.' }, { status: 503 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Audio invalide.' }, { status: 400 });
  }
  const file = form.get('file');
  const offset = Number(form.get('offset') ?? 0) || 0;
  if (!(file instanceof File) || file.size < 1000 || file.size > 4_200_000) return NextResponse.json({ error: 'Extrait audio invalide.' }, { status: 400 });
  const out = new FormData();
  out.append('file', file, 'audio.wav');
  out.append('response_format', 'verbose_json');
  out.append('timestamp_granularities[]', 'word');
  out.append('temperature', '0');
  let last = '';
  for (const model of [process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo', 'whisper-large-v3']) {
    out.set('model', model);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: out, signal: AbortSignal.timeout(50_000) });
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const j = (await res.json()) as { words?: { word: string; start: number; end: number }[]; language?: string };
      const words = (j.words ?? [])
        .filter((w) => typeof w.word === 'string' && /[\p{L}\p{N}]/u.test(w.word) && Number.isFinite(w.start))
        .map((w) => ({ word: w.word.trim(), start: Math.round((w.start + offset) * 100) / 100, end: Math.round((w.end + offset) * 100) / 100 }));
      return NextResponse.json({ words, language: j.language });
    } catch (e) {
      last = (e as Error).message;
    }
  }
  console.warn('[transcribe] échec :', last);
  return NextResponse.json({ error: 'La transcription est momentanément indisponible.' }, { status: 503 });
}
