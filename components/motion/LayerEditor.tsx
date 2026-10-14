'use client';

import { ArrowDown, ArrowUp, Copy, Film, ImageIcon, Plus, Trash2, Type } from 'lucide-react';

import { KeyframeTimeline } from './KeyframeTimeline';

import type { Keyed, Layer, MotionProject } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

/**
 * Éditeur de calques façon After Effects (version simple) : liste des calques
 * de la scène avec leur durée d'apparition, et réglages du calque choisi
 * (texte, taille, couleur, animation d'entrée, vitesse, effets, ordre).
 * Tout s'applique en direct dans l'aperçu.
 */

export type LayerSel = { scene: number; layer: number };
type Scene = MotionProject['scenes'][number];
type FreeScene = Extract<Scene, { type: 'free' }>;

const REVEALS: [string, string][] = [
  ['none', 'Aucune'], ['rise', 'Montée'], ['blur', 'Flou → net'], ['mask', 'Masque'], ['scale', 'Zoom'], ['type', 'Machine à écrire'],
  ['wave', 'Vague'], ['split', 'Séparé'], ['curve', 'Courbe'], ['karaoke', 'Karaoké']
];
const MOVES: [string, string][] = [
  ['none', 'Aucun'], ['fade', 'Fondu'], ['zoom', 'Zoom'], ['pop', 'Rebond'], ['left', 'Glissé de la gauche'], ['right', 'Glissé de la droite'], ['up', 'Montée'], ['spin', 'Rotation']
];
const SPEEDS: [number, string][] = [[1.4, 'Lente'], [0.8, 'Normale'], [0.45, 'Rapide']];

const base = (k: Keyed<number> | undefined, def: number) => (k === undefined ? def : typeof k === 'number' ? k : k[k.length - 1].v);
const first = (k: Keyed<string> | undefined, def: string) => (k === undefined ? def : typeof k === 'string' ? k : k[0].v);

function labelOf(L: Layer): string {
  if (L.kind === 'text') return L.text.replace(/\*/g, '').slice(0, 26);
  if (L.kind === 'image' && L.src.startsWith('video:')) return `Vidéo ${Number(L.src.slice(6)) + 1}`;
  if (L.kind === 'image' && L.src.startsWith('photo:')) return `Photo ${Number(L.src.slice(6)) + 1}`;
  return ({ rect: 'Forme', ellipse: 'Cercle', path: 'Tracé', image: 'Image', callout: 'Annotation', gallery: 'Galerie', list: 'Liste', particles: 'Particules', glow: 'Lumière', flow: 'Fond lumineux', group: 'Groupe' } as Record<string, string>)[L.kind] ?? L.kind;
}

/** Mouvement d'entrée prêt à l'emploi : images clés posées à partir de l'apparition du calque. */
function applyMove(L: Layer, move: string, dur: number): Layer {
  const t0 = L.from ?? 0;
  const x = base(L.x, 0.5), y = base(L.y, 0.5), sc = base(L.scale, 1), rot = base(L.rotate, 0);
  const next: Layer = { ...L, opacity: undefined, scale: sc === 1 ? undefined : sc, x, y, rotate: rot || undefined } as Layer;
  const k = (a: number, b: number, e: 'smooth' | 'spring' | 'expo' = 'smooth') => [{ t: t0, v: a }, { t: t0 + dur, v: b, e }];
  switch (move) {
    case 'fade': return { ...next, opacity: k(0, 1) } as Layer;
    case 'zoom': return { ...next, opacity: k(0, 1), scale: k(sc * 0.6, sc, 'expo') } as Layer;
    case 'pop': return { ...next, opacity: [{ t: t0, v: 0 }, { t: t0 + dur * 0.4, v: 1 }], scale: k(sc * 0.3, sc, 'spring') } as Layer;
    case 'left': return { ...next, opacity: k(0, 1), x: k(x - 0.45, x, 'expo'), motionBlur: true } as Layer;
    case 'right': return { ...next, opacity: k(0, 1), x: k(x + 0.45, x, 'expo'), motionBlur: true } as Layer;
    case 'up': return { ...next, opacity: k(0, 1), y: k(y + 0.08, y, 'expo') } as Layer;
    case 'spin': return { ...next, opacity: k(0, 1), rotate: k(rot - 90, rot, 'spring'), scale: k(sc * 0.5, sc, 'spring') } as Layer;
    default: return next;
  }
}

