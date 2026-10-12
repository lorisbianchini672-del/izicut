'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/** Pages publiques en thème clair ; outils de montage (Studio, éditeurs, tableau de bord) en sombre. */
export const LIGHT_SCRIPT = `(function(){try{var p=location.pathname;if(/^\\/($|login|cgu|confidentialite|mentions-legales|reset-password|guide-9-16|blog|docs)/.test(p))document.documentElement.classList.add('izi-light');}catch(e){}})();`;
const LIGHT = /^\/($|login|cgu|confidentialite|mentions-legales|reset-password|guide-9-16|blog|docs)/;

export function ThemeByRoute() {
  const path = usePathname() ?? '/';
  useEffect(() => {
    document.documentElement.classList.toggle('izi-light', LIGHT.test(path));
  }, [path]);
  return null;
}
