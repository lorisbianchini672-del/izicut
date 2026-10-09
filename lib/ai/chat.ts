/**
 * lib/ai/chat.ts — Appels IA côté serveur (routes API Vercel).
 *
 * Plusieurs fournisseurs GRATUITS en cascade (même principe que FreeLLMAPI,
 * mais intégré : aucun serveur exposé, clés uniquement dans les variables
 * d'environnement). Si l'un est saturé (429), en panne (5xx) ou trop lent,
 * on passe automatiquement au suivant.
 *   ANTHROPIC_API_KEY  → Claude (Anthropic) : IA principale si la clé est présente (créativité, vision)
 *   GEMINI_API_KEY     → Google Gemini (gratuite, voit les images)
 *   GROQ_API_KEY       → Groq (rapide, secours)
 *   OPENROUTER_API_KEY → OpenRouter (modèles « :free »)
 *   MISTRAL_API_KEY    → Mistral (offre gratuite « Experiment »)
 *   OPENAI_API_KEY     → OpenAI (payant, dernier recours)
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super("L'IA n'est pas encore configurée sur le serveur (aucune clé IA).");
  }
}

type Provider = { name: string; url: string; key: string; model: string; vision?: string; json: boolean; kind?: 'openai' | 'anthropic' };
/** think = budget de réflexion (tokens) : Claude réfléchit en profondeur avant de répondre. */
type ChatOptions = { system: string; user: string; maxTokens?: number; temperature?: number; think?: number };
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

function providers(): Provider[] {
  const list: Provider[] = [];
  const env = process.env;
  if (env.ANTHROPIC_API_KEY) list.push({ name: 'claude', kind: 'anthropic', url: 'https://api.anthropic.com/v1/messages', key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || 'claude-opus-5-5', vision: env.ANTHROPIC_MODEL || 'claude-opus-5-5', json: false });
  if (env.GEMINI_API_KEY) list.push({ name: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: env.GEMINI_API_KEY, model: env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash', vision: env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash', json: true });
  if (env.GROQ_API_KEY) list.push({ name: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY, model: env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b', vision: env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b', json: true });
  if (env.OPENROUTER_API_KEY) list.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_CHAT_MODEL || 'openrouter/free', vision: env.OPENROUTER_VISION_MODEL, json: false });
  if (env.MISTRAL_API_KEY) list.push({ name: 'mistral', url: 'https://api.mistral.ai/v1/chat/completions', key: env.MISTRAL_API_KEY, model: env.MISTRAL_CHAT_MODEL || 'mistral-small-latest', vision: env.MISTRAL_VISION_MODEL || 'mistral-small-latest', json: true });
  if (env.OPENAI_API_KEY) list.push({ name: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: env.OPENAI_API_KEY, model: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', vision: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', json: true });
  return list;
}

export function aiConfigured(): boolean {
  return providers().length > 0;
}

/** Extrait le premier objet JSON d'une réponse (tolère du texte autour). */
export function parseJsonObject(text: string): unknown {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("Réponse de l'IA illisible");
  }
}

/** Claude (API Messages d'Anthropic) : le système est à part, les images en base64. */
async function callAnthropic(p: Provider, model: string, messages: { role: string; content: string | Part[] }[], maxTokens: number, temperature: number, json: boolean, think = 0): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
  const conv = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string'
      ? m.content
      : m.content.map((part) => {
          if (part.type === 'text') return { type: 'text', text: part.text };
          const match = part.image_url.url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
          return match ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } } : { type: 'image', source: { type: 'url', url: part.image_url.url } };
        })
  }));
  const send = (withThinking: boolean) => fetch(p.url, {
    method: 'POST',
    headers: { 'x-api-key': p.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens + (withThinking ? think : 0),
      // Réflexion approfondie : Claude planifie la pub (concept, rythme, calques) avant d'écrire le JSON.
      ...(withThinking ? { thinking: { type: 'enabled', budget_tokens: think } } : { temperature: Math.min(1, temperature) }),
      system: json ? `${system}\n\nRéponds uniquement par l'objet JSON demandé, sans texte autour ni balises de code.` : system || undefined,
      messages: conv
    }),
    signal: AbortSignal.timeout(withThinking ? 240_000 : 110_000)
  });
  let res = await send(think > 0);
  // Modèle sans réflexion étendue : on refait la demande sans elle.
  if (think > 0 && res.status === 400) res = await send(false);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`claude HTTP ${res.status} ${detail.slice(0, 120)}`), { retry: true });
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  if (!text.trim()) throw Object.assign(new Error('claude : réponse vide'), { retry: true });
  return text;
}

async function call(p: Provider, model: string, messages: { role: string; content: string | Part[] }[], maxTokens: number, temperature: number, json: boolean, think = 0): Promise<string> {
  if (p.kind === 'anthropic') return callAnthropic(p, model, messages, maxTokens, temperature, json, think);
  const res = await fetch(p.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      ...(json && p.json ? { response_format: { type: 'json_object' } } : {}),
      messages
    }),
    signal: AbortSignal.timeout(think > 0 ? 120_000 : 40_000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`${p.name} HTTP ${res.status} ${detail.slice(0, 120)}`) as Error & { retry?: boolean };
    // 429 (quota), 5xx (panne), 404/400 sur un modèle retiré : on essaie le suivant.
    err.retry = res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400 || res.status === 413;
    throw err;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) throw Object.assign(new Error(`${p.name} : réponse vide`), { retry: true });
  return content;
}

/** Essaie chaque fournisseur dans l'ordre jusqu'à obtenir une réponse. */
async function cascade(run: (p: Provider) => Promise<string>, filter: (p: Provider) => boolean = () => true): Promise<string> {
  const list = providers().filter(filter);
  if (!list.length) throw new AiNotConfiguredError();
  let last: unknown = null;
  for (const p of list) {
    try {
      return await run(p);
    } catch (err) {
      last = err;
      // Quelle que soit l'erreur (quota, panne, clé invalide…), on passe au suivant.
      console.warn(`[ia] ${p.name} indisponible : ${(err as Error).message}`);
    }
  }
  console.error(`[ia] toutes les IA ont échoué : ${(last as Error)?.message ?? ''}`);
  throw Object.assign(new Error('Notre IA est très demandée en ce moment. Nouvel essai automatique dans quelques secondes…'), { busy: true });
}

export async function chatJson({ system, user, maxTokens = 1500, temperature = 0.7, think = 0 }: ChatOptions): Promise<unknown> {
  const content = await cascade((p) =>
    call(p, p.model, [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature, true, think)
  );
  return parseJsonObject(content);
}

/**
 * Vision : l'IA regarde une ou plusieurs images (data URL JPEG/PNG) et répond
 * en texte. Utilisé par le Montage IA pour « voir » la vidéo avant de monter.
 */
export async function describeImages(images: string[], instruction: string, maxTokens = 700): Promise<string> {
  return cascade(
    (p) => call(p, p.vision!, [{ role: 'user', content: [{ type: 'text', text: instruction }, ...images.slice(0, 3).map((url) => ({ type: 'image_url' as const, image_url: { url } }))] }], maxTokens, 0.3, false),
    (p) => Boolean(p.vision)
  );
}
