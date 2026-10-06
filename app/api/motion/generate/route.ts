import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson, describeImages } from '@/lib/ai/chat';
import { BrandBriefSchema, CompanySchema } from '@/lib/brand/types';
import { ConceptSchema, MAX_PHOTOS, MAX_SCENES, MOTIFS, MUSIC, MotionProjectSchema, SFX, SceneSchema, TRANSITIONS, type Concept, type MotionProject } from '@/lib/motion/types';
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

/** Format technique d'un projet (commun à la création et aux modifications). */
const FORMAT = `{
  "format": "9:16" | "16:9" | "1:1",
  "brand": "nom de la marque (40 caractères max)",
  "theme": {
    "background": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB",
    "style": "neon" | "clean" | "bold",
    "motif": "particles" | "bubbles" | "grain" | "waves" | "confetti" | "sparkles" | "lines" | "none"
  },
  "transition": "flash" | "slide" | "zoom" | "wipe" | "glitch",
  "sound": { "music": "pop" | "electro" | "chill" | "epic" | "acoustic" | "hiphop" | "none", "bpm": 60-170, "volume": 0-1 },
  "scenes": [ 1 à 12 scènes parmi (chaque scène peut avoir "sfx" = son joué à son entrée : "whoosh" | "pop" | "click" | "impact" | "riser" | "chime" | "fizz" | "bubble" | "swipe" | "glitch") :
    { "type": "title", "duration": 2-5, "title": "max 90 car.", "subtitle": "optionnel, max 120", "sfx": "optionnel" },
    { "type": "bullets", "duration": 3-6, "title": "max 60", "items": ["2 à 4 éléments de max 60 car."] },
    { "type": "stat", "duration": 2.5-4, "value": nombre, "prefix": "optionnel ex. +", "suffix": "optionnel ex. %", "label": "max 70" },
    { "type": "screenshot", "duration": 3-5, "caption": "max 80" },
    { "type": "quote", "duration": 3-6, "text": "max 160", "author": "optionnel" },
    { "type": "cta", "duration": 2.5-4, "title": "max 70", "button": "max 30" },
    { "type": "video", "duration": 2-15, "media": index de la vidéo du client, "from": seconde de départ dans sa vidéo, "caption": "optionnel max 80", "layout": "full" | "frame" },
    { "type": "photo", "duration": 1.5-5, "photo": index de la photo du client, "caption": "optionnel max 80", "layout": "full" | "frame" }
  ]
}`;

const RULES = `Règles techniques :
- Textes COURTS et percutants (style publicité TikTok). Mets 1 ou 2 mots clés entre *astérisques* pour les colorer.
- "duration" entre 1.5 et 8 secondes (15 pour "video").
- Contraste fort entre "text" et "background" : le texte doit rester lisible.
- "motif" = la texture signature de la marque : bubbles (boissons, bain, lessive, aquarium), grain (boulangerie, artisan, bois, café, papier, vintage), waves (eau, piscine, mer, bien-être, mode fluide), confetti (événement, fête, association, promo, anniversaire), sparkles (beauté, bijoux, luxe, mariage, cosmétique), lines (sport, auto, livraison, transport, tech, vitesse), particles (générique tech/startup), none (minimaliste).
- "transition" selon l'énergie : flash (dynamique), slide (moderne, réseaux), zoom (impact, sport), wipe (graphique, marque forte), glitch (tech, gaming, jeune).
- "sound.music" + "bpm" selon le style musical : pop (110-124, joyeux), electro (120-128, énergique), chill (75-95, doux, lo-fi), epic (80-100, grandiose), acoustic (90-110, artisanal, chaleureux), hiphop (85-98, urbain).
- "sfx" : choisis des sons qui RACONTENT la marque (fizz = ouverture d'une boisson, bubble = bulles, pop = apparition ludique, click = appli/tech, impact = révélation forte, riser = montée avant une révélation, chime = luxe/beauté/magie, glitch = tech, whoosh/swipe = mouvement). L'accroche et la chute ont souvent "impact" ou un son fétiche.
- "screenshot" sert à montrer le produit (capture fournie par l'utilisateur ou interface animée).
- Scène "video" UNIQUEMENT si le client a importé des vidéos (liste fournie). Sa vidéo est alors le CŒUR de la pub : 50 à 70 % de la durée en scènes "video" (plusieurs passages avec des "from" différents si elle est longue). "from" + "duration" ne doit pas dépasser la durée de la vidéo.
- Scène "photo" UNIQUEMENT si le client a importé des photos (liste fournie avec leur contenu). Ses photos sont la preuve réelle de son activité : montre-les presque toutes, chacune 1.5 à 3 s. Choisis la photo qui correspond au texte. Alterne "full" et "frame". Jamais deux fois de suite la même photo.
- Si une fiche marque est fournie : parle EXACTEMENT de cette entreprise / association (activité, ville, points forts, ton), utilise son vrai nom dans "brand", reprends ses couleurs. N'invente pas de prix, de chiffres ou de promesses vérifiables non fournis. Pour une association : adhérents, bénévoles, événements, dons plutôt que clients et ventes.`;

