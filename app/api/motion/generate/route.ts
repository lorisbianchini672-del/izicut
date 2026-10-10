import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AiNotConfiguredError, chatJson, claudeConfigured, describeImages } from '@/lib/ai/chat';
import { BrandBriefSchema, CompanySchema, SiteSchema } from '@/lib/brand/types';
import { resolvePlanTier } from '@/lib/entitlements';
import { FREE_LIMITS, FREE_MOTION_CREATIONS, clampToFree, isAdminEmail } from '@/lib/motion/plan';
import { trialsUsedEmail } from '@/lib/email/messages';
import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConceptSchema, MAGIC_KINDS, MAX_PHOTOS, MAX_SCENES, MOTIFS, MUSIC, MagicSchema, MotionProjectSchema, BackdropSchema, SFX, SceneSchema, TEXT_ANIMS, TRANSITIONS, type Concept, type MotionProject, type Scene } from '@/lib/motion/types';
import { FREE_DOC } from '@/lib/motion/prompt';
import { BLOCKS_DOC, StyleSchema, composeProject, parseBlocks } from '@/lib/motion/compose';
import { EDIT_OPS_DOC, applyOps, quickOps, summarize } from '@/lib/motion/edit-ops';
import { coerce, repairFree } from '@/lib/motion/repair';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/motion/generate — L'IA du Studio Motion.
 *  - sans projet : crée une vidéo complète à partir d'une description ;
 *  - avec projet : applique la modification demandée (« titre en jaune »,
 *    « plus rapide », « ajoute une scène prix »…) en gardant le reste.
 * La réponse est validée par le même schéma que l'éditeur.
 */

export const maxDuration = 300;

const BodySchema = z.object({
  prompt: z.string().trim().min(2).max(1200),
  project: MotionProjectSchema.optional(),
  media: z.array(z.object({ index: z.number().int().min(0).max(2), name: z.string().max(80), duration: z.number().min(0).max(36000) })).max(3).optional(),
  photos: z.array(z.object({ index: z.number().int().min(0).max(MAX_PHOTOS - 1), name: z.string().max(80) })).max(MAX_PHOTOS).optional(),
  /** Planches contact numérotées des photos (JPEG en data URL), pour la vision. */
  photoSheets: z.array(z.string().startsWith('data:image/').max(1_500_000)).max(2).optional(),
  /** Description des photos déjà faite lors d'un appel précédent. */
  photoNotes: z.string().max(6000).optional(),
  hasLogo: z.boolean().optional(),
  /** Scène affichée dans l'aperçu quand le client écrit (« ce texte », « cette slide »). */
  currentScene: z.number().int().min(0).max(30).optional(),
  format: z.enum(['9:16', '16:9', '1:1']).optional(),
  brand: z
    .object({
      company: CompanySchema.nullable(),
      notes: z.string().max(2000),
      brief: BrandBriefSchema.nullable(),
      site: SiteSchema.nullable().optional(),
      link: z.string().max(200).optional()
    })
    .optional()
});

/** Format technique d'un projet (commun à la création et aux modifications). */
const FORMAT = `{
  "format": "9:16" | "16:9" | "1:1",
  "brand": "nom de la marque (40 caractères max)",
  "theme": {
    "background": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB",
    "style": "neon" | "clean" | "bold",
    "motif": "flow" | "particles" | "bubbles" | "grain" | "waves" | "confetti" | "sparkles" | "lines" | "none",
    "radius": "square" | "rounded" | "pill" (style des boutons de la marque),
    "anim": "rise" | "slam" | "mask" | "split" | "type" | "curve" | "blur" (animation de texte par défaut),
    "backdrop": { "kind": …, "colors": [...], … } (FOND ANIMÉ HAUT DE GAMME de la pub, voir plus bas — choisis-le avec soin, c'est la première impression)
  },
  "transition": "flash" | "slide" | "zoom" | "wipe" | "glitch" | "blur",
  "sound": { "music": "pop" | "electro" | "chill" | "epic" | "acoustic" | "hiphop" | "none", "bpm": 60-170, "volume": 0-1 },
  "scenes": [ 1 à 12 scènes. Chaque scène peut avoir :
      "anim" = animation du texte de la scène : "rise" | "slam" | "mask" | "split" | "type" | "curve" | "blur"
      "sfx" = son à son entrée : "whoosh" | "pop" | "click" | "impact" | "riser" | "chime" | "fizz" | "bubble" | "swipe" | "glitch"
      "magic" = 0 à 2 apparitions magiques : [{ "kind": "notification" | "sticker" | "badge" | "button" | "emoji" | "review" | "qr", "text": "max 60 car.", "sub": "optionnel max 60", "emoji": "optionnel, 1 emoji", "at": seconde d'apparition dans la scène, "pos": "top" | "center" | "bottom", "sfx": "optionnel" }]
    Types de scènes :
    { "type": "title", "duration": 2-5, "title": "max 90 car.", "subtitle": "optionnel, max 120" },
    { "type": "bullets", "duration": 3-6, "title": "max 60", "items": ["2 à 4 éléments de max 60 car."] },
    { "type": "stat", "duration": 2.5-4, "value": nombre, "prefix": "optionnel ex. +", "suffix": "optionnel ex. %", "label": "max 70" },
    { "type": "screenshot", "duration": 3-5, "caption": "max 80" },
    { "type": "quote", "duration": 3-6, "text": "max 160", "author": "optionnel" },
    { "type": "cta", "duration": 2.5-4, "title": "max 70", "button": "max 30" },
    { "type": "video", "duration": 2-15, "media": index de la vidéo du client, "from": seconde de départ, "caption": "optionnel max 80", "captionPos": "top" | "bottom", "layout": "full" | "frame" },
    { "type": "photo", "duration": 1.5-5, "photo": index de la photo du client, "caption": "optionnel max 80", "captionPos": "top" | "bottom", "layout": "full" | "frame" },
    { "type": "logo", "duration": 2-3, "title": "nom de la marque, max 32", "subtitle": "optionnel, signature max 80" },
    { "type": "chips", "duration": 2.5-3.5, "title": "optionnel, question max 60", "items": ["2 à 5 boutons de max 22 car."], "pick": index du bouton cliqué par le curseur },
    { "type": "prompt", "duration": 3-4.5, "text": "la demande du client final tapée lettre par lettre, max 120", "label": "optionnel, max 24 (ex. nom de la marque)" },
    { "type": "free", "duration": 1.5-8, "name": "nom court", "bg": "theme" | "#RRGGBB" | { "from": "#hex", "to": "#hex", "angle": degrés, "radial": bool } | { "kind": …fond animé GPU… },
      "camera": { "zoom": anim, "x": anim, "y": anim, "rotate": anim, "shake": 0-1 },
      "layers": [ 1 à 40 calques dessinés dans l'ordre (le premier est au fond) ],
      "cues": [ { "at": seconde, "sfx": "whoosh" | "pop" | "click" | "impact" | "riser" | "chime" | "fizz" | "bubble" | "swipe" | "glitch" } ] },
    { "type": "mockup", "duration": 3-4.5, "title": "titre de la page, max 60", "nav": ["0 à 4 entrées de menu, max 14"], "button": "optionnel max 24", "photo": "optionnel, index d'une photo du client en fond", "recolor": "optionnel #RRGGBB : la maquette change de couleur en direct" }
  ]
}`;

