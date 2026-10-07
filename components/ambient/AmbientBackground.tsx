/**
 * Fond d'ambiance commun à toutes les pages : nappes de lumière violet /
 * indigo / ambre qui dérivent lentement, trame fine et grain. Pur CSS,
 * figé si l'utilisateur préfère réduire les animations.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="izi-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="izi-ambient-blob left-[-12%] top-[-18%] h-[60vmax] w-[60vmax] bg-[radial-gradient(closest-side,rgb(124_92_240/0.30),transparent)] [animation-duration:28s]" />
      <div className="izi-ambient-blob right-[-18%] top-[18%] h-[55vmax] w-[55vmax] bg-[radial-gradient(closest-side,rgb(169_144_255/0.16),transparent)] [animation-delay:-9s] [animation-duration:34s]" />
      <div className="izi-ambient-blob bottom-[-25%] left-[20%] h-[50vmax] w-[50vmax] bg-[radial-gradient(closest-side,rgb(255_190_118/0.12),transparent)] [animation-delay:-17s] [animation-duration:40s]" />
      {/* Arc de verre discret en coin, rappel de l'anneau de l'accueil */}
      <div className="izi-ambient-arc right-[-14vmax] top-[-14vmax] h-[42vmax] w-[42vmax]" />
      <div className="absolute inset-0 izi-grid opacity-[0.35]" />
      <div className="izi-ambient-grain absolute inset-0" />
    </div>
  );
}
