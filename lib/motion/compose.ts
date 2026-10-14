/**
 * Compositeur « blocs → motion design premium ».
 *
 * L'IA n'a plus à écrire des centaines de calques (les IA gratuites s'y
 * perdent et la vidéo retombait sur des scènes basiques). Elle choisit des
 * BLOCS et écrit les textes ; ce module fabrique pour chaque bloc une scène
 * au niveau des grandes campagnes (verre dépoli, galeries, plongées de caméra,
 * flou de mouvement, annotations…). Rendu garanti quelle que soit l'IA.
 */
import { z } from 'zod';

import { BACKDROPS } from './gl-bg';
import { repairFree } from './repair';
import { fallbackMap } from './osm';
import { MUSIC, SFX, SceneSchema, TRANSITIONS, type Layer, type MotionProject, type Scene } from './types';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const img = z.string().regex(/^(logo|photo:\d{1,2}|video:[0-2]|search:.{2,60})$/);
const txt = (n: number) => z.string().trim().min(1).max(n);

export const BlockSchema = z.discriminatedUnion('block', [
  z.object({ block: z.literal('reveal'), brand: txt(40), line: z.string().trim().max(90).optional() }),
  z.object({ block: z.literal('kinetic'), lines: z.array(txt(60)).min(1).max(3), style: z.enum(['push', 'blur', 'slam', 'mask', 'curve', 'karaoke', 'highlight', 'stack', 'echo', 'type', 'wave']).optional() }),
  z.object({ block: z.literal('carousel'), title: z.string().trim().max(50).optional(), items: z.array(z.object({ img, label: z.string().trim().max(32).optional(), sub: z.string().trim().max(40).optional() })).min(1).max(10) }),
  z.object({ block: z.literal('wall'), title: txt(60), imgs: z.array(img).min(1).max(12) }),
  z.object({ block: z.literal('grid'), title: z.string().trim().max(50).optional(), items: z.array(z.object({ img, label: z.string().trim().max(32).optional() })).min(2).max(6) }),
  z.object({ block: z.literal('card'), title: txt(40), sub: z.string().trim().max(50).optional(), img: img.optional(), toast: z.string().trim().max(44).optional() }),
  z.object({ block: z.literal('list'), title: z.string().trim().max(50).optional(), lines: z.array(txt(60)).min(2).max(7) }),
  z.object({ block: z.literal('stat'), value: z.number().min(-1e9).max(1e9), prefix: z.string().max(4).optional(), suffix: z.string().max(8).optional(), label: txt(60) }),
  z.object({ block: z.literal('explain'), img, title: z.string().trim().max(60).optional(), notes: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), text: txt(40), sub: z.string().trim().max(50).optional() })).min(1).max(3) }),
  z.object({ block: z.literal('compare'), before: img, after: img, labelBefore: z.string().trim().max(24).optional(), labelAfter: z.string().trim().max(24).optional(), title: z.string().trim().max(60).optional() }),
  z.object({ block: z.literal('photo'), img, caption: z.string().trim().max(70).optional(), style: z.enum(['full', 'card', 'polaroid', 'strips', 'circle', 'zoom', 'tilt', 'stack']).optional(), imgs: z.array(img).max(8).optional() }),
  z.object({ block: z.literal('search'), query: txt(50), imgs: z.array(img).max(8).optional() }),
  z.object({ block: z.literal('masonry'), imgs: z.array(img).min(1).max(12), title: z.string().trim().max(50).optional() }),
  z.object({ block: z.literal('button'), label: txt(24), final: z.string().trim().max(30).optional(), icon: z.string().max(12).optional() }),
  // Scène 100 % sur mesure quand aucun bloc ne convient (calques libres, validés avant d'être gardés).
  z.object({ block: z.literal('free'), duration: z.number().min(1.2).max(8), name: z.string().max(40).optional(), layers: z.array(z.record(z.string(), z.unknown())).min(1).max(16), camera: z.record(z.string(), z.unknown()).optional() }),
  z.object({ block: z.literal('map'), place: txt(60), label: z.string().trim().max(60).optional(), geo: z.object({ name: z.string().max(80), roads: z.array(z.string().max(3000)).max(14), major: z.array(z.string().max(3000)).max(6), water: z.array(z.string().max(3000)).max(3) }).optional() }),
  z.object({ block: z.literal('cta'), title: txt(60), button: z.string().trim().max(28).optional(), link: z.string().trim().max(60).optional() }),
  // Blocs « signature izicut » (le style de nos propres pubs) :
  z.object({ block: z.literal('phone'), img: img.optional(), kicker: z.string().trim().max(40).optional(), hook: z.string().trim().max(40).optional(), caption: z.string().trim().max(70).optional(), from: z.number().min(0).max(3600).optional() }),
  z.object({ block: z.literal('chat'), ask: txt(70), reply: txt(60), kicker: z.string().trim().max(40).optional() }),
  z.object({ block: z.literal('problem'), kicker: z.string().trim().max(40).optional(), title: txt(60), items: z.array(z.object({ icon: z.string().trim().max(4).optional(), text: txt(40), sub: z.string().trim().max(50).optional() })).min(1).max(3) }),
  z.object({ block: z.literal('clock'), big: txt(12), sub: z.string().trim().max(50).optional(), kicker: z.string().trim().max(40).optional() })
]);
export type Block = z.infer<typeof BlockSchema>;

export const StyleSchema = z.object({
  backdrop: z.enum(BACKDROPS).optional(),
  colors: z.array(hex).min(1).max(4).optional(),
  accent: hex.optional(),
  music: z.enum(MUSIC).optional(),
  bpm: z.number().min(60).max(170).optional(),
  transition: z.enum(TRANSITIONS).optional()
});
export type ComposeStyle = z.infer<typeof StyleSchema>;

const LIGHT_BACKDROPS = new Set(['paper']);
type Ease = 'expo' | 'back' | 'out' | 'inOut' | 'in' | 'linear' | 'smooth' | 'spring';
// Courbes de motion designer : 'expo' → cubic-bezier(0.16,1,0.3,1), 'back' → ressort amorti.
const e = (t: number, v: number, ease: Ease = 'smooth') => ({ t, v, e: (ease === 'expo' ? 'smooth' : ease === 'back' ? 'spring' : ease) as Ease });

function lum(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}
function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

type Ctx = { accent: string; text: string; sub: string; brand: string; hasLogo: boolean; vertical: boolean; /** Tirage au sort par pub : deux pubs ne se ressemblent jamais. */ seed?: number; light?: boolean };
/** Hauteur de l'écran en px (petit côté = 1080). */
const Hpx = (c: Ctx) => (c.vertical ? 1920 : 1080);
/** Petit titre au-dessus d'une scène (« Le problème », « Ta vidéo »…). */
const kickerL = (text: string, y: number, c: Ctx, at = 0.05): Layer => ({ kind: 'text', x: 0.5, y, text: text.toUpperCase(), size: 30, weight: 600, tracking: 0.18, color: c.sub, reveal: 'rise', revealAt: at } as Layer);

/** Texte qui entre en glissant avec flou de mouvement (et ressort pareil). */
function pushText(text: string, y: number, size: number, at: number, out: number | null, c: Ctx, weight = 800): Layer {
  const keys = [e(at, 1.5), e(at + 0.5, 0.5)];
  if (out !== null) keys.push(e(out, 0.5, 'linear'), e(out + 0.35, -0.6, 'in'));
  return { kind: 'text', x: keys, y, text, size, weight, maxWidth: 0.86, color: c.text, motionBlur: true, from: at };
}