const RULES = `${FREE_DOC}

Règles techniques :
- Textes COURTS, contrastés, percutants (pub TikTok / Reels). 1 ou 2 mots clés entre *astérisques* pour les colorer.
- SAFE ZONES 9:16 : rien d'important dans les 15 % du haut ni les 20 % du bas (interfaces TikTok / Reels) — le moteur s'en charge si tu utilises "pos".
- "motif" = texture signature : bubbles (boissons, bain, lessive), grain (boulangerie, artisan, bois, café, vintage), waves (eau, mer, bien-être, mode fluide), confetti (événement, fête, association, promo), sparkles (beauté, bijoux, luxe, mariage), lines (sport, auto, livraison, tech), particles (tech/startup), none (minimaliste).
- Typographie cinétique ("anim") : "slam" (mot géant qui s'écrase avec secousse caméra : accroches, sport, promo), "mask" (texte qui sort d'un masque : premium, luxe, corporate), "split" (lettres qui se rassemblent : fun, jeune, événement), "type" (machine à écrire : tech, B2B, chiffres), "rise" (montée souple). VARIE d'une scène à l'autre comme un vrai monteur ; l'accroche frappe fort.
- Le montage est calé sur le tempo : les durées des scènes tombent sur les temps de la musique (le moteur les ajuste au bpm).
- "transition" selon l'énergie : flash (dynamique), slide (moderne), zoom (impact, sport), wipe (graphique, marque forte), glitch (tech, gaming, jeune).
- "sound.music" + "bpm" : pop (110-124, joyeux), electro (120-128, énergique), chill (75-95, doux), epic (80-100, grandiose), acoustic (90-110, artisanal, chaleureux), hiphop (85-98, urbain).
- "sfx" qui RACONTENT la marque : fizz (ouverture de boisson), bubble, pop (apparition ludique), click (appli/tech), impact (révélation), riser (montée avant révélation), chime (luxe, beauté, magie), glitch (tech), whoosh/swipe (mouvement).
- Apparitions magiques ("magic") — c'est ce qui rend la pub vivante, utilise-les dans 3 ou 4 scènes :
  · "emoji" : l'objet de la marque qui surgit en 3D (🥖, 🧋, 💇‍♀️, 🏋️, 🍕, 👟, 💎…) avec un mot ;
  · "notification" : notification de smartphone plausible liée au service (ex. « Réservation confirmée », « Votre commande est prête »), sans chiffre inventé ;
  · "badge" : tampon (« Nouveau », « Fait maison », « Made in France », « 100 % bio » seulement si c'est vrai) ;
  · "button" : bouton d'action que le doigt vient cliquer (« Réserver », « Commander »…), idéal dans le CTA ;
  · "sticker" : sticker « Lien en bio » + emoji 👇 dans la scène finale (conversion) ;
  · "qr" : QR code qui se construit à l'écran vers le lien du client ("sub" = le lien, "text" = « Scannez-moi » ou équivalent), UNIQUEMENT si un lien est fourni ; dans une scène "cta" il remplace le bouton ; idéal en fin de pub pour l'affichage en boutique / écran ;
  · "review" : UNIQUEMENT avec un avis réel cité par le client (texte + "sub" = prénom). Jamais d'avis inventé.
  Placement : une apparition ne doit pas masquer le texte de la scène. "notification" et "emoji" vont en haut ("top"), "sticker", "button", "badge" et "review" en bas ("bottom"). Sur une scène "cta" (qui a déjà son bouton), ajoute le "sticker" « Lien en bio » plutôt qu'un "button". "review" plutôt sur une scène "photo", "video" ou un "title" court.
- Lien du client : s'il est fourni, mets-le en "sub" du bouton ou du sticker final (version courte, sans https://).
- "screenshot" sert à montrer le produit (capture fournie ou interface animée).
- Scène "video" UNIQUEMENT si le client a importé des vidéos. Sa vidéo est alors le CŒUR de la pub (50 à 70 % de la durée, plusieurs passages "from"). "from" + "duration" ≤ durée de la vidéo.
- Scène "photo" UNIQUEMENT si le client a importé des photos : montre-les presque toutes (1.5 à 3 s chacune), la bonne photo sur le bon texte, alterne "full" et "frame", jamais deux fois de suite la même.
- PROFONDEUR : si des faits précis sont fournis (fiche.facts, texte du site), la pub en utilise AU MOINS 3, avec leurs vrais noms et chiffres (année de création, palmarès, catégories, offre phare, événement, lieu…). Une pub qui pourrait être celle d'un concurrent est ratée : chaque scène doit être impossible à confondre.
- IMAGES DU CLIENT = HÉROS : quand des photos sont fournies (y compris celles de son site), elles occupent au moins 50 % de la durée, en grand ("full", Ken Burns), avec les meilleures en accroche et en final ; le texte se place dans la zone vide ("captionPos"). Le motion design les met en valeur, il ne les cache pas.
- Fiche marque / site web fournis : parle EXACTEMENT de cette entreprise ou association, utilise son vrai nom, reprends les couleurs de son site ou de sa fiche. Association : adhérents, bénévoles, événements, dons.
- N'invente JAMAIS de réduction, code promo, prix, chiffre, avis, récompense ou label non fournis par le client. Sans offre fournie, l'appel à l'action invite à venir, découvrir, réserver, commander, suivre, adhérer.
- Ne recopie jamais un slogan déposé ou une campagne existante d'une marque : invente une création originale, même pour une grande marque.
- Sans nom de marque fourni, n'invente pas de nom : utilise un nom générique lié à l'activité (« Votre salon », « Votre boulangerie »…).
- Texte sur photo / vidéo : JAMAIS sur le visage ni sur le produit. "captionPos" = la zone vide, à l'opposé du sujet décrit dans les notes des photos (sujet en bas → "top"). Le moteur ajoute un calque d'assombrissement calculé selon la luminosité.
- Scènes "free" = ton pinceau principal : elles occupent la MAJORITÉ de chaque pub (au moins 60 % de la durée, souvent 100 %). Utilise les autres types seulement quand ils servent vraiment (photos / vidéos du client en plein écran, raccourcis). Dès que le client demande un style, un effet ou un visuel particulier, construis-le en "free".
- STYLE « DÉMO PRODUIT CINÉMATIQUE » (un exemple parmi d'autres) (le niveau des pubs motion design qui cartonnent sur TikTok) : fond noir profond "motif": "flow" (rubans de lumière liquide aux couleurs de la marque), "transition": "blur" (mouvements de caméra rapides avec flou de mouvement), "anim": "blur" (mise au point flou → net) et "curve" pour la phrase finale (lettres qui arrivent en ruban). Enchaînement type : "logo" (le signe et le nom se révèlent) → "chips" (les services / publics de la marque, le curseur clique sur le bon) → "prompt" (la vraie demande d'un client, ex. « Je cherche un club de basket pour mon fils à Villeurbanne ») → "mockup" (la page du site du client qui pivote en 3D, avec sa vraie photo en fond si fournie) → "photo" pour les preuves → "title" ou "cta" final en "curve". À utiliser pour les sites, applis, services en ligne, réservations, et dès que le client veut un rendu premium / « Apple ». Les textes de "chips" et "mockup" reprennent ses vraies rubriques et offres (site web fourni) ; "recolor" seulement pour montrer une personnalisation (avant / après).
- "theme.radius" : reprends le style de boutons du site du client s'il est fourni (carré, arrondi, pilule).
- Format : "9:16" par défaut ; "16:9" si le client parle de YouTube (vidéo classique) ; "1:1" pour un post carré.`;

