'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Scissors, Sparkles } from 'lucide-react';

import { useKaraoke } from './caption-preview';
import { PhoneFrame } from './phone-frame';

/** Moments « détectés » : positions en % de la timeline + score. */
const MOMENTS = [
  { id: 1, start: 8, width: 11, score: 91, title: 'Le secret des 3 premières secondes' },
  { id: 2, start: 37, width: 9, score: 84, title: "L'erreur qui tue ta rétention" },
  { id: 3, start: 66, width: 13, score: 78, title: 'Ma routine de montage en 10 min' },
];

/** Forme d'onde déterministe (pas de hasard → pas d'écart serveur/client). */
const WAVE = Array.from({ length: 96 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.37) * 0.4);
  return 18 + Math.round(v * 82);
});

export function ProductPreview() {
  const reduce = useReducedMotion();
  const { words, active } = useKaraoke();
  const [selected, setSelected] = useState(0);

  // Le clip mis en avant change tout seul, sauf si l'utilisateur a cliqué.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduce) return;
    const id = window.setInterval(() => setSelected((s) => (s + 1) % MOMENTS.length), 3800);
    return () => window.clearInterval(id);
  }, [auto, reduce]);

  const moment = MOMENTS[selected];

  return (
    <div className="relative">
      {/* halo */}
      <div aria-hidden className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(60%_50%_at_50%_40%,rgb(169_144_255/0.12),transparent_70%)]" />

      <div className="overflow-hidden rounded-2xl border border-line-strong bg-ink-900/90 shadow-[0_50px_140px_-40px_rgb(0_0_0/0.95)] backdrop-blur">
        {/* Barre de fenêtre */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <p className="truncate font-code text-xs text-fg-muted">podcast_ep42.mp4 · 58:12</p>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 font-code text-[10px] uppercase tracking-wider text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse-rec rounded-full bg-rec" />
            Analyse IA
          </span>
        </div>

        <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,200px)_1fr] sm:p-5">
          {/* Aperçu 9:16 */}
          <PhoneFrame template="hormozi" words={words} active={active} hook={moment.title} className="mx-auto w-full max-w-[200px]" />

          {/* Clips suggérés */}
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 text-xs font-medium text-fg-muted">
              <Sparkles className="h-3.5 w-3.5 text-neon" aria-hidden />
              3 moments forts détectés
            </p>
            <ul className="mt-3 space-y-2">
              {MOMENTS.map((m, i) => {
                const on = i === selected;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => { setSelected(i); setAuto(false); }}
                      aria-pressed={on}
                      className={`izi-focus group flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        on ? 'border-neon/50 bg-neon/[0.07]' : 'border-line bg-white/[0.02] hover:border-line-strong hover:bg-white/[0.04]'
                      }`}
                    >
                      <Score value={m.score} on={on} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{m.title}</span>
                        <span className="font-code text-[11px] text-fg-subtle">
                          {timecode(m.start)} → {timecode(m.start + m.width)}
                        </span>
                      </span>
                      <Scissors className={`h-4 w-4 shrink-0 transition-colors ${on ? 'text-neon' : 'text-fg-subtle group-hover:text-fg-muted'}`} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Timeline */}
            <div className="mt-auto pt-5">
              <div className="relative h-16 overflow-hidden rounded-lg border border-line bg-ink-950/80">
                <div className="absolute inset-0 flex items-center gap-[2px] px-2" aria-hidden>
                  {WAVE.map((h, i) => (
                    <span key={i} className="flex-1 rounded-full bg-white/15" style={{ height: `${h}%` }} />
                  ))}
                </div>
                {MOMENTS.map((m, i) => (
                  <motion.span
                    key={m.id}
                    aria-hidden
                    className="absolute inset-y-0 rounded-md border"
                    style={{ left: `${m.start}%`, width: `${m.width}%` }}
                    animate={{
                      backgroundColor: i === selected ? 'rgba(200,255,61,0.18)' : 'rgba(61,224,255,0.07)',
                      borderColor: i === selected ? 'rgba(200,255,61,0.8)' : 'rgba(61,224,255,0.25)',
                    }}
                    transition={{ duration: 0.3 }}
                  />
                ))}
                <span aria-hidden className="absolute inset-y-0 w-px animate-scan bg-cyan shadow-[0_0_12px_#ffbe76]" />
              </div>
              <div className="mt-2 flex justify-between font-code text-[10px] text-fg-subtle" aria-hidden>
                <span>00:00</span><span>14:33</span><span>29:06</span><span>43:39</span><span>58:12</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Score({ value, on }: { value: number; on: boolean }) {
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg font-code text-sm font-semibold ${
        on ? 'bg-neon text-ink-950' : 'bg-white/[0.06] text-fg'
      }`}
      aria-label={`Score de viralité ${value} sur 100`}
    >
      {value}
    </span>
  );
}

/** % de la timeline → mm:ss sur une vidéo de 58:12. */
function timecode(percent: number) {
  const total = 58 * 60 + 12;
  const s = Math.round((percent / 100) * total);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
