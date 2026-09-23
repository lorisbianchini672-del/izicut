/**
 * lib/ai/prompts.ts — Prompting LLM + parsing Zod strict
 * -----------------------------------------------------
 * Enveloppe autour des appels OpenAI/LLM qui :
 *   1. Construit le prompt system + user avec le transcript
 *   2. Appelle l'API LLM (GPT-4o-mini par défaut)
 *   3. Parse la réponse avec Zod pour garantir du JSON valide
 *   4. Retourne les découpages virals avec scores et justifications
 */

import { z } from 'zod';
import OpenAI from 'openai';

// ---------- Schémas Zod ----------

export const ViralClipSchema = z.object({
  start_time: z.number().min(0).max(9999),
  end_time: z.number().min(0).max(9999),
  virality_score: z.number().int().min(1).max(100),
  hook_text: z.string().min(10).max(200),
  summary: z.string().min(20).max(500),
  tags: z.array(z.string()).min(1).max(10),
  justification: z.string().min(30).max(300),
});

export type ViralClip = z.infer<typeof ViralClipSchema>;

// ─────────────────────────────────────────────────────────────
// PILIER 1 — Schémas enrichis (Opus Pro benchmark)
// ─────────────────────────────────────────────────────────────

/** Structure narrative détectée (Hook / Value / CTA) */
export const NarrativeStructureSchema = z.object({
  hook: z
    .object({
      start_time: z.number().min(0),
      end_time: z.number().min(0),
      summary: z.string().min(10).max(100),
      why_effective: z.string().min(20).max(200),
    })
    .optional(),
  value: z
    .object({
      start_time: z.number().min(0),
      end_time: z.number().min(0),
      summary: z.string().min(10).max(100),
      elements: z.array(z.string()).min(1).max(5), // humor, insight, surprise, emotion...
    })
    .optional(),
  cta: z
    .object({
      start_time: z.number().min(0),
      end_time: z.number().min(0),
      text: z.string().min(5).max(100),
      type: z.enum(['question', 'instruction', 'engagement', 'purchase', 'none']).default('none'),
    })
    .optional(),
});

export type NarrativeStructure = z.infer<typeof NarrativeStructureSchema>;

/** 6 critères de scoring pour l'explainability du virality_score */
export const ViralityCriteriaSchema = z.object({
  hook_strength: z.number().min(0).max(100),
  emotional_resonance: z.number().min(0).max(100),
  information_density: z.number().min(0).max(100),
  shareability: z.number().min(0).max(100),
  originality: z.number().min(0).max(100),
  pacing: z.number().min(0).max(100),
});

export type ViralityCriteria = z.infer<typeof ViralityCriteriaSchema>;

/** Clip enrichi (PILIER 1) */
export const ViralClipEnrichedSchema = z.object({
  start_time: z.number().min(0).max(9999),
  end_time: z.number().min(0).max(9999),
  duration_seconds: z.number().min(1).max(300),
  virality_score: z.number().int().min(0).max(99),
  virality_criteria: ViralityCriteriaSchema,
  narrative: NarrativeStructureSchema,
  hook_text: z.string().min(10).max(200),
  title: z.string().min(20).max(80), // titre prêt à publier
  description: z.string().min(30).max(250), // description prête à publier
  hashtags: z.array(z.string()).min(3).max(12), // hashtags pertinents
  summary: z.string().min(20).max(500),
  justification: z.string().min(30).max(400),
  tags: z.array(z.string()).min(1).max(10),
  speakers: z.array(z.string()).optional(),
  emoji_highlights: z.array(z.string()).optional(), // émojis à surligner
});

export type ViralClipEnriched = z.infer<typeof ViralClipEnrichedSchema>;

/** Réponse LLM enrichie (PILIER 1) */
export const AnalyzeResponseEnrichedSchema = z.object({
  clips: z.array(ViralClipEnrichedSchema).min(1).max(5),
  total_duration_seconds: z.number().min(0),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1),
  overall_analysis: z.object({
    title_suggestions: z.array(z.string()).min(1).max(5),
    best_moment_summary: z.string().min(30).max(200),
    recommended_style: z.enum(['dynamic', 'calm', 'educational', 'humor', 'minimalist']).optional(),
    speaker_names: z.array(z.string()).optional(),
    key_topics: z.array(z.string()).min(1).max(10),
  }),
});

export type AnalyzeResponseEnriched = z.infer<typeof AnalyzeResponseEnrichedSchema>;

// PILIER 4 — B-Roll suggestions automatiques
export const BrrollSuggestionSchema = z.object({
  start_time: z.number().min(0),
  end_time: z.number().min(0),
  type: z.enum(['image', 'video', 'graphic', 'text_overlay']),
  query: z.string().min(5).max(100), // requête de recherche
  rationale: z.string().min(10).max(150),
  style: z.enum(['realistic', 'illustrative', 'minimalist', 'dynamic']).optional(),
});

export type BrrollSuggestion = z.infer<typeof BrrollSuggestionSchema>;

export const BrrollResponseSchema = z.object({
  suggestions: z.array(BrrollSuggestionSchema).min(0).max(20),
});

export type BrrollResponse = z.infer<typeof BrrollResponseSchema>;

