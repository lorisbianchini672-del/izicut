import type { Keyed } from './types';
import { keyedAt } from './render';

/** Outils d'images clés (façon After Effects) pour l'éditeur de calques. */
export type Key = { t: number; v: number; e?: 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'elastic' | 'bounce' | 'expo' | 'smooth' | 'spring' };

export const asKeys = (k: Keyed<number> | undefined): Key[] | null => (Array.isArray(k) ? (k as Key[]) : null);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Pose (ou remplace) une image clé à l'instant t avec la valeur v. */
export function setKey(k: Keyed<number> | undefined, t: number, v: number, def: number): Keyed<number> {
  const t3 = Math.max(0, Math.min(15, r3(t)));
  const keys = asKeys(k);
  if (!keys) {
    const cur = k === undefined ? def : (k as number);
    if (Math.abs(t3) < 0.02) return [{ t: 0, v: r3(v) }];
    return [{ t: 0, v: r3(cur) }, { t: t3, v: r3(v), e: 'smooth' }];
  }
  const i = keys.findIndex((q) => Math.abs(q.t - t3) < 0.04);
  const next = keys.slice();
  if (i >= 0) next[i] = { ...next[i], v: r3(v) };
  else next.push({ t: t3, v: r3(v), e: 'smooth' });
  return next.sort((a, b) => a.t - b.t).slice(0, 12);
}

/** Ajoute une image clé à l'instant t avec la valeur actuelle (sans rien changer visuellement). */
export function addKeyHere(k: Keyed<number> | undefined, t: number, def: number): Keyed<number> {
  return setKey(k, t, keyedAt(k, t, def), def);
}

/** Déplace / supprime / modifie la courbe d'une image clé. */
export function moveKey(k: Keyed<number> | undefined, i: number, t: number): Keyed<number> | undefined {
  const keys = asKeys(k);
  if (!keys || !keys[i]) return k;
  const next = keys.slice();
  next[i] = { ...next[i], t: Math.max(0, Math.min(15, r3(t))) };
  return next.sort((a, b) => a.t - b.t);
}
export function removeKey(k: Keyed<number> | undefined, i: number): Keyed<number> | undefined {
  const keys = asKeys(k);
  if (!keys) return k;
  const next = keys.filter((_, j) => j !== i);
  if (!next.length) return undefined;
  return next.length === 1 ? next[0].v : next;
}
export function easeKey(k: Keyed<number> | undefined, i: number, e: Key['e']): Keyed<number> | undefined {
  const keys = asKeys(k);
  if (!keys || !keys[i]) return k;
  const next = keys.slice();
  next[i] = { ...next[i], e };
  return next;
}

/**
 * Déplacement à la souris d'une propriété : si elle est animée, on modifie
 * (ou crée) l'image clé à l'instant courant, comme dans After Effects ;
 * sinon on décale simplement la valeur.
 */
export function nudge(k: Keyed<number> | undefined, t: number, dlt: number, def: number): Keyed<number> {
  const keys = asKeys(k);
  if (!keys) return (k === undefined ? def : (k as number)) + dlt;
  return setKey(k, t, keyedAt(k, t, def) + dlt, def);
}
