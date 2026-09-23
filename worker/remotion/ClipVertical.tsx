/**
 * ============================================================
 * worker/remotion/ClipVertical.tsx — Composition de rendu 9:16
 * ------------------------------------------------------------
 * Auto-suffisante : n'importe QUE remotion (aucun alias '@/…').
 * Le worker la bundle isolément (@remotion/bundler) — le projet
 * Next.js n'est ni requis ni disponible dans l'image du worker.
 *
 * Entrées (inputProps) :
 *   videoSrc : URL signée courte de la source (jamais publique)
 *   words    : mots horodatés, secondes RELATIVES au clip (0 = début)
 *   style    : sous-titres (taille, couleurs, karaoke, position)
 * ============================================================
 */
import {
  AbsoluteFill,
  registerRoot,
  Composition,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from 'remotion';

export type CaptionStyle = {
  font_size?: number;
  active_color?: string;
  inactive_color?: string;
  karaoke?: boolean;
  /** Position verticale 0 (haut) → 1 (bas) du centre du bloc. */
  position?: number;
  animation?: 'fade' | 'slide' | 'pop' | 'none';
  outline_color?: string;
};

export type ClipVerticalProps = {
  videoSrc: string;
  startTime: number;
  endTime: number;
  words: { word: string; start: number; end: number }[];
  style?: CaptionStyle;
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

/**
 * Regroupe les mots en lignes courtes (fenêtre glissante centrée
 * sur le mot en cours) : le style « Hormozi » n'affiche que 3 à
 * 5 mots à la fois.
 */
function buildLines(
  words: ClipVerticalProps['words'],
  activeIndex: number
): { word: string; index: number }[][] {
  if (words.length === 0) return [];
  const window = 5;
  const start = Math.max(0, Math.min(activeIndex - 1, words.length - window));
  const slice = words.slice(start, start + window);

  const lines: { word: string; index: number }[][] = [[]];
  let chars = 0;
  slice.forEach((item, i) => {
    const current = lines[lines.length - 1];
    if (chars + item.word.length > 20 && current.length > 0) {
      lines.push([]);
      chars = 0;
    }
    lines[lines.length - 1].push({ word: item.word, index: start + i });
    chars += item.word.length + 1;
  });
  return lines;
}

export const ClipVertical: React.FC<ClipVerticalProps> = ({
  videoSrc,
  words,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Temps relatif au CLIP (0 = première image rendue).
  const time = frame / fps;
  const activeIndex = words.findIndex((w) => time >= w.start && time < w.end);

  const fontSize = style?.font_size ?? 92;
  const activeColor = style?.active_color ?? '#FFD400';
  const inactiveColor = style?.inactive_color ?? '#FFFFFF';
  const outlineColor = style?.outline_color ?? '#000000';
  const karaoke = style?.karaoke !== false;
  const position = style?.position ?? 0.8;
  const animation = style?.animation ?? 'pop';

  const lines = buildLines(words, activeIndex);

  // Respiration légère : zoom lent sur la vidéo recadrée en 9:16.
  const zoom = 1.08 + 0.02 * Math.sin(frame / (fps * 2));

  const popScale =
    animation === 'pop' && activeIndex >= 0
      ? 1 + 0.12 * Math.max(0, 1 - (time - words[activeIndex].start) / 0.12)
      : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {videoSrc ? (
        <Img
          src={videoSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
          }}
        />
      ) : null}

      {/* Sous-titres animés — bloc centré horizontalement */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${position * 100}%`,
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '0 60px',
          fontFamily:
            'Inter, "Segoe UI", "Liberation Sans", "DejaVu Sans", sans-serif',
        }}
      >
        {lines.map((line, lineIndex) => (
          <div
            key={lineIndex}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            {line.map((item) => {
              const isActive = item.index === activeIndex;
              const isPast = item.index < activeIndex;
              const color = karaoke && isActive ? activeColor : inactiveColor;
              const opacity = isPast || isActive ? 1 : 0.85;
              const scale = karaoke && isActive ? popScale : 1;
              return (
                <span
                  key={`${lineIndex}-${item.index}`}
                  style={{
                    fontSize,
                    fontWeight: 900,
                    color,
                    opacity,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center',
                    textTransform: 'uppercase',
                    WebkitTextStroke: `3px ${outlineColor}`,
                    paintOrder: 'stroke fill',
                    textShadow: '0 6px 24px rgba(0,0,0,0.55)',
                    lineHeight: 1.15,
                  }}
                >
                  {item.word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Déclaration de la composition, consommée par bundle()/renderMedia(). */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ClipVertical"
      component={ClipVertical}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={1} // surchargé par le worker selon la durée réelle
      defaultProps={{
        videoSrc: '',
        startTime: 0,
        endTime: 1,
        words: [],
        style: {},
      }}
    />
  );
};

registerRoot(RemotionRoot);