function sceneFor(b: Block, i: number, c: Ctx): Scene {
  const base = { type: 'free' as const, bg: 'theme' as const };
  switch (b.block) {
    case 'reveal': {
      const mark: Layer = c.hasLogo
        ? { kind: 'image', src: 'logo', x: 0.5, y: 0.43, w: 170, fit: 'contain', opacity: [e(0.1, 0, 'linear'), e(0.5, 1, 'out')], scale: [e(0.1, 0.6), e(0.7, 1, 'back')] }
        : { kind: 'ellipse', x: 0.5, y: 0.4, w: [e(0.1, 0), e(0.6, 120, 'back')], color: c.accent, glow: { color: c.accent, size: 40 } };
      const layers: Layer[] = [
        mark,
        { kind: 'text', x: 0.5, y: 0.5, text: b.brand, size: 96, weight: 800, maxWidth: 0.86, reveal: 'blur', revealBy: 'char', revealAt: 0.4, color: c.text, to: b.line ? 1.55 : undefined },
        { kind: 'particles', x: 0.5, y: 0.46, mode: 'converge', count: 50, color: c.accent, color2: '#ffffff', size: 5, spread: 0.6, at: 0, speed: 1.4 }
      ];
      if (b.line) layers.push(pushText(b.line, 0.5, 74, 1.45, null, c));
      return { ...base, duration: b.line ? 3 : 2.4, name: 'Révélation', layers, cues: [{ at: 0.2, sfx: 'riser' }, { at: 0.6, sfx: 'chime' }, ...(b.line ? [{ at: 1.45, sfx: 'whoosh' as const }] : [])] };
    }
    case 'kinetic': {
      const style = b.style ?? (['push', 'highlight', 'stack', 'blur', 'echo', 'mask', 'wave', 'slam'] as const)[(i + (c.seed ?? 0)) % 8];
      const layers: Layer[] = [];
      const step = 0.75;
      const W = c.vertical ? 1080 : 1920;
      const n = b.lines.length;
      if (style === 'highlight') {
        // Les mots montent un à un, puis un surligneur aux couleurs de la marque balaie la dernière ligne.
        const gap = 0.085;
        b.lines.forEach((l, k) => {
          const y = 0.47 + (k - (n - 1) / 2) * gap;
          const size = n > 1 ? 84 : 100;
          if (k === n - 1) {
            const w = Math.min(W * 0.92, l.length * size * 0.56 + 60);
            layers.push({ kind: 'rect', x: 0.5, y: y + 0.004, w: [e(0.35 + k * 0.4, 0), e(0.85 + k * 0.4, w, 'smooth')], h: size * 1.15, radius: 14, color: c.accent, rotate: -1.5 });
          }
          layers.push({ kind: 'text', x: 0.5, y, text: l, size, weight: 900, maxWidth: 0.9, color: k === n - 1 && lum(c.accent) > 150 ? '#0b0b0b' : c.text, reveal: 'rise', revealBy: 'word', revealAt: 0.1 + k * 0.4 });
        });
        const dur = Math.min(5, 1.6 + n * 0.55);
        return { ...base, duration: dur, name: 'Surligné', camera: { zoom: [e(0, 1.04, 'linear'), e(dur, 1, 'smooth')] }, layers, cues: [{ at: 0.1, sfx: 'whoosh' }, { at: 0.35 + (n - 1) * 0.4, sfx: 'swipe' }] };
      }
      if (style === 'stack') {
        // Lignes géantes empilées qui claquent tour à tour de gauche et de droite, la dernière en dégradé.
        // Taille calée sur la longueur de la ligne (jamais de retour à la ligne qui ferait chevaucher les lignes).
        const sizes = b.lines.map((l) => Math.round(Math.max(64, Math.min(n > 2 ? 120 : 150, ((c.vertical ? 1000 : 1700) / Math.max(4, l.length)) * 1.55))));
        const H = c.vertical ? 1920 : 1080;
        const tot = sizes.reduce((a, z) => a + z * 1.08, 0);
        let yy = 0.47 - tot / 2 / H;
        b.lines.forEach((l, k) => {
          const y = yy + (sizes[k] * 1.08) / 2 / H;
          yy += (sizes[k] * 1.08) / H;
          const from = k % 2 ? 1.7 : -0.7;
          const at = 0.08 + k * 0.32;
          layers.push({ kind: 'text', x: [e(at, from), e(at + 0.42, 0.5, 'expo')], y, text: l.toUpperCase(), size: sizes[k], weight: 900, tracking: -0.02, maxWidth: 0.96, motionBlur: true, rotate: [e(at, k % 2 ? 6 : -6), e(at + 0.5, 0, 'spring')], ...(k === n - 1 ? { fill: { from: c.text, to: c.accent, angle: 90 } } : { color: c.text }) });
        });
        const dur = Math.min(4.5, 1.5 + n * 0.45);
        return { ...base, duration: dur, name: 'Empilé', camera: { zoom: [e(0, 1, 'linear'), e(0.5 + (n - 1) * 0.32, 1.08, 'expo'), e(dur, 1.03, 'smooth')] }, layers, cues: b.lines.map((_, k) => ({ at: 0.1 + k * 0.32, sfx: 'impact' as const })) };
      }
      if (style === 'echo') {
        // Le mot clé répété en contour qui défile, la version pleine au centre : typographie « écho » des pubs mode / sport.
        const word = b.lines[0].toUpperCase();
        const size = Math.min(170, Math.round((W * 0.9) / Math.max(4, word.length * 0.62)));
        for (let k = -3; k <= 3; k++) {
          if (k === 0) continue;
          const y0 = 0.47 + k * (size / (c.vertical ? 1920 : 1080)) * 1.05;
          layers.push({ kind: 'text', x: 0.5, y: [e(0, y0 + 0.03 * Math.sign(k)), e(2.6, y0 - 0.03 * Math.sign(k), 'linear')], text: word, size, weight: 900, stroke: { color: c.accent, width: 2.5 }, opacity: [e(0.1 + Math.abs(k) * 0.08, 0, 'linear'), e(0.4 + Math.abs(k) * 0.08, 1 - Math.abs(k) * 0.22)] });
        }
        layers.push({ kind: 'text', x: 0.5, y: 0.47, text: word, size, weight: 900, color: c.text, reveal: 'scale', revealAt: 0.15 });
        if (b.lines[1]) layers.push({ kind: 'text', x: 0.5, y: 0.47 + (size / (c.vertical ? 1920 : 1080)) * 2.4, text: b.lines[1], size: 46, weight: 600, color: c.text, maxWidth: 0.86, reveal: 'rise', revealBy: 'word', revealAt: 0.7 });
        return { ...base, duration: 2.8, name: 'Écho', camera: { zoom: [e(0, 1.08, 'linear'), e(2.8, 1, 'smooth')] }, layers, cues: [{ at: 0.15, sfx: 'impact' }] };
      }
      if (style === 'type' || style === 'wave') {
        const gap = 0.08;
        b.lines.forEach((l, k) => layers.push({ kind: 'text', x: 0.5, y: 0.47 + (k - (n - 1) / 2) * gap, text: l, size: k === 0 ? 92 : 70, weight: style === 'type' ? 700 : 900, maxWidth: 0.88, color: c.text, reveal: style, revealBy: style === 'type' ? 'char' : 'char', revealAt: 0.15 + k * (style === 'type' ? l.length * 0.045 + 0.2 : 0.5) }));
        const dur = Math.min(5, style === 'type' ? 0.9 + b.lines.join('').length * 0.05 : 1.6 + n * 0.55);
        return { ...base, duration: Math.max(2.2, dur), name: style === 'type' ? 'Machine à écrire' : 'Vague', layers, cues: [{ at: 0.1, sfx: style === 'type' ? 'click' : 'whoosh' }] };
      }
      if (style === 'karaoke') {
        // Sous-titres mot à mot façon Hormozi : le mot prononcé grossit, s'allume et brille.
        const all = b.lines.join(' ');
        layers.push({ kind: 'text', x: 0.5, y: 0.5, text: all, size: 96, weight: 900, maxWidth: 0.86, color: c.text, reveal: 'karaoke', revealBy: 'word', revealAt: 0.15 });
        const words = all.split(/\s+/).length;
        const dur = Math.min(6, 0.6 + words * 0.38 + 0.6);
        return { ...base, duration: dur, name: 'Sous-titres', camera: { zoom: [e(0, 1, 'linear'), e(dur, 1.05, 'inOut')] }, layers, cues: [{ at: 0.1, sfx: 'pop' }] };
      }
      if (style === 'push') {
        b.lines.forEach((l, k) => layers.push(pushText(l, 0.47, b.lines.length > 1 ? 88 : 104, k * step, k < b.lines.length - 1 ? (k + 1) * step - 0.1 : null, c)));
      } else {
        const gap = 0.085;
        b.lines.forEach((l, k) => layers.push({
          kind: 'text', x: 0.5, y: 0.47 + (k - (b.lines.length - 1) / 2) * gap, text: l, size: k === 0 ? 96 : 76, weight: k === 0 ? 900 : 700, maxWidth: 0.88, color: c.text,
          reveal: style === 'slam' ? 'scale' : style, revealBy: style === 'mask' ? 'line' : 'word', revealAt: 0.15 + k * 0.45
        }));
        layers.push({ kind: 'rect', x: 0.5, y: 0.47 + (b.lines.length * gap) / 2 + 0.03, w: [e(0.6, 0), e(1.1, 260)], h: 8, radius: 4, color: c.accent, glow: { color: c.accent, size: 18 } });
      }
      const dur = Math.max(2.2, 0.9 + b.lines.length * (style === 'push' ? step : 0.6));
      return { ...base, duration: Math.min(5, dur), name: 'Message', camera: { zoom: [e(0, 1.06, 'linear'), e(dur, 1, 'linear')] }, layers, cues: [{ at: 0.1, sfx: style === 'slam' ? 'impact' : 'whoosh' }] };
    }
    case 'carousel': {
      const items = b.items.map((it) => ({ src: it.img, label: it.label, sub: it.sub ?? c.brand }));
      return {
        ...base, duration: 2.8, name: 'Carrousel',
        layers: [
          ...(b.title ? [{ kind: 'text' as const, x: 0.08, y: 0.33, align: 'left' as const, text: b.title, size: 62, weight: 800, reveal: 'rise' as const, revealBy: 'word' as const, color: c.text, maxWidth: 0.84 }] : []),
          { kind: 'gallery', x: 0.5, y: 0.48, layout: 'row', items, badges: true, cardW: 320, at: 0.25, speed: 90, color: c.accent }
        ],
        cues: [{ at: 0.25, sfx: 'swipe' }]
      };
    }
    case 'wall':
      return {
        ...base, duration: 2.8, name: 'Mur d’images',
        layers: [
          { kind: 'gallery', x: 0.5, y: 0.5, layout: 'wall', items: b.imgs.map((src) => ({ src })), speed: 170 },
          { kind: 'rect', x: 0.5, y: 0.5, w: 2600, h: 300, rotate: -24, color: '#000000', opacity: 0.38 },
          { kind: 'text', x: 0.5, y: 0.5, text: b.title, size: 100, weight: 900, rotate: -24, maxWidth: 1, reveal: 'blur', revealBy: 'word', revealAt: 0.35, shadow: true, color: '#ffffff' }
        ],
        cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.4, sfx: 'impact' }]
      };
    case 'grid':
      return {
        ...base, duration: 2.8, name: 'Grille',
        layers: [
          ...(b.title ? [{ kind: 'text' as const, x: 0.5, y: c.vertical ? 0.2 : 0.14, text: b.title, size: 66, weight: 800, reveal: 'blur' as const, revealBy: 'word' as const, color: c.text, maxWidth: 0.86 }] : []),
          { kind: 'gallery', x: 0.5, y: 0.54, layout: 'grid', items: b.items.map((it) => ({ src: it.img, label: it.label })), cardW: c.vertical ? 420 : 380, cardH: c.vertical ? 420 : 300, at: 0.3, color: c.accent }
        ],
        cues: [{ at: 0.3, sfx: 'pop' }]
      };
    case 'card': {
      const layers: Layer[] = [
        { kind: 'group', x: 0.5, y: 0.5, ry: [e(0, 28), e(0.8, 0)], scale: [e(0, 0.86), e(0.8, 1)], opacity: [e(0, 0, 'linear'), e(0.4, 1, 'out'), e(2.3, 1, 'linear'), e(2.45, 0, 'linear')], motionBlur: true, children: [
          { kind: 'rect', x: 0.5, y: 0.5, w: 920, h: 560, radius: 56, glass: true },
          ...(b.img ? [{ kind: 'image' as const, src: b.img, x: 0.24, y: 0.425, w: 170, h: 170, radius: 22 }] : [{ kind: 'rect' as const, x: 0.24, y: 0.425, w: 170, h: 170, radius: 22, color: c.accent }]),
          { kind: 'text', x: 0.35, y: 0.405, align: 'left', text: b.title, size: 54, weight: 800, maxWidth: 0.55, color: '#ffffff' },
          { kind: 'text', x: 0.35, y: 0.44, align: 'left', text: b.sub ?? c.brand, size: 34, weight: 500, color: '#c9cfd6', maxWidth: 0.55 },
          { kind: 'rect', x: 0.5, y: 0.525, w: 780, h: 10, radius: 5, color: '#42474f' },
          { kind: 'rect', x: [e(0, 0.3, 'linear'), e(3.4, 0.39, 'linear')], y: 0.525, w: [e(0, 360, 'linear'), e(3.4, 560, 'linear')], h: 10, radius: 5, color: '#ffffff' },
          { kind: 'ellipse', x: 0.5, y: 0.605, w: 120, color: '#ffffff' },
          { kind: 'path', x: 0.507, y: 0.605, w: 64, d: 'M 300 180 L 780 500 L 300 820 Z', fill: '#0b0b0b' },
          { kind: 'ellipse', x: 0.8, y: 0.605, w: 72, stroke: { color: '#ffffff', width: 5 } },
          { kind: 'text', x: 0.8, y: 0.605, text: '+', size: 56, weight: 400, color: '#ffffff' }
        ] },
        { kind: 'ellipse', x: 0.5, y: 0.42, w: [e(2.4, 0), e(2.7, 190, 'back')], color: c.accent, glow: { color: c.accent, size: 50 }, from: 2.4 },
        { kind: 'path', x: 0.5, y: 0.42, w: 120, d: 'M 230 520 L 420 710 L 780 300', color: lum(c.accent) > 150 ? '#0b0b0b' : '#ffffff', width: 16, progress: [e(2.55, 0, 'linear'), e(2.85, 1, 'out')], from: 2.5 },
        { kind: 'particles', x: 0.5, y: 0.42, mode: 'burst', count: 46, color: c.accent, color2: '#ffffff', size: 9, spread: 0.32, at: 2.6, from: 2.5 },
        { kind: 'group', x: 0.5, y: [e(2.75, 0.56, 'linear'), e(3.05, 0.5, 'back')], opacity: [e(2.75, 0, 'linear'), e(2.95, 1, 'out')], from: 2.7, children: [
          { kind: 'rect', x: 0.5, y: 0.56, w: 760, h: 120, radius: 28, glass: true, color: '#ffffff' },
          { kind: 'rect', x: 0.2, y: 0.56, w: 56, h: 56, radius: 14, color: c.accent },
          { kind: 'text', x: 0.27, y: 0.56, align: 'left', text: b.toast ?? 'C’est fait !', size: 40, weight: 700, maxWidth: 0.6, color: '#ffffff' }
        ] }
      ];
      return {
        ...base, duration: 3.4, name: 'Carte en verre', layers,
        camera: { zoom: [e(0, 1, 'linear'), e(1.4, 1, 'linear'), e(2.1, 2.3), e(2.35, 1)], x: [e(1.4, 0, 'linear'), e(2.1, 0.2), e(2.35, 0)], y: [e(1.4, 0, 'linear'), e(2.1, 0.1), e(2.35, 0)] },
        cues: [{ at: 0.1, sfx: 'whoosh' }, { at: 1.5, sfx: 'swipe' }, { at: 2.4, sfx: 'pop' }, { at: 2.6, sfx: 'chime' }]
      };
    }
    case 'list':
      return {
        ...base, duration: Math.min(5, 1.2 + b.lines.length * 0.6), name: 'Liste',
        layers: [
          ...(b.title ? [{ kind: 'text' as const, x: 0.5, y: 0.3, text: b.title, size: 62, weight: 800, maxWidth: 0.86, reveal: 'blur' as const, revealBy: 'word' as const, color: c.text }] : []),
          { kind: 'rect', x: 0.5, y: 0.53, w: 920, h: 600, radius: 48, glass: true, ry: [e(0.2, -18), e(0.9, 0)], opacity: [e(0.2, 0, 'linear'), e(0.5, 1, 'out')] },
          { kind: 'list', x: 0.5, y: 0.54, lines: b.lines, width: 760, size: 54, visible: 4, color: '#ffffff', active: b.lines.map((_, k) => e(0.5 + k * 0.6, k)), opacity: [e(0.4, 0, 'linear'), e(0.7, 1, 'out')] }
        ],
        cues: [{ at: 0.2, sfx: 'whoosh' }]
      };
    case 'stat': {
      const v = b.value;
      const decimals = Math.abs(v) < 100 && !Number.isInteger(v) ? 1 : 0;
      // Compteur : on anime le chiffre en enchaînant des étapes (le texte est figé à chaque instant).
      const steps = 14;
      const counter: Layer[] = Array.from({ length: steps + 1 }, (_, k) => {
        const val = (v * (1 - Math.pow(1 - k / steps, 3))).toFixed(decimals).replace('.', ',');
        return { kind: 'text' as const, x: 0.5, y: 0.45, text: `${b.prefix ?? ''}${val}${b.suffix ?? ''}`, size: 190, weight: 900, color: c.text, from: 0.2 + (k * 1.1) / steps, ...(k < steps ? { to: 0.2 + ((k + 1) * 1.1) / steps } : {}) };
      });
      return {
        ...base, duration: 2.8, name: 'Chiffre clé',
        layers: [
          { kind: 'glow', x: 0.5, y: 0.45, color: c.accent, size: [e(0, 0), e(0.8, 520, 'out')], blend: 'add', opacity: 0.6 },
          { kind: 'ellipse', x: 0.5, y: 0.45, w: 560, stroke: { color: c.accent, width: 10 }, progress: [e(0.2, 0, 'linear'), e(1.4, 1, 'inOut')], rotate: -90, glow: { color: c.accent, size: 24 } },
          ...counter,
          { kind: 'text', x: 0.5, y: 0.62, text: b.label, size: 48, weight: 600, maxWidth: 0.8, color: c.sub, reveal: 'rise', revealBy: 'word', revealAt: 1.0 }
        ],
        cues: [{ at: 0.2, sfx: 'riser' }, { at: 1.3, sfx: 'impact' }]
      };
    }
    case 'explain': {
      const n = b.notes[0];
      const layers: Layer[] = [
        { kind: 'image', src: b.img, x: 0.5, y: 0.5, w: 1080, h: 1920, fit: 'cover', reveal: 'iris', revealDur: 0.8, zoom: [e(0, 1.05, 'linear'), e(1.6, 1.12, 'linear'), e(2.6, 2.1, 'inOut')], fx: [e(1.6, 0.5, 'linear'), e(2.6, n.x, 'inOut')], fy: [e(1.6, 0.5, 'linear'), e(2.6, n.y, 'inOut')] },
        { kind: 'rect', x: 0.5, y: 0.5, w: 1200, h: 2100, fill: { from: '#000000', to: '#000000', angle: 90 }, opacity: 0.18 }
      ];
      b.notes.forEach((nt, k) => layers.push({ kind: 'callout', x: nt.x, y: nt.y, tx: nt.x < 0.5 ? Math.min(0.9, nt.x + 0.3) : Math.max(0.1, nt.x - 0.3), ty: Math.max(0.12, Math.min(0.85, nt.y - 0.12)), text: nt.text, sub: nt.sub, at: 0.6 + k * 0.5, to: 1.6, color: c.accent }));
      layers.push({ kind: 'callout', x: 0.5, y: 0.5, tx: n.x < 0.5 ? 0.8 : 0.2, ty: 0.3, text: n.text, sub: n.sub, at: 2.7, color: c.accent });
      if (b.title) layers.push({ kind: 'text', x: 0.5, y: 0.74, text: b.title, size: 60, weight: 800, maxWidth: 0.86, shadow: true, reveal: 'rise', revealBy: 'word', revealAt: 0.4, color: '#ffffff', to: 2.5 });
      return { ...base, duration: 3.6, name: 'Image expliquée', layers, cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.6, sfx: 'pop' }, { at: 2.7, sfx: 'click' }] };
    }
    case 'compare':
      return {
        ...base, duration: 3, name: 'Avant / après',
        layers: [
          { kind: 'image', src: b.before, x: 0.5, y: 0.5, w: 1080, h: 1920, fit: 'cover' },
          { kind: 'image', src: b.after, x: 0.5, y: 0.5, w: 1080, h: 1920, fit: 'cover', reveal: 'wipe', revealAt: 1, revealDur: 1 },
          { kind: 'rect', x: [e(1, 0, 'linear'), e(2, 1, 'inOut')], y: 0.5, w: 8, h: 2200, color: '#ffffff', glow: { color: c.accent, size: 30 }, from: 1, to: 2.05 },
          { kind: 'text', x: 0.25, y: 0.16, text: b.labelBefore ?? 'Avant', size: 54, weight: 800, color: '#ffffff', shadow: true, to: 1.6 },
          { kind: 'text', x: 0.75, y: 0.16, text: b.labelAfter ?? 'Après', size: 54, weight: 800, color: '#ffffff', shadow: true, from: 1.5, reveal: 'blur', revealAt: 1.5 },
          ...(b.title ? [{ kind: 'text' as const, x: 0.5, y: 0.74, text: b.title, size: 58, weight: 800, maxWidth: 0.86, shadow: true, color: '#ffffff', reveal: 'rise' as const, revealAt: 2.1 }] : [])
        ],
        cues: [{ at: 1, sfx: 'swipe' }]
      };
    case 'photo': return photoScene(b, i, c);
    case 'search': return searchScene(b, c);
    case 'masonry': return masonryScene(b, c);
    case 'button': return buttonScene(b, c);
    case 'free':
      return { type: 'free', bg: 'theme', duration: b.duration, name: b.name ?? 'Sur mesure', layers: b.layers as unknown as Layer[], ...(b.camera ? { camera: b.camera as Scene extends { camera?: infer C } ? C : never } : {}) } as Scene;
    case 'map': {
      // Vraie carte du lieu : rivières, puis rues, puis grands axes qui se dessinent ; l'épingle tombe, l'onde se propage.
      const geo = b.geo ?? fallbackMap(b.place);
      const w = c.vertical ? 1500 : 2100;
      const cy = c.vertical ? 0.43 : 0.5;
      const L: Layer[] = [];
      geo.water.forEach((d) => L.push({ kind: 'path', x: 0.5, y: cy, w, d, color: '#2f63ff', width: 14, cap: 'round', opacity: 0.85, progress: [e(0.05, 0, 'linear'), e(1.1, 1, 'smooth')] } as Layer));
      geo.roads.forEach((d, k) => L.push({ kind: 'path', x: 0.5, y: cy, w, d, color: '#2e3140', width: 2.5, cap: 'round', progress: [e(0.1 + k * 0.04, 0, 'linear'), e(1.0 + k * 0.04, 1, 'smooth')] } as Layer));
      geo.major.forEach((d, k) => L.push({ kind: 'path', x: 0.5, y: cy, w, d, color: '#6b6f86', width: 5, cap: 'round', progress: [e(0.3 + k * 0.06, 0, 'linear'), e(1.2 + k * 0.06, 1, 'smooth')] } as Layer));
      const pinY = cy - 0.02;
      L.push({ kind: 'ellipse', x: 0.5, y: pinY + 0.035, w: [e(1.25, 0), e(2.2, 340, 'out')], stroke: { color: c.accent, width: 4 }, opacity: [e(1.25, 0.9, 'linear'), e(2.2, 0, 'out')] } as Layer);
      L.push({ kind: 'ellipse', x: 0.5, y: pinY + 0.035, w: [e(1.7, 0), e(2.7, 340, 'out')], stroke: { color: c.accent, width: 3 }, opacity: [e(1.7, 0.7, 'linear'), e(2.7, 0, 'out')] } as Layer);
      L.push({ kind: 'path', x: 0.5, y: [e(1.0, pinY - 0.18), e(1.45, pinY, 'spring')], w: 120, d: 'M500 80 C 330 80 250 210 250 330 C 250 520 500 760 500 760 C 500 760 750 520 750 330 C 750 210 670 80 500 80 Z', fill: c.accent, glow: { color: c.accent, size: 40 }, opacity: [e(1.0, 0, 'linear'), e(1.15, 1, 'linear')] } as Layer);
      L.push({ kind: 'ellipse', x: 0.5, y: [e(1.0, pinY - 0.185), e(1.45, pinY - 0.005, 'spring')], w: 34, color: '#ffffff', opacity: [e(1.0, 0, 'linear'), e(1.15, 1, 'linear')] } as Layer);
      L.push({ kind: 'rect', x: 0.5, y: c.vertical ? 0.79 : 0.84, w: c.vertical ? 820 : 900, h: b.label ? 190 : 140, radius: 44, glass: true, color: '#0d0e14', opacity: [e(1.5, 0, 'linear'), e(1.9, 0.92, 'smooth')], scale: [e(1.5, 0.9), e(2.0, 1, 'spring')] } as Layer);
      L.push({ kind: 'text', x: 0.5, y: (c.vertical ? 0.79 : 0.84) - (b.label ? 0.018 : 0), text: geo.name || b.place, size: 66, weight: 800, maxWidth: 0.8, color: '#ffffff', reveal: 'rise', revealBy: 'word', revealAt: 1.7 } as Layer);
      if (b.label) L.push({ kind: 'text', x: 0.5, y: (c.vertical ? 0.79 : 0.84) + 0.03, text: b.label, size: 34, weight: 500, maxWidth: 0.78, color: '#c9cfd6', reveal: 'rise', revealBy: 'word', revealAt: 2.0 } as Layer);
      L.push({ kind: 'text', x: 0.97, y: 0.985, align: 'right', text: '© OpenStreetMap', size: 18, weight: 400, color: '#7a7f92' } as Layer);
      return { ...base, bg: '#0b0c11' as never, duration: 3.6, name: 'Carte', camera: { zoom: [e(0, 1.3, 'linear'), e(2.2, 1, 'smooth'), e(3.6, 1.04, 'linear')], rotate: [e(0, -4, 'linear'), e(2.2, 0, 'smooth')] }, layers: L.slice(0, 40), cues: [{ at: 0.05, sfx: 'riser' }, { at: 1.4, sfx: 'pop' }, { at: 1.8, sfx: 'chime' }] };
    }
    case 'phone': {
      // Téléphone qui pivote en 3D, avec votre vidéo / photo dedans, accroche en pastille, sous-titres karaoké et barre de lecture.
      const k = c.vertical ? 1 : 0.7;
      const H = Hpx(c);
      const cy = c.vertical ? 0.54 : 0.555;
      const pw = 540 * k, ph = 960 * k;
      const top = 0.5 - ph / 2 / H; // les enfants d'un groupe sont placés par rapport à son centre (0.5)
      const media = b.img ?? `search:${c.brand || 'lifestyle'}`;
      const L: Layer[] = [
        { kind: 'glow', x: 0.5, y: cy + 0.04, color: c.accent, size: [e(0, 0), e(0.9, 760, 'out')], opacity: 0.55, blend: 'add' } as Layer
      ];
      if (b.kicker) L.push(kickerL(b.kicker, c.vertical ? 0.13 : 0.07, c));
      L.push({ kind: 'group', x: 0.5, y: [e(0, cy + 0.06), e(0.9, cy, 'expo'), e(4, cy - 0.008, 'smooth')], ry: [e(0, 26), e(1, 0, 'expo')], rotate: [e(0, -6), e(1, 0, 'spring')], scale: [e(0, 0.82), e(0.9, 1, 'expo'), e(4, 1.03, 'linear')], opacity: [e(0, 0, 'linear'), e(0.35, 1, 'out')], motionBlur: true, children: [
        { kind: 'rect', x: 0.5, y: 0.5, w: pw + 26, h: ph + 26, radius: 78 * k, color: '#101014', stroke: { color: '#34343c', width: 3 }, shadow: true },
        { kind: 'image', src: media, x: 0.5, y: 0.5, w: pw, h: ph, radius: 60 * k, fit: 'cover', reveal: 'iris', revealAt: 0.35, revealDur: 0.8, zoom: [e(0, 1.12, 'linear'), e(4, 1, 'smooth')], ...(media.startsWith('video:') ? { vfrom: b.from ?? 0 } : {}) },
        { kind: 'rect', x: 0.5, y: top + (ph - 40 * k) / H, w: pw - 80 * k, h: 6, radius: 3, color: '#3a3a40' },
        { kind: 'rect', x: [e(0.4, 0.5 - (pw - 80 * k) / 2 / (c.vertical ? 1080 : 1920), 'linear'), e(4, 0.5, 'linear')], y: top + (ph - 40 * k) / H, w: [e(0.4, 0, 'linear'), e(4, pw - 80 * k, 'linear')], h: 6, radius: 3, color: '#ffffff' },
        ...(b.hook ? [
          { kind: 'rect' as const, x: 0.5, y: top + (b.hook.length > 22 ? 170 : 150) * k / H, w: [e(0.7, 0), e(1.05, Math.min(pw - 30, b.hook.length * 19 * k + 70), 'spring')], h: (b.hook.length > 22 ? 120 : 76) * k, radius: 18, color: '#ffffff' },
          { kind: 'text' as const, x: 0.5, y: top + (b.hook.length > 22 ? 170 : 150) * k / H, text: b.hook, size: 34 * k, weight: 800, maxWidth: (pw - 60) / (c.vertical ? 1080 : 1920), color: '#0a0a0a', reveal: 'rise' as const, revealBy: 'word' as const, revealAt: 0.85 }
        ] : []),
        ...(b.caption ? [{ kind: 'text' as const, x: 0.5, y: top + (ph - 210 * k) / H, text: b.caption, size: 46 * k, weight: 800, maxWidth: (pw - 60) / (c.vertical ? 1080 : 1920), color: '#ffffff', stroke: { color: '#000000', width: 2 }, reveal: 'karaoke' as const, revealAt: 1.2 }] : [])
      ] } as Layer);
      L.push({ kind: 'particles', x: 0.5, y: cy, mode: 'sparkle', count: 18, color: '#ffffff', color2: c.accent, size: 8, spread: 0.5 } as Layer);
      return { ...base, duration: 4, name: 'Téléphone', layers: L, camera: { zoom: [e(0, 1.06, 'linear'), e(1, 1, 'expo'), e(4, 1.03, 'linear')] }, cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.85, sfx: 'pop' }] };
    }
    case 'chat': {
      // Le client écrit sa demande, l'IA répond et valide (bulle en verre + coche dégradée).
      const H = Hpx(c);
      const W = c.vertical ? 1080 : 1920;
      const y1 = c.vertical ? 0.36 : 0.36, y2 = c.vertical ? 0.53 : 0.6;
      const bw = Math.min(W * 0.8, b.ask.length * 21 + 110);
      const rw = Math.min(W * 0.8, b.reply.length * 21 + 190);
      const L: Layer[] = [{ kind: 'glow', x: 0.5, y: 0.5, color: c.accent, size: 620, opacity: 0.35, blend: 'add' } as Layer];
      if (b.kicker) L.push(kickerL(b.kicker, c.vertical ? 0.22 : 0.14, c));
      const L0 = c.vertical ? 0.08 : 0.26, R0 = c.vertical ? 0.92 : 0.74;
      const bx = R0 - bw / 2 / W;
      L.push({ kind: 'rect', x: bx, y: y1, w: bw, h: 120, radius: 44, color: '#ffffff', scale: [e(0.1, 0.6), e(0.5, 1, 'spring')], opacity: [e(0.1, 0, 'linear'), e(0.3, 1, 'out')] } as Layer);
      L.push({ kind: 'text', x: bx, y: y1, text: b.ask, size: 38, weight: 600, maxWidth: (bw - 60) / W, color: '#0a0a0a', reveal: 'type', revealAt: 0.4, revealDur: 1 } as Layer);
      const dx = L0 + 60 / W;
      [0, 1, 2].forEach((d) => L.push({ kind: 'ellipse', x: dx + d * (30 / W), y: [e(1.5, y2), e(1.65 + d * 0.08, y2 - 12 / H, 'smooth'), e(1.85 + d * 0.08, y2, 'smooth')], w: 16, color: c.sub, from: 1.45, to: 2.05 } as Layer));
      const rx = L0 + rw / 2 / W;
      L.push({ kind: 'rect', x: rx, y: y2, w: rw, h: 120, radius: 44, glass: true, color: '#16161c', stroke: { color: '#3a3a44', width: 2 }, from: 2.05, scale: [e(2.05, 0.7), e(2.4, 1, 'spring')] } as Layer);
      L.push({ kind: 'ellipse', x: L0 + 70 / W, y: y2, w: [e(2.2, 0), e(2.45, 64, 'back')], fill: { from: '#7f9cff', to: c.accent, angle: 135 }, from: 2.15 } as Layer);
      L.push({ kind: 'path', x: L0 + 70 / W, y: y2, w: 36, d: 'M 230 520 L 420 710 L 780 300', color: '#ffffff', width: 18, progress: [e(2.4, 0, 'linear'), e(2.7, 1, 'out')], from: 2.35 } as Layer);
      L.push({ kind: 'text', x: L0 + 125 / W, y: y2, align: 'left', text: b.reply, size: 38, weight: 600, maxWidth: (rw - 160) / W, color: '#ffffff', reveal: 'rise', revealBy: 'word', revealAt: 2.3 } as Layer);
      return { ...base, duration: 3.8, name: 'Conversation', layers: L, camera: { zoom: [e(0, 1, 'linear'), e(3.8, 1.06, 'linear')] }, cues: [{ at: 0.1, sfx: 'pop' }, { at: 0.45, sfx: 'click' }, { at: 2.05, sfx: 'bubble' }, { at: 2.45, sfx: 'chime' }] };
    }
    case 'problem': {
      // Petit titre, grande phrase, puis 1 à 3 cartes en verre qui arrivent en glissant avec flou de mouvement.
      const H = Hpx(c);
      const L: Layer[] = [];
      const t0 = c.vertical ? 0.17 : 0.12;
      if (b.kicker) L.push(kickerL(b.kicker, t0, c));
      L.push({ kind: 'text', x: 0.5, y: t0 + (c.vertical ? 0.07 : 0.11), text: b.title, size: c.vertical ? 88 : 76, weight: 800, maxWidth: 0.86, color: c.text, reveal: 'rise', revealBy: 'word', revealAt: 0.2 } as Layer);
      const n = b.items.length;
      const ch = 170, gap = 30;
      const start = (c.vertical ? 0.53 : 0.6) - ((n - 1) * (ch + gap)) / 2 / H;
      const cw = c.vertical ? 880 : 1000;
      const W = c.vertical ? 1080 : 1920;
      b.items.forEach((it, k) => {
        const y = start + (k * (ch + gap)) / H;
        const at = 0.7 + k * 0.28;
        L.push({ kind: 'group', x: [e(at, 1.6), e(at + 0.55, 0.5, 'expo')], y, motionBlur: true, opacity: [e(at, 0, 'linear'), e(at + 0.2, 1, 'out')], children: [
          { kind: 'rect', x: 0.5, y: 0.5, w: cw, h: ch, radius: 40, glass: true, color: '#121218', stroke: { color: '#2e2e36', width: 2 } },
          { kind: 'ellipse', x: 0.5 - cw / 2 / W + 90 / W, y: 0.5, w: 96, fill: { from: mix(c.accent, '#000000', 0.55), to: c.accent, angle: 135 } },
          { kind: 'text', x: 0.5 - cw / 2 / W + 90 / W, y: 0.5, text: it.icon ?? String(k + 1), size: it.icon ? 48 : 40, weight: 800, color: '#ffffff' },
          { kind: 'text', x: 0.5 - cw / 2 / W + 170 / W, y: it.sub ? 0.5 - 22 / H : 0.5, align: 'left', text: it.text, size: 44, weight: 700, maxWidth: (cw - 220) / W, color: '#ffffff' },
          ...(it.sub ? [{ kind: 'text' as const, x: 0.5 - cw / 2 / W + 170 / W, y: 0.5 + 30 / H, align: 'left' as const, text: it.sub, size: 30, weight: 500, maxWidth: (cw - 220) / W, color: '#a1a1aa' }] : [])
        ] } as Layer);
      });
      const dur = Math.min(4.6, 2 + n * 0.55);
      return { ...base, duration: dur, name: 'Problème', layers: L, camera: { zoom: [e(0, 1.03, 'linear'), e(dur, 1, 'smooth')] }, cues: [{ at: 0.2, sfx: 'whoosh' }, ...b.items.map((_, k) => ({ at: 0.75 + k * 0.28, sfx: 'swipe' as const }))] };
    }
    case 'clock': {
      // Gros chiffre en dégradé au centre d'un anneau qui se dessine (« 2 MIN », « 24 h », « 0 € »).
      const cy = c.vertical ? 0.47 : 0.5;
      const ring = c.vertical ? 720 : 620;
      const L: Layer[] = [
        { kind: 'glow', x: 0.5, y: cy, color: c.accent, size: [e(0, 300), e(1.2, 700, 'out')], opacity: 0.45, blend: 'add' } as Layer,
        { kind: 'ellipse', x: 0.5, y: cy, w: ring, stroke: { color: '#2a2a32', width: 6 } } as Layer,
        { kind: 'ellipse', x: 0.5, y: cy, w: ring, stroke: { color: c.accent, width: 12 }, rotate: -90, progress: [e(0.1, 0, 'linear'), e(1.6, 1, 'inOut')], glow: { color: c.accent, size: 26 } } as Layer,
        { kind: 'text', x: 0.5, y: cy - 0.01, text: b.big, size: Math.min(220, Math.round((ring * 1.45) / Math.max(3, b.big.length))), weight: 800, tracking: -0.04, fill: { from: '#8fa6ff', to: c.accent, angle: 90 }, reveal: 'blur', revealBy: 'char', revealAt: 0.35 } as Layer
      ];
      if (b.sub) L.push({ kind: 'text', x: 0.5, y: cy + (c.vertical ? 0.07 : 0.11), text: b.sub, size: 40, weight: 500, maxWidth: 0.7, color: c.sub, reveal: 'rise', revealBy: 'word', revealAt: 0.9 } as Layer);
      if (b.kicker) L.push({ kind: 'text', x: 0.5, y: c.vertical ? 0.2 : 0.1, text: b.kicker, size: 70, weight: 800, maxWidth: 0.86, color: c.text, reveal: 'rise', revealBy: 'word', revealAt: 0.05 } as Layer);
      L.push({ kind: 'particles', x: 0.5, y: cy, mode: 'orbit', count: 22, color: '#ffffff', color2: c.accent, size: 6, spread: 0.36, speed: 0.6 } as Layer);
      return { ...base, duration: 3, name: 'Chrono', layers: L, camera: { zoom: [e(0, 1.12, 'linear'), e(1.4, 1, 'expo'), e(3, 1.02, 'linear')] }, cues: [{ at: 0.1, sfx: 'riser' }, { at: 1.6, sfx: 'impact' }] };
    }
    case 'cta':
      return {
        ...base, duration: 3, name: 'Signature',
        layers: [
          c.hasLogo ? { kind: 'image', src: 'logo', x: 0.5, y: 0.34, w: 170, fit: 'contain', scale: [e(0, 0.6), e(0.6, 1, 'back')], opacity: [e(0, 0, 'linear'), e(0.4, 1, 'out')] } : { kind: 'ellipse', x: 0.5, y: 0.34, w: [e(0, 0), e(0.5, 110, 'back')], color: c.accent, glow: { color: c.accent, size: 36 } },
          { kind: 'text', x: 0.5, y: 0.45, text: b.title, size: 80, weight: 900, maxWidth: 0.86, color: c.text, reveal: 'blur', revealBy: 'word', revealAt: 0.3 },
          ...(b.button ? [
            { kind: 'rect' as const, x: 0.5, y: 0.58, w: [e(0.8, 0), e(1.2, 520, 'back')], h: 120, radius: 60, color: c.accent, glow: { color: c.accent, size: 30 }, scale: [e(1.9, 1, 'linear'), e(2, 0.92, 'out'), e(2.15, 1, 'back')] },
            { kind: 'text' as const, x: 0.5, y: 0.58, text: b.button, size: 46, weight: 800, color: lum(c.accent) > 150 ? '#0b0b0b' : '#ffffff', from: 1.05, reveal: 'scale' as const, revealAt: 1.05 }
          ] : []),
          ...(b.link ? [{ kind: 'text' as const, x: 0.5, y: 0.67, text: b.link, size: 34, weight: 500, color: c.sub, reveal: 'rise' as const, revealAt: 1.3 }] : [])
        ],
        cues: [{ at: 0.3, sfx: 'chime' }, ...(b.button ? [{ at: 2, sfx: 'click' as const }] : [])]
      };
  }
}

