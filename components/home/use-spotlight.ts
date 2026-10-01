'use client';

import { useCallback } from 'react';

/**
 * Pose --mx / --my (position du curseur) sur l'élément survolé.
 * Le CSS `.izi-card::before` s'en sert pour éclairer la bordure.
 */
export function useSpotlight<T extends HTMLElement>() {
  return useCallback((event: React.PointerEvent<T>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, []);
}
