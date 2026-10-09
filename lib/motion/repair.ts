/**
 * Réparation des créations libres écrites par l'IA (Studio Motion et Montage IA) :
 * une petite faute ne casse jamais la vidéo, l'élément fautif est corrigé ou retiré.
 */
import { z } from 'zod';

import { BackdropSchema, EASES, FreeSceneSchema, GroupLayer, LeafLayer, SFX } from './types';

const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | undefined => ((list as readonly unknown[]).includes(v) ? (v as T[number]) : undefined);

/**
 * Corrige automatiquement un objet presque valide : textes et listes trop longs
 * coupés, nombres ramenés dans leurs bornes, champs facultatifs invalides retirés.
 * Renvoie null si l'objet reste inutilisable.
 */
export function coerce<T>(schema: z.ZodTypeAny, value: unknown, tries = 14): T | null {
  let v: unknown;
  try { v = JSON.parse(JSON.stringify(value)); } catch { return null; }
  for (let i = 0; i < tries; i++) {
    const r = schema.safeParse(v);
    if (r.success) return r.data as T;
    let changed = false;
    for (const iss of r.error.issues) {
      const path = iss.path as (string | number)[];
      if (!path.length) return null;
      let parent: unknown = v;
      for (const k of path.slice(0, -1)) parent = parent && typeof parent === 'object' ? (parent as Record<string | number, unknown>)[k] : undefined;
      if (!parent || typeof parent !== 'object') continue;
      const key = path[path.length - 1];
      const box = parent as Record<string | number, unknown>;
      const cur = box[key];
      const info = iss as unknown as { code: string; maximum?: number | bigint; minimum?: number | bigint };
      if (info.code === 'too_big' && typeof cur === 'string') box[key] = cur.slice(0, Number(info.maximum));
      else if (info.code === 'too_big' && typeof cur === 'number') box[key] = Number(info.maximum);
      else if (info.code === 'too_small' && typeof cur === 'number') box[key] = Number(info.minimum);
      else if (info.code === 'too_big' && Array.isArray(cur)) box[key] = cur.slice(0, Number(info.maximum));
      else if (Array.isArray(parent)) { (parent as unknown[]).splice(Number(key), 1); changed = true; break; }
      else delete box[key];
      changed = true;
    }
    if (!changed) return null;
  }
  return null;
}

/** Scène libre écrite par l'IA : chaque calque est réparé un par un, les irrécupérables sont retirés. */
const NAMED: Record<string, string> = { white: '#ffffff', blanc: '#ffffff', black: '#000000', noir: '#000000', red: '#ff3b30', rouge: '#ff3b30', blue: '#2f6bff', bleu: '#2f6bff', green: '#22c55e', vert: '#22c55e', yellow: '#ffd23d', jaune: '#ffd23d', orange: '#ff7a1a', pink: '#ff4d8d', rose: '#ff4d8d', purple: '#7c5cff', violet: '#7c5cff', gold: '#e6c375', or: '#e6c375', grey: '#8a8f98', gray: '#8a8f98', gris: '#8a8f98', cyan: '#22d3ee' };
/** Petites fautes fréquentes des IA : courbe inconnue, couleur en toutes lettres ou en #abc. */
function normalizeFree(v: unknown, key = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => normalizeFree(x, key));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'e' && !pick(EASES, x)) continue;
      o[k] = normalizeFree(x, k === 'v' ? key : k);
    }
    return o;
  }
  if (typeof v === 'string' && /^(color|color2|from|to|bg|colors)$/.test(key)) {
    const t = v.trim().toLowerCase();
    if (NAMED[t]) return NAMED[t];
    const m = t.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  }
  return v;
}

export function repairFree(raw: Record<string, unknown>): Record<string, unknown> | null {
  const sc = normalizeFree(raw) as Record<string, unknown>;
  const fixLayer = (l: unknown): unknown => {
    if (!l || typeof l !== 'object') return null;
    const o = l as Record<string, unknown>;
    if (o.kind === 'group') {
      const children = (Array.isArray(o.children) ? o.children : []).map((ch) => coerce(LeafLayer, ch)).filter(Boolean).slice(0, 24);
      if (!children.length) return null;
      return coerce(GroupLayer, { ...o, children });
    }
    if (o.kind === 'image' && typeof o.src === 'string' && /^photo\s*\d/.test(o.src)) o.src = 'photo:' + o.src.replace(/\D/g, '');
    return coerce(LeafLayer, o);
  };
  const layers = (Array.isArray(sc.layers) ? sc.layers : []).map(fixLayer).filter(Boolean).slice(0, 40);
  if (!layers.length) return null;
  if (sc.bg && typeof sc.bg === 'object' && 'kind' in (sc.bg as object)) {
    // Fond animé GPU : réparé (couleurs, réglages) ou remplacé par le fond de la pub.
    sc.bg = coerce(BackdropSchema, sc.bg) ?? 'theme';
  } else if (sc.bg !== undefined && sc.bg !== 'theme' && !coerce(z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.object({ from: z.string(), to: z.string() }).passthrough()]), sc.bg)) sc.bg = 'theme';
  if (Array.isArray(sc.cues)) sc.cues = sc.cues.filter((q) => q && typeof q === 'object' && pick(SFX, (q as Record<string, unknown>).sfx)).slice(0, 12);
  return coerce(FreeSceneSchema, { ...sc, layers });
}

