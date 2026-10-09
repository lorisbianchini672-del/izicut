/**
 * Studio Motion — modèle de données d'une vidéo animée.
 * Le même schéma sert à l'éditeur, au moteur de rendu (canvas) et à la
 * validation des réponses de l'IA.
 */
import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const duration = z.number().min(1.5).max(8);
/** Les mots entre *astérisques* sont mis en couleur d'accent. */
const txt = (max: number) => z.string().trim().min(1).max(max);

/** Effets sonores disponibles (générés dans le navigateur). */
export const SFX = ['whoosh', 'pop', 'click', 'impact', 'riser', 'chime', 'fizz', 'bubble', 'swipe', 'glitch'] as const;
export type Sfx = (typeof SFX)[number];
/** Textures de fond « signature » de la marque. */
export const MOTIFS = ['flow', 'particles', 'bubbles', 'grain', 'waves', 'confetti', 'sparkles', 'lines', 'none'] as const;
export type Motif = (typeof MOTIFS)[number];
/** Transitions entre scènes. */
export const TRANSITIONS = ['flash', 'slide', 'zoom', 'wipe', 'glitch', 'blur'] as const;
export type Transition = (typeof TRANSITIONS)[number];
/** Animations de texte (typographie cinétique). */
export const TEXT_ANIMS = ['rise', 'slam', 'mask', 'split', 'type', 'curve', 'blur'] as const;
export type TextAnim = (typeof TEXT_ANIMS)[number];
export const TEXT_ANIM_LABELS: Record<TextAnim, string> = { rise: 'Montée', slam: 'Impact', mask: 'Masque', split: 'Éclaté', type: 'Machine à écrire', curve: 'Ruban (lettres en courbe)', blur: 'Mise au point (flou → net)' };

/** Ambiances musicales générées. */
export const MUSIC = ['pop', 'electro', 'chill', 'epic', 'acoustic', 'hiphop', 'none'] as const;
export type Music = (typeof MUSIC)[number];

/** « Apparitions magiques » : éléments qui surgissent par-dessus une scène. */
export const MAGIC_KINDS = ['notification', 'sticker', 'badge', 'button', 'emoji', 'review', 'qr'] as const;
export type MagicKind = (typeof MAGIC_KINDS)[number];
export const MagicSchema = z.object({
  kind: z.enum(MAGIC_KINDS),
  text: z.string().trim().min(1).max(60),
  sub: z.string().trim().max(60).optional(),
  emoji: z.string().max(8).optional(),
  /** Seconde d'apparition, à partir du début de la scène. */
  at: z.number().min(0).max(8),
  pos: z.enum(['top', 'center', 'bottom']).optional(),
  sfx: z.enum(['whoosh', 'pop', 'click', 'impact', 'riser', 'chime', 'fizz', 'bubble', 'swipe', 'glitch']).optional()
});
export type Magic = z.infer<typeof MagicSchema>;
export const MAGIC_LABELS: Record<MagicKind, string> = {
  notification: 'Notification', sticker: 'Sticker « lien en bio »', badge: 'Badge', button: 'Bouton cliqué', emoji: 'Objet / emoji 3D', review: 'Avis client (réel)', qr: 'QR code vers votre lien'
};

/** Nombre maximum de scènes dans une vidéo. */
export const MAX_SCENES = 12;
/** Nombre maximum de photos importées. */
export const MAX_PHOTOS = 12;

