import { Aurora } from './Aurora';

/**
 * Fond d'ambiance commun à toutes les pages : soie de lumière en WebGL
 * (voiles violets, reflets nacrés et ambrés qui se plient lentement), grain
 * fin par-dessus. Repli automatique en Canvas 2D, figé si l'utilisateur
 * préfère réduire les animations.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="izi-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Aurora />
      <div className="izi-ambient-grain absolute inset-0" />
    </div>
  );
}