const ICON_SET = ['heart', 'star', 'share', 'pin', 'edit', 'search', 'check', 'plus', 'play', 'cart', 'bag', 'phone', 'mail', 'location', 'calendar', 'clock', 'user', 'camera', 'bell', 'home', 'gift', 'sparkle', 'like', 'message', 'send', 'music', 'bolt', 'lock', 'arrow', 'euro', 'download', 'eye'];
const pickN = <T,>(arr: readonly T[], k: number): T => arr[((k % arr.length) + arr.length) % arr.length];
/** Couleur qui change d'un coup à l'instant t. */
const colAt = (t: number, a: string, b: string) => [{ t: 0, v: a }, { t, v: a }, { t: t + 0.1, v: b, e: 'linear' as const }];
const PHOTO_STYLES = ['card', 'polaroid', 'strips', 'circle', 'zoom', 'tilt', 'stack', 'full'] as const;
const capOf = (cap: string | undefined, y: number, c: Ctx, at: number, reveal: 'swirl' | 'rise' | 'blur' | 'mask' = 'swirl', size = 60): Layer[] =>
  cap ? [{ kind: 'text', x: 0.5, y, text: cap, size, weight: 800, maxWidth: 0.86, color: c.text, reveal, revealBy: reveal === 'swirl' ? 'char' : 'word', revealAt: at } as Layer] : [];

