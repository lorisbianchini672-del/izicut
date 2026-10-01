/**
 * ============================================================
 * worker/remotion/ClipVertical.tsx — Composition de rendu 9:16
 * ------------------------------------------------------------
 * Auto-suffisante : n'importe QUE remotion (aucun alias '@/…').
 * Le worker la bundle isolément (@remotion/bundler) — le projet
 * Next.js n'est ni requis ni disponible dans l'image du worker.
 *
 * Entrées (inputProps) — préparées par worker/pipeline.js :
 *   videoSrc  : fichier du dossier public du bundle (« clip.mp4 »,
 *               déjà découpé, silences retirés, son traité par
 *               ffmpeg) ou URL absolue ;
 *   words     : mots horodatés, secondes RELATIVES au clip rendu ;
 *   style     : réglages DÉJÀ rabotés selon l'offre (entitlements) ;
 *   zoomTimes : instants des zooms dynamiques (vide = aucun) ;
 *   hookTitle : titre d'accroche des 3 premières secondes (vide = aucun) ;
 *   signature : filigrane Free ou signature Agency (vide = aucune).
 *
 * Les champs de `style` suivent `RenderSettings` (lib/entitlements.ts) :
 * dupliqués ici volontairement, ce fichier ne pouvant rien importer du
 * projet Next.js. Les deux définitions doivent rester alignées.
 * ============================================================
 */