// ---------- Scène libre : le motion designer IA dessine ce qu'il veut ----------
/** Courbes d'animation disponibles pour les images clés. */
export const EASES = ['linear', 'in', 'out', 'inOut', 'back', 'elastic', 'bounce', 'expo'] as const;
const num = z.number().min(-10000).max(10000);
/** Valeur animée : un nombre / une couleur fixe, ou des images clés [{ t (s), v, e (courbe) }]. */
const keyed = <T extends z.ZodTypeAny>(v: T) => z.union([v, z.array(z.object({ t: z.number().min(0).max(15), v, e: z.enum(EASES).optional() })).min(1).max(12)]);
const anum = keyed(num);
const acol = keyed(hex);
const paint = z.union([hex, z.object({ from: hex, to: hex, angle: z.number().min(-360).max(360).optional(), radial: z.boolean().optional() })]);
export const LAYER_KINDS = ['text', 'rect', 'ellipse', 'path', 'image', 'particles', 'glow', 'flow', 'group'] as const;
const layerBase = {
  /** Position du centre en fraction de l'écran (0 = gauche / haut, 1 = droite / bas). */
  x: anum.optional(), y: anum.optional(),
  scale: anum.optional(), sx: anum.optional(), sy: anum.optional(),
  /** Rotation en degrés ; ry / rx = bascule 3D autour de l'axe vertical / horizontal (−85 à 85). */
  rotate: anum.optional(), ry: anum.optional(), rx: anum.optional(),
  opacity: anum.optional(),
  /** Flou en px (toutes les tailles sont en px sur un écran dont le petit côté fait 1080). */
  blur: anum.optional(),
  glow: z.object({ color: hex, size: z.number().min(0).max(200) }).optional(),
  shadow: z.boolean().optional(),
  blend: z.enum(['normal', 'add', 'screen', 'multiply', 'overlay']).optional(),
  /** Traînée de flou de mouvement quand le calque bouge vite. */
  motionBlur: z.boolean().optional(),
  /** Fenêtre de visibilité dans la scène (s). */
  from: z.number().min(0).max(15).optional(), to: z.number().min(0).max(15).optional()
};
const TextLayer = z.object({
  kind: z.literal('text'), ...layerBase,
  text: z.string().trim().min(1).max(120),
  /** Taille du texte en px (90 ≈ gros titre, 40 ≈ sous-titre). */
  size: z.number().min(8).max(500).optional(),
  weight: z.number().min(100).max(900).optional(),
  color: acol.optional(),
  fill: paint.optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  /** Largeur max en fraction de la largeur de l'écran (retour à la ligne). */
  maxWidth: z.number().min(0.1).max(1).optional(),
  tracking: z.number().min(-0.2).max(1).optional(),
  upper: z.boolean().optional(),
  italic: z.boolean().optional(),
  serif: z.boolean().optional(),
  stroke: z.object({ color: hex, width: z.number().min(0.5).max(20) }).optional(),
  /** Révélation lettre par lettre ou mot par mot. */
  reveal: z.enum(['none', 'type', 'rise', 'blur', 'curve', 'split', 'mask', 'scale', 'wave']).optional(),
  revealBy: z.enum(['char', 'word', 'line']).optional(),
  revealAt: z.number().min(0).max(15).optional(),
  revealDur: z.number().min(0.1).max(8).optional()
});
const RectLayer = z.object({ kind: z.literal('rect'), ...layerBase, w: anum, h: anum, radius: anum.optional(), fill: paint.optional(), color: acol.optional(), stroke: z.object({ color: hex, width: z.number().min(0.5).max(40) }).optional(), progress: anum.optional() });
const EllipseLayer = z.object({ kind: z.literal('ellipse'), ...layerBase, w: anum, h: anum.optional(), fill: paint.optional(), color: acol.optional(), stroke: z.object({ color: hex, width: z.number().min(0.5).max(40) }).optional(), progress: anum.optional() });
const PathLayer = z.object({
  kind: z.literal('path'), ...layerBase,
  /** Tracé SVG dans un repère 0–1000 × 0–1000 centré sur (x, y) ; "w" = largeur affichée en px. */
  d: z.string().max(3000),
  w: anum.optional(),
  color: acol.optional(), width: z.number().min(0.5).max(80).optional(),
  fill: paint.optional(),
  /** Part du tracé dessinée (0 → 1 = le trait se dessine). */
  progress: anum.optional(),
  /** Début du trait (0 → 1 : la queue suit la tête, effet comète / ligne qui traverse). */
  start: anum.optional(),
  cap: z.enum(['round', 'butt', 'square']).optional()
});
const ImageLayer = z.object({ kind: z.literal('image'), ...layerBase, src: z.string().regex(/^(logo|photo:\d{1,2}|search:.{2,60})$/), w: anum, h: anum.optional(), fit: z.enum(['cover', 'contain']).optional(), radius: z.number().min(0).max(1000).optional() });
const ParticlesLayer = z.object({ kind: z.literal('particles'), ...layerBase, mode: z.enum(['float', 'burst', 'rain', 'orbit', 'sparkle', 'converge']), count: z.number().int().min(1).max(160), color: hex, color2: hex.optional(), size: z.number().min(1).max(80).optional(), spread: z.number().min(0.01).max(1.5).optional(), speed: z.number().min(0).max(5).optional(), at: z.number().min(0).max(15).optional() });
const GlowLayer = z.object({ kind: z.literal('glow'), ...layerBase, color: acol, size: anum });
const FlowLayer = z.object({ kind: z.literal('flow'), ...layerBase, colors: z.array(hex).min(1).max(4), intensity: z.number().min(0).max(2).optional() });
type LayerIn = z.infer<typeof TextLayer> | z.infer<typeof RectLayer> | z.infer<typeof EllipseLayer> | z.infer<typeof PathLayer> | z.infer<typeof ImageLayer> | z.infer<typeof ParticlesLayer> | z.infer<typeof GlowLayer> | z.infer<typeof FlowLayer> | ({ kind: 'group'; children: LayerIn[] } & Partial<Record<keyof typeof layerBase, unknown>>);
export const LeafLayer = z.discriminatedUnion('kind', [TextLayer, RectLayer, EllipseLayer, PathLayer, ImageLayer, ParticlesLayer, GlowLayer, FlowLayer]);
export const GroupLayer = z.object({ kind: z.literal('group'), ...layerBase, children: z.array(LeafLayer).min(1).max(24) });
export const LayerSchema = z.union([LeafLayer, GroupLayer]);
export type Layer = z.infer<typeof LayerSchema>;
export type LeafLayerT = z.infer<typeof LeafLayer>;
export type Keyed<T> = T | { t: number; v: T; e?: (typeof EASES)[number] }[];
void (null as unknown as LayerIn);