/** Photo mise en scène : 8 façons différentes, tirées au sort à chaque pub (jamais toujours la même chose). */
function photoScene(b: Extract<Block, { block: 'photo' }>, i: number, c: Ctx): Scene {
  const st = b.style ?? pickN(PHOTO_STYLES, (c.seed ?? 0) + i * 3);
  const base = { type: 'free' as const, bg: 'theme' as const };
  const V = c.vertical, W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const others = (b.imgs ?? []).filter((x) => x !== b.img);
  const alt = (k: number) => (others.length ? others[Math.abs(k) % others.length] : b.img);
  const ink = c.light ? '#141414' : '#ffffff';
  switch (st) {
    case 'card': {
      // Carte photo qui arrive en tournoyant, boutons d'action qui gravitent autour puis se posent ; l'un est « appuyé ».
      const cw = V ? 620 : 480, ch = V ? 780 : 600;
      const icons = ['edit', 'pin', 'heart', 'share'] as const;
      const L: Layer[] = [
        { kind: 'image', src: b.img, x: 0.5, y: 0.46, w: cw, h: ch, radius: 56, fit: 'cover', shadow: true, motionBlur: true, rotate: [e(0, -38), e(0.75, 4, 'smooth'), e(1.1, 0, 'spring')], scale: [e(0, 0.35), e(0.75, 1.04, 'smooth'), e(1.1, 1, 'spring')], ry: [e(0, 50), e(0.8, 0, 'smooth')], opacity: [e(0, 0, 'linear'), e(0.2, 1, 'out')], zoom: [e(0, 1.25, 'linear'), e(3.2, 1, 'smooth')] } as Layer
      ];
      icons.forEach((name, k) => {
        const fx = 0.5 + (cw / 2 + 70) / W, fy = 0.46 + ((k - 1.5) * 150) / H;
        const at = 0.55 + k * 0.1;
        const pressed = k === 1;
        L.push({
          kind: 'icon', name, size: 34, shadow: true, motionBlur: true,
          x: [e(at, 0.5 + Math.cos(k * 1.7) * 0.3), e(at + 0.6, fx, 'spring')],
          y: [e(at, 0.46 + Math.sin(k * 1.7) * 0.18), e(at + 0.6, fy, 'spring')],
          rotate: [e(at, 160), e(at + 0.6, 0, 'spring')],
          color: pressed ? colAt(1.7, '#1a1a1a', '#ffffff') : '#1a1a1a',
          bg: pressed ? colAt(1.7, '#ffffff', c.accent) : '#ffffff',
          ...(pressed ? { scale: [e(1.55, 1), e(1.65, 0.8, 'in'), e(1.9, 1.15, 'spring'), e(2.2, 1)] } : {}),
          opacity: [e(at, 0, 'linear'), e(at + 0.15, 1, 'out')]
        } as Layer);
      });
      L.push({ kind: 'particles', x: 0.5 + (cw / 2 + 70) / W, y: 0.46 - 75 / H, mode: 'burst', count: 26, color: c.accent, color2: '#ffffff', size: 7, spread: 0.12, at: 1.7, from: 1.6 } as Layer);
      L.push(...capOf(b.caption, V ? 0.76 : 0.88, c, 1.3, 'swirl', V ? 60 : 52));
      return { ...base, duration: 3.2, name: 'Carte photo', layers: L, camera: { zoom: [e(0, 1.08, 'linear'), e(1.2, 1, 'smooth'), e(3.2, 1.04, 'linear')] }, cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.7, sfx: 'pop' }, { at: 1.7, sfx: 'click' }] };
    }
    case 'polaroid': {
      // Photos façon tirage papier qui tombent et s'empilent, légende écrite sur le cadre.
      const pw = V ? 640 : 420, ph = pw * 1.1;
      const L: Layer[] = [];
      [alt(1), b.img].forEach((src, k) => {
        const at = k * 0.35, rot = k ? -4 : 9, dx = k ? 0 : 0.06;
        L.push({ kind: 'group', x: 0.5 + dx, y: [e(at, -0.4), e(at + 0.7, V ? 0.46 : 0.5, 'spring')], rotate: [e(at, k ? 18 : -14), e(at + 0.75, rot, 'spring')], motionBlur: true, children: [
          { kind: 'rect', x: 0.5, y: 0.5, w: pw + 50, h: ph + 190, radius: 10, color: '#fbfaf7', shadow: true },
          { kind: 'image', src, x: 0.5, y: 0.5 - 60 / H, w: pw, h: ph, radius: 4, fit: 'cover' },
          ...(k && b.caption ? [{ kind: 'text' as const, x: 0.5, y: 0.5 + (ph / 2 + 30) / H, text: b.caption, size: V ? 44 : 34, weight: 600, italic: true, maxWidth: (pw - 20) / W, color: '#2a2a2a', reveal: 'type' as const, revealAt: 1.2, revealDur: 1 }] : [])
        ] } as Layer);
      });
      return { ...base, duration: 3.2, name: 'Tirages photo', layers: L, camera: { zoom: [e(0, 1, 'linear'), e(3.2, 1.06, 'linear')], rotate: [e(0, 2, 'linear'), e(3.2, 0, 'smooth')] }, cues: [{ at: 0.5, sfx: 'swipe' }, { at: 0.9, sfx: 'swipe' }, { at: 1.2, sfx: 'click' }] };
    }
    case 'strips': {
      // La photo découpée en bandes qui glissent en sens alterné et se recollent.
      const n = V ? 3 : 5, sw = W / n;
      const L: Layer[] = [];
      for (let k = 0; k < n; k++) {
        const from = k % 2 ? 1.6 : -0.6, at = k * 0.08;
        L.push({ kind: 'image', src: b.img, x: (k + 0.5) / n, y: [e(at, from), e(at + 0.65, 0.5, 'expo')], w: sw + 1, h: H, fit: 'cover', slice: [k / n, (k + 1) / n], zoom: [e(0, 1.2, 'linear'), e(2.8, 1.05, 'smooth')], motionBlur: true } as Layer);
      }
      if (b.caption) {
        L.push({ kind: 'rect', x: 0.5, y: 0.78, w: [e(0.8, 0), e(1.2, W * 0.86, 'expo')], h: V ? 150 : 120, radius: 20, color: c.accent } as Layer);
        L.push({ kind: 'text', x: 0.5, y: 0.78, text: b.caption, size: V ? 54 : 46, weight: 900, maxWidth: 0.8, color: lum(c.accent) > 150 ? '#0b0b0b' : '#ffffff', reveal: 'mask', revealBy: 'word', revealAt: 1.0 } as Layer);
      }
      return { ...base, duration: 2.8, name: 'Bandes', layers: L, cues: [{ at: 0.05, sfx: 'swipe' }, { at: 0.3, sfx: 'swipe' }, { at: 0.9, sfx: 'impact' }] };
    }
    case 'circle': {
      // Photo dans un cercle qui s'ouvre depuis un point, anneau qui se dessine, anneau fin qui tourne en sens inverse.
      const d = V ? 760 : 520;
      const cy = V ? 0.44 : 0.45;
      const L: Layer[] = [
        { kind: 'ellipse', x: 0.5, y: cy, w: [e(0, 0), e(0.35, 60, 'out'), e(0.9, d + 70, 'smooth')], color: c.accent } as Layer,
        { kind: 'image', src: b.img, x: 0.5, y: cy, w: [e(0.25, 1), e(0.95, d, 'smooth')], h: [e(0.25, 1), e(0.95, d, 'smooth')], radius: 1000, fit: 'cover', zoom: [e(0, 1.4, 'linear'), e(3, 1, 'smooth')] } as Layer,
        { kind: 'ellipse', x: 0.5, y: cy, w: d + 150, stroke: { color: c.accent, width: 4 }, progress: [e(0.6, 0, 'linear'), e(1.6, 1, 'smooth')], rotate: [e(0, -90, 'linear'), e(3, 30, 'linear')] } as Layer,
        { kind: 'ellipse', x: 0.5, y: cy, w: d + 230, stroke: { color: ink, width: 2 }, opacity: 0.25, progress: [e(0.8, 0, 'linear'), e(1.8, 0.7, 'smooth')], rotate: [e(0, 90, 'linear'), e(3, -60, 'linear')] } as Layer
      ];
      L.push(...capOf(b.caption, V ? 0.73 : 0.86, c, 1.1, 'swirl', V ? 64 : 52));
      return { ...base, duration: 3, name: 'Cercle', layers: L, cues: [{ at: 0.1, sfx: 'pop' }, { at: 0.6, sfx: 'whoosh' }] };
    }
    case 'zoom': {
      // Mur de vignettes ; la caméra plonge dans celle du centre qui devient plein écran.
      const tw = V ? 300 : 300, th = tw * 1.3, gap = 30;
      const L: Layer[] = [];
      for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) {
        const center = r === 0 && q === 0;
        const x = 0.5 + (q * (tw + gap)) / W, y = 0.5 + (r * (th + gap)) / H;
        L.push(center
          ? { kind: 'image', src: b.img, x, y, w: tw, h: th, radius: 26, fit: 'cover', shadow: true } as Layer
          : { kind: 'image', src: alt(r * 5 + q + 12), x, y, w: tw, h: th, radius: 26, fit: 'cover', opacity: [e(0, 0.9, 'linear'), e(1.0, 0.35, 'smooth')], blur: [e(0, 0, 'linear'), e(1.0, 12, 'smooth')] } as Layer);
      }
      const big = Math.max(W / tw, H / th) * 1.04;
      return { ...base, duration: 3, name: 'Plongée', layers: L, camera: { zoom: [e(0, 0.85, 'linear'), e(0.6, 1, 'smooth'), e(1.6, big, 'expo'), e(3, big * 1.05, 'linear')], rotate: [e(0, -8, 'linear'), e(1.6, 0, 'expo')] }, cues: [{ at: 0.6, sfx: 'riser' }, { at: 1.5, sfx: 'impact' }] };
    }
    case 'tilt': {
      // Photo qui pivote en 3D devant son propre reflet flou, reflet lumineux qui balaie.
      const pw = V ? 820 : 900, ph = V ? 1100 : 560;
      const L: Layer[] = [
        { kind: 'image', src: b.img, x: 0.5, y: 0.5, w: W * 1.3, h: H * 1.3, fit: 'cover', blur: 40, opacity: 0.55 } as Layer,
        { kind: 'image', src: b.img, x: 0.5, y: 0.47, w: pw, h: ph, radius: 40, fit: 'cover', shadow: true, ry: [e(0, 55), e(0.9, -10, 'smooth'), e(1.5, 0, 'spring')], scale: [e(0, 0.8), e(0.9, 1, 'smooth')], opacity: [e(0, 0, 'linear'), e(0.25, 1, 'out')], motionBlur: true } as Layer,
        { kind: 'rect', x: [e(0.9, -0.3, 'linear'), e(1.7, 1.3, 'inOut')], y: 0.47, w: 160, h: H * 1.4, rotate: 20, color: '#ffffff', opacity: 0.25, blur: 30, blend: 'screen' } as Layer
      ];
      L.push(...capOf(b.caption, V ? 0.85 : 0.9, c, 1.2, 'rise', V ? 58 : 48).map((l) => ({ ...l, color: '#ffffff', shadow: true } as Layer)));
      return { ...base, duration: 3, name: 'Bascule 3D', layers: L, cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 0.9, sfx: 'chime' }] };
    }
    case 'stack': {
      // Pile de cartes en éventail qui arrive, puis une carte s'envole sur le côté.
      const cw = V ? 620 : 420, ch = cw * 1.3;
      const L: Layer[] = [];
      [alt(2), alt(1), b.img].forEach((src, k) => {
        const at = k * 0.12, rot = (k - 1) * 8;
        const fly = k === 1;
        L.push({ kind: 'image', src, y: [e(at, 1.5), e(at + 0.6, 0.47, 'expo')], w: cw, h: ch, radius: 36, fit: 'cover', shadow: true, motionBlur: true,
          x: fly ? [e(0, 0.5), e(1.2, 0.5), e(1.6, -0.6, 'in')] : 0.5,
          rotate: fly ? [e(at, rot * 3), e(at + 0.6, rot, 'spring'), e(1.2, rot), e(1.6, -40, 'in')] : k === 2 ? [e(at, 20), e(at + 0.6, 0, 'spring')] : [e(at, rot * 3), e(at + 0.6, rot, 'spring')] } as Layer);
      });
      L.push(...capOf(b.caption, V ? 0.8 : 0.9, c, 1.0, 'swirl', V ? 60 : 50));
      return { ...base, duration: 3, name: 'Pile de cartes', layers: L, cues: [{ at: 0.1, sfx: 'swipe' }, { at: 0.35, sfx: 'swipe' }, { at: 1.25, sfx: 'whoosh' }] };
    }
    default: {
      const rv = pickN(['iris', 'blinds', 'split', 'wipe', 'rise'] as const, i + (c.seed ?? 0));
      return {
        ...base, duration: 2.6, name: 'Photo',
        layers: [
          { kind: 'image', src: b.img, x: 0.5, y: 0.5, w: W, h: H, fit: 'cover', reveal: rv, revealDur: 0.7, zoom: [e(0, 1.04, 'linear'), e(2.6, 1.16, 'linear')] } as Layer,
          ...(b.caption ? [
            { kind: 'rect', x: 0.5, y: 0.74, w: V ? 960 : 1200, h: 170, radius: 36, glass: true, opacity: [e(0.5, 0, 'linear'), e(0.8, 1, 'out')] } as Layer,
            { kind: 'text', x: 0.5, y: 0.74, text: b.caption, size: 50, weight: 800, maxWidth: 0.8, color: '#ffffff', reveal: 'blur', revealBy: 'word', revealAt: 0.6 } as Layer
          ] : [])
        ],
        cues: [{ at: 0.05, sfx: 'whoosh' }]
      };
    }
  }
}

