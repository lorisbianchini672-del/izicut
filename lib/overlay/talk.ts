/**
 * Montage « After Effects » pour une vidéo où quelqu'un parle (face caméra).
 * À partir de la transcription mot à mot et d'un petit plan (accroche, mots
 * à illustrer, liste numérotée, temps forts — écrit par l'IA ou deviné), on
 * fabrique les calques : titre d'accroche brillant, sous-titres karaoké,
 * photos qui surgissent, liste numérotée plein écran, zooms. Chaque vidéo
 * reçoit une combinaison de styles différente (jamais le même rendu).
 */
import type { Layer } from './types';

export type Word = { word: string; start: number; end: number };
export type TalkPlan = {
  hook: string;
  broll: { t: number; query: string; label?: string }[];
  list: { items: string[]; marks: number[] } | null;
  emphasis: number[];
  accent?: string;
};

type L = Record<string, unknown>;
const k = (t: number, v: number, e: 'smooth' | 'spring' | 'inOut' | 'linear' | 'in' = 'smooth') => ({ t: Math.max(0, Math.round(t * 100) / 100), v, e });
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Phrases horodatées (pour l'IA et pour les sous-titres). */
export function sentences(words: Word[]): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) out.push({ t: cur[0].start, text: clean(cur.map((w) => w.word).join(' ')) }); cur = []; };
  words.forEach((w, i) => {
    cur.push(w);
    const gap = (words[i + 1]?.start ?? w.end + 1) - w.end;
    if (/[.!?…]$/.test(w.word) || gap > 0.6 || cur.length >= 14) flush();
  });
  flush();
  return out;
}

/** Plan deviné sans IA (secours) : accroche = début de la vidéo, liste = « numéro 1 / 2 / 3 », temps forts réguliers. */
export function guessPlan(words: Word[], duration: number): TalkPlan {
  const first = sentences(words)[0]?.text ?? '';
  const hook = first.split(' ').slice(0, 7).join(' ').replace(/[,.;:!?]+$/, '');
  const marks: number[] = [];
  const items: string[] = [];
  const ORD = /^(num[ée]ro|premi[eè]re?(ment)?|deuxi[eè]me(ment)?|troisi[eè]me(ment)?|quatri[eè]me(ment)?|cinqui[eè]me(ment)?|enfin)$/i;
  words.forEach((w, i) => {
    const bare = w.word.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿœ0-9]/gi, '');
    if (ORD.test(bare) && (!marks.length || w.start - marks[marks.length - 1] > 1.2)) {
      marks.push(w.start);
      // Le point = les mots qui suivent, jusqu'à la fin de la phrase ou l'annonce du point suivant.
      const taken: string[] = [];
      for (const x of words.slice(i + 1, i + 9)) {
        const b = x.word.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿœ0-9]/gi, '');
        if (ORD.test(b)) break;
        if (!/^(\d+|un|une|deux|trois|quatre|cinq|six|cest|ça|ca)$/i.test(b) || taken.length) taken.push(x.word);
        if (/[.!?;,]$/.test(x.word) || taken.length >= 5) break;
      }
      const next = taken.join(' ');
      items.push(clean(next).replace(/[,.;:!?]+$/, '') || `Point ${marks.length}`);
    }
  });
  const emphasis: number[] = [];
  for (let t = 4; t < duration - 2; t += 5.5) emphasis.push(t);
  return { hook: hook || 'Regarde ça', broll: [], list: marks.length >= 2 ? { items: items.slice(0, 6), marks: marks.slice(0, 6) } : null, emphasis };
}

const HOOK_STYLES = [
  { fill: { from: '#ffffff', to: '#5cb4ff', angle: 90 }, stroke: { color: '#06122b', width: 12 } },
  { fill: { from: '#fff36b', to: '#ffb800', angle: 90 }, stroke: { color: '#111111', width: 13 } },
  { fill: { from: '#ffffff', to: '#d7dde8', angle: 90 }, stroke: { color: '#0b0b0f', width: 12 } },
  { fill: { from: '#7cf7ff', to: '#3d6bff', angle: 90 }, stroke: { color: '#020617', width: 12 } }
];
const ACCENTS = ['#ffd400', '#3de0ff', '#7cff6b', '#ff4d6d', '#4d8bff'];