/** Création : l'IA travaille comme un directeur de création sénior d'agence. */
const DIRECTOR = `Tu es directeur de création et motion designer sénior dans une agence de publicité française.
Ta mission : inventer un concept de pub motion design ULTRA-PERSONNALISÉ pour la marque du client. Tu ne réutilises PAS une structure générique : la direction artistique (visuelle, sonore, narrative) est entièrement bâtie autour de l'ADN, des codes et des produits de cette marque.

Méthode :
1. Analyse la marque et définis 3 éléments signatures (texture visuelle, typographie en mouvement, effet sonore propre) qui la rendent immédiatement reconnaissable.
2. Storytelling dynamique de 15 s en 9:16 (sauf si le client demande une autre durée ou un autre format) :
   - 0-3 s : hook visuel et sonore, immersion directe dans l'univers de la marque ;
   - 3-10 s : mise en scène du produit / service avec un motion design propre à la marque ;
   - 10-15 s : chute, signature de marque, slogan et appel à l'action.
3. Sound design : style musical précis (genre, bpm, humeur) et effets sonores spécifiques à la marque.
4. Traduis ensuite ce concept en projet animé avec les outils disponibles (scènes, couleurs, texture, transitions, musique, sons). La somme des durées = 14 à 16 s par défaut.

Réponds UNIQUEMENT par un objet JSON :
{
  "concept": {
    "brand_name": "...",
    "creative_concept": "le concept créatif et l'ambiance, en 2 phrases",
    "art_direction": {
      "visual_theme": "ambiance visuelle (textures, effets, transitions typiques)",
      "color_palette": ["Couleur 1 (#hex)", "Couleur 2 (#hex)", "Couleur 3 (#hex)"],
      "music_style": "style musical précis (bpm, genre, humeur)",
      "brand_signature_sfx": ["SFX 1", "SFX 2"]
    },
    "signatures": ["signature 1", "signature 2", "signature 3"],
    "scenes": [
      { "timeframe": "0-3s", "idea": "concept de l'accroche", "visual_motion_description": "animation précise à l'écran", "text_on_screen": "texte court", "sound_design": "SFX + rythme" },
      { "timeframe": "3-10s", "idea": "mise en avant du produit/service", "visual_motion_description": "...", "text_on_screen": "...", "sound_design": "..." },
      { "timeframe": "10-15s", "idea": "chute et signature", "visual_motion_description": "...", "text_on_screen": "slogan + CTA", "sound_design": "jingle de fin" }
    ]
  },
  "project": ${FORMAT}
}

${RULES}`;

/** Modification d'une vidéo existante. */
const EDITOR = `Tu es directeur artistique en motion design. Le client modifie une pub animée existante.
Applique UNIQUEMENT la modification demandée et renvoie le projet COMPLET mis à jour (garde tout le reste à l'identique, y compris theme.motif, transition, sound et sfx s'ils ne sont pas concernés).
Réponds UNIQUEMENT par un objet JSON au format :
${FORMAT}

${RULES}`;

const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | undefined => (list as readonly unknown[]).includes(v) ? (v as T[number]) : undefined;