export const FreeSceneSchema = z.object({
  type: z.literal('free'),
  duration,
  sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(),
  /** Nom de la scène dans l'éditeur. */
  name: z.string().trim().max(40).optional(),
  /** Fond : "theme" (fond animé de la marque), une couleur, ou un dégradé. */
  bg: z.union([z.literal('theme'), paint]).optional(),
  /** Caméra : zoom, déplacement (fraction d'écran), rotation (degrés). */
  camera: z.object({ zoom: anum.optional(), x: anum.optional(), y: anum.optional(), rotate: anum.optional(), shake: z.number().min(0).max(1).optional() }).optional(),
  layers: z.array(LayerSchema).min(1).max(40),
  /** Bruitages placés dans la scène. */
  cues: z.array(z.object({ at: z.number().min(0).max(15), sfx: z.enum(SFX) })).max(12).optional()
});

export const SceneSchema = z.discriminatedUnion('type', [
  FreeSceneSchema,
  z.object({ type: z.literal('title'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), title: txt(90), subtitle: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal('bullets'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), title: txt(60), items: z.array(txt(60)).min(1).max(4) }),
  z.object({
    type: z.literal('stat'),
    duration,
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(),
    value: z.number().min(-1e9).max(1e9),
    prefix: z.string().max(4).optional(),
    suffix: z.string().max(6).optional(),
    label: txt(70)
  }),
  z.object({ type: z.literal('screenshot'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), caption: txt(80) }),
  z.object({ type: z.literal('quote'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), text: txt(160), author: z.string().trim().max(50).optional() }),
  /** Révélation du logo / nom de marque (signe lumineux + nom qui sort de derrière). */
  z.object({ type: z.literal('logo'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), title: txt(32), subtitle: z.string().trim().max(80).optional() }),
  /** Rangée de boutons lumineux : un curseur arrive et clique sur l'un d'eux. */
  z.object({ type: z.literal('chips'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), title: z.string().trim().max(60).optional(), items: z.array(txt(22)).min(2).max(5), pick: z.number().int().min(0).max(4) }),
  /** Barre de saisie façon assistant : la demande du client se tape lettre par lettre (caméra qui recule). */
  z.object({ type: z.literal('prompt'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), text: txt(120), label: z.string().trim().max(24).optional() }),
  /** Maquette de site / d'écran en 3D qui pivote et se pose, avec changement de couleur possible. */
  z.object({
    type: z.literal('mockup'),
    duration,
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(),
    title: txt(60),
    nav: z.array(z.string().trim().min(1).max(14)).max(4).optional(),
    button: z.string().trim().max(24).optional(),
    photo: z.number().int().min(0).max(11).optional(),
    recolor: hex.optional()
  }),
  z.object({ type: z.literal('cta'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(), title: txt(70), button: txt(30) }),
  z.object({
    type: z.literal('video'),
    duration: z.number().min(1.5).max(15),
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(),
    /** Index de la vidéo importée par le client (0, 1 ou 2). */
    media: z.number().int().min(0).max(2),
    /** Seconde de départ dans la vidéo importée. */
    from: z.number().min(0).max(3600),
    caption: z.string().trim().max(80).optional(),
    captionPos: z.enum(['top', 'bottom']).optional(),
    layout: z.enum(['full', 'frame'])
  }),
  z.object({
    type: z.literal('photo'),
    duration,
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), anim: z.enum(TEXT_ANIMS).optional(),
    /** Index de la photo importée par le client (0 à 11). */
    photo: z.number().int().min(0).max(11),
    caption: z.string().trim().max(80).optional(),
    captionPos: z.enum(['top', 'bottom']).optional(),
    layout: z.enum(['full', 'frame'])
  })
]);

