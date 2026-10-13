import { useId } from 'react';

/**
 * Pictogramme izicut : un bouton « lecture » noir aux angles doux, tranché
 * par une coupe (le montage), avec une petite étincelle (l'IA).
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <mask id={`izm${id}`}>
          <rect width="48" height="48" fill="#fff" />
          <path d="M4 33 L40 16" stroke="#000" strokeWidth="4.5" strokeLinecap="round" />
        </mask>
      </defs>
      <path mask={`url(#izm${id})`} d="M9 10.6c0-3 3.2-4.9 5.8-3.4l23.6 13.6c2.6 1.5 2.6 5.3 0 6.8L14.8 41.2C12.2 42.7 9 40.8 9 37.8z" fill="currentColor" />
      <path d="M41 3.5c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5z" fill="currentColor" />
    </svg>
  );
}

/** Mot-symbole « izicut » : minuscules, très gras, serré, noir. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-display font-extrabold tracking-[-0.045em] ${className}`}>izicut</span>;
}
