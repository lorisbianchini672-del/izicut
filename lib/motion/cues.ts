/**
 * Minutage des scènes « démo produit » : partagé par le moteur d'image
 * (render.ts) et le moteur de son (sound.ts) pour que chaque clic, chaque
 * frappe de clavier tombe exactement sur l'image.
 */
import type { Scene, Sfx } from './types';

/** Instant du clic du curseur sur le bouton choisi. */
export function chipsClickAt(s: Extract<Scene, { type: 'chips' }>): number {
  return Math.max(1.2, Math.min(s.duration - 0.9, 1.75));
}

/** Fenêtre de frappe de la demande : début, fin, caractères par seconde. */
export function promptTiming(s: Extract<Scene, { type: 'prompt' }>): { start: number; end: number; cps: number; send: number } {
  const start = 0.3;
  const n = Math.max(1, Array.from(s.text).length);
  const avail = Math.max(0.8, s.duration - 1.25);
  const cps = Math.min(32, Math.max(11, n / avail));
  const end = start + n / cps;
  return { start, end, cps, send: Math.min(s.duration - 0.35, end + 0.35) };
}

/** Moments sonores propres à une scène (en secondes depuis son début). */
export function sceneCues(s: Scene): { at: number; kind: Sfx | 'key' }[] {
  switch (s.type) {
    case 'chips':
      return [{ at: 0.1, kind: 'pop' }, { at: chipsClickAt(s), kind: 'click' }];
    case 'prompt': {
      const pt = promptTiming(s);
      const out: { at: number; kind: 'key' | 'click' }[] = [];
      const n = Array.from(s.text).length;
      // Une frappe tous les deux caractères : naturel sans saturer.
      for (let i = 0; i < n; i += 2) out.push({ at: pt.start + i / pt.cps, kind: 'key' });
      out.push({ at: pt.send, kind: 'click' });
      return out;
    }
    case 'mockup':
      return [{ at: 0.02, kind: 'whoosh' }];
    case 'logo':
      return [{ at: 0.45, kind: 'chime' }];
    case 'free':
      return (s.cues ?? []).filter((q) => q.at < s.duration).map((q) => ({ at: q.at, kind: q.sfx }));
    default:
      return [];
  }
}
