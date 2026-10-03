/**
 * Moteur de montage « pro » : à partir de l'analyse (temps forts de la
 * musique + mouvement + position du sujet), génère un montage DENSE et calé
 * au rythme, comme les modèles des monteurs TikTok / CapCut.
 * L'IA choisit le style et l'énergie ; ce moteur garantit la qualité.
 */
import type { VideoAnalysis } from './analyze';
import { newId, type Layer } from './types';

export const STYLES = [
  { id: 'velocity', name: 'Danse · Velocity', emoji: '💃', description: 'Accélérés / ralentis sur chaque temps fort, zooms qui frappent, traînées.' },
  { id: 'hype', name: 'Hype · Glitch', emoji: '⚡', description: 'Glitch, flashs et secousses au rythme : énergie maximale.' },
  { id: 'cinematic', name: 'Cinématique', emoji: '🎬', description: 'Étalonnage film, ralentis élégants, lumière, arrêt sur image.' },
  { id: 'beatzoom', name: 'Beat Zoom', emoji: '🎯', description: 'Zooms alternés sur chaque temps, propre et efficace.' },
  { id: 'smooth', name: 'Vlog doux', emoji: '🌅', description: 'Couleurs chaudes, mouvements lents, transitions fluides.' },
  { id: 'product', name: 'Pub produit', emoji: '🛍️', description: 'Mise en valeur du sujet, look premium, transitions éclair.' }
] as const;
export type StyleId = (typeof STYLES)[number]['id'];

type Ctx = { duration: number; beats: number[]; a: VideoAnalysis | null; energy: number; rand: () => number };

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function motionAt(c: Ctx, t: number): number {
  if (!c.a || !c.a.motion.length) return 0.5;
  const i = Math.min(c.a.motion.length - 1, Math.max(0, Math.round(t / c.a.step)));
  return c.a.motion[i];
}
function centerAt(c: Ctx, t: number): { x: number; y: number } {
  if (!c.a || !c.a.centers.length) return { x: 0.5, y: 0.42 };
  const i = Math.min(c.a.centers.length - 1, Math.max(0, Math.round(t / c.a.step)));
  return c.a.centers[i];
}

/** Temps forts utilisables : ceux de la musique, sinon une grille à 120 BPM. */
function beatGrid(c: Ctx): number[] {
  const list = c.beats.filter((b) => b > 0.15 && b < c.duration - 0.2);
  if (list.length >= 4) return list;
  const out: number[] = [];
  for (let t = 0.5; t < c.duration - 0.2; t += 0.5) out.push(t);
  return out;
}

/** Temps forts « accent » : un sur N, en privilégiant ceux où ça bouge le plus. */
function accents(c: Ctx, every: number): number[] {
  const grid = beatGrid(c);
  const out: number[] = [];
  for (let i = 0; i < grid.length; i += every) {
    const group = grid.slice(i, i + every);
    group.sort((x, y) => motionAt(c, y) - motionAt(c, x));
    out.push(group[0]);
  }
  return out.sort((x, y) => x - y);
}

/** Passage le plus animé de longueur len. */
function peakWindow(c: Ctx, len: number): number {
  let best = 0;
  let bestScore = -1;
  for (let t = 0; t + len <= c.duration; t += 0.1) {
    let s = 0;
    for (let u = t; u < t + len; u += 0.1) s += motionAt(c, u);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

const L = {
  speed: (start: number, end: number, rate: number): Layer => ({ id: newId('speed'), type: 'speed', start: r2(start), end: r2(end), rate: r2(rate) }),
  zoom: (c: Ctx, t: number, len: number, scale: number, ease: 'smooth' | 'punch' | 'shake'): Layer => {
    const p = centerAt(c, t);
    return { id: newId('zoom'), type: 'zoom', start: r2(t), end: r2(Math.min(c.duration, t + len)), scale: r2(scale), x: r2(p.x), y: r2(p.y), ease };
  },
  fx: (effect: Extract<Layer, { type: 'effect' }>['effect'], start: number, end: number, intensity: number, beat = false): Layer => ({
    id: newId('fx'), type: 'effect', effect, start: r2(Math.max(0, start)), end: r2(end), intensity: r2(Math.min(1, Math.max(0.05, intensity))), beat
  }),
  filter: (c: Ctx, filter: Extract<Layer, { type: 'filter' }>['filter'], intensity: number): Layer => ({ id: newId('filter'), type: 'filter', filter, start: 0, end: c.duration, intensity: r2(intensity) }),
  flash: (t: number, color = '#ffffff', len = 0.18): Layer => ({ id: newId('flash'), type: 'flash', start: r2(t), end: r2(t + len), color }),
  freeze: (t: number, hold: number): Layer => ({ id: newId('freeze'), type: 'freeze', start: r2(t), end: r2(t + 0.2), hold: r2(hold) })
};

function velocity(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'vibrant', 0.5 + 0.3 * c.energy)];
  const marks = accents(c, c.energy > 0.66 ? 1 : 2);
  let lastEnd = -1;
  marks.forEach((b, i) => {
    if (b - 0.5 < lastEnd + 0.1) return;
    // Rampe : accéléré avant le temps fort, ralenti juste dessus.
    out.push(L.speed(Math.max(0, b - 0.45), b - 0.06, 1.6 + 0.6 * c.energy));
    out.push(L.speed(b - 0.06, Math.min(c.duration, b + 0.32), 0.45 - 0.15 * c.energy));
    out.push(L.fx('echo', b - 0.06, b + 0.32, 0.55 + 0.3 * c.energy));
    out.push(L.zoom(c, b - 0.04, 0.42, 1.18 + 0.14 * c.energy * (i % 2 ? 0.7 : 1), 'punch'));
    out.push(L.fx('zoomblur', b - 0.06, b + 0.14, 0.8));
    if (i % 4 === 0) out.push(L.flash(b - 0.02, '#ffffff', 0.14));
    lastEnd = b + 0.32;
  });
  const peak = peakWindow(c, Math.min(2.5, c.duration / 3));
  out.push(L.fx('shake', peak, peak + Math.min(2.5, c.duration / 3), 0.35 + 0.4 * c.energy, true));
  marks.filter((_, i) => i % 3 === 2).slice(0, 3).forEach((b) => out.push(L.fx('rgb', b, b + 0.25, 0.8)));
  return out;
}

