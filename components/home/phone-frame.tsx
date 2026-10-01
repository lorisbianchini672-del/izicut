import type { CaptionTemplate, FrameLayout } from '@/lib/entitlements';
import { CaptionLine } from './caption-preview';

type PhoneFrameProps = {
  template: CaptionTemplate;
  words: string[];
  active: number;
  color?: string;
  layout?: FrameLayout;
  hook?: string | null;
  progress?: boolean;
  className?: string;
};

/**
 * Aperçu 9:16 d'un clip : « plan » stylisé du locuteur, titre d'accroche,
 * sous-titres animés et barre de progression. Purement décoratif.
 */
export function PhoneFrame({
  template,
  words,
  active,
  color = '#c8ff3d',
  layout = 'crop',
  hook = 'Le secret des 3 premières secondes',
  progress = true,
  className = '',
}: PhoneFrameProps) {
  const captionAtBottom = template === 'minimal';
  return (
    <div
      className={`relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-line-strong bg-ink-900 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)] ${className}`}
      style={{ containerType: 'inline-size' }}
      role="img"
      aria-label={`Aperçu d'un clip vertical avec sous-titres : ${words.join(' ')}`}
    >
      {/* Plan : fond flou en mode blur_fit, plein cadre en mode crop */}
      <Scene layout={layout} />

      {hook ? (
        <div className="absolute inset-x-4 top-[11%] flex justify-center">
          <span className="rounded-lg bg-white px-3 py-1.5 text-center text-[clamp(8px,4.6cqw,15px)] font-extrabold leading-tight text-ink-950 shadow-lg">
            {hook}
          </span>
        </div>
      ) : null}

      <div
        className={`absolute inset-x-[7%] ${captionAtBottom ? 'bottom-[12%]' : 'top-[58%]'} text-[clamp(9px,6.4cqw,24px)]`}>
        <CaptionLine template={template} words={words} active={active} color={color} />
      </div>

      {progress ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div className="h-full w-full origin-left animate-[izi-progress_9s_linear_infinite] bg-neon" />
        </div>
      ) : null}

      {/* Zones réservées à l'interface TikTok (repère discret) */}
      <div aria-hidden className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-3 opacity-60">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-6 w-6 rounded-full bg-white/15" />
        ))}
      </div>
    </div>
  );
}

function Scene({ layout }: { layout: FrameLayout }) {
  const speaker = (
    <svg viewBox="0 0 90 160" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="izi-key" cx="30%" cy="25%" r="80%">
          <stop offset="0" stopColor="#3de0ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#05060a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="izi-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a3144" />
          <stop offset="1" stopColor="#141824" />
        </linearGradient>
      </defs>
      <rect width="90" height="160" fill="#0b0e16" />
      <rect width="90" height="160" fill="url(#izi-key)" />
      <circle cx="45" cy="62" r="17" fill="url(#izi-body)" />
      <path d="M13 160c2-34 15-52 32-52s30 18 32 52z" fill="url(#izi-body)" />
      <rect x="40" y="96" width="10" height="22" rx="4" fill="#0a0c12" />
    </svg>
  );

  if (layout === 'blur_fit') {
    return (
      <div className="absolute inset-0">
        <div className="absolute inset-0 scale-125 opacity-70 blur-xl">{speaker}</div>
        <div className="absolute inset-x-0 top-1/2 aspect-video -translate-y-1/2 overflow-hidden border-y border-white/10">
          <svg viewBox="0 0 160 90" className="h-full w-full" aria-hidden>
            <rect width="160" height="90" fill="#0b0e16" />
            <circle cx="80" cy="36" r="11" fill="#2a3144" />
            <path d="M52 90c1-20 12-32 28-32s27 12 28 32z" fill="#1d2332" />
          </svg>
        </div>
      </div>
    );
  }
  return <div className="absolute inset-0">{speaker}</div>;
}
