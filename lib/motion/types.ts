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
export const MOTIFS = ['particles', 'bubbles', 'grain', 'waves', 'confetti', 'sparkles', 'lines', 'none'] as const;
export type Motif = (typeof MOTIFS)[number];
/** Transitions entre scènes. */
export const TRANSITIONS = ['flash', 'slide', 'zoom', 'wipe', 'glitch'] as const;
export type Transition = (typeof TRANSITIONS)[number];
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

export const SceneSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), title: txt(90), subtitle: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal('bullets'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), title: txt(60), items: z.array(txt(60)).min(1).max(4) }),
  z.object({
    type: z.literal('stat'),
    duration,
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(),
    value: z.number().min(-1e9).max(1e9),
    prefix: z.string().max(4).optional(),
    suffix: z.string().max(6).optional(),
    label: txt(70)
  }),
  z.object({ type: z.literal('screenshot'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), caption: txt(80) }),
  z.object({ type: z.literal('quote'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), text: txt(160), author: z.string().trim().max(50).optional() }),
  z.object({ type: z.literal('cta'), duration, sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(), title: txt(70), button: txt(30) }),
  z.object({
    type: z.literal('video'),
    duration: z.number().min(1.5).max(15),
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(),
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
    sfx: z.enum(SFX).optional(), magic: z.array(MagicSchema).max(3).optional(),
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
    radius: z.enum(['square', 'rounded', 'pill']).optional()
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
  particles: 'Particules', bubbles: 'Bulles', grain: 'Grain / farine', waves: 'Vagues', confetti: 'Confettis', sparkles: 'Paillettes', lines: 'Vitesse', none: 'Aucune'
};
export const TRANSITION_LABELS: Record<Transition, string> = { flash: 'Flash', slide: 'Glissé', zoom: 'Zoom', wipe: 'Volet', glitch: 'Glitch' };
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
  photo: 'Votre photo'
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
