'use client';

/**
 * Pont entre la page d'accueil (composant serveur) et le bloc de
 * génération (composant client).
 *
 * Le hook `useHeroForm` utilise `useRouter` : il ne peut être appelé que
 * dans un composant client. Ce fichier est ce composant client — il ne fait
 * rien d'autre qu'appeler le hook et transmettre son objet en props. La page
 * `app/page.tsx` reste serveur et garde son référencement.
 */
import { HeroGenerator } from './HeroGenerator';
import { useHeroForm } from './use-hero-form';

export function HeroGeneratorSection() {
  return <HeroGenerator {...useHeroForm()} />;
}