export const MotionProjectSchema = z.object({
  format: z.enum(['9:16', '16:9', '1:1']),
  brand: z.string().trim().max(40),
  theme: z.object({
    background: hex,
    primary: hex,
    accent: hex,
    text: hex,
    style: z.enum(['neon', 'clean', 'bold']),
    motif: z.enum(MOTIFS).optional(),
    /** Style des boutons / cartes repris du site du client. */
    radius: z.enum(['square', 'rounded', 'pill']).optional(),
    /** Animation de texte par défaut de la pub. */
    anim: z.enum(TEXT_ANIMS).optional()
  }),
  transition: z.enum(TRANSITIONS).optional(),
  sound: z
    .object({
      music: z.enum(MUSIC),
      bpm: z.number().min(60).max(170),
      /** Volume de la musique (0 à 1). */
      volume: z.number().min(0).max(1).optional()
    })
    .optional(),
  scenes: z.array(SceneSchema).min(1).max(MAX_SCENES)
});

export type Scene = z.infer<typeof SceneSchema>;

/** Le concept créatif rédigé par l'IA (direction artistique, son, storyboard). */
export const ConceptSchema = z.object({
  brand_name: z.string().max(80),
  creative_concept: z.string().max(700),
  art_direction: z.object({
    visual_theme: z.string().max(500),
    color_palette: z.array(z.string().max(40)).max(6),
    music_style: z.string().max(200),
    brand_signature_sfx: z.array(z.string().max(80)).max(5)
  }),
  signatures: z.array(z.string().max(160)).max(3).optional(),
  /** Analyse : proposition de valeur, cible, émotion, levier de conversion. */
  strategy: z
    .object({ value: z.string().max(240), audience: z.string().max(240), emotion: z.string().max(120), lever: z.string().max(160) })
    .optional(),
  /** Script de voix-off chronométré avec marqueurs de bruitages. */
  voiceover: z.array(z.object({ time: z.string().max(20), text: z.string().max(240), sfx: z.string().max(80).optional() })).max(8).optional(),
  scenes: z
    .array(
      z.object({
        timeframe: z.string().max(40),
        idea: z.string().max(300).optional(),
        visual_motion_description: z.string().max(500),
        motion_design_effects: z.string().max(400).optional(),
        brand_assets_integration: z.string().max(300).optional(),
        typography_animation: z.string().max(200).optional(),
        text_on_screen: z.string().max(160),
        sound_design: z.string().max(300)
      })
    )
    .max(5)
});
export type Concept = z.infer<typeof ConceptSchema>;
export type SceneType = Scene['type'];
export type MotionProject = z.infer<typeof MotionProjectSchema>;

