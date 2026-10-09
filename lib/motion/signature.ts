/**
 * Pub « signature » au rendu des grandes campagnes d'applis (type Spotify /
 * Apple) construite avec les PHOTOS DU CLIENT : révélation du logo, carrousel
 * numéroté, mur d'images incliné, carte en verre avec plongée de caméra et
 * validation, liste défilante, signature finale. Rendu garanti, immédiat, sans
 * attendre l'IA — puis tout reste modifiable (textes, couleurs, fond, ordre).
 */
import type { MotionProject, Scene } from './types';

type Opts = {
  photos: number;
  brand: string;
  theme: MotionProject['theme'];
  hasLogo?: boolean;
  tagline?: string;
  /** Points forts (liste défilante). */
  points?: string[];
  /** Noms des photos (étiquettes du carrousel). */
  labels?: string[];
  link?: string;
  format?: MotionProject['format'];
};

const clean = (s: string, n: number) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

export function buildSignatureAd(o: Opts): MotionProject {
  const n = Math.max(1, Math.min(12, o.photos));
  const brand = clean(o.brand || 'Votre marque', 32);
  const tagline = clean(o.tagline || 'Ce que vous aimez, en mieux.', 60);
  const ph = (i: number) => `photo:${i % n}`;
  const labels = Array.from({ length: n }, (_, i) => clean(o.labels?.[i]?.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ') || `Sélection ${i + 1}`, 24));
  const items = Array.from({ length: Math.min(n, 8) }, (_, i) => ({ src: ph(i), label: labels[i], sub: brand }));
  const wallItems = Array.from({ length: Math.min(n, 12) }, (_, i) => ({ src: ph(i) }));
  const points = (o.points?.length ? o.points : ['Pensé pour vous.', 'Fait avec passion.', 'Toujours plus proche.', 'Rejoignez-nous.']).map((p) => clean(p, 60)).slice(0, 6);
  const accent = o.theme.primary;
  const text = '#ffffff';
  const theme: MotionProject['theme'] = {
    ...o.theme,
    text,
    style: 'clean',
    motif: 'none',
    anim: 'blur',
    backdrop: { kind: 'glow', colors: [mixDark(accent, 0.93), mixDark(accent, 0.6), accent, mixLight(accent, 0.45)], speed: 1.5, intensity: 1.05 }
  };
  const logo = o.hasLogo
    ? { kind: 'image' as const, src: 'logo', x: 0.32, y: 0.45, w: 150, fit: 'contain' as const, opacity: [{ t: 0.1, v: 0 }, { t: 0.5, v: 1 }], scale: [{ t: 0.1, v: 0.6 }, { t: 0.7, v: 1, e: 'back' as const }] }
    : { kind: 'ellipse' as const, x: 0.32, y: 0.45, w: [{ t: 0.1, v: 0 }, { t: 0.6, v: 130, e: 'back' as const }], color: accent, glow: { color: accent, size: 40 } };

  const scenes: Scene[] = [
    // 1. Révélation de la marque, puis la phrase « pousse » le nom hors champ avec flou de mouvement.
    {
      type: 'free', duration: 2.6, name: 'Révélation', bg: 'theme',
      camera: { zoom: [{ t: 0, v: 1.08 }, { t: 2.6, v: 1, e: 'linear' }] },
      layers: [
        { ...logo, x: [{ t: 0, v: 0.3 }, { t: 1.15, v: 0.3 }, { t: 1.5, v: -0.45, e: 'in' }], motionBlur: true },
        { kind: 'text', x: [{ t: 0, v: 0.6 }, { t: 1.15, v: 0.6 }, { t: 1.5, v: -0.3, e: 'in' }], y: 0.45, text: brand, size: 92, weight: 800, align: 'center', maxWidth: 0.6, reveal: 'blur', revealBy: 'char', revealAt: 0.35, motionBlur: true, to: 1.55 },
        { kind: 'text', x: [{ t: 1.4, v: 1.5 }, { t: 1.9, v: 0.5, e: 'expo' }], y: 0.45, text: `Une pub signée *${brand}*.`, size: 84, weight: 800, maxWidth: 0.86, motionBlur: true, from: 1.4 }
      ],
      cues: [{ at: 0.3, sfx: 'riser' }, { at: 1.3, sfx: 'whoosh' }]
    },
    // 2. Carrousel numéroté des photos.
    {
      type: 'free', duration: 2.6, name: 'Carrousel', bg: 'theme',
      layers: [
        { kind: 'text', x: 0.08, y: 0.33, align: 'left', text: 'Pensé *pour vous*', size: 64, weight: 800, reveal: 'rise', revealBy: 'word' },
        { kind: 'gallery', x: 0.5, y: 0.47, layout: 'row', items, badges: true, cardW: 320, at: 0.25, speed: 90, color: accent }
      ],
      cues: [{ at: 0.25, sfx: 'swipe' }]
    },
    // 3. Mur d'images incliné qui défile derrière un titre penché.
    {
      type: 'free', duration: 2.6, name: 'Mur d’images', bg: 'theme',
      layers: [
        { kind: 'gallery', x: 0.5, y: 0.5, layout: 'wall', items: wallItems, speed: 170, at: 0.05 },
        { kind: 'rect', x: 0.5, y: 0.5, w: 2600, h: 300, rotate: -24, color: '#000000', opacity: 0.35 },
        { kind: 'text', x: 0.5, y: 0.5, text: 'Tout ce que *vous aimez*.', size: 104, weight: 900, rotate: -24, maxWidth: 1, reveal: 'blur', revealBy: 'word', revealAt: 0.35, shadow: true }
      ],
      cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.4, sfx: 'impact' }]
    },
    // 4. Carte en verre façon lecteur, plongée de caméra sur le bouton, validation + notification.
    {
      type: 'free', duration: 3.4, name: 'Carte en verre', bg: 'theme',
      camera: {
        zoom: [{ t: 0, v: 1 }, { t: 1.4, v: 1 }, { t: 2.1, v: 2.3, e: 'expo' }, { t: 2.35, v: 1, e: 'expo' }],
        x: [{ t: 1.4, v: 0 }, { t: 2.1, v: 0.2, e: 'expo' }, { t: 2.35, v: 0, e: 'expo' }],
        y: [{ t: 1.4, v: 0 }, { t: 2.1, v: 0.1, e: 'expo' }, { t: 2.35, v: 0, e: 'expo' }]
      },
      layers: [
        { kind: 'group', x: 0.5, y: 0.5, ry: [{ t: 0, v: 28 }, { t: 0.8, v: 0, e: 'expo' }], scale: [{ t: 0, v: 0.86 }, { t: 0.8, v: 1, e: 'expo' }], opacity: [{ t: 0, v: 0 }, { t: 0.4, v: 1 }, { t: 2.3, v: 1 }, { t: 2.45, v: 0 }], motionBlur: true, children: [
          { kind: 'rect', x: 0.5, y: 0.5, w: 920, h: 560, radius: 56, glass: true },
          { kind: 'image', src: ph(0), x: 0.24, y: 0.425, w: 170, h: 170, radius: 22 },
          { kind: 'text', x: 0.35, y: 0.405, align: 'left', text: clean(labels[0], 22), size: 54, weight: 800, maxWidth: 0.55 },
          { kind: 'text', x: 0.35, y: 0.44, align: 'left', text: brand, size: 34, weight: 500, color: '#c9cfd6', maxWidth: 0.55 },
          { kind: 'rect', x: 0.5, y: 0.525, w: 780, h: 10, radius: 5, color: '#42474f' },
          { kind: 'rect', x: [{ t: 0, v: 0.3 }, { t: 3.4, v: 0.39, e: 'linear' }], y: 0.525, w: [{ t: 0, v: 360 }, { t: 3.4, v: 560, e: 'linear' }], h: 10, radius: 5, color: '#ffffff' },
          { kind: 'ellipse', x: 0.5, y: 0.605, w: 120, color: '#ffffff' },
          { kind: 'path', x: 0.507, y: 0.605, w: 64, d: 'M 300 180 L 780 500 L 300 820 Z', fill: '#0b0b0b' },
          { kind: 'path', x: 0.33, y: 0.605, w: 64, d: 'M 700 200 L 300 500 L 700 800 Z M 260 200 L 260 800', color: '#ffffff', width: 9 },
          { kind: 'path', x: 0.67, y: 0.605, w: 64, d: 'M 300 200 L 700 500 L 300 800 Z M 740 200 L 740 800', color: '#ffffff', width: 9 },
          { kind: 'ellipse', x: 0.8, y: 0.605, w: 72, stroke: { color: '#ffffff', width: 5 } },
          { kind: 'text', x: 0.8, y: 0.605, text: '+', size: 56, weight: 400 }
        ] },
        // Validation : coche qui se dessine + éclat + notification en verre.
        { kind: 'ellipse', x: 0.5, y: 0.42, w: [{ t: 2.4, v: 0 }, { t: 2.7, v: 190, e: 'back' }], color: accent, glow: { color: accent, size: 50 }, from: 2.4 },
        { kind: 'path', x: 0.5, y: 0.42, w: 120, d: 'M 230 520 L 420 710 L 780 300', color: '#0b0b0b', width: 16, progress: [{ t: 2.55, v: 0 }, { t: 2.85, v: 1, e: 'out' }], from: 2.5 },
        { kind: 'particles', x: 0.5, y: 0.42, mode: 'burst', count: 46, color: accent, color2: '#ffffff', size: 9, spread: 0.32, at: 2.6, from: 2.5 },
        { kind: 'group', x: 0.5, y: [{ t: 2.75, v: 0.56 }, { t: 3.05, v: 0.5, e: 'back' }], opacity: [{ t: 2.75, v: 0 }, { t: 2.95, v: 1 }], from: 2.7, children: [
          { kind: 'rect', x: 0.5, y: 0.56, w: 760, h: 120, radius: 28, glass: true, color: '#ffffff' },
          { kind: 'rect', x: 0.2, y: 0.56, w: 56, h: 56, radius: 14, color: accent },
          { kind: 'text', x: 0.27, y: 0.56, align: 'left', text: 'Ajouté à vos favoris', size: 40, weight: 700, maxWidth: 0.6 }
        ] }
      ],
      cues: [{ at: 0.1, sfx: 'whoosh' }, { at: 1.5, sfx: 'swipe' }, { at: 2.4, sfx: 'pop' }, { at: 2.6, sfx: 'chime' }]
    },
    // 5. Liste défilante dans une carte en verre.
    {
      type: 'free', duration: 3, name: 'Liste', bg: 'theme',
      layers: [
        { kind: 'text', x: 0.5, y: 0.3, text: tagline, size: 64, weight: 800, maxWidth: 0.86, reveal: 'blur', revealBy: 'word' },
        { kind: 'rect', x: 0.5, y: 0.52, w: 920, h: 600, radius: 48, glass: true, ry: [{ t: 0.2, v: -18 }, { t: 0.9, v: 0, e: 'expo' }], opacity: [{ t: 0.2, v: 0 }, { t: 0.5, v: 1 }] },
        { kind: 'text', x: 0.13, y: 0.4, align: 'left', text: brand, size: 38, weight: 700, opacity: [{ t: 0.4, v: 0 }, { t: 0.7, v: 1 }] },
        { kind: 'list', x: 0.5, y: 0.54, lines: points, width: 760, size: 54, visible: 4, active: points.map((_, i) => ({ t: 0.5 + i * 0.6, v: i, e: 'expo' as const })), opacity: [{ t: 0.4, v: 0 }, { t: 0.7, v: 1 }] }
      ],
      cues: [{ at: 0.2, sfx: 'whoosh' }]
    },
    // 6. Signature.
    {
      type: 'free', duration: 2.6, name: 'Signature', bg: 'theme',
      layers: [
        { ...logo, x: 0.5, y: 0.4 },
        { kind: 'text', x: 0.5, y: 0.5, text: brand, size: 96, weight: 800, reveal: 'blur', revealBy: 'char', revealAt: 0.3 },
        ...(o.link ? [{ kind: 'text' as const, x: 0.5, y: 0.6, text: clean(o.link, 60), size: 34, weight: 500, color: '#c9cfd6', reveal: 'rise' as const, revealAt: 0.8 }] : [])
      ],
      cues: [{ at: 0.3, sfx: 'chime' }]
    }
  ];
  return { format: o.format ?? '9:16', brand: brand.slice(0, 40), theme, transition: 'blur', sound: { music: 'electro', bpm: 118, volume: 0.75 }, scenes };
}

function mixDark(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const m = (v: number) => Math.round(v * (1 - k));
  return '#' + ((1 << 24) | (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1);
}
function mixLight(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return '#' + ((1 << 24) | (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1);
}