/** Barre de recherche qui s'écrit (la caméra part de très près), puis résultats en mosaïque qui apparaissent en cascade. */
function searchScene(b: Extract<Block, { block: 'search' }>, c: Ctx): Scene {
  const V = c.vertical, W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const bw = V ? 900 : 1100, by = V ? 0.24 : 0.2;
  const L: Layer[] = [
    { kind: 'rect', x: 0.5, y: by, w: bw, h: 120, radius: 60, color: '#ffffff', shadow: true, stroke: { color: '#e4e4e7', width: 2 } } as Layer,
    { kind: 'icon', name: 'search', x: 0.5 + (bw / 2 - 70) / W, y: by, size: 40, color: '#3f3f46' } as Layer,
    { kind: 'text', x: 0.5 - (bw / 2 - 50) / W, y: by, align: 'left', text: b.query, size: 44, weight: 500, maxWidth: (bw - 160) / W, color: '#18181b', reveal: 'type', revealAt: 0.3, revealDur: Math.min(1.4, 0.3 + b.query.length * 0.05) } as Layer
  ];
  const cols = V ? 3 : 5, cw = V ? 290 : 300, gap = 26;
  const imgs = b.imgs ?? [];
  const hues = [c.accent, mix(c.accent, '#000000', 0.4), mix(c.accent, '#ffffff', 0.5), '#3f4a5a', '#6b7a3a', '#a33a2c', '#d8d4cc', '#2b2f3a'];
  let k = 0;
  for (let q = 0; q < cols; q++) {
    let y = by + 160 / H;
    for (let r = 0; r < 5; r++) {
      const hgt = [300, 380, 240, 340][(q + r * 2) % 4];
      const x = 0.5 + ((q - (cols - 1) / 2) * (cw + gap)) / W;
      const cy = y + hgt / 2 / H;
      const at = 1.5 + k * 0.04;
      const common = { x, y: [e(at, cy + 0.05), e(at + 0.5, cy, 'expo')], w: cw, h: hgt, radius: 24, opacity: [e(at, 0, 'linear'), e(at + 0.2, 1, 'out')], scale: [e(at, 0.7), e(at + 0.5, 1, 'spring')], motionBlur: true };
      L.push((imgs.length ? { kind: 'image', src: imgs[k % imgs.length], fit: 'cover', ...common } : { kind: 'rect', color: hues[k % hues.length], ...common }) as Layer);
      y += (hgt + gap) / H;
      k++;
    }
  }
  return { type: 'free', bg: 'theme', duration: 3.6, name: 'Recherche', layers: L.slice(0, 40), camera: { zoom: [e(0, 2.3, 'linear'), e(1.4, 2.15, 'linear'), e(2.0, 1, 'expo')], y: [e(0, by - 0.5, 'linear'), e(1.4, by - 0.5, 'linear'), e(2.0, 0, 'expo')], x: [e(0, -0.1, 'linear'), e(1.4, 0.04, 'linear'), e(2.0, 0, 'expo')] }, cues: [{ at: 0.3, sfx: 'click' }, { at: 1.4, sfx: 'whoosh' }, { at: 1.6, sfx: 'pop' }] };
}