/** Création : fusion des briefs « directeur de création » d'IziCut. */
/** Ce qui fait d'IziCut un studio sans limite : l'IA exécute, invente, ne recopie aucun modèle. */
const ATTITUDE = `ESPRIT IZICUT (prioritaire sur tout le reste) :
- Le client est le réalisateur : tu fais TOUT ce qu'il demande, même inhabituel, ambitieux ou très précis (couleur, mot, effet, style, durée, ordre, format, référence à une marque ou à une vidéo). Tu ne refuses jamais par manque de « modèle » : tu le construis avec les scènes libres.
- AUCUN modèle pré-construit : chaque pub est une création unique pensée pour CE client. Les exemples donnés ici ne sont que des illustrations du niveau attendu, ne les recopie pas.
- RÉFLÉCHIS longuement avant d'écrire : objectif, cible, émotion, idée forte, esthétique, découpage seconde par seconde, transitions entre les scènes (raccords de mouvement, formes qui se transforment, lignes qui guident l'œil, caméra), son. Puis exécute avec la précision d'un motion designer d'agence.
- Vise l'« irréalisable » pour un particulier : ce qu'un client ne pourrait jamais faire seul en quelques minutes.`;

const DIRECTOR = (free: boolean) => `${ATTITUDE}

Tu es Directeur Artistique, Réalisateur de publicités et Lead Motion Designer « haute couture » chez IziCut, au niveau des grandes agences qui travaillent pour des marques mondiales.
Ta mission : remplacer le travail d'un community manager / monteur en créant une pub motion design ULTRA-PERSONNALISÉE, haute conversion, pour n'importe quel brief (marque mondiale, commerce local, e-commerce, startup, artisan, association, indépendant). Jamais de concept générique : dépasse l'idée évidente.

RÉFLEXION APPROFONDIE (avant d'écrire le JSON, fais-la mentalement) :
- ADN de la marque : ses codes visuels iconiques (forme, mouvement, matière, rythme), ce qui la rend unique.
- Psychologie du spectateur : comment capter l'attention dès la frame 0 et garder la rétention 15 s (rupture, tension, révélation, récompense).
- Micro-détails motion : easing (expo-out pour les entrées, back pour les rebonds), parallaxe, typographie cinétique, masques, accélérations (speed ramp) — traduits avec les outils disponibles (transitions, textures, apparitions, rythme des scènes).
- Sound design en couches : musique, impacts, ambiance, sons d'interface calés sur chaque mouvement.
- Intégration ORGANIQUE de la marque : le logo et le nom se révèlent par un mouvement (particules qui convergent, reflet, apparition) au lieu d'être « collés ».

Méthode :
1. ANALYSE : proposition de valeur unique, cible exacte, émotion à déclencher (urgence, prestige, confiance, curiosité, hype, chaleur), levier de conversion.
2. DIRECTION ARTISTIQUE dédiée : 3 éléments signatures (texture, typographie en mouvement, son fétiche) qui rendent la marque reconnaissable. Si le site web du client est fourni, calque fidèlement sa charte (couleurs, ambiance).
3. STRUCTURE NATIVE ADS de 15 s (sauf autre durée demandée), 5 à 7 scènes, aucune de plus de 4 s (sauf "video") :
   - 0-3 s HOOK : accroche visuelle et sonore choc qui stoppe le scroll ;
   - 3-7 s PROBLÈME / ENJEU : le besoin ou la frustration de la cible, animé ;
   - 7-12 s SOLUTION & VALEUR : le produit / service, mots-clés animés, apparitions magiques, preuve (uniquement réelle) ;
   - 12-15 s CTA : signature de marque, appel à l'action clair, bouton cliqué ou sticker « lien en bio ».
4. SOUND DESIGN : musique précise (genre, bpm, humeur) + bruitage sur chaque mouvement et chaque apparition.
${free ? '' : `5. A/B TESTING : 3 accroches alternatives pour la scène 1 — A = problème / frustration, B = bénéfice / résultat, C = curiosité / question intrigante. La scène 1 du projet = l'accroche A.
6. VOIX-OFF : 35 à 40 mots maximum pour 15 s, ton dynamique et naturel, une réplique par moment clé, avec marqueurs de bruitages ([Whoosh], [Pop], [Click], [Ding]). La musique baissera de 12 dB pendant chaque réplique.
`}
Tout est rédigé en FRANÇAIS. Taille : 5 à 7 scènes, 12 calques maximum par scène "free", JSON COMPACT (sans espaces inutiles ni retours à la ligne) pour que la réponse ne soit jamais coupée. Réponds UNIQUEMENT par un objet JSON :
{
  "message": "explication claire et DÉTAILLÉE pour le client (4 à 8 phrases) : ce que tu as compris de sa demande, ton idée créative, l'esthétique choisie et pourquoi, le déroulé de la pub, et ce qu'il peut te demander ensuite (tutoiement si le client tutoie)",
  "plan": ["une ligne par scène : « Scène N (durée) — ce qu'on voit, comment ça bouge, quel son » ; puis 1 à 3 idées pour aller plus loin"],
  "question": "AU MAXIMUM une question courte pour affiner un choix, ou chaîne vide — ne bloque jamais : décide toi-même ce qui manque",
  "concept": {
    "brand_name": "...",
    "strategy": { "value": "proposition de valeur", "audience": "cible", "emotion": "émotion clé", "lever": "levier de conversion" },
    "creative_concept": "concept créatif et ambiance, 2 phrases",
    "art_direction": {
      "visual_theme": "ambiance visuelle (textures, effets, transitions)",
      "color_palette": ["Couleur 1 (#hex)", "Couleur 2 (#hex)", "Couleur 3 (#hex)"],
      "music_style": "style musical précis (bpm, genre, humeur)",
      "brand_signature_sfx": ["SFX 1", "SFX 2"]
    },
    "signatures": ["signature 1", "signature 2", "signature 3"],
    "scenes": [
      { "timeframe": "0-3s Hook", "idea": "...", "visual_motion_description": "ce qui se passe à l'écran, frame par frame", "motion_design_effects": "transitions, masques, easing, typographie cinétique", "brand_assets_integration": "comment la marque / le logo apparaît", "text_on_screen": "...", "typography_animation": "effet d'apparition du texte", "sound_design": "SFX + rythme" },
      { "timeframe": "3-7s Problème", ... }, { "timeframe": "7-12s Solution", ... }, { "timeframe": "12-15s CTA", ... }
    ]${free ? '' : `,
    "voiceover": [ { "time": "0-3s", "text": "texte exact de la voix-off", "sfx": "[Whoosh]" }, ... ]`}
  },${free ? '' : `
  "hooks": [ 3 scènes complètes (type "title", "stat" ou "quote", avec "sfx" et "magic") : A problème, B bénéfice, C curiosité ],`}
  "project": ${FORMAT}
}

${RULES}`;

