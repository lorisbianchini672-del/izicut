import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson, describeImages } from '@/lib/ai/chat';
import { BrandBriefSchema, CompanySchema } from '@/lib/brand/types';
import { MAX_PHOTOS, MAX_SCENES, MotionProjectSchema, SceneSchema, type MotionProject } from '@/lib/motion/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/generate — L'IA du Studio Motion.
 *  - sans projet : crée une vidéo complète à partir d'une description ;
 *  - avec projet : applique la modification demandée (« titre en jaune »,
 *    « plus rapide », « ajoute une scène prix »…) en gardant le reste.
 * La réponse est validée par le même schéma que l'éditeur.
 */

export const maxDuration = 60;

const BodySchema = z.object({
  prompt: z.string().trim().min(2).max(1200),
  project: MotionProjectSchema.optional(),
  media: z.array(z.object({ index: z.number().int().min(0).max(2), name: z.string().max(80), duration: z.number().min(0).max(36000) })).max(3).optional(),
  photos: z.array(z.object({ index: z.number().int().min(0).max(MAX_PHOTOS - 1), name: z.string().max(80) })).max(MAX_PHOTOS).optional(),
  /** Planches contact numérotées des photos (JPEG en data URL), pour la vision. */
  photoSheets: z.array(z.string().startsWith('data:image/').max(1_500_000)).max(2).optional(),
  /** Description des photos déjà faite lors d'un appel précédent. */
  photoNotes: z.string().max(3000).optional(),
  brand: z
    .object({ company: CompanySchema.nullable(), notes: z.string().max(2000), brief: BrandBriefSchema.nullable() })
    .optional()
});

const SYSTEM = `Tu es directeur artistique en motion design. Tu conçois des vidéos animées courtes (8 à 25 s) pour les réseaux sociaux, en français par défaut.
Tu réponds UNIQUEMENT par un objet JSON qui respecte EXACTEMENT ce format :
{
  "format": "9:16" | "16:9" | "1:1",
  "brand": "nom de la marque (40 caractères max)",
  "theme": { "background": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB", "style": "neon" | "clean" | "bold" },
  "scenes": [ 1 à 12 scènes parmi :
    { "type": "title", "duration": 2-5, "title": "max 90 car.", "subtitle": "optionnel, max 120" },
    { "type": "bullets", "duration": 3-6, "title": "max 60", "items": ["2 à 4 éléments de max 60 car."] },
    { "type": "stat", "duration": 2.5-4, "value": nombre, "prefix": "optionnel ex. +", "suffix": "optionnel ex. %", "label": "max 70" },
    { "type": "screenshot", "duration": 3-5, "caption": "max 80" },
    { "type": "quote", "duration": 3-6, "text": "max 160", "author": "optionnel" },
    { "type": "cta", "duration": 2.5-4, "title": "max 70", "button": "max 30" },
    { "type": "video", "duration": 2-15, "media": index de la vidéo du client, "from": seconde de départ dans sa vidéo, "caption": "optionnel max 80", "layout": "full" | "frame" },
    { "type": "photo", "duration": 1.5-5, "photo": index de la photo du client, "caption": "optionnel max 80", "layout": "full" | "frame" }
  ]
}
Règles :
- Textes COURTS et percutants (style publicité TikTok). Mets 1 ou 2 mots clés entre *astérisques* pour les colorer.
- "duration" entre 1.5 et 8 secondes. Une vidéo commence par une accroche forte et finit souvent par "cta".
- "screenshot" sert à montrer le produit (capture d'écran fournie par l'utilisateur ou interface animée).
- Le texte doit rester lisible : bon contraste entre "text" et "background".
- Si on te donne un projet existant, applique UNIQUEMENT la modification demandée et renvoie le projet COMPLET mis à jour.
- Scène "video" UNIQUEMENT si le client a importé des vidéos (liste fournie). Dans ce cas, sa vidéo est le CŒUR de la pub : 50 à 70 % de la durée en scènes "video" (plusieurs passages avec des "from" différents si elle est longue), entourées d'une accroche, de points forts/chiffres et d'un appel à l'action. "from" + "duration" ne doit pas dépasser la durée de la vidéo.
- Scène "photo" UNIQUEMENT si le client a importé des photos (liste fournie avec leur contenu). Ses photos sont la preuve réelle de son activité : montre-les presque toutes, chacune 1.5 à 3 s, rythme rapide façon pub. Choisis la photo qui correspond au texte (ex. la photo d'un plat sur "Fait maison"). Alterne "full" (plein écran) et "frame" (tirage photo) pour varier. Ne mets jamais deux fois de suite la même photo.
- Si une fiche marque est fournie : parle EXACTEMENT de cette entreprise / association (son activité, sa ville, ses points forts, son ton), utilise son vrai nom dans "brand", reprends ses couleurs si une palette est donnée. N'invente pas de prix, de chiffres ou de promesses vérifiables qui ne sont pas fournis : préfère des formulations sincères. Pour une association, parle d'adhérents, de bénévoles, d'événements, de dons plutôt que de clients et de ventes.`;

