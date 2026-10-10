import { NextResponse } from 'next/server';

import { cleanText, MAX_DOC_CHARS } from '@/lib/motion/docs';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/docs — lit un document d'inspiration (PDF, Word, texte) et
 * renvoie son texte nettoyé (données personnelles masquées). Le fichier est
 * traité en mémoire : il n'est ni enregistré, ni journalisé, ni transmis à une IA ici.
 */
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Connectez-vous pour ajouter des documents.' }, { status: 401 });
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    file = f instanceof File ? f : null;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Fichier trop lourd (8 Mo maximum).' }, { status: 413 });
  const name = file.name.slice(0, 80);
  const ext = name.toLowerCase().split('.').pop() ?? '';
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let text = '';
    if (ext === 'pdf' || file.type === 'application/pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(buf);
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join('\n') : out.text;
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
    } else if (['txt', 'md', 'csv', 'json', 'html', 'htm'].includes(ext) || file.type.startsWith('text/')) {
      text = new TextDecoder().decode(buf);
      if (ext === 'html' || ext === 'htm') text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    } else {
      return NextResponse.json({ error: 'Format non pris en charge (PDF, Word .docx, texte).' }, { status: 415 });
    }
    const clean = cleanText(text);
    if (clean.length < 20) return NextResponse.json({ error: 'Aucun texte lisible dans ce document (scan ou image ?).' }, { status: 422 });
    return NextResponse.json({ name, text: clean, truncated: text.length > MAX_DOC_CHARS });
  } catch {
    return NextResponse.json({ error: 'Impossible de lire ce document.' }, { status: 422 });
  }
}