/** Modification d'une vidéo existante : on garde l'harmonie globale. */
const EDITOR = `${ATTITUDE}

Tu es le Directeur Créatif motion design d'IziCut. Le client retouche une pub animée existante.
Si le client demande une pub TOTALEMENT NOUVELLE (autre sujet, autre produit, autre marque : « fais une pub pour… »), crée-la de zéro : nouveau projet complet, sans rien garder de l'ancien.
Sinon, applique UNIQUEMENT la modification demandée (« modifie le rythme », « change la palette », « plus moderne », « ajoute un effet »…) sans détruire l'harmonie globale, et renvoie le projet COMPLET mis à jour (garde à l'identique theme.motif, transition, sound, sfx et magic s'ils ne sont pas concernés).
Traduis les demandes floues ou hésitantes (« un truc qui pète ») en décisions visuelles précises.
Réponds UNIQUEMENT par un objet JSON :
{
  "message": "explication précise (2 à 6 phrases) : ce que tu as compris et ce que tu as changé",
  "plan": ["une ligne par changement : « Scène N — avant → après »"],
  "question": "au maximum UNE question courte, ou chaîne vide",
  "project": ${FORMAT}
}

${RULES}`;

/** Deuxième chance, plus légère : si la grande création n'aboutit pas, on demande une version courte mais 100 % sur mesure. */
const LITE = `${ATTITUDE}

Tu es motion designer chez IziCut. Crée la pub demandée en 4 à 6 scènes, TOUTES de type "free" (création libre), 4 à 9 calques chacune, 12 à 16 s au total. JSON COMPACT. Tout en français.
Réponds UNIQUEMENT par : { "message": "explication de ton idée et du déroulé (3 à 5 phrases)", "plan": ["Scène N — …"], "project": { "format": "9:16" | "16:9" | "1:1", "brand": "...", "theme": { "background": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB", "style": "neon" | "clean" | "bold" }, "transition": "flash" | "slide" | "zoom" | "wipe" | "glitch" | "blur", "sound": { "music": "pop" | "electro" | "chill" | "epic" | "acoustic" | "hiphop", "bpm": 60-170 }, "scenes": [ { "type": "free", "duration": 2-4, "bg": "#RRGGBB", dégradé ou fond animé { "kind": … }, "camera": {...}, "layers": [...], "cues": [...] } ] } }

${FREE_DOC}`;

