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
import { MUSIC, SFX, type Layer, type MotionProject, type Scene } from './types';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const img = z.string().regex(/^(logo|photo:\d{1,2}|search:.{2,60})$/);
const txt = (n: number) => z.string().trim().min(1).max(n);

export const BlockSchema = z.discriminatedUnion('block', [
  z.object({ block: z.literal('reveal'), brand: txt(40), line: z.string().trim().max(90).optional() }),
  z.object({ block: z.literal('kinetic'), lines: z.array(txt(60)).min(1).max(3), style: z.enum(['push', 'blur', 'slam', 'mask', 'curve']).optional() }),
  z.object({ block: z.literal('carousel'), title: z.string().trim().max(50).optional(), items: z.array(z.object({ img, label: z.string().trim().max(32).optional(), sub: z.string().trim().max(40).optional() })).min(1).max(10) }),
  z.object({ block: z.literal('wall'), title: txt(60), imgs: z.array(img).min(1).max(12) }),
  z.object({ block: z.literal('grid'), title: z.string().trim().max(50).optional(), items: z.array(z.object({ img, label: z.string().trim().max(32).optional() })).min(2).max(6) }),
  z.object({ block: z.literal('card'), title: txt(40), sub: z.string().trim().max(50).optional(), img: img.optional(), toast: z.string().trim().max(44).optional() }),
  z.object({ block: z.literal('list'), title: z.string().trim().max(50).optional(), lines: z.array(txt(60)).min(2).max(7) }),
  z.object({ block: z.literal('stat'), value: z.number().min(-1e9).max(1e9), prefix: z.string().max(4).optional(), suffix: z.string().max(8).optional(), label: txt(60) }),
  z.object({ block: z.literal('explain'), img, title: z.string().trim().max(60).optional(), notes: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), text: txt(40), sub: z.string().trim().max(50).optional() })).min(1).max(3) }),
  z.object({ block: z.literal('compare'), before: img, after: img, labelBefore: z.string().trim().max(24).optional(), labelAfter: z.string().trim().max(24).optional(), title: z.string().trim().max(60).optional() }),
  z.object({ block: z.literal('photo'), img, caption: z.string().trim().max(70).optional() }),
  z.object({ block: z.literal('cta'), title: txt(60), button: z.string().trim().max(28).optional(), link: z.string().trim().max(60).optional() })
]);
export type Block = z.infer<typeof BlockSchema>;

export const StyleSchema = z.object({
  backdrop: z.enum(BACKDROPS).optional(),
  colors: z.array(hex).min(1).max(4).optional(),
  accent: hex.optional(),
  music: z.enum(MUSIC).optional(),
  bpm: z.number().min(60).max(170).optional()
});
export type ComposeStyle = z.infer<typeof StyleSchema>;

const LIGHT_BACKDROPS = new Set(['paper']);
const e = (t: number, v: number, ease: 'expo' | 'back' | 'out' | 'inOut' | 'in' | 'linear' = 'expo') => ({ t, v, e: ease });

function lum(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}
function mix(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

type Ctx = { accent: string; text: string; sub: string; brand: string; hasLogo: boolean; vertical: boolean };

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
      const style = b.style ?? (['push', 'blur', 'mask', 'slam'] as const)[i % 4];
      const layers: Layer[] = [];
      const step = 0.75;
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
      if (b.title) layers.push({ kind: 'text', x: 0.5, y: 0.82, text: b.title, size: 60, weight: 800, maxWidth: 0.86, shadow: true, reveal: 'rise', revealBy: 'word', revealAt: 0.4, color: '#ffffff', to: 2.5 });
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
          ...(b.title ? [{ kind: 'text' as const, x: 0.5, y: 0.84, text: b.title, size: 58, weight: 800, maxWidth: 0.86, shadow: true, color: '#ffffff', reveal: 'rise' as const, revealAt: 2.1 }] : [])
        ],
        cues: [{ at: 1, sfx: 'swipe' }]
      };
    case 'photo':
      return {
        ...base, duration: 2.4, name: 'Photo',
        layers: [
          { kind: 'image', src: b.img, x: 0.5, y: 0.5, w: 1080, h: 1920, fit: 'cover', reveal: (['iris', 'blinds', 'split', 'wipe'] as const)[i % 4], revealDur: 0.7, zoom: [e(0, 1.04, 'linear'), e(2.4, 1.16, 'linear')] },
          ...(b.caption ? [
            { kind: 'rect' as const, x: 0.5, y: 0.8, w: 960, h: 170, radius: 36, glass: true, opacity: [e(0.5, 0, 'linear'), e(0.8, 1, 'out')] },
            { kind: 'text' as const, x: 0.5, y: 0.8, text: b.caption, size: 50, weight: 800, maxWidth: 0.8, color: '#ffffff', reveal: 'blur' as const, revealBy: 'word' as const, revealAt: 0.6 }
          ] : [])
        ],
        cues: [{ at: 0.05, sfx: 'whoosh' }]
      };
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