export function buildTalkEdit(words: Word[], duration: number, plan: TalkPlan, variant = 0): { layers: Layer[]; accent: string } {
  const v = Math.abs(variant);
  const hookStyle = HOOK_STYLES[v % HOOK_STYLES.length];
  const accent = plan.accent && /^#[0-9a-f]{6}$/i.test(plan.accent) ? plan.accent : ACCENTS[(v * 3 + 1) % ACCENTS.length];
  const capY = [0.6, 0.64, 0.56][v % 3];
  const layers: Layer[] = [];
  let n = 0;
  const id = (p: string) => `talk-${p}-${n++}`;
  const motion = (name: string, start: number, end: number, ls: L[]) => {
    const s = Math.max(0, Math.min(start, duration - 0.2));
    const e = Math.min(duration, Math.max(s + 0.3, end));
    layers.push({ id: id(name), type: 'motion', name, start: s, end: e, layers: ls } as unknown as Layer);
  };
  const zoom = (start: number, len: number, scale: number, ease: 'smooth' | 'punch', y = 0.4) => {
    if (start >= duration - 0.3) return;
    layers.push({ id: id('zoom'), type: 'zoom', start, end: Math.min(duration, start + len), scale, x: 0.5, y, ease } as Layer);
  };

  // 1) ACCROCHE : gros titre brillant (dégradé + contour + ombre), qui jaillit au début.
  const hookEnd = Math.min(duration, Math.max(2.6, Math.min(4.2, duration * 0.25)));
  const hook = clean(plan.hook).slice(0, 70);
  if (hook) {
    motion('Accroche', 0, hookEnd, [
      { kind: 'text', text: hook, x: 0.5, y: 0.14, size: hook.length > 34 ? 100 : 122, weight: 900, upper: true, maxWidth: 0.96, fill: hookStyle.fill, stroke: hookStyle.stroke, shadow: true,
        reveal: v % 2 ? 'scale' : 'blur', revealBy: 'word', revealAt: 0.05, revealDur: 0.45,
        scale: [k(0, 0.92), k(0.5, 1, 'spring')], opacity: [k(hookEnd - 0.35, 1, 'linear'), k(hookEnd, 0, 'in')] }
    ]);
    zoom(0, 1.1, 1.14, 'punch');
  }

  // 2) LISTE NUMÉROTÉE plein écran, qui revient à chaque « numéro N » avec le point en cours en avant.
  const listWins: [number, number][] = [];
  if (plan.list && plan.list.items.length >= 2) {
    const items = plan.list.items.slice(0, 6).map((s) => clean(s).slice(0, 34));
    const marks = plan.list.marks.slice(0, items.length);
    const gap = 0.115;
    const y0 = 0.45 - ((items.length - 1) * gap) / 2;
    marks.forEach((m, cur) => {
      const len = Math.min(2.6, Math.max(1.6, (marks[cur + 1] ?? duration) - m - 0.3));
      const ls: L[] = [{ kind: 'rect', x: 0.5, y: 0.5, w: 1300, h: 2400, color: '#05070d', opacity: [k(0, 0, 'linear'), k(0.18, 0.9)] }];
      items.forEach((it, i) => {
        const y = y0 + i * gap;
        const on = i === cur;
        const enter = cur === 0 ? 0.08 + i * 0.09 : 0.02;
        const op = on ? 1 : i < cur ? 0.55 : 0.32;
        ls.push(
          { kind: 'text', text: `${i + 1}.`, x: 0.11, y, size: 132, weight: 900, color: on ? accent : '#ffffff', opacity: [k(enter, 0, 'linear'), k(enter + 0.2, op)] },
          { kind: 'group', x: [k(enter, 0.66), k(enter + 0.45, 0.58)], y, opacity: [k(enter, 0, 'linear'), k(enter + 0.2, op)], scale: on ? [k(0.1, 0.94), k(0.55, 1.06, 'spring')] : 1, blur: on ? 0 : i > cur ? 3 : 0, children: [
            { kind: 'rect', x: 0.5, y: 0.5, w: 840, h: 150, radius: 75, color: '#ffffff', glow: on ? { color: accent, size: 34 } : undefined },
            { kind: 'text', text: it, x: 0.5, y: 0.5, size: it.length > 22 ? 50 : 60, weight: 900, upper: true, maxWidth: 0.7, color: '#0b0b0f' }
          ] }
        );
      });
      motion(`Liste ${cur + 1}`, m - 0.05, m + len, ls.map((l) => JSON.parse(JSON.stringify(l))));
      listWins.push([m - 0.05, m + len]);
      zoom(m + len, 0.8, 1.12, 'punch');
    });
  }
  const inList = (a: number, b: number) => listWins.some(([s, e]) => a < e && b > s);

  // 3) PHOTOS QUI SURGISSENT sur les mots clés (photos libres de droits trouvées par mot clé).
  plan.broll.slice(0, 8).forEach((b, i) => {
    const t = Math.max(hookEnd * 0.6, b.t);
    if (t > duration - 1 || inList(t, t + 1.9)) return;
    const side = (v + i) % 3;
    const x = side === 0 ? 0.5 : side === 1 ? 0.3 : 0.7;
    const rot = side === 0 ? -4 : side === 1 ? -9 : 9;
    const q = clean(b.query).slice(0, 55);
    if (q.length < 2) return;
    const ls: L[] = [{ kind: 'image', src: `search:${q}`, x, y: 0.34, w: side === 0 ? 600 : 470, h: side === 0 ? 450 : 470, radius: 38, stroke: { color: '#ffffff', width: 10 }, shadow: true,
      scale: [k(0, 0.35), k(0.45, 1, 'spring'), k(1.55, 1, 'linear'), k(1.85, 0.6, 'in')], rotate: [k(0, rot * 2.2), k(0.5, rot, 'smooth')], opacity: [k(0, 0, 'linear'), k(0.12, 1), k(1.65, 1, 'linear'), k(1.85, 0, 'in')], motionBlur: true }];
    if (b.label) ls.push({ kind: 'text', text: clean(b.label).slice(0, 28), x, y: 0.48, size: 50, weight: 900, upper: true, color: '#0b0b0f', fill: undefined, opacity: [k(0.25, 0, 'linear'), k(0.4, 1), k(1.6, 1, 'linear'), k(1.8, 0, 'in')], scale: [k(0.25, 0.6), k(0.6, 1, 'spring')] });
    if (b.label) ls.splice(1, 0, { kind: 'rect', x, y: 0.48, w: Math.min(620, 70 + clean(b.label).length * 30), h: 86, radius: 43, color: accent, opacity: [k(0.25, 0, 'linear'), k(0.4, 1), k(1.6, 1, 'linear'), k(1.8, 0, 'in')], scale: [k(0.25, 0.6), k(0.6, 1, 'spring')] });
    motion(`Photo ${i + 1}`, t, t + 1.9, ls);
    zoom(t, 0.6, 1.1, 'punch');
  });

  // 4) SOUS-TITRES mot à mot (2 à 3 mots, le mot prononcé s'allume), cachés pendant la liste.
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const nextGap = (words[i + 1]?.start ?? w.end + 1) - w.end;
    const len = cur.map((x) => x.word).join(' ').length;
    if (cur.length >= 3 || len > 16 || nextGap > 0.4 || /[.!?,…]$/.test(w.word)) { chunks.push(cur); cur = []; }
  });
  if (cur.length) chunks.push(cur);
  chunks.forEach((c, ci) => {
    const s = c[0].start;
    const e = Math.max(c[c.length - 1].end + 0.08, s + 0.45);
    const end = Math.min(e, chunks[ci + 1]?.[0].start ?? e);
    if (s < hookEnd * 0.15 || inList(s, end)) return;
    const text = clean(c.map((w) => w.word.replace(/[,.;:!?…]+$/, '')).join(' ')).slice(0, 60);
    if (!text) return;
    motion('Sous-titre', s - 0.02, Math.max(end, s + 0.35), [
      { kind: 'text', text, x: 0.5, y: capY, size: 84, weight: 900, upper: true, maxWidth: 0.82, color: '#ffffff', stroke: { color: '#000000', width: 9 }, shadow: true,
        reveal: 'karaoke', revealBy: 'word', times: c.map((w) => Math.max(0, Math.round((w.start - s + 0.02) * 100) / 100)) }
    ]);
  });

  // 5) ZOOMS sur les temps forts (alternés doux / punch), sans chevaucher les autres zooms.
  plan.emphasis.slice(0, 10).forEach((t, i) => {
    if (inList(t, t + 1.4) || layers.some((l) => l.type === 'zoom' && Math.abs(l.start - t) < 1.2)) return;
    zoom(t, i % 2 ? 0.7 : 1.6, i % 2 ? 1.16 : 1.08, i % 2 ? 'punch' : 'smooth');
  });

  return { layers, accent };
}