export const FORMAT_SIZE: Record<MotionProject['format'], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 }
};

export const MOTIF_LABELS: Record<Motif, string> = {
  flow: 'Flux lumineux (cinéma)', particles: 'Particules', bubbles: 'Bulles', grain: 'Grain / farine', waves: 'Vagues', confetti: 'Confettis', sparkles: 'Paillettes', lines: 'Vitesse', none: 'Aucune'
};
export const TRANSITION_LABELS: Record<Transition, string> = { flash: 'Flash', slide: 'Glissé', zoom: 'Zoom', wipe: 'Volet', glitch: 'Glitch', blur: 'Flou de mouvement' };
export const MUSIC_LABELS: Record<Music, string> = { pop: 'Pop', electro: 'Électro', chill: 'Chill / lo-fi', epic: 'Épique', acoustic: 'Acoustique', hiphop: 'Hip-hop', none: 'Sans musique' };
export const SFX_LABELS: Record<Sfx, string> = {
  whoosh: 'Whoosh', pop: 'Pop', click: 'Clic', impact: 'Impact', riser: 'Montée', chime: 'Carillon', fizz: 'Pétillant', bubble: 'Bulles', swipe: 'Swipe', glitch: 'Glitch'
};

export const SCENE_LABELS: Record<SceneType, string> = {
  title: 'Titre',
  bullets: 'Liste',
  stat: 'Chiffre clé',
  screenshot: 'Capture produit',
  quote: 'Citation',
  cta: 'Appel à l’action',
  video: 'Votre vidéo',
  photo: 'Votre photo',
  logo: 'Révélation du logo',
  chips: 'Boutons + clic',
  prompt: 'Demande tapée (assistant)',
  mockup: 'Maquette 3D du site',
  free: 'Création libre (IA)'
};

export const TRANSITION = 0.45;

export function totalDuration(project: MotionProject): number {
  return project.scenes.reduce((sum, s) => sum + s.duration, 0);
}

export function defaultScene(type: SceneType): Scene {
  switch (type) {
    case 'title':
      return { type, duration: 3, title: 'Votre *message* ici', subtitle: 'Une phrase pour accrocher' };
    case 'bullets':
      return { type, duration: 4, title: 'Pourquoi nous ?', items: ['Rapide', 'Simple', 'Efficace'] };
    case 'stat':
      return { type, duration: 3, value: 87, suffix: '%', label: 'de clients satisfaits' };
    case 'screenshot':
      return { type, duration: 3.5, caption: 'Tout se fait en *un clic*' };
    case 'quote':
      return { type, duration: 4, text: 'Le meilleur moment pour commencer, c’est *maintenant*.', author: 'Votre marque' };
    case 'cta':
      return { type, duration: 3, title: 'Essayez *gratuitement*', button: 'Commencer' };
    case 'video':
      return { type, duration: 4, media: 0, from: 0, caption: 'Découvrez *notre savoir-faire*', layout: 'full' };
    case 'photo':
      return { type, duration: 3, photo: 0, caption: 'Fait *avec passion*', layout: 'full' };
    case 'logo':
      return { type, duration: 2.5, title: 'Votre marque' };
    case 'chips':
      return { type, duration: 3, items: ['Découvrir', 'Réserver', 'Contact'], pick: 1 };
    case 'prompt':
      return { type, duration: 3.5, text: 'Je veux un rendez-vous cette semaine', label: 'Votre marque' };
    case 'free':
      return {
        type, duration: 3, name: 'Création libre', bg: 'theme',
        camera: { zoom: [{ t: 0, v: 1.15, e: 'expo' }, { t: 1.2, v: 1 }] },
        layers: [
          { kind: 'glow', x: 0.5, y: 0.5, color: '#a990ff', size: [{ t: 0, v: 0 }, { t: 0.8, v: 700, e: 'out' }], blend: 'add' },
          { kind: 'path', x: 0.5, y: 0.5, w: 700, d: 'M 100 500 C 300 100, 700 900, 900 500', color: '#ffffff', width: 10, progress: [{ t: 0.1, v: 0 }, { t: 1.1, v: 1, e: 'inOut' }], glow: { color: '#a990ff', size: 30 } },
          { kind: 'text', x: 0.5, y: 0.5, text: 'Votre *idée*', size: 110, weight: 800, reveal: 'blur', revealAt: 0.5 }
        ]
      };
    case 'mockup':
      return { type, duration: 3.5, title: 'Votre *savoir-faire* en ligne', nav: ['Accueil', 'Offres', 'Contact'], button: 'Réserver' };
  }
}

