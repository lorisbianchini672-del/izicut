'use client';

import { Diamond, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { addKeyHere, asKeys, easeKey, moveKey, removeKey, setKey, type Key } from '@/lib/motion/keys';
import { keyedAt } from '@/lib/motion/render';
import type { Keyed, Layer } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

/**
 * Timeline à images clés façon After Effects pour le calque choisi :
 * une piste par propriété (position, échelle, opacité, rotation, flou),
 * losanges déplaçables à la souris, ajout d'une clé à la tête de lecture,
 * valeur et courbe d'animation de chaque clé.
 */

type Prop = 'x' | 'y' | 'scale' | 'opacity' | 'rotate' | 'blur';
const PROPS: { key: Prop; label: string; def: number; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'x', label: 'Position X', def: 0.5, min: -0.5, max: 1.5, step: 0.005, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'y', label: 'Position Y', def: 0.5, min: -0.5, max: 1.5, step: 0.005, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'scale', label: 'Échelle', def: 1, min: 0, max: 4, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'opacity', label: 'Opacité', def: 1, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
  { key: 'rotate', label: 'Rotation', def: 0, min: -360, max: 360, step: 1, fmt: (v) => `${Math.round(v)}°` },
  { key: 'blur', label: 'Flou', def: 0, min: 0, max: 60, step: 1, fmt: (v) => `${Math.round(v)} px` }
];
const EASES: [NonNullable<Key['e']>, string][] = [
  ['smooth', 'Douce'], ['linear', 'Linéaire'], ['in', 'Accélère'], ['out', 'Ralentit'], ['inOut', 'Accélère puis ralentit'],
  ['expo', 'Expo (très dynamique)'], ['back', 'Dépasse et revient'], ['spring', 'Ressort'], ['elastic', 'Élastique'], ['bounce', 'Rebond']
];

export function KeyframeTimeline({ layer, duration, lt, edit, onSeekLocal, accent }: {
  layer: Layer;
  duration: number;
  /** Temps courant dans la scène (s). */
  lt: number;
  edit: (fn: (l: Layer) => Layer | null) => void;
  onSeekLocal: (t: number) => void;
  accent: string;
}) {
  const [pick, setPick] = useState<{ prop: Prop; i: number } | null>(null);
  const drag = useRef<{ prop: Prop; i: number; el: HTMLElement; moved: boolean } | null>(null);
  const d = Math.max(0.1, duration);
  const get = (p: Prop) => (layer as Record<string, unknown>)[p] as Keyed<number> | undefined;
  const put = (p: Prop, v: Keyed<number> | undefined) => edit((l) => ({ ...l, [p]: v } as Layer));
  const tAt = (el: HTMLElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(d, ((clientX - r.left) / Math.max(1, r.width)) * d));
  };

  const picked = pick ? asKeys(get(pick.prop))?.[pick.i] : undefined;
  const pickedProp = pick ? PROPS.find((q) => q.key === pick.prop) : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Images clés</p>
        <p className="text-[11px] tabular-nums text-fg-subtle">{lt.toFixed(2)} s</p>
      </div>
      {PROPS.map((P) => {
        const k = get(P.key);
        const keys = asKeys(k) ?? [];
        const cur = keyedAt(k, lt, P.def);
        const onKey = keys.findIndex((q) => Math.abs(q.t - lt) < 0.04);
        return (
          <div key={P.key} className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              title={onKey >= 0 ? 'Supprimer la clé ici' : 'Ajouter une clé ici'}
              onClick={() => { if (onKey >= 0) { put(P.key, removeKey(k, onKey)); setPick(null); } else { put(P.key, addKeyHere(k, lt, P.def)); } }}
              className={cn('grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded', onKey >= 0 ? 'text-neon' : 'text-fg-subtle hover:text-fg')}
            >
              <Diamond className="h-3 w-3" fill={onKey >= 0 ? 'currentColor' : 'none'} />
            </button>
            <span className="w-20 shrink-0 truncate text-fg-muted">{P.label}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-fg-subtle">{P.fmt(cur)}</span>
            <div
              className="relative h-5 flex-1 cursor-pointer rounded bg-white/[0.05]"
              onPointerDown={(e) => { if (e.target === e.currentTarget) onSeekLocal(tAt(e.currentTarget, e.clientX)); }}
            >
              {keys.length > 1 ? (
                <span className="absolute top-1/2 h-px -translate-y-1/2" style={{ left: `${(keys[0].t / d) * 100}%`, width: `${((keys[keys.length - 1].t - keys[0].t) / d) * 100}%`, background: accent, opacity: 0.5 }} />
              ) : null}
              <span className="pointer-events-none absolute inset-y-0 w-px bg-white/70" style={{ left: `${(Math.min(lt, d) / d) * 100}%` }} />
              {keys.map((q, i) => (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`${P.label} : clé à ${q.t.toFixed(2)} s`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const track = e.currentTarget.parentElement as HTMLElement;
                    drag.current = { prop: P.key, i, el: track, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setPick({ prop: P.key, i });
                  }}
                  onPointerMove={(e) => {
                    const dr = drag.current;
                    if (!dr) return;
                    dr.moved = true;
                    const t = tAt(dr.el, e.clientX);
                    put(dr.prop, moveKey(get(dr.prop), dr.i, t));
                    const sorted = asKeys(moveKey(get(dr.prop), dr.i, t)) ?? [];
                    const ni = sorted.findIndex((x) => Math.abs(x.t - Math.round(t * 1000) / 1000) < 1e-6);
                    if (ni >= 0 && ni !== dr.i) { dr.i = ni; setPick({ prop: dr.prop, i: ni }); }
                  }}
                  onPointerUp={() => { const dr = drag.current; drag.current = null; if (dr) onSeekLocal((asKeys(get(dr.prop)) ?? [])[dr.i]?.t ?? lt); }}
                  className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize rounded-[2px] border', pick?.prop === P.key && pick.i === i ? 'border-white bg-white' : 'border-white/60')}
                  style={{ left: `${(Math.min(q.t, d) / d) * 100}%`, background: pick?.prop === P.key && pick.i === i ? undefined : accent }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {picked && pickedProp && pick ? (
        <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
          <label className="text-[11px] text-fg-muted">
            {pickedProp.label} à {picked.t.toFixed(2)} s · {pickedProp.fmt(picked.v)}
            <input
              type="range"
              min={pickedProp.min}
              max={pickedProp.max}
              step={pickedProp.step}
              value={picked.v}
              onChange={(e) => put(pick.prop, setKey(get(pick.prop), picked.t, Number(e.target.value), pickedProp.def))}
              className="mt-1 w-full"
            />
          </label>
          <button type="button" title="Supprimer cette clé" onClick={() => { put(pick.prop, removeKey(get(pick.prop), pick.i)); setPick(null); }} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-red-400/30 text-red-300 hover:bg-red-500/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <label className="col-span-2 text-[11px] text-fg-muted">
            Courbe pour arriver à cette clé
            <select value={picked.e ?? 'inOut'} onChange={(e) => put(pick.prop, easeKey(get(pick.prop), pick.i, e.target.value as Key['e']))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-fg">
              {EASES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-[11px] text-fg-subtle">Placez la tête de lecture, cliquez sur ◆ pour poser une clé, puis déplacez le calque dans la vidéo : la clé se met à jour. Glissez les losanges pour changer le timing.</p>
      )}
    </div>
  );
}
