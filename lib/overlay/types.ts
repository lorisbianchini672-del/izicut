/**
 * Studio d'effets — calques posés PAR-DESSUS la vidéo du client
 * (textes animés, emojis, zooms, formes, intro, carte de fin, filtres…).
 * Même schéma pour l'éditeur, le moteur de rendu et les réponses de l'IA.
 */
import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const unit = z.number().min(0).max(1);
const base = { id: z.string().min(1).max(40), start: z.number().min(0).max(3600), end: z.number().min(0).max(3600) };

export const TEXT_ANIMS = ['pop', 'fade', 'slide', 'bounce', 'zoom', 'typewriter', 'words'] as const;
export const TEXT_BOXES = ['none', 'box', 'pill', 'highlight', 'outline'] as const;
export const EMOJI_ANIMS = ['pop', 'bounce', 'float', 'spin', 'shake'] as const;
export const SHAPES = ['arrow', 'circle', 'underline', 'box'] as const;
export const FILTERS = ['bw', 'warm', 'cool', 'vibrant', 'vintage', 'cinema', 'dark'] as const;
export const ZOOM_EASES = ['smooth', 'punch', 'shake'] as const;
/** Effets appliqués à l'IMAGE de la vidéo elle-même (pas des ajouts). */
export const VIDEO_FX = ['glitch', 'rgb', 'mirror', 'pulse', 'strobe', 'echo', 'invert', 'grain', 'vhs', 'spin', 'split', 'blur', 'zoomin', 'shake'] as const;

export const LayerSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('text'),
    text: z.string().trim().min(1).max(140),
    x: unit,
    y: unit,
    size: z.number().min(20).max(220),
    color: hex,
    accent: hex.optional(),
    box: z.enum(TEXT_BOXES),
    boxColor: hex.optional(),
    anim: z.enum(TEXT_ANIMS),
    uppercase: z.boolean().optional()
  }),
  z.object({ ...base, type: z.literal('emoji'), emoji: z.string().min(1).max(12), x: unit, y: unit, size: z.number().min(40).max(500), anim: z.enum(EMOJI_ANIMS) }),
  z.object({ ...base, type: z.literal('zoom'), scale: z.number().min(1.05).max(2.2), x: unit, y: unit, ease: z.enum(ZOOM_EASES) }),
  z.object({
    ...base,
    type: z.literal('shape'),
    shape: z.enum(SHAPES),
    x: unit,
    y: unit,
    w: z.number().min(0.03).max(1),
    h: z.number().min(0.01).max(1),
    color: hex,
    rotation: z.number().min(-180).max(180)
  }),
  z.object({ ...base, type: z.literal('progress'), color: hex, position: z.enum(['top', 'bottom']) }),
  z.object({ ...base, type: z.literal('intro'), title: z.string().trim().min(1).max(90), subtitle: z.string().trim().max(110).optional(), color: hex, backdrop: z.enum(['dark', 'blur', 'color']) }),
  z.object({ ...base, type: z.literal('endcard'), title: z.string().trim().min(1).max(80), button: z.string().trim().max(30).optional(), brand: z.string().trim().max(40).optional(), color: hex }),
  z.object({ ...base, type: z.literal('filter'), filter: z.enum(FILTERS), intensity: unit }),
  z.object({ ...base, type: z.literal('flash'), color: hex }),
  /** Vitesse de lecture sur un passage : ralenti (< 1) ou accéléré (> 1). */
  z.object({ ...base, type: z.literal('speed'), rate: z.number().min(0.25).max(4) }),
  /** Passage supprimé de la vidéo. */
  z.object({ ...base, type: z.literal('cut') }),
  /** Arrêt sur image : l'image de « start » reste figée « hold » secondes. */
  z.object({ ...base, type: z.literal('freeze'), hold: z.number().min(0.2).max(5) }),
  /** Effet visuel sur la vidéo ; « beat » = calé sur les temps forts de la musique. */
  z.object({ ...base, type: z.literal('effect'), effect: z.enum(VIDEO_FX), intensity: unit, beat: z.boolean().optional() })
]);

export type Layer = z.infer<typeof LayerSchema>;
export type LayerType = Layer['type'];
export const LayersSchema = z.array(LayerSchema).max(60);

export const LAYER_LABELS: Record<LayerType, string> = {
  text: 'Texte',
  emoji: 'Emoji',
  zoom: 'Zoom',
  shape: 'Forme',
  progress: 'Barre de progression',
  intro: 'Titre d’intro',
  endcard: 'Carte de fin',
  filter: 'Filtre',
  flash: 'Flash',
  speed: 'Vitesse',
  cut: 'Coupe',
  freeze: 'Arrêt sur image',
  effect: 'Effet vidéo'
};