/**
 * Création par BLOCS : l'IA choisit la suite de scènes premium et écrit les
 * textes, le compositeur fabrique l'animation. JSON court → fiable même avec
 * les IA gratuites, et rendu toujours au niveau des grandes campagnes.
 */
const COMPOSER = `${ATTITUDE}

Tu es Directeur Artistique chez IziCut, au niveau des campagnes Spotify / Apple / Nike. Tu conçois une pub motion design de 15 s (sauf autre durée demandée) en enchaînant des BLOCS déjà animés par nos motion designers : toi, tu choisis l'ordre, les textes (courts, percutants, en français), les images et la direction artistique.

${BLOCKS_DOC}

RÈGLES :
- 6 à 9 blocs. Structure : HOOK (reveal ou kinetic choc) → enjeu / bénéfice → preuves visuelles → signature "cta" en dernier.
- Varie les blocs : jamais deux fois le même bloc d'affilée, au moins 4 blocs différents.
- PHOTOS DU CLIENT = INFORMATIONS : utilise CHAQUE photo au moins une fois. Pour la photo la plus parlante, un bloc "explain" avec 1 à 3 annotations placées sur les points clés indiqués (x = fx, y = fy). Avec 3 photos ou plus : un "carousel" ou un "wall". Deux photos du même sujet avant/après : "compare".
- Sans photo du client : utilise "search:mots-clés en anglais" (photos libres de droits) dans 1 à 3 blocs, et privilégie kinetic, card, list, stat (stat UNIQUEMENT avec un vrai chiffre donné par le client), cta.
- Textes très courts : 2 à 6 mots par ligne. Aucun faux avis, faux chiffre ni fausse promo.
- N'INVENTE AUCUNE INFORMATION FACTUELLE que le client n'a pas donnée (horaires, adresse, site web, téléphone, prix, services précis, équipements) : formule de façon générale et évocatrice (« Ton nouveau QG sportif » plutôt que « Ouvert 7j/7 6h-23h »). Le "link" du bloc cta UNIQUEMENT s'il est fourni (lien_cta ou site web), sinon ne mets pas de link.
- Style : fond et couleurs aux couleurs de la marque (site web fourni = sa charte). Fonds clairs : "paper" seulement si la marque est très claire ; sinon "glow", "silk", "aurora", "mesh", "liquid", "nebula"… Musique et bpm adaptés à l'émotion.
- Format : "9:16" par défaut, "16:9" pour YouTube, "1:1" pour un post carré.

Réponds UNIQUEMENT par un objet JSON COMPACT :
{"message":"4 à 6 phrases pour le client : ce que tu as compris, l'idée créative, l'esthétique et le déroulé","plan":["Scène N — ce qu'on voit"],"question":"une question courte ou chaîne vide","brand":"nom de la marque","format":"9:16","style":{…},"blocks":[…]}`;

const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | undefined => (list as readonly unknown[]).includes(v) ? (v as T[number]) : undefined;

/** Style de l'IA : on garde chaque champ valide séparément (un fond inconnu n'annule pas les couleurs). */
function safeStyle(raw: unknown): z.infer<typeof StyleSchema> {
  const full = StyleSchema.safeParse(raw);
  if (full.success) return full.data;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: z.infer<typeof StyleSchema> = {};
  for (const k of ['backdrop', 'colors', 'accent', 'music', 'bpm'] as const) {
    const one = StyleSchema.safeParse({ [k]: k === 'colors' && Array.isArray(o.colors) ? o.colors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 4) : o[k] });
    if (one.success) Object.assign(out, one.data);
  }
  return out;
}