import {
  AbsoluteFill,
  Composition,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Word = { word: string; start: number; end: number };

export type CaptionTemplate = 'hormozi' | 'clean' | 'karaoke_box' | 'neon' | 'bold_pop' | 'minimal';

export type ClipStyle = {
  template?: CaptionTemplate;
  active_color?: string;
  text_color?: string;
  font_size?: number;
  position?: number;
  uppercase?: boolean;
  layout?: 'crop' | 'blur_fit';
  focus_x?: number;
  auto_zoom?: boolean;
  progress_bar?: boolean;
};

export type ClipVerticalProps = {
  videoSrc: string;
  words: Word[];
  style?: ClipStyle;
  zoomTimes?: number[];
  hookTitle?: string;
  signature?: string;
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FONT_STACK = 'Montserrat, Inter, "Segoe UI", "Liberation Sans", "DejaVu Sans", sans-serif';
const SENTENCE_END = /[.!?…]["»”)]*$/;

// ---------- Pagination des sous-titres ----------

type PageWord = Word & { index: number };
type Page = { words: PageWord[]; start: number; end: number };

type TemplateSpec = {
  maxWords: number;
  maxChars: number;
  sizeFactor: number;
  weight: number;
  stroke: boolean;
  popAmount: number;
};

const TEMPLATE_SPECS: Record<CaptionTemplate, TemplateSpec> = {
  hormozi: { maxWords: 3, maxChars: 18, sizeFactor: 1, weight: 900, stroke: true, popAmount: 0.14 },
  clean: { maxWords: 6, maxChars: 30, sizeFactor: 0.8, weight: 700, stroke: false, popAmount: 0 },
  karaoke_box: { maxWords: 4, maxChars: 22, sizeFactor: 0.95, weight: 900, stroke: false, popAmount: 0.06 },
  neon: { maxWords: 3, maxChars: 18, sizeFactor: 1, weight: 800, stroke: false, popAmount: 0.1 },
  bold_pop: { maxWords: 1, maxChars: 14, sizeFactor: 1.55, weight: 900, stroke: true, popAmount: 0.25 },
  minimal: { maxWords: 7, maxChars: 34, sizeFactor: 0.6, weight: 600, stroke: false, popAmount: 0 },
};

/**
 * Pages de sous-titres stables (et non une fenêtre glissante qui fait
 * « sauter » le texte à chaque mot) : nouvelle page à chaque fin de
 * phrase, pause > 0,6 s, ou dépassement de la longueur du gabarit.
 */
function buildPages(words: Word[], spec: TemplateSpec): Page[] {
  const pages: Page[] = [];
  let current: PageWord[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
    current = [];
    chars = 0;
  };

  words.forEach((w, index) => {
    const text = w.word.trim();
    if (!text) return;
    const prev = current[current.length - 1];
    const breakBefore =
      prev !== undefined &&
      (current.length >= spec.maxWords ||
        chars + text.length > spec.maxChars ||
        w.start - prev.end > 0.6 ||
        SENTENCE_END.test(prev.word.trim()));
    if (breakBefore) flush();
    current.push({ word: text, start: w.start, end: w.end, index });
    chars += text.length + 1;
  });
  flush();
  return pages;
}

/** Texte noir ou blanc selon la luminance du fond (bloc Karaoké). */
function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0A0A0A' : '#FFFFFF';
}

/** Intensité 0 → 1 d'un « punch-in » déclenché à chaque instant de zoomTimes. */
function punchIntensity(time: number, zoomTimes: number[]): number {
  let best = 0;
  for (const t0 of zoomTimes) {
    const dt = time - t0;
    if (dt < 0 || dt > 1.6) continue;
    const a = dt < 0.15 ? dt / 0.15 : Math.max(0, 1 - (dt - 0.15) / 1.45);
    best = Math.max(best, a);
  }
  // Ease-out : attaque franche, relâchement doux.
  return 1 - (1 - best) * (1 - best);
}

// ---------- Composition ----------

export const ClipVertical: React.FC<ClipVerticalProps> = ({
  videoSrc,
  words,
  style,
  zoomTimes = [],
  hookTitle = '',
  signature = '',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;
  const totalSeconds = durationInFrames / fps;

  const template: CaptionTemplate = style?.template ?? 'hormozi';
  const spec = TEMPLATE_SPECS[template] ?? TEMPLATE_SPECS.hormozi;
  const activeColor = style?.active_color ?? '#FFD400';
  const textColor = style?.text_color ?? '#FFFFFF';
  const fontSize = Math.round((style?.font_size ?? 84) * spec.sizeFactor);
  const position = style?.position ?? 0.72;
  const uppercase = style?.uppercase !== false && template !== 'minimal';
  const layout = style?.layout ?? 'crop';
  const focusX = Math.min(1, Math.max(0, style?.focus_x ?? 0.5));

  const src = /^https?:\/\//.test(videoSrc) ? videoSrc : videoSrc ? staticFile(videoSrc) : '';

  // Zoom : très léger de base (évite les bords noirs du recadrage),
  // plus un punch-in de +10 % aux moments forts (offres payantes).
  const zoom = 1.02 + (style?.auto_zoom ? 0.1 * punchIntensity(time, zoomTimes) : 0);

  // Page active : la dernière commencée, tant que la pause n'est pas longue.
  const pages = buildPages(words, spec);
  let page: Page | null = null;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].start > time) break;
    const next = pages[i + 1];
    const visibleUntil = Math.min(pages[i].end + 0.5, next ? next.start : Number.POSITIVE_INFINITY);
    page = time < visibleUntil ? pages[i] : null;
  }
  const activeIndex = page ? page.words.findIndex((w) => time >= w.start && time < w.end) : -1;
  const pageAge = page ? time - page.start : 0;
  const pageScale = interpolate(pageAge, [0, 0.12], [0.86, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Titre d'accroche : entrée ressort, sortie en fondu à ~3 s.
  const hookIn = spring({ frame, fps, config: { damping: 13, stiffness: 140 } });
  const hookOut = interpolate(time, [2.8, 3.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', fontFamily: FONT_STACK }}>
      {src ? (
        layout === 'blur_fit' ? (
          <>
            {/* Fond : la même vidéo, floutée et assombrie, plein cadre. */}
            <AbsoluteFill style={{ transform: 'scale(1.2)' }}>
              <OffthreadVideo
                src={src}
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'blur(48px) brightness(0.55) saturate(1.2)',
                }}
              />
            </AbsoluteFill>
            {/* Premier plan : la vidéo entière, rien n'est coupé. */}
            <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
              <OffthreadVideo
                src={src}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </AbsoluteFill>
          </>
        ) : (
          <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${focusX * 100}% 45%` }}>
            <OffthreadVideo
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${focusX * 100}% 50%`,
              }}
            />
          </AbsoluteFill>
        )
      ) : null}

      {/* Barre de progression : incite à regarder jusqu'au bout. */}
      {style?.progress_bar ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: 14,
            width: `${Math.min(100, (time / Math.max(0.1, totalSeconds)) * 100)}%`,
            backgroundColor: activeColor,
            boxShadow: `0 0 18px ${activeColor}`,
          }}
        />
      ) : null}

      {/* Signature : filigrane Free ou marque Agency. */}
      {signature ? (
        <div
          style={{
            position: 'absolute',
            top: HEIGHT * 0.145,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 34,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.8)',
              backgroundColor: 'rgba(0,0,0,0.35)',
              padding: '8px 22px',
              borderRadius: 999,
              letterSpacing: 1,
            }}
          >
            {signature}
          </span>
        </div>
      ) : null}

      {/* Titre d'accroche des 3 premières secondes. */}
      {hookTitle && hookOut > 0 ? (
        <div
          style={{
            position: 'absolute',
            top: HEIGHT * 0.2,
            left: 70,
            right: 70,
            display: 'flex',
            justifyContent: 'center',
            opacity: hookOut,
            transform: `scale(${0.7 + 0.3 * hookIn}) translateY(${(1 - hookIn) * -40}px)`,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              color: '#0A0A0A',
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.15,
              textAlign: 'center',
              padding: '26px 38px',
              borderRadius: 28,
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
              borderBottom: `10px solid ${activeColor}`,
            }}
          >
            {hookTitle}
          </div>
        </div>
      ) : null}

      {/* Sous-titres animés. */}
      {page ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${position * 100}%`,
            transform: `translateY(-50%) scale(${pageScale})`,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: template === 'karaoke_box' ? 10 : 18,
            padding: '0 70px',
          }}
        >
          {page.words.map((item, i) => {
            const isActive = i === activeIndex;
            const isSpoken = time >= item.start;
            const popAge = time - item.start;
            const pop =
              isActive && spec.popAmount > 0
                ? 1 + spec.popAmount * Math.max(0, 1 - popAge / 0.14)
                : 1;

            const base: React.CSSProperties = {
              fontSize,
              fontWeight: spec.weight,
              lineHeight: 1.1,
              textTransform: uppercase ? 'uppercase' : 'none',
              transform: `scale(${pop})`,
              display: 'inline-block',
              color: textColor,
            };

            if (template === 'karaoke_box') {
              return (
                <span
                  key={item.index}
                  style={{
                    ...base,
                    color: isActive ? readableOn(activeColor) : textColor,
                    backgroundColor: isActive ? activeColor : 'transparent',
                    padding: '6px 16px',
                    borderRadius: 14,
                    textShadow: isActive ? 'none' : '0 4px 16px rgba(0,0,0,0.8)',
                  }}
                >
                  {item.word}
                </span>
              );
            }

            if (template === 'neon') {
              const glow = isActive ? activeColor : 'rgba(0,0,0,0.7)';
              return (
                <span
                  key={item.index}
                  style={{
                    ...base,
                    color: isActive ? '#FFFFFF' : textColor,
                    textShadow: `0 0 12px ${glow}, 0 0 28px ${glow}, 0 0 52px ${glow}`,
                  }}
                >
                  {item.word}
                </span>
              );
            }

            if (template === 'clean' || template === 'minimal') {
              return (
                <span
                  key={item.index}
                  style={{
                    ...base,
                    color: isActive ? activeColor : textColor,
                    opacity: isSpoken ? 1 : 0.75,
                    textShadow: '0 3px 14px rgba(0,0,0,0.85)',
                  }}
                >
                  {item.word}
                </span>
              );
            }

            // hormozi & bold_pop : contour épais, mot actif coloré.
            return (
              <span
                key={item.index}
                style={{
                  ...base,
                  color: isActive ? activeColor : textColor,
                  WebkitTextStroke: spec.stroke ? `${Math.max(4, Math.round(fontSize / 18))}px #000` : undefined,
                  paintOrder: 'stroke fill',
                  textShadow: '0 8px 26px rgba(0,0,0,0.6)',
                }}
              >
                {item.word}
              </span>
            );
          })}
        </div>
      ) : null}
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
        words: [],
        style: {},
        zoomTimes: [],
        hookTitle: '',
        signature: '',
      }}
    />
  );
};