/** Colonnes d'images qui défilent en sens alterné avec accélération / freinage (flou de vitesse), titre par-dessus. */
function masonryScene(b: Extract<Block, { block: 'masonry' }>, c: Ctx): Scene {
  const V = c.vertical, W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const cols = V ? 4 : 6, cw = V ? 240 : 290, gap = 22;
  const L: Layer[] = [];
  let k = 0;
  for (let q = 0; q < cols; q++) {
    const kids: Layer[] = [];
    let y = 0.5 - 1.1;
    for (let r = 0; r < 8; r++) {
      const hgt = [320, 420, 280, 380][(q + r) % 4];
      kids.push({ kind: 'image', src: b.imgs[k++ % b.imgs.length], x: 0.5, y: y + hgt / 2 / H, w: cw, h: hgt, radius: 22, fit: 'cover' } as Layer);
      y += (hgt + gap) / H;
    }
    const dir = q % 2 ? 1 : -1;
    L.push({ kind: 'group', x: 0.5 + ((q - (cols - 1) / 2) * (cw + gap)) / W, y: [e(0, 0.5 + dir * 0.35, 'linear'), e(0.9, 0.5 - dir * 0.05, 'out'), e(2.2, 0.5 - dir * 0.12, 'linear'), e(3.2, 0.5 - dir * 0.6, 'in')], motionBlur: true, children: kids } as Layer);
  }
  if (b.title) {
    L.push({ kind: 'rect', x: 0.5, y: 0.5, w: [e(0.8, 0), e(1.2, Math.min(W * 0.9, b.title.length * 34 + 140), 'spring')], h: V ? 170 : 150, radius: 85, color: c.light ? '#ffffff' : '#0b0b0f', shadow: true } as Layer);
    L.push({ kind: 'text', x: 0.5, y: 0.5, text: b.title, size: V ? 60 : 56, weight: 800, maxWidth: 0.82, color: c.light ? '#141414' : '#ffffff', reveal: 'swirl', revealAt: 1.0 } as Layer);
  }
  return { type: 'free', bg: 'theme', duration: 3.2, name: 'Mosaïque', layers: L, camera: { rotate: [e(0, -6, 'linear'), e(3.2, -2, 'smooth')], zoom: [e(0, 1.15, 'linear'), e(3.2, 1.05, 'smooth')] }, cues: [{ at: 0.05, sfx: 'whoosh' }, { at: 1.0, sfx: 'pop' }, { at: 2.6, sfx: 'whoosh' }] };
}

