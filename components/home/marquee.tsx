import { Sparkle } from 'lucide-react';

const ITEMS = ['TikTok', 'Reels', 'Shorts', '1080×1920', 'Sous-titres mot à mot', 'Silences coupés', 'Score viral', 'Fond flou', 'Titre d’accroche', 'Zooms dynamiques'];

/** Bandeau défilant (CSS pur, en pause au survol, figé si mouvement réduit). */
export function Marquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div aria-hidden className="group relative overflow-hidden border-b border-line py-5 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-10 group-hover:[animation-play-state:paused]">
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-10 whitespace-nowrap font-code text-sm uppercase tracking-[0.2em] text-fg-subtle">
            {item}
            <Sparkle className="h-3.5 w-3.5 text-neon/70" />
          </span>
        ))}
      </div>
    </div>
  );
}