export const THEME_PRESETS: { name: string; theme: MotionProject['theme'] }[] = [
  { name: 'Néon', theme: { background: '#0b0920', primary: '#a990ff', accent: '#ffbe76', text: '#ffffff', style: 'neon' } },
  { name: 'Océan', theme: { background: '#06122b', primary: '#4f8cff', accent: '#22d3ee', text: '#ffffff', style: 'clean' } },
  { name: 'Sunset', theme: { background: '#1a0b16', primary: '#ff5c8a', accent: '#ffb547', text: '#ffffff', style: 'bold' } },
  { name: 'Luxe', theme: { background: '#0e0d0b', primary: '#e6c375', accent: '#f5e6c4', text: '#fdf8ef', style: 'clean' } },
  { name: 'Clair', theme: { background: '#f4f5f9', primary: '#5b5bf6', accent: '#ff4d8d', text: '#101225', style: 'clean' } }
];

export const TEMPLATES: { id: string; name: string; description: string; project: MotionProject }[] = [
  {
    id: 'cinema',
    name: 'Démo cinématique',
    description: 'Le style des pubs motion design qui cartonnent : lumière liquide, curseur, maquette 3D',
    project: {
      format: '9:16',
      brand: 'Votre marque',
      theme: { background: '#050505', primary: '#ff7a1a', accent: '#ffc23d', text: '#ffffff', style: 'neon', motif: 'flow', radius: 'pill', anim: 'blur' },
      transition: 'blur',
      sound: { music: 'electro', bpm: 122, volume: 0.8 },
      scenes: [
        { type: 'logo', duration: 2.5, title: 'Votre marque', subtitle: 'Votre signature' },
        { type: 'chips', duration: 3, title: 'Vous cherchez *quoi* ?', items: ['Découvrir', 'Réserver', 'Commander', 'Contact'], pick: 1 },
        { type: 'prompt', duration: 3.5, text: 'Je veux réserver cette semaine, près de chez moi', label: 'Votre marque' },
        { type: 'mockup', duration: 3.5, title: 'Tout votre *savoir-faire*', nav: ['Accueil', 'Offres', 'Contact'], button: 'Réserver', recolor: '#2f6bff' },
        { type: 'title', duration: 2.5, anim: 'curve', title: 'Réservez *en 1 clic*.' }
      ]
    }
  },
  {
    id: 'libre',
    name: 'Création libre IA',
    description: 'Tout dessiné et animé par l’IA : tracé néon, typo brutaliste, cartes 3D. Demandez n’importe quel style',
    project: {"format": "9:16", "brand": "Volt", "theme": {"background": "#05040a", "primary": "#7c5cff", "accent": "#22d3ee", "text": "#ffffff", "style": "neon", "motif": "none", "anim": "blur"}, "transition": "blur", "scenes": [{"type": "free", "duration": 3, "bg": {"from": "#0a0620", "to": "#000000", "radial": true}, "camera": {"zoom": [{"t": 0, "v": 1.3}, {"t": 1.4, "v": 1, "e": "expo"}], "shake": 0.2}, "layers": [{"kind": "glow", "x": 0.5, "y": 0.42, "color": "#7c5cff", "size": [{"t": 0, "v": 0}, {"t": 0.9, "v": 650, "e": "out"}], "blend": "add"}, {"kind": "path", "x": 0.5, "y": 0.42, "w": 420, "d": "M 560 60 L 260 560 L 500 560 L 420 940 L 760 380 L 520 380 Z", "color": "#ffffff", "width": 14, "progress": [{"t": 0.1, "v": 0}, {"t": 1.1, "v": 1, "e": "inOut"}], "glow": {"color": "#22d3ee", "size": 40}}, {"kind": "path", "x": 0.5, "y": 0.42, "w": 420, "d": "M 560 60 L 260 560 L 500 560 L 420 940 L 760 380 L 520 380 Z", "fill": {"from": "#22d3ee", "to": "#7c5cff", "angle": 90}, "opacity": [{"t": 1.0, "v": 0}, {"t": 1.4, "v": 1}]}, {"kind": "particles", "x": 0.5, "y": 0.42, "mode": "burst", "count": 70, "color": "#22d3ee", "color2": "#ffffff", "size": 8, "spread": 0.6, "at": 1.1}, {"kind": "text", "x": 0.5, "y": 0.68, "text": "VOLT", "size": 190, "weight": 900, "tracking": 0.25, "reveal": "blur", "revealBy": "char", "revealAt": 1.2, "fill": {"from": "#ffffff", "to": "#22d3ee", "angle": 90}}, {"kind": "text", "x": 0.5, "y": 0.75, "text": "L'énergie *qui se recharge*", "size": 46, "weight": 500, "reveal": "rise", "revealAt": 1.7}], "cues": [{"at": 0.1, "sfx": "riser"}, {"at": 1.1, "sfx": "impact"}]}, {"type": "free", "duration": 3, "bg": "#f3eee6", "layers": [{"kind": "rect", "x": [{"t": 0, "v": -0.6}, {"t": 0.5, "v": 0.5, "e": "expo"}], "y": 0.3, "w": 1300, "h": 330, "color": "#ff4d2e", "rotate": -6, "motionBlur": true}, {"kind": "rect", "x": [{"t": 0.15, "v": 1.6}, {"t": 0.65, "v": 0.5, "e": "expo"}], "y": 0.52, "w": 1300, "h": 330, "color": "#111111", "rotate": 4, "motionBlur": true}, {"kind": "text", "x": 0.5, "y": 0.3, "text": "FAIT", "size": 250, "weight": 900, "color": "#111111", "rotate": -6, "reveal": "mask", "revealBy": "word", "revealAt": 0.45}, {"kind": "text", "x": 0.5, "y": 0.52, "text": "MAIN", "size": 250, "weight": 900, "color": "#f3eee6", "rotate": 4, "reveal": "mask", "revealBy": "word", "revealAt": 0.6}, {"kind": "text", "x": 0.5, "y": 0.71, "text": "Atelier ouvert du mardi au samedi", "size": 44, "weight": 600, "color": "#111111", "reveal": "type", "revealAt": 1.0}, {"kind": "ellipse", "x": 0.78, "y": 0.15, "w": [{"t": 0.9, "v": 0}, {"t": 1.4, "v": 220, "e": "back"}], "stroke": {"color": "#ff4d2e", "width": 8}, "progress": [{"t": 0.9, "v": 0}, {"t": 1.6, "v": 1, "e": "out"}]}], "cues": [{"at": 0.05, "sfx": "swipe"}, {"at": 0.2, "sfx": "swipe"}, {"at": 0.5, "sfx": "impact"}]}, {"type": "free", "duration": 3.2, "bg": "theme", "camera": {"zoom": [{"t": 0, "v": 1}, {"t": 3.2, "v": 1.08, "e": "linear"}]}, "layers": [{"kind": "flow", "colors": ["#7c5cff", "#ff4d8d"], "intensity": 0.9}, {"kind": "group", "x": 0.5, "y": [{"t": 0, "v": 0.62}, {"t": 1, "v": 0.5, "e": "expo"}], "rotate": [{"t": 0, "v": -12}, {"t": 1.2, "v": 0, "e": "back"}], "children": [{"kind": "rect", "x": 0.5, "y": 0.5, "w": 620, "h": 820, "radius": 48, "fill": {"from": "#2a1b5e", "to": "#7c5cff", "angle": 120}, "rotate": [{"t": 0.2, "v": 0}, {"t": 1.2, "v": -10, "e": "back"}], "opacity": 0.7}, {"kind": "rect", "x": 0.5, "y": 0.5, "w": 620, "h": 820, "radius": 48, "fill": {"from": "#3b1f63", "to": "#ff4d8d", "angle": 120}, "rotate": [{"t": 0.2, "v": 0}, {"t": 1.2, "v": 7, "e": "back"}], "opacity": 0.8}, {"kind": "rect", "x": 0.5, "y": 0.5, "w": 620, "h": 820, "radius": 48, "fill": {"from": "#0d0b1a", "to": "#1c1240", "angle": 90}, "stroke": {"color": "#ffffff", "width": 3}, "shadow": true}, {"kind": "text", "x": 0.5, "y": 0.44, "text": "Nouvelle *collection*", "size": 82, "weight": 800, "maxWidth": 0.5, "reveal": "curve", "revealAt": 0.8}, {"kind": "rect", "x": 0.5, "y": 0.58, "w": [{"t": 1.5, "v": 0}, {"t": 2, "v": 300, "e": "back"}], "h": 90, "radius": 45, "color": "#ffffff"}, {"kind": "text", "x": 0.5, "y": 0.58, "text": "Découvrir", "size": 38, "weight": 700, "color": "#111111", "opacity": [{"t": 1.8, "v": 0}, {"t": 2.1, "v": 1}]}]}, {"kind": "particles", "x": 0.5, "y": 0.5, "mode": "sparkle", "count": 24, "color": "#ffffff", "size": 14, "spread": 0.55}], "cues": [{"at": 0.1, "sfx": "whoosh"}, {"at": 1.6, "sfx": "pop"}]}]} as MotionProject
  },
  {
    id: 'product',
    name: 'Pub produit',
    description: 'Présentez votre appli ou votre offre en 15 s',
    project: {
      format: '9:16',
      brand: 'MonAppli',
      theme: THEME_PRESETS[0].theme,
      scenes: [
        { type: 'title', duration: 3, title: 'Vos factures en *30 secondes*', subtitle: 'Fini la paperasse' },
        { type: 'screenshot', duration: 3.5, caption: 'Une interface *ultra simple*' },
        { type: 'bullets', duration: 4, title: 'Ce qui change', items: ['Devis en 1 clic', 'Relances automatiques', 'Paiement en ligne'] },
        { type: 'stat', duration: 3, value: 10, suffix: 'h', label: 'gagnées chaque mois' },
        { type: 'cta', duration: 3, title: 'Essayez *gratuitement*', button: 'monappli.fr' }
      ]
    }
  },
  {
    id: 'stats',
    name: 'Chiffres clés',
    description: 'Des chiffres qui frappent, parfait pour LinkedIn',
    project: {
      format: '1:1',
      brand: 'MaMarque',
      theme: THEME_PRESETS[1].theme,
      scenes: [
        { type: 'title', duration: 2.5, title: '2025 en *chiffres*' },
        { type: 'stat', duration: 3, value: 12500, suffix: '+', label: 'clients accompagnés' },
        { type: 'stat', duration: 3, value: 98, suffix: '%', label: 'de satisfaction' },
        { type: 'stat', duration: 3, value: 4.9, suffix: '/5', label: 'note moyenne' },
        { type: 'cta', duration: 3, title: 'Merci à *vous*', button: 'Rejoignez-nous' }
      ]
    }
  },
  {
    id: 'quote',
    name: 'Conseil / citation',
    description: 'Un conseil animé pour vos réseaux',
    project: {
      format: '9:16',
      brand: '@moncompte',
      theme: THEME_PRESETS[2].theme,
      scenes: [
        { type: 'title', duration: 2.5, title: '1 conseil pour *vendre plus*' },
        { type: 'quote', duration: 4.5, text: 'Les gens n’achètent pas un produit, ils achètent une *transformation*.' },
        { type: 'bullets', duration: 4, title: 'Concrètement', items: ['Montrez l’avant / après', 'Parlez du résultat', 'Donnez une preuve'] },
        { type: 'cta', duration: 3, title: 'Abonne-toi pour *la suite*', button: 'Suivre' }
      ]
    }
  }
];