export function LayerEditor({ project, sel, onSelect, onChange, onSeek, sceneStart, accent, time = 0, videos = 0, photos = 0 }: {
  project: MotionProject;
  /** Temps global de lecture (s), pour la timeline d'images clés. */
  time?: number;
  /** Nombre de vidéos / photos importées utilisables comme calques. */
  videos?: number;
  photos?: number;
  sel: LayerSel | null;
  onSelect: (s: LayerSel | null) => void;
  onChange: (fn: (p: MotionProject) => MotionProject) => void;
  onSeek: (t: number) => void;
  sceneStart: number;
  accent: string;
}) {
  const si = sel?.scene ?? -1;
  const scene = project.scenes[si] as Scene | undefined;
  if (!sel || !scene || scene.type !== 'free') return null;
  const free = scene as FreeScene;
  const L = free.layers[sel.layer];
  const d = free.duration;

  const edit = (fn: (l: Layer) => Layer | null) =>
    onChange((p) => {
      const scenes = p.scenes.slice();
      const s = scenes[si];
      if (!s || s.type !== 'free') return p;
      const layers = s.layers.slice();
      const cur = layers[sel.layer];
      if (!cur) return p;
      const out = fn(cur);
      if (out) layers[sel.layer] = out; else layers.splice(sel.layer, 1);
      scenes[si] = { ...s, layers };
      return { ...p, scenes };
    });
  const reorder = (dir: 1 | -1) => {
    const j = sel.layer + dir;
    if (j < 0 || j >= free.layers.length) return;
    onChange((p) => {
      const scenes = p.scenes.slice();
      const s = scenes[si] as FreeScene;
      const layers = s.layers.slice();
      [layers[sel.layer], layers[j]] = [layers[j], layers[sel.layer]];
      scenes[si] = { ...s, layers };
      return { ...p, scenes };
    });
    onSelect({ scene: si, layer: j });
  };
  const addLayer = (l: Layer) => {
    onChange((p) => {
      const scenes = p.scenes.slice();
      const s = scenes[si] as FreeScene;
      scenes[si] = { ...s, layers: [...s.layers, l] };
      return { ...p, scenes };
    });
    onSelect({ scene: si, layer: free.layers.length });
  };

  return (
    <div className="mt-3 w-full max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      {/* Calques de la scène (timeline simplifiée) */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Calques · scène {si + 1}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => addLayer({ kind: 'text', text: 'Nouveau texte', x: 0.5, y: 0.5, size: 80, weight: 800, color: '#ffffff', reveal: 'rise', revealBy: 'word', revealAt: 0.1 } as Layer)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
            <Plus className="h-3.5 w-3.5" /> Texte
          </button>
          {videos > 0 ? (
            <button type="button" title="Ajouter votre vidéo comme calque" onClick={() => addLayer({ kind: 'image', src: `video:${Math.min(videos - 1, free.layers.filter((l) => l.kind === 'image' && l.src.startsWith('video:')).length)}`, x: 0.5, y: 0.5, w: 760, radius: 36, shadow: true, reveal: 'iris', revealAt: 0.05, from: 0 } as Layer)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
              <Film className="h-3.5 w-3.5" /> Vidéo
            </button>
          ) : null}
          {photos > 0 ? (
            <button type="button" title="Ajouter une de vos photos comme calque" onClick={() => addLayer({ kind: 'image', src: `photo:${free.layers.filter((l) => l.kind === 'image' && l.src.startsWith('photo:')).length % photos}`, x: 0.5, y: 0.5, w: 700, radius: 32, shadow: true, reveal: 'rise', revealAt: 0.05 } as Layer)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg">
              <ImageIcon className="h-3.5 w-3.5" /> Photo
            </button>
          ) : null}
          <button type="button" onClick={() => onSelect(null)} className="cursor-pointer rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg">Fermer</button>
        </div>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {free.layers.map((l, i) => {
          const a = l.from ?? 0, b = l.to ?? d;
          return (
            <button key={i} type="button" onClick={() => { onSelect({ scene: si, layer: i }); onSeek(sceneStart + Math.min(d - 0.05, a + 0.6)); }} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-xs', i === sel.layer ? 'bg-neon/15 text-fg' : 'text-fg-muted hover:bg-white/[0.04]')}>
              <span className="w-28 shrink-0 truncate">{labelOf(l)}</span>
              <span className="relative h-2 flex-1 rounded-full bg-white/[0.06]">
                <span className="absolute inset-y-0 rounded-full" style={{ left: `${(a / d) * 100}%`, width: `${Math.max(3, ((b - a) / d) * 100)}%`, background: i === sel.layer ? accent : 'rgba(255,255,255,.28)' }} />
              </span>
            </button>
          );
        })}
      </div>

      {L ? (
        <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
          {L.kind === 'text' ? (
            <>
              <label className="block text-xs text-fg-muted">
                <span className="mb-1 flex items-center gap-1"><Type className="h-3.5 w-3.5" /> Texte <span className="text-fg-subtle">(mettez un mot entre *étoiles* pour le colorer)</span></span>
                <textarea id="layer-text" rows={2} maxLength={120} value={L.text} onChange={(e) => { const v = e.target.value; if (v.trim()) edit((l) => ({ ...l, text: v.slice(0, 120) } as Layer)); }} className="w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-sm text-fg outline-none focus:border-neon/50" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-fg-muted">Taille · {Math.round(L.size ?? 80)}
                  <input id="layer-size" type="range" min={20} max={260} value={L.size ?? 80} onChange={(e) => edit((l) => ({ ...l, size: Number(e.target.value) } as Layer))} className="mt-1 w-full" />
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-muted">Couleur
                  <input id="layer-color" type="color" value={first(L.color, '#ffffff')} onChange={(e) => edit((l) => ({ ...l, color: e.target.value, fill: undefined } as Layer))} className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent" />
                  <select id="layer-weight" value={L.weight ?? 800} onChange={(e) => edit((l) => ({ ...l, weight: Number(e.target.value) } as Layer))} className="rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-xs text-fg">
                    <option value={400}>Normal</option><option value={600}>Semi-gras</option><option value={800}>Gras</option><option value={900}>Très gras</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-fg-muted">Animation du texte
                  <select id="layer-reveal" value={L.reveal ?? 'none'} onChange={(e) => edit((l) => ({ ...l, reveal: e.target.value as never, revealAt: (l.from ?? 0) + 0.05 } as Layer))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5 text-xs text-fg">
                    {REVEALS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </label>
                <label className="text-xs text-fg-muted">Découpage
                  <select id="layer-by" value={L.revealBy ?? 'word'} onChange={(e) => edit((l) => ({ ...l, revealBy: e.target.value as never } as Layer))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5 text-xs text-fg">
                    <option value="char">Lettre par lettre</option><option value="word">Mot par mot</option><option value="line">Ligne par ligne</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                Vitesse :
                {SPEEDS.map(([v, t]) => (
                  <button key={t} type="button" onClick={() => edit((l) => ({ ...l, revealDur: v } as Layer))} className={cn('cursor-pointer rounded-full border px-2.5 py-1', Math.abs(((L as { revealDur?: number }).revealDur ?? 0.8) - v) < 0.01 ? 'border-neon text-neon' : 'border-white/10')}>{t}</button>
                ))}
              </div>
            </>
          ) : null}

          {L.kind === 'image' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-fg-muted">Largeur · {Math.round(base(L.w, 600))}
                <input id="layer-w" type="range" min={120} max={1600} value={base(L.w, 600)} onChange={(e) => edit((l) => ({ ...l, w: Number(e.target.value), h: undefined } as Layer))} className="mt-1 w-full" />
              </label>
              <label className="text-xs text-fg-muted">Coins arrondis · {Math.round(L.radius ?? 0)}
                <input id="layer-radius" type="range" min={0} max={300} value={L.radius ?? 0} onChange={(e) => edit((l) => ({ ...l, radius: Number(e.target.value) || undefined } as Layer))} className="mt-1 w-full" />
              </label>
              {L.src.startsWith('video:') ? (
                <label className="col-span-2 text-xs text-fg-muted">Départ dans votre clip · {(L.vfrom ?? 0).toFixed(1)} s
                  <input id="layer-vfrom" type="range" min={0} max={120} step={0.1} value={L.vfrom ?? 0} onChange={(e) => edit((l) => ({ ...l, vfrom: Number(e.target.value) || undefined } as Layer))} className="mt-1 w-full" />
                </label>
              ) : null}
            </div>
          ) : null}

          <label className="block text-xs text-fg-muted">Mouvement d’entrée
            <select id="layer-move" defaultValue="" onChange={(e) => { const m = e.target.value; if (m) edit((l) => applyMove(l, m, 0.7)); e.target.value = ''; }} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-1.5 py-1.5 text-xs text-fg">
              <option value="">Choisir un mouvement…</option>
              {MOVES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {([
              ['Halo', Boolean(L.glow), () => edit((l) => ({ ...l, glow: l.glow ? undefined : { color: accent, size: 40 }, shadow: undefined } as Layer))],
              ['Ombre', Boolean(L.shadow), () => edit((l) => ({ ...l, shadow: l.shadow ? undefined : true, glow: undefined } as Layer))],
              ...(L.kind === 'text' ? [['Contour', Boolean(L.stroke), () => edit((l) => ({ ...l, stroke: (l as { stroke?: unknown }).stroke ? undefined : { color: accent, width: 3 } } as Layer))] as [string, boolean, () => void]] : []),
              ['Flou de mouvement', Boolean(L.motionBlur), () => edit((l) => ({ ...l, motionBlur: l.motionBlur ? undefined : true } as Layer))]
            ] as [string, boolean, () => void][]).map(([t, on, fn]) => (
              <button key={t} type="button" onClick={fn} className={cn('cursor-pointer rounded-full border px-2.5 py-1 text-xs transition', on ? 'border-neon text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>{t}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-fg-muted">Apparaît à {(L.from ?? 0).toFixed(1)} s
              <input id="layer-from" type="range" min={0} max={d} step={0.1} value={L.from ?? 0} onChange={(e) => { const v = Number(e.target.value); edit((l) => ({ ...l, from: v || undefined, ...(l.to !== undefined && l.to <= v ? { to: undefined } : {}) } as Layer)); }} className="mt-1 w-full" />
            </label>
            <label className="text-xs text-fg-muted">Disparaît à {(L.to ?? d).toFixed(1)} s
              <input id="layer-to" type="range" min={0} max={d} step={0.1} value={L.to ?? d} onChange={(e) => { const v = Number(e.target.value); edit((l) => ({ ...l, to: v >= d - 0.05 ? undefined : Math.max((l.from ?? 0) + 0.2, v) } as Layer)); }} className="mt-1 w-full" />
            </label>
          </div>

          <div className="border-t border-white/10 pt-3">
            <KeyframeTimeline layer={L} duration={d} lt={Math.max(0, Math.min(d, time - sceneStart))} edit={edit} onSeekLocal={(t) => onSeek(sceneStart + Math.min(d - 0.01, t))} accent={accent} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => addLayer(JSON.parse(JSON.stringify({ ...L, x: base(L.x, 0.5) + 0.03, y: base(L.y, 0.5) + 0.03 })) as Layer)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg"><Copy className="h-3.5 w-3.5" /> Dupliquer</button>
            <button type="button" onClick={() => reorder(1)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg"><ArrowUp className="h-3.5 w-3.5" /> Premier plan</button>
            <button type="button" onClick={() => reorder(-1)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:text-fg"><ArrowDown className="h-3.5 w-3.5" /> Arrière-plan</button>
            <button type="button" onClick={() => { edit(() => null); onSelect(null); }} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-red-400/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          </div>
          <p className="text-[11px] text-fg-subtle">Astuce : faites glisser le calque directement dans la vidéo pour le déplacer.</p>
        </div>
      ) : null}
    </div>
  );
}
