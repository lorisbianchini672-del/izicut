import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson } from '@/lib/ai/chat';
import { MotionProjectSchema, SceneSchema, type MotionProject } from '@/lib/motion/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/generate — L'IA du Studio Motion.
 *  - sans projet : crée une vidéo complète à partir d'une description ;
 *  - avec projet : applique la modification demandée (« titre en jaune »,
 *    « plus rapide », « ajoute une scène prix »…) en gardant le reste.
 * La réponse est validée par le même schéma que l'éditeur.
 */

const BodySchema = z.object({
  prompt: z.string().trim().min(2).max(1200),
  project: MotionProjectSchema.optional(),
  media: z.array(z.object({ index: z.number().int().min(0).max(2), name: z.string().max(80), duration: z.number().min(0).max(36000) })).max(3).optional()
});

const SYSTEM = `Tu es directeur artistique en motion design. Tu conçois des vidéos animées courtes (8 à 25 s) pour les réseaux sociaux, en français par défaut.
Tu réponds UNIQUEMENT par un objet JSON qui respecte EXACTEMENT ce format :
{
  "format": "9:16" | "16:9" | "1:1",
  "brand": "nom de la marque (40 caractères max)",
  "theme": { "background": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB", "style": "neon" | "clean" | "bold" },
  "scenes": [ 1 à 8 scènes parmi :
    { "type": "title", "duration": 2-5, "title": "max 90 car.", "subtitle": "optionnel, max 120" },
    { "type": "bullets", "duration": 3-6, "title": "max 60", "items": ["2 à 4 éléments de max 60 car."] },
    { "type": "stat", "duration": 2.5-4, "value": nombre, "prefix": "optionnel ex. +", "suffix": "optionnel ex. %", "label": "max 70" },
    { "type": "screenshot", "duration": 3-5, "caption": "max 80" },
    { "type": "quote", "duration": 3-6, "text": "max 160", "author": "optionnel" },
    { "type": "cta", "duration": 2.5-4, "title": "max 70", "button": "max 30" },
    { "type": "video", "duration": 2-15, "media": index de la vidéo du client, "from": seconde de départ dans sa vidéo, "caption": "optionnel max 80", "layout": "full" | "frame" }
  ]
}
Règles :
- Textes COURTS et percutants (style publicité TikTok). Mets 1 ou 2 mots clés entre *astérisques* pour les colorer.
- "duration" entre 1.5 et 8 secondes. Une vidéo commence par une accroche forte et finit souvent par "cta".
- "screenshot" sert à montrer le produit (capture d'écran fournie par l'utilisateur ou interface animée).
- Le texte doit rester lisible : bon contraste entre "text" et "background".
- Si on te donne un projet existant, applique UNIQUEMENT la modification demandée et renvoie le projet COMPLET mis à jour.
- Scène "video" UNIQUEMENT si le client a importé des vidéos (liste fournie). Dans ce cas, sa vidéo est le CŒUR de la pub : 50 à 70 % de la durée en scènes "video" (plusieurs passages avec des "from" différents si elle est longue), entourées d'une accroche, de points forts/chiffres et d'un appel à l'action. "from" + "duration" ne doit pas dépasser la durée de la vidéo.`;

/** Nettoie une réponse presque correcte (durées hors bornes, textes trop longs…). */
function repair(raw: unknown, fallback?: MotionProject): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const p = raw as Record<string, unknown>;
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : v);
  if (Array.isArray(p.scenes)) {
    p.scenes = p.scenes.slice(0, 8).map((s) => {
      if (!s || typeof s !== 'object') return s;
      const sc = { ...(s as Record<string, unknown>) };
      const d = Number(sc.duration);
      sc.duration = Number.isFinite(d) ? Math.min(sc.type === 'video' ? 15 : 8, Math.max(1.5, d)) : 3;
      if (sc.type === 'video') {
        sc.media = Math.min(2, Math.max(0, Math.round(Number(sc.media) || 0)));
        sc.from = Math.max(0, Number(sc.from) || 0);
        if (sc.layout !== 'frame') sc.layout = 'full';
      }
      sc.title = cut(sc.title, sc.type === 'title' ? 90 : 60);
      sc.subtitle = cut(sc.subtitle, 120);
      sc.caption = cut(sc.caption, 80);
      sc.text = cut(sc.text, 160);
      sc.label = cut(sc.label, 70);
      sc.button = cut(sc.button, 30);
      if (Array.isArray(sc.items)) sc.items = sc.items.slice(0, 4).map((i) => cut(String(i), 60));
      if (sc.type === 'stat') sc.value = Number(sc.value) || 0;
      for (const k of Object.keys(sc)) if (sc[k] === null) delete sc[k];
      return sc;
    }).filter((s) => SceneSchema.safeParse(s).success);
  }
  if (typeof p.brand !== 'string') p.brand = fallback?.brand ?? '';
  p.brand = cut(p.brand, 40);
  if (!p.format && fallback) p.format = fallback.format;
  if (!p.theme && fallback) p.theme = fallback.theme;
  return p;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour utiliser l’IA du Studio.' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { prompt, project, media } = parsed.data;
  const mediaInfo = media?.length
    ? `\nVidéos importées par le client : ${media.map((m) => `index ${m.index} « ${m.name} » (${m.duration} s)`).join(' ; ')}.`
    : '\nLe client n’a importé aucune vidéo (n’utilise pas de scène "video").';

  const userMsg = project
    ? `Projet actuel :\n${JSON.stringify(project)}${mediaInfo}\n\nModification demandée : ${prompt}`
    : `Crée une vidéo à partir de cette demande : ${prompt}${mediaInfo}`;

  try {
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await chatJson({
        system: SYSTEM,
        user: attempt === 0 ? userMsg : `${userMsg}\n\nATTENTION : ta réponse précédente était invalide (${lastError}). Respecte exactement le format JSON.`,
        maxTokens: 2500,
        temperature: project ? 0.4 : 0.8
      });
      const result = MotionProjectSchema.safeParse(repair(raw, project));
      if (result.success) {
        const count = media?.length ?? 0;
        const scenes = result.data.scenes.filter((sc) => sc.type !== 'video' || sc.media < count);
        if (scenes.length) return NextResponse.json({ project: { ...result.data, scenes } });
      }
      lastError = (result.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    return NextResponse.json({ error: "L'IA n'a pas réussi à produire une vidéo valide. Reformulez votre demande." }, { status: 502 });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
