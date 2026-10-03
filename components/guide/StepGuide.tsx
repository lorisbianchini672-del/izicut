'use client';

/**
 * Parcours guidé en 3 étapes, affiché en haut des pages clés :
 *   1. Importer → 2. L'IA trouve les moments → 3. Télécharger
 * Le client sait toujours où il en est et ce qu'il doit faire ensuite.
 */
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Importer', hint: 'Fichier ou lien YouTube' },
  { title: 'L’IA trouve les moments', hint: 'Automatique, quelques minutes' },
  { title: 'Télécharger', hint: 'Prêt pour TikTok & Reels' }
] as const;

export function StepGuide({
  current,
  detail,
  className
}: {
  /** Étape en cours (1, 2 ou 3). Les précédentes sont cochées. */
  current: 1 | 2 | 3;
  /** Ligne d'aide sous les étapes (ce qu'il faut faire maintenant). */
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4', className)}>
      <ol className="grid grid-cols-3 gap-2" aria-label="Étapes">
        {STEPS.map((step, index) => {
          const n = (index + 1) as 1 | 2 | 3;
          const done = n < current;
          const active = n === current;
          return (
            <li key={step.title} className="relative flex flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    n <= current ? 'bg-neon/60' : 'bg-white/10'
                  )}
                  style={{ marginRight: '1.1rem', width: 'calc(100% - 2.2rem)' }}
                />
              ) : null}
              <span
                className={cn(
                  'relative z-10 grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition-colors',
                  done && 'bg-neon text-ink-950',
                  active && 'bg-neon text-ink-950 shadow-[0_0_18px_rgb(200_255_61/0.6)] ring-4 ring-neon/20',
                  !done && !active && 'bg-white/10 text-fg-muted'
                )}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
              </span>
              <span className={cn('mt-2 text-xs font-semibold leading-tight sm:text-sm', active ? 'text-fg' : done ? 'text-fg-muted' : 'text-fg-subtle')}>
                {step.title}
              </span>
              <span className="mt-0.5 hidden text-[11px] text-fg-subtle sm:block">{step.hint}</span>
            </li>
          );
        })}
      </ol>
      {detail ? <div className="mt-3 border-t border-white/10 pt-3 text-center text-sm text-fg-muted">{detail}</div> : null}
    </div>
  );
}

/**
 * Temps restant estimé (en secondes) avant les premiers clips, d'après la
 * durée de la vidéo et le temps déjà écoulé. Volontairement prudent.
 */
export function estimateRemainingSeconds(durationSeconds: number | null, createdAt: string): number | null {
  const started = Date.parse(createdAt);
  if (!Number.isFinite(started)) return null;
  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : 10 * 60;
  // Téléchargement + transcription + analyse IA + montage du 1er clip.
  const total = 45 + duration * 0.12 + 75;
  const elapsed = (Date.now() - started) / 1000;
  return Math.max(0, Math.round(total - elapsed));
}

export function formatRemaining(seconds: number | null): string {
  if (seconds == null) return 'Quelques minutes';
  if (seconds <= 20) return 'Presque fini…';
  if (seconds < 90) return 'Encore moins de 2 minutes';
  return `Encore environ ${Math.round(seconds / 60)} min`;
}