/** Fabrique la pub complète à partir des blocs et du style choisis par l'IA. */
export function composeProject(blocks: Block[], style: ComposeStyle, o: { brand: string; hasLogo: boolean; format: MotionProject['format']; fallbackTheme?: MotionProject['theme']; photos: number }): MotionProject {
  const backdrop = style.backdrop && style.backdrop !== 'custom' ? style.backdrop : 'glow';
  const light = LIGHT_BACKDROPS.has(backdrop);
  const accent = style.accent ?? style.colors?.[2] ?? o.fallbackTheme?.primary ?? '#7c5cff';
  const colors = style.colors?.length ? style.colors : [mix(accent, '#000000', 0.93), mix(accent, '#000000', 0.6), accent, mix(accent, '#ffffff', 0.45)];
  const text = light ? '#141414' : '#ffffff';
  const c: Ctx = { accent, text, sub: light ? '#4a4a4a' : '#c9cfd6', brand: o.brand, hasLogo: o.hasLogo, vertical: o.format === '9:16' };
  // Images qui pointent vers une photo absente : on les remplace par une photo existante (ou une recherche web).
  const fixImg = (s: string) => (s.startsWith('photo:') && Number(s.slice(6)) >= o.photos ? (o.photos ? `photo:${Number(s.slice(6)) % o.photos}` : `search:${o.brand}`) : s);
  const fixed = blocks.map((b) => JSON.parse(JSON.stringify(b, (k, v) => (k === 'img' || k === 'src' || k === 'before' || k === 'after' ? fixImg(String(v)) : k === 'imgs' && Array.isArray(v) ? v.map((x: unknown) => fixImg(String(x))) : v))) as Block);
  const scenes = fixed.slice(0, 12).map((b, i) => sceneFor(b, i, c));
  return {
    format: o.format,
    brand: o.brand.slice(0, 40),
    theme: { background: colors[0], primary: accent, accent: colors[3] ?? accent, text, style: 'clean', motif: 'none', anim: 'blur', backdrop: { kind: backdrop, colors, speed: 1.3, intensity: 1.05 } },
    transition: 'blur',
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
    if (r.success) out.push(r.data);
  }
  return out;
}

export const BLOCKS_DOC = `BLOCS DISPONIBLES (chacun devient une scène motion design haut de gamme, déjà animée et sonorisée) — "img" = "photo:N" (photo du client), "logo" ou "search:mots-clés en anglais" (photo libre de droits) :
- { "block": "reveal", "brand": "nom", "line": "phrase qui pousse le nom hors champ (optionnel)" } — révélation de la marque (particules qui convergent, logo, nom flou → net).
- { "block": "kinetic", "lines": ["1 à 3 phrases courtes"], "style": "push" | "blur" | "slam" | "mask" | "curve" } — typographie cinétique (push = chaque phrase pousse la précédente avec flou de mouvement).
- { "block": "carousel", "title": "…", "items": [{ "img": "photo:0", "label": "…", "sub": "…" }, …] } — carrousel de cartes numérotées 01, 02…
- { "block": "wall", "title": "…", "imgs": ["photo:0", "photo:1", …] } — mur d'images incliné qui défile derrière un gros titre penché.
- { "block": "grid", "title": "…", "items": [{ "img": …, "label": … }] } — grille qui apparaît en vague.
- { "block": "card", "title": "…", "sub": "…", "img": "photo:N", "toast": "Réservation confirmée" } — carte d'interface en verre dépoli qui pivote, plongée de caméra sur le bouton, coche + éclat + notification.
- { "block": "list", "title": "…", "lines": ["2 à 7 lignes"] } — liste qui défile dans une carte en verre (avantages, étapes, menu, horaires).
- { "block": "stat", "value": 1250, "prefix": "+", "suffix": " clients", "label": "…" } — chiffre qui compte avec un anneau qui se dessine (UNIQUEMENT un chiffre réel fourni).
- { "block": "explain", "img": "photo:N", "title": "…", "notes": [{ "x": 0-1, "y": 0-1, "text": "…", "sub": "…" }] } — photo expliquée : annotations animées sur les points clés (coordonnées dans la photo), puis zoom sur le détail principal.
- { "block": "compare", "before": "photo:N", "after": "photo:M", "labelBefore": "Avant", "labelAfter": "Après", "title": "…" } — avant / après avec volet lumineux.
- { "block": "photo", "img": "photo:N", "caption": "…" } — photo plein écran qui se dévoile (iris, stores…) avec légende en verre.
- { "block": "cta", "title": "…", "button": "…", "link": "…" } — signature finale : logo, phrase, bouton cliqué, lien.
STYLE : { "backdrop": un fond parmi ${BACKDROPS.filter((b) => b !== 'custom').join(', ')}, "colors": [4 couleurs #RRGGBB du plus sombre au plus clair, aux couleurs de la marque], "accent": "#RRGGBB" (couleur vive des boutons / badges), "music": "pop" | "electro" | "chill" | "epic" | "acoustic" | "hiphop", "bpm": 60-170 }`;

export { SFX };