export const AnalyzeResponseSchema = z.object({
  clips: z.array(ViralClipSchema).min(1).max(5),
  total_duration_seconds: z.number().min(0),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ---------- Prompt engineering ----------

const SYSTEM_PROMPT = `Tu es un expert en analyse de contenu vidéo et en détection de viralité.

Analyse une transcription horaire pour identifier 1 à 5 séquences virales (15-60 secondes).

STRUCTURE NARRATIVE À DÉTECTER :
1. HOOK (0-5s) : Accroche qui capte l'attention — questions provocatrices, affirmations choc, humour, silence impactant
2. VALUE (corps) : Contenu principal — éducation, humour, émotion, informations utiles, storytelling
3. CTA (chute) : Conclusion ou appel à l'action — questions pour engager, instructions, conclusions percutantes

SCORING VIRALITE (0-99) — 6 critères de 0 à 100 :
- hook_strength (25%) : Force de l'accroche initiale (90-100 = choc immédiat)
- emotional_resonance (25%) : Pics émotionnels (90-100 = émotion intense)
- shareability (20%) : Potentiel de partage (90-100 = "je dois montrer ça")
- information_density (15%) : Densité de valeur (90-100 = insight puissant)
- originality (10%) : POV unique (90-100 = contenu inédit, contre-intuitif)
- pacing (5%) : Rythme (90-100 = rythme dynamique, variation)

VIRALITY_SCORE = moyenne pondérée des 6 critères.

RETOURNE UNIQUEMENT DU JSON VALIDE, sans markdown, sans commentaires.`;

function buildUserPrompt(transcript: string, durationSeconds: number): string {
  return `Voici la transcription horaire de la vidéo (${durationSeconds}s):

"""
${transcript}
"""

Analyse et retourne les meilleures séquences virales.

Réponds avec UNIQUEMENT un JSON valide:
{
  "clips": [{
    "start_time": 0,
    "end_time": 30,
    "virality_score": 85,
    "hook_text": "10-20 mots accrocheurs...",
    "summary": "Pourquoi virale...",
    "tags": ["#tag1", "#tag2"],
    "justification": "Explication..."
  }],
  "total_duration_seconds": 90,
  "language": "fr",
  "confidence": 0.85
}

Format EXACT obligatoire. Aucun texte avant/après le JSON.
Les hashtags doivent être en minuscules sans le '#' dans le tableau.
`;
}

// PILIER 4 — Prompt B-Roll
const BROLL_SYSTEM_PROMPT = `Tu es un directeur artistique spécialisé dans les B-rolls pour vidéos virales (TikTok/Reels/Shorts).

TYPES DE B-ROLLS :
- image : Photo d'illustration (ex: "person talking on stage", "graph showing growth")
- video : Courte vidéo loopable (ex: "time lapse of city", "person typing fast")
- graphic : Élément graphique (ex: "arrow pointing up", "checkmark animation")
- text_overlay : Texte graphique animé (ex: "3x more revenue", "before/after")

Pour chaque suggestion :
1. Identifie les moments clés qui méritent un renforcement visuel
2. Propose un type de B-roll adapté au contenu
3. Génère une requête de recherche précise (pour Unsplash, Pexels, ou génération IA)
4. Explique pourquoi ce B-roll renforce le message`;

function buildBrrollUserPrompt(transcript: string, durationSeconds: number): string {
  return `Transcription (${durationSeconds}s):\n\n\"\"\"\n${transcript}\n\"\"\"\n\nPropose max 20 suggestions de B-rolls pour les moments clés.\n\nJSON :\n{"suggestions": [{"start_time": 15, "end_time": 25, "type": "image", "query": "person talking on stage", "rationale": "Renforce l'autorité du message", "style": "realistic"}]}\n\nRéponds UNIQUEMENT avec ce JSON, sans texte avant/après.`;
}

// ---------- Client OpenAI ----------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- API publiques ----------

export async function analyzeTranscript(
  transcript: string,
  durationSeconds: number,
  options?: { model?: string; temperature?: number }
): Promise<AnalyzeResponse> {
  const model = options?.model ?? process.env.OPENAI_ANALYZE_MODEL ?? 'gpt-4o-mini';
  const temperature = options?.temperature ?? 0.5;

  const userPrompt = buildUserPrompt(transcript, durationSeconds);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Réponse LLM vide');

  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`JSON invalide: ${(e as Error).message}`);
  }

  const result = AnalyzeResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[analyzeTranscript] Zod error:', result.error.flatten());
    throw new Error('Réponse LLM invalide');
  }

  return result.data;
}

export async function summarizeTranscript(
  transcript: string,
  options?: { model?: string; maxLength?: number }
): Promise<{ summary: string; keywords: string[] }> {
  const model = options?.model ?? process.env.OPENAI_ANALYZE_MODEL ?? 'gpt-4o-mini';
  const maxLength = options?.maxLength ?? 150;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `Retourne UNIQUEMENT un JSON valide:
{
  "summary": "résumé max ${maxLength} caractères",
  "keywords": ["mot1", "mot2"]
}
Sans texte avant/après.`,
      },
      { role: 'user', content: transcript.slice(0, 10000) },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Réponse LLM vide');

  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned);

  const schema = z.object({
    summary: z.string().min(10).max(maxLength),
    keywords: z.array(z.string()).min(1).max(10),
  });

  const validated = schema.safeParse(parsed);
  if (!validated.success) throw new Error('Réponse LLM invalide');

  return validated.data;
}

// ─────────────────────────────────────────────────────────────
// PILIER 4 — B-Roll suggestions
// ─────────────────────────────────────────────────────────────

export async function suggestBrrolls(
  transcript: string,
  durationSeconds: number,
  options?: { model?: string }
): Promise<BrrollResponse> {
  const model = options?.model ?? process.env.OPENAI_ANALYZE_MODEL ?? 'gpt-4o-mini';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: BROLL_SYSTEM_PROMPT },
      { role: 'user', content: buildBrrollUserPrompt(transcript, durationSeconds) },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Réponse LLM vide');

  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned);

  const result = BrrollResponseSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[suggestBrrolls] Zod error:', result.error.flatten());
    return { suggestions: [] };
  }
  return result.data;
}