/** Nettoie le concept créatif (textes trop longs, champs manquants). */
function repairConcept(raw: unknown): Concept | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : Array.isArray(v) ? v.join(', ').slice(0, n) : '');
  const list = (v: unknown, count: number, n: number) => (Array.isArray(v) ? v : []).map((x) => str(x, n)).filter(Boolean).slice(0, count);
  const ad = (o.art_direction && typeof o.art_direction === 'object' ? o.art_direction : {}) as Record<string, unknown>;
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).slice(0, 5).map((sc) => {
    const x = (sc && typeof sc === 'object' ? sc : {}) as Record<string, unknown>;
    return {
      timeframe: str(x.timeframe, 40),
      idea: str(x.idea ?? x.hook_concept ?? x.core_message ?? x.call_to_action_scene, 300) || undefined,
      visual_motion_description: str(x.visual_motion_description, 500),
      motion_design_effects: str(x.motion_design_effects, 400) || undefined,
      brand_assets_integration: str(x.brand_assets_integration, 300) || undefined,
      typography_animation: str(x.typography_animation, 200) || undefined,
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
    strategy: o.strategy && typeof o.strategy === 'object'
      ? (() => { const st = o.strategy as Record<string, unknown>; return { value: str(st.value, 240), audience: str(st.audience, 240), emotion: str(st.emotion, 120), lever: str(st.lever, 160) }; })()
      : undefined,
    voiceover: Array.isArray(o.voiceover)
      ? o.voiceover.slice(0, 8).map((v) => { const x = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>; return { time: str(x.time, 20), text: str(x.text, 240), sfx: str(x.sfx, 80) || undefined }; }).filter((v) => v.text)
      : undefined,
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
      sc.title = cut(sc.title, sc.type === 'title' ? 90 : sc.type === 'logo' ? 32 : 60);
      sc.subtitle = cut(sc.subtitle, sc.type === 'logo' ? 80 : 120);
      sc.caption = cut(sc.caption, 80);
      sc.text = cut(sc.text, sc.type === 'prompt' ? 120 : 160);
      sc.label = cut(sc.label, sc.type === 'prompt' ? 24 : 70);
      sc.button = cut(sc.button, sc.type === 'mockup' ? 24 : 30);
      if (Array.isArray(sc.items)) sc.items = sc.type === 'chips' ? sc.items.slice(0, 5).map((i) => cut(String(i), 22)) : sc.items.slice(0, 4).map((i) => cut(String(i), 60));
      if (sc.type === 'chips') {
        const n = Array.isArray(sc.items) ? sc.items.length : 0;
        sc.pick = Math.min(Math.max(0, n - 1), Math.max(0, Math.round(Number(sc.pick) || 0)));
        if (typeof sc.title !== 'string' || !sc.title.trim()) delete sc.title;
      }
      if (sc.type === 'mockup') {
        sc.nav = (Array.isArray(sc.nav) ? sc.nav : []).map((x) => String(x).trim().slice(0, 14)).filter(Boolean).slice(0, 4);
        if (sc.photo !== undefined) { const ph = Math.round(Number(sc.photo)); if (Number.isFinite(ph) && ph >= 0 && ph < MAX_PHOTOS) sc.photo = ph; else delete sc.photo; }
        if (typeof sc.recolor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(sc.recolor)) delete sc.recolor;
        if (typeof sc.button !== 'string' || !sc.button.trim()) delete sc.button;
      }
      if (sc.type === 'stat') sc.value = Number(sc.value) || 0;
      if (sc.sfx !== undefined && !pick(SFX, sc.sfx)) delete sc.sfx;
      if (sc.captionPos !== undefined && !['top', 'bottom'].includes(String(sc.captionPos))) delete sc.captionPos;
      if (sc.anim !== undefined && !pick(TEXT_ANIMS, sc.anim)) delete sc.anim;
      if (sc.magic !== undefined) {
        const dur = Number(sc.duration) || 3;
        const list = (Array.isArray(sc.magic) ? sc.magic : [])
          .map((m) => {
            if (!m || typeof m !== 'object') return null;
            const o = { ...(m as Record<string, unknown>) };
            if (!pick(MAGIC_KINDS, o.kind)) return null;
            o.text = cut(typeof o.text === 'string' && o.text.trim() ? o.text : String(o.emoji ?? ''), 60);
            if (!o.text) o.text = ' ';
            o.sub = typeof o.sub === 'string' && o.sub.trim() ? cut(o.sub, 60) : undefined;
            o.emoji = typeof o.emoji === 'string' ? Array.from(o.emoji).slice(0, 2).join('') : undefined;
            o.at = Math.max(0, Math.min(dur - 0.6, Number(o.at) || 0.3));
            if (o.pos !== undefined && !['top', 'center', 'bottom'].includes(String(o.pos))) delete o.pos;
            if (o.sfx !== undefined && !pick(SFX, o.sfx)) delete o.sfx;
            for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k];
            return MagicSchema.safeParse(o).success ? o : null;
          })
          .filter(Boolean)
          .slice(0, 3);
        if (list.length) sc.magic = list; else delete sc.magic;
      }
      for (const k of Object.keys(sc)) if (sc[k] === null) delete sc[k];
      if (sc.type === 'free') return repairFree(sc);
      return sc;
    }).filter((s) => SceneSchema.safeParse(s).success);
  }
  // Valeurs de secours : un thème ou un format manquant ne doit jamais faire échouer une pub.
  const HEXRE = /^#[0-9a-fA-F]{6}$/;
  if (!['9:16', '16:9', '1:1'].includes(String(p.format))) p.format = fallback?.format ?? '9:16';
  if (typeof p.brand !== 'string') p.brand = fallback?.brand ?? '';
  p.brand = String(p.brand).slice(0, 40);
  if (!p.theme || typeof p.theme !== 'object') p.theme = { ...(fallback?.theme ?? {}) };
  {
    const th = p.theme as Record<string, unknown>;
    const def = fallback?.theme ?? { background: '#07060f', primary: '#a990ff', accent: '#ffbe76', text: '#ffffff', style: 'neon' };
    for (const k of ['background', 'primary', 'accent', 'text'] as const) {
      const v = typeof th[k] === 'string' ? (th[k] as string).trim() : '';
      const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
      th[k] = HEXRE.test(v) ? v : short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : def[k];
    }
  }
  if (p.theme && typeof p.theme === 'object') {
    const th = p.theme as Record<string, unknown>;
    if (th.motif !== undefined && !pick(MOTIFS, th.motif)) delete th.motif;
    if (th.radius !== undefined && !['square', 'rounded', 'pill'].includes(String(th.radius))) delete th.radius;
    if (th.anim !== undefined && !pick(TEXT_ANIMS, th.anim)) delete th.anim;
    if (th.backdrop !== undefined) {
      const bd = coerce<Record<string, unknown>>(BackdropSchema, th.backdrop);
      if (bd) th.backdrop = bd; else delete th.backdrop;
    }
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
  const { prompt, media, photos, photoSheets, brand } = parsed.data;
  let project = parsed.data.project;

  // Offre : 3 pubs créées gratuitement, puis Pro. Les retouches restent possibles.
  const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', user.id).maybeSingle();
  const tier = isAdminEmail(user.email) ? 'agency' : resolvePlanTier(profile?.plan, profile?.subscription_status);
  const free = tier === 'free';
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const used = Number(meta.motion_creations) || 0;
  if (!project && free && used >= FREE_MOTION_CREATIONS) {
    return NextResponse.json(
      { error: `Vous avez utilisé vos ${FREE_MOTION_CREATIONS} pubs gratuites. Passez en Pro pour créer des pubs en illimité (vous pouvez toujours retoucher vos pubs).`, code: 'quota', quota: { tier, used, limit: FREE_MOTION_CREATIONS } },
      { status: 402 }
    );
  }
  if (free && ((media?.length ?? 0) > FREE_LIMITS.videos || (photos?.length ?? 0) > FREE_LIMITS.photos)) {
    return NextResponse.json({ error: `Offre Free : ${FREE_LIMITS.photos} photos et ${FREE_LIMITS.videos} vidéo maximum. Passez en Pro pour en utiliser plus.`, code: 'limit' }, { status: 402 });
  }
  let photoNotes = parsed.data.photoNotes ?? '';
  // L'IA « regarde » les photos une fois (planche contact numérotée), puis le
  // navigateur garde la description pour les demandes suivantes.
  if (photos?.length && photoSheets?.length && !photoNotes) {
    try {
      photoNotes = (await describeImages(
        photoSheets,
        `Ces images sont des planches de photos numérotées (le numéro est en haut à gauche de chaque photo). Pour CHAQUE photo, écris une ligne :
"n : description précise (ce qu'on voit, produit / lieu / personne / logo, ambiance, textes ou prix lisibles sur l'image) | sujet : haut / centre / bas | zone vide : haut / bas | points clés : (fx, fy) élément ; (fx, fy) élément ; (fx, fy) élément | à expliquer : l'information que cette image prouve ou montre"
fx et fy sont la position DANS la photo (0 = gauche / haut, 1 = droite / bas), 2 à 4 points clés par photo (le détail le plus parlant, le visage, le logo, le prix, le geste…). En français, concis.`,
        1600
      )).slice(0, 6000);
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
        fiche: brand.brief ?? undefined,
        site_web: brand.site ? { adresse: brand.site.url, titre: brand.site.title, description: brand.site.description, couleurs_du_site: brand.site.colors, polices: brand.site.fonts, style_boutons: brand.site.radius, extrait_du_texte: (brand.site.text ?? '').slice(0, 3500) || undefined } : undefined,
        lien_cta: brand.link || undefined
      })}`
    : '';

  // ---------- Retouche : petites opérations ciblées (réponse courte, fiable avec les IA gratuites) ----------
  // Avec Claude, la retouche se fait sur le projet complet (liberté totale) ; sans Claude, par petites opérations.
  if (project && !claudeConfigured()) {
    const editMsg = `Résumé de la pub actuelle :\n${summarize(project)}${parsed.data.currentScene !== undefined ? `\nLe client regarde la scène ${parsed.data.currentScene} quand il écrit.` : ''}${photos?.length ? `\nPhotos du client : index 0 à ${photos.length - 1}.${photoNotes ? `\n${photoNotes.slice(0, 1500)}` : ''}` : ''}\n\nDemande du client : ${prompt}`;
    const t1 = Date.now();
    let recreate = false;
    let lastErr = '';
    for (let attempt = 0; attempt < 3 && !recreate; attempt++) {
      if (attempt > 0 && Date.now() - t1 > 150_000) break;
      try {
        const raw = (await chatJson({
          system: EDIT_OPS_DOC,
          user: attempt === 0 ? editMsg : `${editMsg}\n\nATTENTION : ${lastErr || 'réponse précédente inexploitable'}. Réponds avec le JSON {"message":…,"ops":[…]} en utilisant les identifiants exacts.`,
          maxTokens: 3500,
          temperature: 0.3,
          think: 2000,
          timeoutMs: 60_000,
          deadline: t1 + 200_000
        })) as Record<string, unknown>;
        const res = applyOps(project, raw?.ops, { hasLogo: Boolean(parsed.data.hasLogo), photos: photos?.length ?? 0 });
        if (res.recreate) { recreate = true; break; }
        if (res.applied > 0) {
          const out = free ? clampToFree(res.project) : res.project;
          const message = typeof raw.message === 'string' ? raw.message.slice(0, 600) : 'C’est fait.';
          return NextResponse.json({ project: out, message, quota: { tier, used, limit: free ? FREE_MOTION_CREATIONS : null } });
        }
        lastErr = 'aucune opération valide (vérifie les identifiants et le format)';
      } catch (err) {
        if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
        lastErr = '';
        console.warn('[motion] retouche essai', attempt + 1, ':', (err as Error).message);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    // Toutes les IA sont saturées : les retouches courantes sont comprises sans IA.
    if (!recreate) {
      const quick = applyOps(project, quickOps(prompt, project, parsed.data.currentScene ?? 0), { hasLogo: Boolean(parsed.data.hasLogo), photos: photos?.length ?? 0 });
      if (quick.applied > 0) {
        return NextResponse.json({ project: free ? clampToFree(quick.project) : quick.project, message: 'C’est fait ✓', quota: { tier, used, limit: free ? FREE_MOTION_CREATIONS : null } });
      }
    }
    if (!recreate) {
      return NextResponse.json({ error: 'Je n’ai pas réussi à appliquer cette retouche. Reformulez-la plus simplement (ex. « titre de la scène 1 en jaune »).', code: 'retry' }, { status: 502 });
    }
    // Pub totalement nouvelle demandée : on crée.
    if (free && used >= FREE_MOTION_CREATIONS) {
      return NextResponse.json({ error: `Vous avez utilisé vos ${FREE_MOTION_CREATIONS} pubs gratuites. Passez en Pro pour créer des pubs en illimité (vous pouvez toujours retoucher vos pubs).`, code: 'quota', quota: { tier, used, limit: FREE_MOTION_CREATIONS } }, { status: 402 });
    }
    project = undefined;
  }

  const userMsg = project
    ? `Projet actuel :\n${JSON.stringify(project)}${mediaInfo}${brandInfo}\n\nModification demandée : ${prompt}`
    : `Demande du client : ${prompt}${mediaInfo}${brandInfo}\n\nCrée le concept puis le projet.`;

  try {
    let lastError = '';
    const t0 = Date.now();
    for (let attempt = 0; attempt < (project ? 2 : 3); attempt++) {
      // Pas de seconde tentative si le temps manque (limite Vercel 300 s).
      if (attempt > 0 && Date.now() - t0 > 200_000) break;
      // Création : d'abord par blocs (rendu premium garanti), en dernier recours la version libre légère.
      const composer = !project && attempt < 2;
      const lite = !project && !composer;
      let raw: unknown;
      try {
        raw = await chatJson({
          system: project ? EDITOR : composer ? COMPOSER : LITE,
          user: attempt === 0 ? userMsg : `${userMsg}\n\n${lastError ? `ATTENTION : ta réponse précédente était invalide (${lastError}). ` : ''}Respecte exactement le format JSON, en restant concis.`,
          maxTokens: composer ? 4500 : lite ? 5000 : 9000,
          temperature: project ? 0.5 : 0.85,
          // Réflexion approfondie de Claude au premier essai.
          think: attempt === 0 ? (project ? 3000 : 4000) : 0,
          timeoutMs: 150_000,
          deadline: t0 + 280_000
        });
      } catch (err) {
        if (err instanceof AiNotConfiguredError) throw err;
        lastError = '';
        console.warn('[motion] essai', attempt + 1, 'sans réponse exploitable :', (err as Error).message);
        continue;
      }
      let composed: MotionProject | null = null;
      if (composer) {
        const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        // Lien inventé par l'IA : on ne garde que le vrai lien du client.
        const blocks = parseBlocks(r.blocks).map((b) => (b.block === 'cta' && b.link && !brand?.link && !brand?.site ? { ...b, link: undefined } : b));
        if (blocks.length < 3) {
          lastError = 'il faut un champ "blocks" avec au moins 3 blocs valides';
          continue;
        }
        const fmt = pick(['9:16', '16:9', '1:1'] as const, r.format) ?? parsed.data.format ?? '9:16';
        const brandName = (typeof r.brand === 'string' && r.brand.trim() ? r.brand.trim() : brand?.company?.name ?? 'Votre marque').slice(0, 40);
        composed = composeProject(blocks, safeStyle(r.style), { brand: brandName, hasLogo: Boolean(parsed.data.hasLogo), format: fmt, photos: photos?.length ?? 0 });
        raw = { message: r.message, plan: r.plan, question: r.question, project: composed };
      }
      const wrapped = Boolean(raw && typeof raw === 'object' && 'project' in (raw as Record<string, unknown>));
      const said = wrapped ? (raw as Record<string, unknown>) : {};
      const message = typeof said.message === 'string' ? said.message.slice(0, 1400) : undefined;
      const plan = Array.isArray(said.plan) ? said.plan.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.slice(0, 300)).slice(0, 16) : undefined;
      const question = typeof said.question === 'string' && said.question.trim() ? said.question.slice(0, 200) : undefined;
      const concept = wrapped && !project ? repairConcept((raw as Record<string, unknown>).concept) : undefined;
      const result = MotionProjectSchema.safeParse(composed ?? repair(wrapped ? (raw as Record<string, unknown>).project : raw, project));
      // 3 accroches A/B (offres payantes).
      const hookList: Scene[] = [];
      if (wrapped && !free && Array.isArray((raw as Record<string, unknown>).hooks)) {
        const fixed = repair({ scenes: (raw as Record<string, unknown>).hooks }) as { scenes?: unknown[] };
        for (const h of fixed.scenes ?? []) {
          const r = SceneSchema.safeParse(h);
          if (r.success && ['title', 'stat', 'quote'].includes(r.data.type)) hookList.push(r.data);
        }
      }
      if (result.success) {
        const count = media?.length ?? 0;
        const photoCount = photos?.length ?? 0;
        let scenes = result.data.scenes.filter((sc) => (sc.type !== 'video' || sc.media < count) && (sc.type !== 'photo' || sc.photo < photoCount));
        scenes = scenes.map((sc) => (sc.type === 'mockup' && sc.photo !== undefined && sc.photo >= photoCount ? { ...sc, photo: undefined } : sc));
        // Une pub créée doit tenir ses ~15 s : si l'IA a fait trop court, on étire le rythme.
        const sum = scenes.reduce((n, sc) => n + sc.duration, 0);
        if (!project && sum > 0 && sum < 13 && !/\b([1-9]|1[0-2]) ?(s|sec|secondes)\b/i.test(prompt)) {
          const k = 15 / sum;
          scenes = scenes.map((sc) => ({ ...sc, duration: Math.round(Math.min(sc.type === 'video' ? 15 : 8, sc.duration * k) * 10) / 10 }));
        }
        // Coupes calées sur la musique : chaque durée = un nombre entier de temps (2 temps minimum).
        const bpm = result.data.sound?.bpm;
        if (bpm && result.data.sound?.music !== 'none') {
          const beat = 60 / bpm;
          scenes = scenes.map((sc) => {
            const max = sc.type === 'video' ? 15 : 8;
            const n = Math.max(2, Math.round(sc.duration / beat));
            return { ...sc, duration: Math.round(Math.min(max, Math.max(1.5, n * beat)) * 100) / 100 };
          });
        }
        if (scenes.length) {
          let finalProject: MotionProject = { ...result.data, scenes };
          if (free) finalProject = clampToFree(finalProject);
          let quota = { tier, used, limit: free ? FREE_MOTION_CREATIONS : null };
          if (!project) {
            // Compteur tenu côté serveur (app_metadata : non modifiable par le navigateur).
            try {
              await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { ...meta, motion_creations: used + 1 } });
              quota = { ...quota, used: used + 1 };
              if (free && used + 1 === FREE_MOTION_CREATIONS && user.email) {
                const { subject, content } = trialsUsedEmail(FREE_MOTION_CREATIONS);
                await sendEmail(user.email, subject, content, { idempotencyKey: `trials-used-${user.id}` });
              }
            } catch {
              /* compteur indisponible : on n'empêche pas la création */
            }
          }
          const cleanConcept = concept && free ? { ...concept, voiceover: undefined } : concept;
          return NextResponse.json({ project: finalProject, message, plan, question, concept: cleanConcept, hooks: hookList.length >= 2 ? hookList.slice(0, 3) : undefined, quota, photoNotes: photoNotes || undefined });
        }
      }
      lastError = (result.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    return NextResponse.json({ error: 'La création n’a pas abouti du premier coup.', code: 'retry' }, { status: 502 });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error('[motion] génération :', err);
    return NextResponse.json({ error: 'Notre IA est très demandée en ce moment.', code: 'busy' }, { status: 503 });
  }
}