/** Carte qui se transforme en bouton, bouton pressé, puis un cercle de couleur envahit l'écran et le mot final apparaît. */
function buttonScene(b: Extract<Block, { block: 'button' }>, c: Ctx): Scene {
  const V = c.vertical;
  const pillW = Math.min(V ? 860 : 900, b.label.length * 30 + 200);
  const onAcc = lum(c.accent) > 150 ? '#0b0b0b' : '#ffffff';
  const icon = b.icon && ICON_SET.includes(b.icon) ? b.icon : undefined;
  const L: Layer[] = [
    { kind: 'rect', x: 0.5, y: 0.5, w: [e(0, 160), e(0.45, 520, 'spring'), e(1.0, 520, 'linear'), e(1.45, pillW, 'smooth')], h: [e(0, 160), e(0.45, 640, 'spring'), e(1.0, 640, 'linear'), e(1.45, 140, 'smooth')], radius: [e(0, 80), e(0.45, 48), e(1.0, 48, 'linear'), e(1.45, 70, 'smooth')], color: c.accent, shadow: true, rotate: [e(0, -20), e(0.6, 0, 'spring')], scale: [e(1.75, 1), e(1.85, 0.9, 'in'), e(2.05, 1, 'spring')], to: 2.6 } as Layer,
    ...(icon ? [{ kind: 'icon', name: icon, x: 0.5, y: 0.5, size: [e(0.3, 0), e(0.6, 110, 'spring'), e(1.0, 110, 'linear'), e(1.2, 0, 'in')], color: onAcc, to: 1.25 } as Layer] : []),
    { kind: 'text', x: 0.5, y: 0.5, text: b.label, size: 56, weight: 700, color: onAcc, reveal: 'swirl', revealAt: 1.35, to: 2.6 } as Layer,
    { kind: 'ellipse', x: 0.5, y: 0.5, w: [e(2.1, 0), e(2.7, 4600, 'expo')], color: c.accent, from: 2.1 } as Layer
  ];
  if (b.final) L.push({ kind: 'text', x: 0.5, y: 0.5, text: b.final, size: V ? 110 : 100, weight: 800, maxWidth: 0.88, color: onAcc, reveal: 'swirl', revealAt: 2.55, from: 2.5 } as Layer);
  return { type: 'free', bg: 'theme', duration: b.final ? 4 : 3, name: 'Bouton', layers: L, cues: [{ at: 0.1, sfx: 'pop' }, { at: 1.85, sfx: 'click' }, { at: 2.15, sfx: 'whoosh' }] };
}

/** Fabrique la pub complète à partir des blocs et du style choisis par l'IA. */
export function composeProject(blocks: Block[], style: ComposeStyle, o: { brand: string; hasLogo: boolean; format: MotionProject['format']; fallbackTheme?: MotionProject['theme']; photos: number; videos?: number; seed?: number }): MotionProject {
  const backdrop = style.backdrop && style.backdrop !== 'custom' ? style.backdrop : 'glow';
  const light = LIGHT_BACKDROPS.has(backdrop);
  const accent = style.accent ?? style.colors?.[2] ?? o.fallbackTheme?.primary ?? '#7c5cff';
  const colors = style.colors?.length ? style.colors : [mix(accent, '#000000', 0.93), mix(accent, '#000000', 0.6), accent, mix(accent, '#ffffff', 0.45)];
  const text = light ? '#141414' : '#ffffff';
  const c: Ctx = { accent, text, sub: light ? '#4a4a4a' : '#c9cfd6', brand: o.brand, hasLogo: o.hasLogo, vertical: o.format === '9:16', seed: o.seed ?? Math.floor(Math.random() * 1000), light };
  // Images qui pointent vers une photo absente : on les remplace par une photo existante (ou une recherche web).
  const fixImg = (s: string) => (s.startsWith('video:') && Number(s.slice(6)) >= (o.videos ?? 0) ? (o.photos ? 'photo:0' : `search:${o.brand || 'lifestyle'}`) : s.startsWith('photo:') && Number(s.slice(6)) >= o.photos ? (o.photos ? `photo:${Number(s.slice(6)) % o.photos}` : `search:${o.brand || 'abstract gradient'}`) : s);
  const fixed = blocks.map((b) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'img' || k === 'src' || k === 'before' || k === 'after' ? fixImg(String(v)) : k === 'imgs' && Array.isArray(v) ? v.map((x: unknown) => fixImg(String(x))) : v))) as Block);
  const scenes = fixed.slice(0, 12).map((b, i) => sceneFor(b, i, c));
  return {
    format: o.format,
    brand: o.brand.slice(0, 40),
    theme: { background: colors[0], primary: accent, accent: colors[3] ?? accent, text, style: 'clean', motif: 'none', anim: 'blur', backdrop: { kind: backdrop, colors, speed: 1.3, intensity: 1.05 } },
    transition: style.transition ?? pickN(['blur', 'whip', 'light', 'circle', 'zoom'] as const, c.seed ?? 0),
    sound: { music: style.music ?? 'electro', bpm: style.bpm ?? 118, volume: 0.75 },
    scenes
  };
}

/** Liste des blocs valides d'une réponse d'IA (les blocs invalides sont ignorés, pas toute la pub). */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    const r = BlockSchema.safeParse(b);
    if (!r.success) continue;
    if (r.data.block === 'free') {
      // Scène libre écrite par l'IA : réparée puis vérifiée, sinon ignorée (jamais de pub cassée).
      const fixed = repairFree({ type: 'free', bg: 'theme', duration: r.data.duration, name: r.data.name, layers: r.data.layers, camera: r.data.camera });
      const ok = fixed ? SceneSchema.safeParse(fixed) : null;
      if (!ok?.success || ok.data.type !== 'free') continue;
      out.push({ ...r.data, layers: ok.data.layers as unknown as Record<string, unknown>[], camera: ok.data.camera as Record<string, unknown> | undefined });
      continue;
    }
    out.push(r.data);
  }
  return out;
}

export const BLOCKS_DOC = `BLOCS DISPONIBLES (chacun devient une scène motion design haut de gamme, déjà animée et sonorisée) — "img" = "photo:N" (photo du client), "video:N" (vidéo du client, blocs phone / photo), "logo" ou "search:mots-clés en anglais" (photo libre de droits) :
- { "block": "reveal", "brand": "nom", "line": "phrase qui pousse le nom hors champ (optionnel)" } — révélation de la marque (particules qui convergent, logo, nom flou → net).
- { "block": "kinetic", "lines": ["1 à 3 phrases courtes"], "style": "push" | "blur" | "slam" | "mask" | "curve" | "highlight" | "stack" | "echo" | "type" | "wave" } — typographie cinétique : push = chaque phrase pousse la précédente avec flou de mouvement ; highlight = un surligneur coloré balaie la dernière ligne (mettre le bénéfice clé en dernière ligne) ; stack = lignes géantes en majuscules qui claquent de gauche et de droite (2-3 mots par ligne, idéal pour un hook) ; echo = un SEUL mot clé géant répété en contour qui défile (lines[0] = 1 mot, lines[1] = petite phrase optionnelle) ; type = machine à écrire avec curseur ; wave = lettres en vague. VARIE les styles d'une scène à l'autre.
- { "block": "carousel", "title": "…", "items": [{ "img": "photo:0", "label": "…", "sub": "…" }, …] } — carrousel de cartes numérotées 01, 02…
- { "block": "wall", "title": "…", "imgs": ["photo:0", "photo:1", …] } — mur d'images incliné qui défile derrière un gros titre penché.
- { "block": "grid", "title": "…", "items": [{ "img": …, "label": … }] } — grille qui apparaît en vague.
- { "block": "card", "title": "…", "sub": "…", "img": "photo:N", "toast": "Réservation confirmée" } — carte d'interface en verre dépoli qui pivote, plongée de caméra sur le bouton, coche + éclat + notification.
- { "block": "list", "title": "…", "lines": ["2 à 7 lignes"] } — liste qui défile dans une carte en verre (avantages, étapes, menu, horaires).
- { "block": "stat", "value": 1250, "prefix": "+", "suffix": " clients", "label": "…" } — chiffre qui compte avec un anneau qui se dessine (UNIQUEMENT un chiffre réel fourni).
- { "block": "explain", "img": "photo:N", "title": "…", "notes": [{ "x": 0-1, "y": 0-1, "text": "…", "sub": "…" }] } — photo expliquée : annotations animées sur les points clés (coordonnées dans la photo), puis zoom sur le détail principal.
- { "block": "compare", "before": "photo:N", "after": "photo:M", "labelBefore": "Avant", "labelAfter": "Après", "title": "…" } — avant / après avec volet lumineux.
- { "block": "photo", "img": "photo:N", "caption": "…", "style": "card" | "polaroid" | "strips" | "circle" | "zoom" | "tilt" | "stack" | "full", "imgs": [autres images pour le décor] } — photo mise en scène : card = carte qui tournoie avec boutons d'action (j'aime, épingle, partage) qui gravitent ; polaroid = tirages papier qui tombent ; strips = photo découpée en bandes qui glissent ; circle = cercle qui s'ouvre avec anneaux ; zoom = mur de vignettes puis plongée de caméra dans la photo ; tilt = bascule 3D devant son reflet flou ; stack = pile de cartes en éventail ; full = plein écran qui se dévoile. VARIE le style à chaque photo (jamais deux fois le même dans une pub).
- { "block": "search", "query": "ce que tape le client", "imgs": ["photo:N" | "search:…"] } — barre de recherche qui s'écrit en très gros plan, puis la caméra recule et les résultats apparaissent en mosaïque.
- { "block": "masonry", "imgs": [3 à 12 images], "title": "…" } — colonnes d'images qui défilent en sens alterné avec accélérations et flou de vitesse, titre en pastille par-dessus.
- { "block": "button", "label": "Réserver", "final": "mot final (souvent la marque)", "icon": "heart|star|share|pin|cart|bag|calendar|phone|location|gift|sparkle|play|check|…" } — une carte se transforme en bouton, il est pressé, un cercle de couleur envahit l'écran et le mot final apparaît en tourbillon.
- { "block": "map", "place": "nom du lieu (ville, quartier, adresse)", "label": "petite phrase (optionnel, ex. « Ouvert à deux pas »)" } — VRAIE carte animée du lieu (rues qui se dessinent, épingle qui tombe, onde) : à utiliser dès que le client parle d'une carte, d'une ville, d'un quartier, d'une adresse ou de « où nous trouver ». Ne mets jamais une photo de carte à la place.
- { "block": "cta", "title": "…", "button": "…", "link": "…" } — signature finale : logo, phrase, bouton cliqué, lien.
BLOCS SIGNATURE (le style des pubs izicut, très premium — utilise-les souvent) :
- { "block": "phone", "img": "video:N" | "photo:N" | "search:…", "from": seconde de départ si vidéo, "kicker": "petit titre au-dessus", "hook": "accroche en pastille blanche", "caption": "sous-titre karaoké" } — téléphone qui pivote en 3D avec la VIDÉO ou la photo du client dedans, accroche, sous-titres mot à mot et barre de lecture. SI LE CLIENT A IMPORTÉ UNE VIDÉO, montre-la dans au moins un bloc "phone" ("img": "video:0").
- { "block": "problem", "kicker": "Le problème", "title": "phrase forte", "items": [{ "icon": "emoji", "text": "…", "sub": "…" }] } — grand titre puis 1 à 3 cartes en verre qui glissent (douleurs du client, étapes, avantages).
- { "block": "chat", "kicker": "…", "ask": "demande écrite par un client", "reply": "réponse validée" } — bulle de message qui s'écrit, réponse qui arrive avec une coche dégradée (réservation, commande, question/réponse).
- { "block": "clock", "big": "2 MIN" | "24 h" | "-30 %", "sub": "…", "kicker": "question choc au-dessus" } — gros chiffre en dégradé dans un anneau qui se dessine (UNIQUEMENT un chiffre réel donné par le client, ou une durée évidente).
Déroulé type d'une pub premium : kinetic "stack" (accroche) → problem → phone → chat ou list → clock / stat → cta.
- "kinetic" avec "style": "karaoke" — sous-titres mot à mot façon TikTok (le mot prononcé grossit et s'allume) : idéal pour une phrase forte ou un message parlé.
- { "block": "free", "duration": 2-5, "name": "…", "layers": [ … ], "camera": { "zoom": [{"t":0,"v":1},{"t":3,"v":1.1}] } } — SCÈNE SUR MESURE quand le client veut quelque chose qu'aucun bloc ne fait (objet précis, schéma, chronologie, comparatif, effet particulier…). Calques possibles (x, y de 0 à 1 ; tailles en pixels sur 1080 de large) :
  {"kind":"text","text":"…","x":0.5,"y":0.5,"size":80,"weight":800,"color":"#fff","reveal":"rise|blur|scale|mask|type|wave|split|karaoke|swirl","revealBy":"word|char|line","revealAt":0.2,"outAt":2.5} · {"kind":"icon","name":"heart|star|share|pin|edit|search|check|plus|play|cart|bag|phone|mail|location|calendar|clock|user|camera|bell|home|gift|sparkle|like|message|send|music|bolt|lock|arrow|euro|download|eye","x":0.5,"y":0.5,"size":40,"color":"#fff","bg":"#…"}
  {"kind":"rect","x":0.5,"y":0.5,"w":800,"h":400,"radius":40,"color":"#…","glass":true} · {"kind":"ellipse","x":0.5,"y":0.5,"w":200,"color":"#…","glow":{"color":"#…","size":40}}
  {"kind":"image","src":"photo:0|search:…|logo","x":0.5,"y":0.5,"w":600,"h":600,"radius":30} · {"kind":"particles","mode":"burst|float|converge|sparkle|orbit","x":0.5,"y":0.5,"count":40,"color":"#…"}
  Animation : n'importe quel nombre peut être une suite d'images clés [{"t":0,"v":0},{"t":0.6,"v":1,"e":"smooth"}] ("e" = "smooth" | "spring" | "inOut" | "in"), et "from"/"to" (secondes) pour l'apparition et la disparition. Emojis : un calque texte avec l'emoji.
ZONES DE SÉCURITÉ (TikTok / Reels) : garde les textes importants entre y = 0.14 et y = 0.76 et loin du bord droit (x < 0.85).
STYLE : { "backdrop": un fond parmi ${BACKDROPS.filter((b) => b !== 'custom').join(', ')}, "colors": [4 couleurs #RRGGBB du plus sombre au plus clair, aux couleurs de la marque], "accent": "#RRGGBB" (couleur vive des boutons / badges), "music": "pop" | "electro" | "chill" | "epic" | "acoustic" | "hiphop", "bpm": 60-170, "transition": "blur" | "whip" (glissé rapide façon After Effects) | "light" (reflet lumineux, premium) | "circle" (cercle de couleur qui envahit l'écran) | "zoom" | "glitch" | "flash" }
ORIGINALITÉ : chaque pub doit être différente des autres — change l'ordre, les blocs, les styles de photo, les styles de texte et la transition d'une pub à l'autre. Mélange les blocs signature, les mises en scène photo et au moins une scène "free" sur mesure avec des icônes ({"kind":"icon","name":"heart","x":0.5,"y":0.5,"size":40,"color":"#fff","bg":"#…"}) ou des textes "reveal":"swirl" (lettres en tourbillon, avec "outAt" pour une sortie animée).`;

