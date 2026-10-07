/**
 * Voix-off : synthèse vocale côté serveur.
 *  1. Gemini TTS (même clé GEMINI_API_KEY) — voix naturelles, ton pilotable ;
 *  2. OpenAI TTS en secours si OPENAI_API_KEY est présente.
 * Renvoie un fichier WAV (mono 16 bits) prêt à être décodé par le navigateur.
 */

export type Voice = 'femme' | 'homme';

function wav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const GEMINI_TTS_MODELS = () => [process.env.GEMINI_TTS_MODEL, 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts', 'gemini-2.5-flash-tts'].filter(Boolean) as string[];

async function geminiTts(text: string, voice: Voice, tone: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of GEMINI_TTS_MODELS()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Lis ce texte en français, comme une voix-off de publicité, ton ${tone}, rythme vif, en appuyant sur les mots importants : ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice === 'homme' ? 'Puck' : 'Kore' } } }
        }
      }),
      signal: AbortSignal.timeout(30_000)
    }).catch(() => null);
    if (!res) continue;
    if (!res.ok) {
      console.warn(`[tts] ${model} HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
      continue;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) continue;
    const rate = Number(part.mimeType?.match(/rate=(\d+)/)?.[1]) || 24000;
    return wav(Buffer.from(part.data, 'base64'), rate);
  }
  return null;
}

async function openaiTts(text: string, voice: Voice): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: voice === 'homme' ? 'onyx' : 'nova', input: text, response_format: 'wav', instructions: 'Voix-off publicitaire française, dynamique et confiante.' }),
    signal: AbortSignal.timeout(30_000)
  }).catch(() => null);
  if (!res?.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function synthesize(text: string, voice: Voice = 'femme', tone = 'dynamique et confiant'): Promise<Buffer | null> {
  return (await geminiTts(text, voice, tone)) ?? (await openaiTts(text, voice));
}
