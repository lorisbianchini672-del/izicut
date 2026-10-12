import { useId } from 'react';

/**
 * Pictogramme IziCut : un bouton « lecture » coupé net en deux — la vidéo
 * (lecture) et le montage (la coupe), sur un dégradé ambre → orange.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`izg${id}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC23D" />
          <stop offset="1" stopColor="#FF5A2E" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#izg${id})`} />
      <path transform="translate(1.5 0)" d="M23.5 18.2c0-2.3 2.5-3.7 4.5-2.5l19.6 12.1c1.9 1.2 1.9 4 0 5.2L28 45.1c-2 1.2-4.5-.2-4.5-2.5z" fill="#0B0B0F" />
      <path d="M15 40.5 51 24" stroke={`url(#izg${id})`} strokeWidth="4.2" strokeLinecap="round" />
    </svg>
  );
}