export { SFX };

/** Une scène premium isolée (ajout ou remplacement d'une scène lors d'une retouche), aux couleurs de la pub. */
export function blockScene(block: Block, project: MotionProject, index: number, o: { hasLogo: boolean; photos: number; videos?: number }): Scene {
  const th = project.theme;
  const light = lum(th.background) > 160 && (!th.backdrop || LIGHT_BACKDROPS.has(th.backdrop.kind));
  const c: Ctx = { accent: th.primary, text: light ? '#141414' : '#ffffff', sub: light ? '#4a4a4a' : '#c9cfd6', brand: project.brand ?? '', hasLogo: o.hasLogo, vertical: project.format === '9:16', seed: Math.floor(Math.random() * 1000), light };
  const fixImg = (s: string) => (s.startsWith('video:') && Number(s.slice(6)) >= (o.videos ?? 0) ? (o.photos ? 'photo:0' : `search:${project.brand || 'lifestyle'}`) : s.startsWith('photo:') && Number(s.slice(6)) >= o.photos ? (o.photos ? `photo:${Number(s.slice(6)) % o.photos}` : `search:${project.brand ?? 'abstract'}`) : s);
  const fixed = JSON.parse(JSON.stringify(block, (k, v) => (k === 'img' || k === 'before' || k === 'after' ? fixImg(String(v)) : k === 'imgs' && Array.isArray(v) ? v.map((x: unknown) => fixImg(String(x))) : v))) as Block;
  return sceneFor(fixed, index, c);
}

/**
 * Pub motion design montée SANS IA (secours quand les IA sont saturées) :
 * on choisit des blocs animés à partir de la demande, de la marque et des
 * médias du client, avec un tirage au sort pour que deux pubs ne se
 * ressemblent pas. Jamais de « modèle » figé.
 */
export function localBlocks(o: { prompt: string; brand?: string; tagline?: string; strengths?: string[]; city?: string; link?: string; photos: number; videos: number; seed?: number }): Block[] {
  const seed = o.seed ?? Math.floor(Math.random() * 1000);
  const r = (k: number) => { const x = Math.sin((seed + 1) * 9301 + k * 49297) * 233280; return x - Math.floor(x); };
  const pick = <T,>(arr: readonly T[], k: number): T => arr[Math.floor(r(k) * arr.length) % arr.length];
  const clean = o.prompt.replace(/\s+/g, ' ').trim();
  const subject = (clean
    .replace(/^(fais|fait|faire|cr[ée]e[rz]?|g[ée]n[èe]re[rz]?|r[ée]alise[rz]?|monte[rz]?|je veux|j'aimerais|peux-tu)\s+(moi\s+)?/i, '')
    .replace(/^(une?|la|le)\s+/i, '')
    .replace(/^(pub(licit[ée])?|vid[ée]o|annonce|spot|reel|tiktok)s?\s+(motion design\s+)?(pour|de|sur)\s+/i, '')
    .replace(/^(mon|ma|mes|notre|nos|votre|vos)\s+/i, '')
    .split(/[,.;!?]| avec | qui | et /i)[0] || o.brand || 'votre projet').slice(0, 40).trim();
  const name = (o.brand || '').trim();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const low = clean.toLowerCase();
  const verb = /resto|restaurant|pizz|burger|caf[ée]|bar\b|brasserie|traiteur|boulang|p[âa]tisser/.test(low) ? 'Commander'
    : /coiff|barb|salon|spa|beaut|ongle|massage|m[ée]decin|cabinet|dentist|kin[ée]|coach|sport|salle|yoga|fitness/.test(low) ? 'Réserver'
    : /boutique|shop|magasin|mode|v[êe]tement|bijou|cosm[ée]t/.test(low) ? 'Découvrir'
    : /asso|club|[ée]v[ée]nement|festival|concert|soir[ée]e/.test(low) ? 'Participer' : 'Découvrir';
  const icon = verb === 'Commander' ? 'bag' : verb === 'Réserver' ? 'calendar' : verb === 'Participer' ? 'star' : 'sparkle';
  const photosList = Array.from({ length: Math.min(o.photos, 12) }, (_, k) => `photo:${k}`);
  const webImgs = [`search:${subject}`, `search:${subject} detail`, `search:${subject} ambiance`];
  const imgs = photosList.length ? photosList : webImgs;
  const out: Block[] = [];
  // 1. Accroche (style tiré au sort).
  const hooks: [string, string][] = [
    [`${cap(subject)}`, 'comme *jamais*'],
    ['Envie de *nouveau* ?', cap(subject)],
    [name || cap(subject), 'Le bon plan *près de chez vous*'],
    ['Vous allez *adorer*', cap(subject)]
  ];
  const [h1, h2] = pick(hooks, 1);
  const hookKind = pick(['stack', 'highlight', 'echo', 'blur', 'mask', 'wave'] as const, 2);
  out.push(hookKind === 'echo' ? { block: 'kinetic', lines: [h1.replace(/\*/g, '').split(' ')[0].slice(0, 14), h2], style: 'echo' } : { block: 'kinetic', lines: [h1, h2], style: hookKind });
  // 2. Médias du client en vedette.
  if (o.videos > 0) out.push({ block: 'phone', img: 'video:0', kicker: name ? `${name} en vidéo` : 'En vidéo', hook: o.tagline?.split(/[.!?]/)[0]?.slice(0, 40) || 'Regardez ça', caption: cap(subject).slice(0, 60) });
  const styles = ['card', 'polaroid', 'strips', 'circle', 'zoom', 'tilt', 'stack'] as const;
  const nPhotoScenes = photosList.length ? Math.min(3, photosList.length) : 1;
  for (let k = 0; k < nPhotoScenes; k++) {
    const captions = o.strengths?.length ? o.strengths : ['Fait avec *passion*', 'Le souci du *détail*', 'Rien que pour vous'];
    out.push({ block: 'photo', img: imgs[k % imgs.length], imgs, style: pick(styles, 10 + k), caption: captions[k % captions.length].slice(0, 70) });
  }
  // 3. Atouts (cartes en verre ou liste), ou recherche animée.
  if (o.strengths?.length) {
    const ic = ['★', '✓', '♥'];
    out.push(r(20) > 0.5
      ? { block: 'problem', kicker: name ? `Pourquoi ${name}` : 'Pourquoi nous', title: 'Ce qui fait *la différence*', items: o.strengths.slice(0, 3).map((s, k) => ({ icon: ic[k], text: s.slice(0, 40) })) }
      : { block: 'list', title: 'Nos *atouts*', lines: o.strengths.slice(0, 5).map((s) => s.slice(0, 60)) });
  } else out.push({ block: 'search', query: subject.slice(0, 50), imgs });
  if (imgs.length >= 3 && r(30) > 0.4) out.push({ block: 'masonry', imgs, title: pick(['Tout pour vous', 'À découvrir', 'Laissez-vous tenter'], 31) });
  // 4. Où nous trouver.
  if (o.city) out.push({ block: 'map', place: o.city, label: pick(['Juste à côté de chez vous', 'On vous attend', 'Venez nous voir'], 40) });
  // 5. Bouton qui se transforme, puis signature.
  out.push({ block: 'button', label: verb, final: (name || cap(subject)).slice(0, 30), icon });
  out.push({ block: 'cta', title: name ? `${name}, *on vous attend*` : 'À *très vite*', button: verb, ...(o.link ? { link: o.link.slice(0, 60) } : {}) });
  return out.slice(0, 9);
}
