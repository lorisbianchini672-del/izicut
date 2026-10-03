/**
 * lib/ai/chat.ts — Appel LLM côté serveur (routes API Vercel).
 * Groq en priorité (gratuit, rapide), OpenAI en secours. Réponse JSON.
 * Clés lues dans l'environnement : GROQ_API_KEY ou OPENAI_API_KEY.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("L'IA n'est pas encore configurée sur le serveur (clé GROQ_API_KEY manquante).");
  }
}

type ChatOptions = { system: string; user: string; maxTokens?: number; temperature?: number };

function provider() {
  if (process.env.GROQ_API_KEY) {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b'
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
    };
  }
  return null;
}

export function aiConfigured(): boolean {
  return provider() !== null;
}

/** Extrait le premier objet JSON d'une réponse (tolère du texte autour). */
export function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Réponse de l'IA illisible");
  }
}

export async function chatJson({ system, user, maxTokens = 1500, temperature = 0.7 }: ChatOptions): Promise<unknown> {
  const p = provider();
  if (!p) throw new AiNotConfiguredError();
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: p.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`IA indisponible (HTTP ${res.status}) ${detail.slice(0, 160)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  return parseJsonObject(content);
}