function hype(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'vibrant', 0.7)];
  out.push(L.fx('glitch', 0, c.duration, 0.45 + 0.45 * c.energy, true));
  out.push(L.fx('pulse', 0, c.duration, 0.6 + 0.3 * c.energy, true));
  const grid = beatGrid(c);
  grid.forEach((b, i) => {
    if (i % 2 === 0) out.push(L.zoom(c, b - 0.03, 0.3, i % 4 === 0 ? 1.32 : 1.16, 'punch'));
    if (i % 4 === 0) out.push(L.flash(b - 0.02, i % 8 === 0 ? '#ffffff' : '#c8ff3d', 0.12));
  });
  const peak = peakWindow(c, Math.min(2, c.duration / 4));
  out.push(L.fx('strobe', peak, peak + Math.min(2, c.duration / 4), 0.35 + 0.3 * c.energy, true));
  out.push(L.fx('shake', peak, peak + Math.min(2, c.duration / 4), 0.6, true));
  const mid = c.duration * (0.45 + 0.1 * c.rand());
  out.push(L.fx('split', mid, mid + Math.min(1.2, c.duration / 6), 1));
  accents(c, 4).slice(0, 2).forEach((b) => out.push(L.fx('invert', b, b + 0.1, 1)));
  return out;
}

function cinematic(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'teal', 0.85), L.fx('grain', 0, c.duration, 0.35), L.fx('zoomin', 0, c.duration, 0.35 + 0.2 * c.energy)];
  out.push({ id: newId('filter'), type: 'filter', filter: 'cinema', start: 0, end: c.duration, intensity: 0.75 });
  const len = Math.min(3, c.duration * 0.35);
  const peak = peakWindow(c, len);
  out.push(L.speed(peak, peak + len, 0.55 - 0.15 * c.energy));
  const freezeAt = peak + len * 0.6;
  out.push(L.freeze(freezeAt, 0.6 + 0.6 * c.energy));
  out.push(L.flash(freezeAt, '#ffffff', 0.25));
  out.push(L.fx('leak', 0, Math.min(2.5, c.duration), 0.55));
  out.push(L.fx('leak', Math.max(0, c.duration - 2), c.duration, 0.5));
  accents(c, 4).forEach((b) => out.push(L.zoom(c, b, 1.2, 1.08 + 0.06 * c.energy, 'smooth')));
  return out;
}

function beatzoom(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'vibrant', 0.4)];
  beatGrid(c).forEach((b, i) => {
    out.push(L.zoom(c, b - 0.03, 0.4, i % 2 ? 1.12 + 0.08 * c.energy : 1.24 + 0.12 * c.energy, 'punch'));
    if (i % 4 === 3) out.push(L.fx('zoomblur', b - 0.05, b + 0.12, 0.7));
  });
  return out;
}

function smooth(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'warm', 0.55), L.fx('zoomin', 0, c.duration, 0.3), L.fx('leak', 0, c.duration, 0.3 + 0.2 * c.energy)];
  out.push(L.fx('pulse', 0, c.duration, 0.2 + 0.2 * c.energy, true));
  accents(c, 6).forEach((b) => out.push(L.fx('whip', b - 0.12, b + 0.12, 0.7)));
  return out;
}

function product(c: Ctx): Layer[] {
  const out: Layer[] = [L.filter(c, 'teal', 0.5), L.fx('leak', 0, c.duration, 0.35)];
  out.push(L.flash(0, '#ffffff', 0.25));
  const marks = accents(c, 4);
  marks.forEach((b, i) => {
    out.push(L.fx('whip', b - 0.12, b + 0.12, 0.8));
    out.push(L.zoom(c, b + 0.1, 1.4, i % 2 ? 1.15 : 1.28, 'smooth'));
  });
  out.push(L.fx('zoomin', 0, c.duration, 0.25));
  return out;
}

/** Génère le montage complet d'un style (variant = autre version du même style). */
export function generateEdit(style: StyleId, opts: { duration: number; beats: number[]; analysis: VideoAnalysis | null; energy: number; variant?: number }): Layer[] {
  const c: Ctx = { duration: opts.duration, beats: opts.beats, a: opts.analysis, energy: Math.min(1, Math.max(0, opts.energy)), rand: mulberry32(1 + (opts.variant ?? 0) * 7919) };
  if ((opts.variant ?? 0) % 2 === 1) c.beats = c.beats.filter((_, i) => i % 2 === 1).concat(c.beats.filter((_, i) => i % 2 === 0 && i % 4 === 0)).sort((x, y) => x - y);
  const fn = { velocity, hype, cinematic, beatzoom, smooth, product }[style];
  return fn(c)
    .filter((l) => l.end > l.start && l.start >= 0 && l.start < opts.duration)
    .map((l) => ({ ...l, end: Math.min(opts.duration, l.end) }) as Layer);
}