export const LAYER_COLORS: Record<LayerType, string> = {
  text: '#c8ff3d',
  emoji: '#ffb547',
  zoom: '#3de0ff',
  shape: '#ff5c8a',
  progress: '#a78bfa',
  intro: '#c8ff3d',
  endcard: '#4ade80',
  filter: '#94a3b8',
  flash: '#ffffff',
  speed: '#f472b6',
  cut: '#ef4444',
  freeze: '#60a5fa',
  effect: '#e879f9'
};

export const ANIM_LABELS: Record<(typeof TEXT_ANIMS)[number], string> = {
  pop: 'Pop',
  fade: 'Fondu',
  slide: 'Glisse',
  bounce: 'Rebond',
  zoom: 'Zoom',
  typewriter: 'Machine à écrire',
  words: 'Mot par mot'
};
export const BOX_LABELS: Record<(typeof TEXT_BOXES)[number], string> = {
  none: 'Contour',
  box: 'Bloc',
  pill: 'Bulle',
  highlight: 'Surligné',
  outline: 'Néon'
};
export const FX_LABELS: Record<(typeof VIDEO_FX)[number], string> = {
  glitch: 'Glitch',
  rgb: 'Décalage RVB',
  mirror: 'Miroir',
  pulse: 'Pulsation (zoom au rythme)',
  strobe: 'Stroboscope',
  echo: 'Traînée (écho)',
  invert: 'Négatif',
  grain: 'Grain film',
  vhs: 'VHS rétro',
  spin: 'Rotation',
  split: 'Écran divisé ×3',
  blur: 'Flou',
  zoomin: 'Zoom progressif',
  shake: 'Tremblement'
};

export const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  bw: 'Noir & blanc',
  warm: 'Chaud',
  cool: 'Froid',
  vibrant: 'Éclatant',
  vintage: 'Vintage',
  cinema: 'Cinéma',
  dark: 'Sombre'
};

let counter = 0;
export function newId(type: string): string {
  counter += 1;
  return `${type}-${Date.now().toString(36)}-${counter}`;
}

/** Calque par défaut, posé à l'instant t. */
export function defaultLayer(type: LayerType, t: number, duration: number): Layer {
  const id = newId(type);
  const span = (len: number) => {
    const start = Math.max(0, Math.min(t, Math.max(0, duration - 0.5)));
    return { start, end: Math.min(duration, start + len) };
  };
  switch (type) {
    case 'text':
      return { id, type, ...span(2.5), text: 'Votre *texte* ici', x: 0.5, y: 0.3, size: 90, color: '#ffffff', accent: '#c8ff3d', box: 'none', anim: 'pop', uppercase: true };
    case 'emoji':
      return { id, type, ...span(1.5), emoji: '🔥', x: 0.75, y: 0.25, size: 160, anim: 'pop' };
    case 'zoom':
      return { id, type, ...span(2), scale: 1.3, x: 0.5, y: 0.4, ease: 'smooth' };
    case 'shape':
      return { id, type, ...span(2), shape: 'circle', x: 0.5, y: 0.45, w: 0.4, h: 0.22, color: '#ff3b6b', rotation: 0 };
    case 'progress':
      return { id, type, start: 0, end: duration, color: '#c8ff3d', position: 'top' };
    case 'intro':
      return { id, type, start: 0, end: Math.min(duration, 2.2), title: 'Regarde *jusqu’au bout*', color: '#c8ff3d', backdrop: 'dark' };
    case 'endcard': {
      const start = Math.max(0, duration - 2.5);
      return { id, type, start, end: duration, title: 'Abonne-toi pour *la suite*', button: 'S’abonner', color: '#c8ff3d' };
    }
    case 'filter':
      return { id, type, start: 0, end: duration, filter: 'cinema', intensity: 0.7 };
    case 'flash':
      return { id, type, ...span(0.35), color: '#ffffff' };
    case 'speed':
      return { id, type, ...span(2), rate: 0.5 };
    case 'cut':
      return { id, type, ...span(1) };
    case 'freeze':
      return { id, type, ...span(0.2), hold: 1 };
    case 'effect':
      return { id, type, ...span(2), effect: 'glitch', intensity: 0.7, beat: true };
  }
}

/** Remet un calque dans les bornes de la vidéo. */
export function clampLayer(layer: Layer, duration: number): Layer {
  const start = Math.max(0, Math.min(layer.start, Math.max(0, duration - 0.1)));
  const end = Math.max(start + 0.1, Math.min(layer.end, duration));
  return { ...layer, start, end };
}
