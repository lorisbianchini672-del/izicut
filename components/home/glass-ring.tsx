/**
 * Anneau de verre 3D (pur CSS) : dégradé conique violet → lavande → ambre,
 * reflets, lueur et rotation lente. Décor du hero, sans image ni WebGL.
 */
export function GlassRing({ className = '' }: { className?: string }) {
  const ring =
    'conic-gradient(from 210deg, #1d1650 0deg, #5b3fe0 40deg, #b7a4ff 85deg, #ffffff 100deg, #a68bff 125deg, #3a2a9c 170deg, #24195f 210deg, #7b5cff 250deg, #ffd28a 285deg, #fff1d6 298deg, #c79cff 315deg, #1d1650 360deg)';
  const shape = 'radial-gradient(circle, transparent 47%, #000 48.5%, #000 66%, transparent 67.5%)';
  const gap = 'conic-gradient(from 300deg, transparent 0deg 38deg, #000 46deg 352deg, transparent 360deg)';
  const mask = { WebkitMaskImage: `${shape}, ${gap}`, maskImage: `${shape}, ${gap}`, WebkitMaskComposite: 'source-in', maskComposite: 'intersect' } as const;
  return (
    <div aria-hidden className={`pointer-events-none select-none [perspective:1100px] ${className}`}>
      <div className="relative h-full w-full animate-[izi-ring-float_9s_ease-in-out_infinite] [transform-style:preserve-3d]">
        <div className="absolute inset-0 [transform:rotateY(-32deg)_rotateX(10deg)]">
          {/* Lueur derrière l'anneau */}
          <div className="absolute inset-[6%] rounded-full opacity-70 blur-3xl animate-[izi-ring-spin_26s_linear_infinite]" style={{ background: ring, ...mask }} />
          {/* Anneau principal */}
          <div className="absolute inset-0 rounded-full animate-[izi-ring-spin_26s_linear_infinite]" style={{ background: ring, ...mask }} />
          {/* Reflet intérieur (verre) */}
          <div
            className="absolute inset-0 rounded-full mix-blend-screen animate-[izi-ring-spin_14s_linear_infinite_reverse]"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg 60deg, rgb(255 255 255 / 0.55) 75deg, transparent 95deg 230deg, rgb(255 220 170 / 0.45) 245deg, transparent 262deg)',
              ...mask
            }}
          />
        </div>
      </div>
    </div>
  );
}
