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

/** Nombre maximum de scènes dans une vidéo. */
export const MAX_SCENES = 12;
/** Nombre maximum de photos importées. */
export const MAX_PHOTOS = 12;

export const SceneSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), duration, title: txt(90), subtitle: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal('bullets'), duration, title: txt(60), items: z.array(txt(60)).min(1).max(4) }),
  z.object({
    type: z.literal('stat'),
    duration,
    value: z.number().min(-1e9).max(1e9),
    prefix: z.string().max(4).optional(),
    suffix: z.string().max(6).optional(),
    label: txt(70)
  }),
  z.object({ type: z.literal('screenshot'), duration, caption: txt(80) }),
  z.object({ type: z.literal('quote'), duration, text: txt(160), author: z.string().trim().max(50).optional() }),
  z.object({ type: z.literal('cta'), duration, title: txt(70), button: txt(30) }),
  z.object({
    type: z.literal('video'),
    duration: z.number().min(1.5).max(15),
    /** Index de la vidéo importée par le client (0, 1 ou 2). */
    media: z.number().int().min(0).max(2),
    /** Seconde de départ dans la vidéo importée. */
    from: z.number().min(0).max(3600),
    caption: z.string().trim().max(80).optional(),
    layout: z.enum(['full', 'frame'])
  }),
  z.object({
    type: z.literal('photo'),
    duration,
    /** Index de la photo importée par le client (0 à 11). */
    photo: z.number().int().min(0).max(11),
    caption: z.string().trim().max(80).optional(),
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
    style: z.enum(['neon', 'clean', 'bold'])
  }),
  scenes: z.array(SceneSchema).min(1).max(MAX_SCENES)
});

export type Scene = z.infer<typeof SceneSchema>;
export type SceneType = Scene['type'];
export type MotionProject = z.infer<typeof MotionProjectSchema>;

export const FORMAT_SIZE: Record<MotionProject['format'], { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 }
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
  { name: 'Néon', theme: { background: '#07080d', primary: '#c8ff3d', accent: '#3de0ff', text: '#ffffff', style: 'neon' } },
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
