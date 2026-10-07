'use client';

import { useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';

import { CAPTION_TEMPLATES, type CaptionTemplate, type FrameLayout } from '@/lib/entitlements';
import { useKaraoke } from './caption-preview';
import { PhoneFrame } from './phone-frame';
import { SectionHeading } from './section-heading';
import { Reveal, Tilt } from './motion';

const FREE_TEMPLATES: CaptionTemplate[] = ['hormozi', 'clean'];
const COLORS = [
  { value: '#c8ff3d', name: 'Citron' },
  { value: '#3de0ff', name: 'Cyan' },
  { value: '#ff3d7f', name: 'Framboise' },
  { value: '#ffd23d', name: 'Or' },
  { value: '#ffffff', name: 'Blanc' },
];

/** Section interactive : on essaie les réglages réels du rendu, en direct. */
export function CaptionStudio() {
  const [template, setTemplate] = useState<CaptionTemplate>('hormozi');
  const [color, setColor] = useState(COLORS[0].value);
  const [layout, setLayout] = useState<FrameLayout>('crop');
  const [hook, setHook] = useState(true);
  const [text, setText] = useState('');

  const lines = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 12);
    return words.length ? [words] : undefined;
  }, [text]);
  const { words, active } = useKaraoke(lines, 380);

  return (
    <section id="studio" className="relative overflow-hidden border-y border-line bg-ink-900/40 py-24 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgb(169_144_255/0.08),transparent)]" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_minmax(0,380px)] lg:px-8">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Essayez maintenant"
            title="Votre style, en direct."
            description="Ce sont les réglages réels du moteur de rendu. Changez-les : l'aperçu suit."
          />

          <Reveal delay={0.1} className="mt-10 space-y-8">
            <fieldset>
              <legend className="text-sm font-medium text-fg">Style de sous-titres</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CAPTION_TEMPLATES.map((t) => {
                  const on = t.key === template;
                  const pro = !FREE_TEMPLATES.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTemplate(t.key)}
                      aria-pressed={on}
                      className={`izi-focus cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-all ${
                        on ? 'border-neon/60 bg-neon/[0.08]' : 'border-line bg-white/[0.02] hover:-translate-y-0.5 hover:border-line-strong'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium text-fg">
                        {t.label}
                        {pro ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-code text-[10px] uppercase text-fg-muted">
                            <Lock className="h-2.5 w-2.5" aria-hidden />Pro
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-8 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-medium text-fg">Couleur du mot prononcé</legend>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {COLORS.map((c) => {
                    const on = c.value === color;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setColor(c.value)}
                        aria-pressed={on}
                        aria-label={c.name}
                        title={c.name}
                        className={`izi-focus grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:scale-110 ${on ? 'border-fg' : 'border-transparent'}`}
                        style={{ background: c.value }}
                      >
                        {on ? <Check className="h-4 w-4 text-ink-950" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium text-fg">Cadrage</legend>
                <div className="mt-3 inline-flex rounded-xl border border-line bg-white/[0.02] p-1">
                  {([['crop', 'Plein cadre'], ['blur_fit', 'Fond flou']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLayout(key)}
                      aria-pressed={layout === key}
                      className={`izi-focus cursor-pointer rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                        layout === key ? 'bg-fg text-ink-950' : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label htmlFor="izi-studio-text" className="text-sm font-medium text-fg">Votre phrase</label>
                <input
                  id="izi-studio-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={90}
                  placeholder="Tapez une phrase pour la voir sous-titrée…"
                  className="izi-focus mt-3 w-full rounded-xl border border-line bg-ink-950/70 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-neon/60 focus:outline-none"
                />
              </div>
              <label className="flex cursor-pointer select-none items-center gap-3 text-sm text-fg-muted">
                <span className="relative inline-flex">
                  <input type="checkbox" checked={hook} onChange={(e) => setHook(e.target.checked)} className="izi-focus peer sr-only" />
                  <span className="h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-neon peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neon" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-fg transition-transform peer-checked:translate-x-5 peer-checked:bg-ink-950" />
                </span>
                Titre d'accroche
              </label>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15} y={48} className="mx-auto w-full max-w-[340px]">
          <Tilt className="rounded-[2rem]" max={8}>
          <PhoneFrame
            template={template}
            words={words}
            active={active}
            color={color}
            layout={layout}
            hook={hook ? 'Le secret des 3 premières secondes' : null}
          />
          </Tilt>
          <p className="mt-4 text-center font-code text-xs text-fg-subtle" aria-live="polite">
            {CAPTION_TEMPLATES.find((t) => t.key === template)?.label} · {layout === 'crop' ? 'Plein cadre' : 'Fond flou'} · 1080×1920
          </p>
        </Reveal>
      </div>
    </section>
  );
}
