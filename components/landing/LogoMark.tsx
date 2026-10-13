import { useId } from 'react';

/**
 * Pictogramme izicut : un bouton « lecture » blanc tranché net par une coupe
 * bleue (la vidéo + le montage), sur un carré noir aux angles doux.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`izc${id}`} x1="10" y1="48" x2="54" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#0b0f1a" />
      <path transform="translate(1.5 0)" d="M23.5 18.2c0-2.3 2.5-3.7 4.5-2.5l19.6 12.1c1.9 1.2 1.9 4 0 5.2L28 45.1c-2 1.2-4.5-.2-4.5-2.5z" fill="#ffffff" />
      <path d="M14 41 52 23.5" stroke="#0b0f1a" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M14 41 52 23.5" stroke={`url(#izc${id})`} strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

/** Mot-symbole « izicut » (minuscules, très gras, serré) — le point du i en bleu. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.045em] text-fg ${className}`}>
      izi<span className="text-[#2563eb]">cut</span>
    </span>
  );
}