/** Nettoie le concept créatif (textes trop longs, champs manquants). */
function repairConcept(raw: unknown): Concept | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : Array.isArray(v) ? v.join(', ').slice(0, n) : '');
  const list = (v: unknown, count: number, n: number) => (Array.isArray(v) ? v : []).map((x) => str(x, n)).filter(Boolean).slice(0, count);
  const ad = (o.art_direction && typeof o.art_direction === 'object' ? o.art_direction : {}) as Record<string, unknown>;
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).slice(0, 4).map((sc) => {
    const x = (sc && typeof sc === 'object' ? sc : {}) as Record<string, unknown>;
    return {
      timeframe: str(x.timeframe, 20),
      idea: str(x.idea ?? x.hook_concept ?? x.core_message ?? x.call_to_action_scene, 300) || undefined,
      visual_motion_description: str(x.visual_motion_description, 500),
      text_on_screen: str(x.text_on_screen, 160),
      sound_design: str(x.sound_design, 300)
    };
  });
  const res = ConceptSchema.safeParse({
    brand_name: str(o.brand_name, 80),
    creative_concept: str(o.creative_concept, 700),
    art_direction: {
      visual_theme: str(ad.visual_theme, 500),
      color_palette: list(ad.color_palette, 6, 40),
      music_style: str(ad.music_style, 200),
      brand_signature_sfx: list(ad.brand_signature_sfx, 5, 80)
    },
    signatures: list(o.signatures, 3, 160),
    scenes
  });
  return res.success && res.data.creative_concept ? res.data : undefined;
}

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
      if (sc.sfx !== undefined && !pick(SFX, sc.sfx)) delete sc.sfx;
      for (const k of Object.keys(sc)) if (sc[k] === null) delete sc[k];
      return sc;
    }).filter((s) => SceneSchema.safeParse(s).success);
  }
  if (p.theme && typeof p.theme === 'object') {
    const th = p.theme as Record<string, unknown>;
    if (th.motif !== undefined && !pick(MOTIFS, th.motif)) delete th.motif;
    if (!['neon', 'clean', 'bold'].includes(String(th.style))) th.style = 'clean';
  }
  if (p.transition !== undefined && !pick(TRANSITIONS, p.transition)) delete p.transition;
  if (p.sound && typeof p.sound === 'object') {
    const so = p.sound as Record<string, unknown>;
    const m = pick(MUSIC, so.music);
    if (!m) delete p.sound;
    else {
      const bpm = Number(so.bpm);
      const vol = Number(so.volume);
      p.sound = { music: m, bpm: Number.isFinite(bpm) ? Math.min(170, Math.max(60, Math.round(bpm))) : 110, ...(Number.isFinite(vol) ? { volume: Math.min(1, Math.max(0, vol)) } : {}) };
    }
  } else if (p.sound !== undefined) delete p.sound;
  if (fallback) {
    if (p.transition === undefined && fallback.transition) p.transition = fallback.transition;
    if (p.sound === undefined && fallback.sound) p.sound = fallback.sound;
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
    : `Demande du client : ${prompt}${mediaInfo}${brandInfo}\n\nCrée le concept puis le projet.`;

  try {
    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await chatJson({
        system: project ? EDITOR : DIRECTOR,
        user: attempt === 0 ? userMsg : `${userMsg}\n\nATTENTION : ta réponse précédente était invalide (${lastError}). Respecte exactement le format JSON.`,
        maxTokens: project ? 3500 : 6000,
        temperature: project ? 0.4 : 0.85
      });
      const wrapped = !project && raw && typeof raw === 'object' && 'project' in (raw as Record<string, unknown>);
      const concept = wrapped ? repairConcept((raw as Record<string, unknown>).concept) : undefined;
      const result = MotionProjectSchema.safeParse(repair(wrapped ? (raw as Record<string, unknown>).project : raw, project));
      if (result.success) {
        const count = media?.length ?? 0;
        const photoCount = photos?.length ?? 0;
        const scenes = result.data.scenes.filter((sc) => (sc.type !== 'video' || sc.media < count) && (sc.type !== 'photo' || sc.photo < photoCount));
        if (scenes.length) return NextResponse.json({ project: { ...result.data, scenes }, concept, photoNotes: photoNotes || undefined });
      }
      lastError = (result.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    return NextResponse.json({ error: "L'IA n'a pas réussi à produire une vidéo valide. Reformulez votre demande." }, { status: 502 });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur IA' }, { status: 502 });
  }
}
