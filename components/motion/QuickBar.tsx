'use client';

import { BACKDROP_LABELS, type BackdropKind } from '@/lib/motion/gl-bg';
import type { MotionProject } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

/**
 * Retouches express, juste sous la vidéo : ambiance, fond, couleurs.
 * Tout s'applique instantanément dans l'aperçu, sans passer par l'IA.
 */

type Theme = MotionProject['theme'];

export const AMBIANCES: { name: string; theme: Theme }[] = [
  { name: 'Zensu Ambre', theme: { background: '#030303', primary: '#f59e0b', accent: '#fdba74', text: '#ffffff', style: 'clean', anim: 'blur', backdrop: { kind: 'glow', colors: ['#030303', '#3a1a05', '#f59e0b', '#fdba74'], speed: 1.2, intensity: 1.05 } } },
  { name: 'Refined Blue', theme: { background: '#000212', primary: '#3b82f6', accent: '#7dd3fc', text: '#ffffff', style: 'clean', anim: 'blur', backdrop: { kind: 'silk', colors: ['#000212', '#0f172a', '#3b82f6', '#7dd3fc'], speed: 1.1, intensity: 1 } } },
  { name: 'Néon', theme: { background: '#0b0920', primary: '#a990ff', accent: '#ffbe76', text: '#ffffff', style: 'neon', anim: 'blur', backdrop: { kind: 'aurora', colors: ['#0b0920', '#2a1b6b', '#a990ff', '#ffbe76'], speed: 1.2, intensity: 1.05 } } },
  { name: 'Sunset', theme: { background: '#1a0b16', primary: '#ff5c8a', accent: '#ffb547', text: '#ffffff', style: 'bold', anim: 'blur', backdrop: { kind: 'mesh', colors: ['#1a0b16', '#5c1236', '#ff5c8a', '#ffb547'], speed: 1.2, intensity: 1 } } },
  { name: 'Luxe', theme: { background: '#0e0d0b', primary: '#e6c375', accent: '#f5e6c4', text: '#fdf8ef', style: 'clean', anim: 'blur', backdrop: { kind: 'liquid', colors: ['#0e0d0b', '#3a2f1a', '#e6c375', '#f5e6c4'], speed: 0.9, intensity: 1 } } },
  { name: 'Clair', theme: { background: '#f4f5f9', primary: '#5b5bf6', accent: '#ff4d8d', text: '#101225', style: 'clean', anim: 'blur', backdrop: { kind: 'paper', colors: ['#f4f5f9', '#e3e5ee', '#5b5bf6', '#ff4d8d'], speed: 1, intensity: 1 } } }
];

const QUICK_BACKDROPS: BackdropKind[] = ['glow', 'silk', 'aurora', 'mesh', 'liquid', 'nebula', 'bokeh', 'paper'];

/** Les scènes libres reprennent le fond de la pub (sinon un fond figé par scène masquerait le changement). */
function withThemeBg(p: MotionProject, theme: Theme): MotionProject {
  return { ...p, theme, scenes: p.scenes.map((s) => (s.type === 'free' && s.bg !== 'theme' ? { ...s, bg: 'theme' as const } : s)) };
}

function backdropColors(t: Theme): string[] {
  return t.backdrop?.colors?.length ? [...t.backdrop.colors, t.primary, t.accent, t.accent].slice(0, 4) : [t.background, t.background, t.primary, t.accent];
}

export function QuickBar({ project, onChange }: { project: MotionProject; onChange: (fn: (p: MotionProject) => MotionProject) => void }) {
  const t = project.theme;
  const setColor = (key: 'primary' | 'text', value: string) =>
    onChange((p) => {
      const th = p.theme;
      const cols = backdropColors(th);
      if (key === 'primary') cols[2] = value;
      return { ...p, theme: { ...th, [key]: value, ...(th.backdrop && key === 'primary' ? { backdrop: { ...th.backdrop, colors: cols } } : {}) } };
    });

  return (
    <div className="mt-3 w-full max-w-2xl space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Ambiance</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {AMBIANCES.map((a) => {
            const active = t.backdrop?.kind === a.theme.backdrop?.kind && t.primary === a.theme.primary;
            return (
              <button key={a.name} type="button" onClick={() => onChange((p) => withThemeBg(p, { ...p.theme, ...a.theme }))} className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition', active ? 'border-neon text-neon' : 'border-white/10 text-fg-muted hover:border-neon/40 hover:text-fg')}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${a.theme.background}, ${a.theme.primary})` }} />
                {a.name}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Fond animé</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {QUICK_BACKDROPS.map((k) => (
            <button key={k} type="button" onClick={() => onChange((p) => withThemeBg(p, { ...p.theme, backdrop: { ...(p.theme.backdrop ?? {}), kind: k, glsl: undefined, colors: backdropColors(p.theme) } }))} className={cn('shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-xs transition', t.backdrop?.kind === k ? 'border-neon text-neon' : 'border-white/10 text-fg-muted hover:border-neon/40 hover:text-fg')}>
              {BACKDROP_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {([['primary', 'Couleur principale'], ['text', 'Texte']] as const).map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
            <input type="color" value={t[key]} onChange={(e) => setColor(key, e.target.value)} className="h-7 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent" />
            {label}
          </label>
        ))}
        <span className="text-[11px] text-fg-subtle">Tout s’applique en direct dans la vidéo.</span>
      </div>
    </div>
  );
}