/** Nettoie une réponse presque correcte (durées hors bornes, textes trop longs…). */
function repair(raw: unknown, fallback?: MotionProject): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const p = raw as Record<string, unknown>;
  const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : v);
  if (Array.isArray(p.scenes)) {
    p.scenes = p.scenes.slice(0, MAX_SCENES).map((s) => {
      if (!s || typeof s !== 'object') return s;
      const sc = { ...(s as Record<string, unknown>) };
      const d = Number(sc.duration);
      sc.duration = Number.isFinite(d) ? Math.min(sc.type === 'video' ? 15 : 8, Math.max(1.5, d)) : 3;
      if (sc.type === 'photo') {
        sc.photo = Math.min(MAX_PHOTOS - 1, Math.max(0, Math.round(Number(sc.photo) || 0)));
        if (sc.layout !== 'frame') sc.layout = 'full';
        sc.duration = Math.min(8, Number(sc.duration));
      }
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
  const { prompt, project, media, photos, photoSheets, brand } = parsed.data;
  let photoNotes = parsed.data.photoNotes ?? '';
  // L'IA « regarde » les photos une fois (planche contact numérotée), puis le
  // navigateur garde la description pour les demandes suivantes.
  if (photos?.length && photoSheets?.length && !photoNotes) {
    try {
      photoNotes = (await describeImages(
        photoSheets,
        `Ces images sont des planches de photos numérotées (le numéro est en haut à gauche de chaque photo). Pour CHAQUE photo, écris une ligne "n : description" (ce qu'on voit, le cadrage, l'ambiance, si c'est un produit / un lieu / une personne / un logo). En français, concis.`,
        700
      )).slice(0, 3000);
    } catch {
      photoNotes = '';
    }
  }
  const mediaInfo = (media?.length
    ? `\nVidéos importées par le client : ${media.map((m) => `index ${m.index} « ${m.name} » (${m.duration} s)`).join(' ; ')}.`
    : '\nLe client n’a importé aucune vidéo (n’utilise pas de scène "video").') +
    (photos?.length
      ? `\nPhotos importées par le client (${photos.length}, index 0 à ${photos.length - 1}) : ${photos.map((ph) => `${ph.index} « ${ph.name} »`).join(' ; ')}.${photoNotes ? `\nCe que montre chaque photo :\n${photoNotes}` : ''}`
      : '\nLe client n’a importé aucune photo (n’utilise pas de scène "photo").');
  const brandInfo = brand
    ? `\nFiche marque du client :\n${JSON.stringify({
        registre: brand.company
          ? { nom: brand.company.name, activite: brand.company.activityLabel ?? brand.company.activityCode, ville: brand.company.city, effectif: brand.company.employees, association: brand.company.isAssociation, creation: brand.company.createdAt }
          : undefined,
        ce_que_dit_le_client: brand.notes || undefined,
        fiche: brand.brief ?? undefined
      })}`
    : '';

  const userMsg = project
    ? `Projet actuel :\n${JSON.stringify(project)}${mediaInfo}${brandInfo}\n\nModification demandée : ${prompt}`
    : `Crée une vidéo à partir de cette demande : ${prompt}${mediaInfo}${brandInfo}`;

  try {
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await chatJson({
        system: SYSTEM,
        user: attempt === 0 ? userMsg : `${userMsg}\n\nATTENTION : ta réponse précédente était invalide (${lastError}). Respecte exactement le format JSON.`,
        maxTokens: 3500,
        temperature: project ? 0.4 : 0.8
      });
      const result = MotionProjectSchema.safeParse(repair(raw, project));
      if (result.success) {
        const count = media?.length ?? 0;
        const photoCount = photos?.length ?? 0;
        const scenes = result.data.scenes.filter((sc) => (sc.type !== 'video' || sc.media < count) && (sc.type !== 'photo' || sc.photo < photoCount));
        if (scenes.length) return NextResponse.json({ project: { ...result.data, scenes }, photoNotes: photoNotes || undefined });
      }
      lastError = (result.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    return NextResponse.json({ error: "L'IA n'a pas réussi à produire une vidéo valide. Reformulez votre demande." }, { status: 502 });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
