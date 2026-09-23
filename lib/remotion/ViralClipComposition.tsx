/**
 * ViralClipComposition.tsx — Composition Remotion pour clips verticaux 9:16
 * -------------------------------------------------------------------------
 * Affiche la vidéo source recadrée + sous-titres animés mot-à-mot.
 *
 * Usage (serveur) :
 *   renderVideo({
 *     composition: ViralClipComposition,
 *     compositionId: 'ViralClip',
 *     input: {
 *       videoSrc: 'https://.../source.mp4',
 *       startTime: 0,
 *       endTime: 30,
 *       transcript: [{ word: 'Bonjour', start: 0.5, end: 0.9 }, ...],
 *     },
 *     options: { codec: 'h264', audio: true, scale: 1, pixelsPerSecond: 25 },
 *   });
 */

import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
} from 'remotion';

import type { StyleConfig, SpeakerDetection, SpeakerLayout, ReframeTarget } from '@/types';

// ---------- Types ----------

type TranscriptWord = {
  word: string;
  start: number; // secondes relatives au début de la séquence
  end: number;
};

type CompositionProps = {
  // Chemin ou URL de la vidéo source (doit être accessible au rendu)
  videoSrc: string;

  // Intervalle de temps dans la vidéo source (secondes absolues)
  startTime: number;
  endTime: number;

  // Transcription mot-à-mot, timestamps relatifs au début de la séquence
  transcript: TranscriptWord[];

  // ── PILIER 2 — Speaker Detection & Auto-Reframe ──
  speakerDetection?: SpeakerDetection;

  // ── PILIER 2 + PILIER 5 — Style / template ──
  styleConfig?: StyleConfig;

  // ── Surcharge directe (pour l'éditeur visuel) ──
  // Ces champs écrasent ce que styleConfig aurait défini.
  fontSize?: number;
  textColor?: string;
  textStroke?: string;
  textStrokeWidth?: number;
  subtitleVerticalPosition?: number;
  template?: 'hormozi' | 'ios_notes' | 'tweet' | 'minimal' | 'colorful';
};

export const ViralClipComposition: React.FC<CompositionProps> = ({
  videoSrc,
  startTime,
  endTime,
  transcript,
  speakerDetection,
  styleConfig,
  fontSize,
  textColor,
  textStroke,
  textStrokeWidth,
  subtitleVerticalPosition,
  template,
}) => {
  const { fps } = useVideoConfig();

  // ── Styles fusionnés : surcharges > styleConfig > defaults ──
  const colors = styleConfig?.colors ?? {};
  const captions = styleConfig?.captions ?? {};
  const templateStyle = styleConfig?.template ?? template ?? 'hormozi';
  const effectiveFontSize = fontSize ?? styleConfig?.captions?.font_size ?? 72;
  const effectiveTextColor = textColor ?? colors.text ?? '#FFFFFF';
  const effectiveTextStroke = textStroke ?? colors.highlight ?? '#000000';
  const effectiveTextStrokeWidth = textStrokeWidth ?? 4;
  const effectiveSubtitlePosition =
    subtitleVerticalPosition ?? captions.position ?? 0.82;
  const karaokeActive = captions.karaoke !== false;

  // ── Layout speaker (PILIER 2) ──
  const layout = speakerDetection?.layout;
  const isSplitScreen =
    layout &&
    (layout.type === 'split_horizontal' ||
      layout.type === 'split_vertical' ||
      layout.type === 'grid' ||
      layout.type === 'picture_in_picture');
  const isSingleSpeaker = layout?.type === 'single';

  // Zoom par défaut (crop zoom)
  const cropZoom =
    styleConfig?.crop?.default_zoom ??
    (templateStyle === 'hormozi' ? 1.3 : templateStyle === 'minimal' ? 1.0 : 1.15);

  return (
    <AbsoluteFill>
      {/* ===== VIDÉO DE FOND — Single speaker crop (PILIER 2) ===== */}
      {!isSplitScreen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${cropZoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={videoSrc}
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'cover',
            }}
            alt="Source video"
          />
        </div>
      )}

      {/* ===== VIDÉO DE FOND — Split-screen / multi-locuteurs (PILIER 2) ===== */}
      {isSplitScreen && layout && (
        <SplitScreenLayout
          layout={layout}
          videoSrc={videoSrc}
          cropZoom={cropZoom}
        />
      )}

      {/* ===== Filtre subtle (légère teinte sombre) ===== */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.12)',
        }}
      />

      {/* ===== SOUS-TITRES MOT-A-MOT (karaoke animé) ===== */}
      <div
        style={{
          position: 'absolute',
          bottom: `${effectiveSubtitlePosition * 100}%`,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 48px 60px',
        }}
      >
        {transcript.map((w, index) => {
          const wordStart = w.start;
          const wordEnd = w.end;

          return (
            <Sequence
              key={index}
              from={wordStart}
              durationInFrames={Math.round((wordEnd - wordStart) * fps)}
            >
              <div
                style={{
                  display: 'inline-block',
                  fontSize: effectiveFontSize,
                  fontWeight: templateStyle === 'hormozi' ? 800 : 600,
                  color: effectiveTextColor,
                  stroke: effectiveTextStroke,
                  strokeWidth: effectiveTextStrokeWidth,
                  paintOrder: 'stroke fill',
                  letterSpacing: templateStyle === 'hormozi' ? 0.02 : 0,
                  lineHeight: 1.1,
                  maxWidth: '90%',
                  textAlign: 'center',
                  textShadow: `0 0 ${effectiveTextStrokeWidth * 2}px ${effectiveTextStroke}`,
                  transition: karaokeActive ? 'color 0.15s ease' : undefined,
                }}
              >
                {w.word.trim()}
              </div>
            </Sequence>
          );
        })}
      </div>

      {/* ===== Ligne décorative sous les sous-titres ===== */}
      <div
        style={{
          position: 'absolute',
          bottom: `${effectiveSubtitlePosition * 100}%`,
          left: 0,
          right: 0,
          height: templateStyle === 'minimal' ? 2 : 4,
          background: `linear-gradient(90deg, transparent, ${effectiveTextColor}80, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * SplitScreenLayout — Affiche plusieurs locuteurs en même temps
 * (PILIER 2 : prise en charge des vidéos multi-locuteurs)
 *
 * NOTE : Dans une implémentation complète avec vraie détection faciale,
 * chaque locuteur aurait sa propre vidéo cropée via son Bounding Box
 * (FFmpeg / ML kit / SFM). Ici on utilise la même source vidéo avec
 * des zones de focus différenciées pour le prototypage.
 */
function SplitScreenLayout({
  layout,
  videoSrc,
  cropZoom,
}: {
  layout: SpeakerLayout;
  videoSrc: string;
  cropZoom: number;
}) {
  const speakers: ReframeTarget[] =
    'speakers' in layout ? layout.speakers : [];

  // Picture-in-Picture : locuteur principal plein écran + secondaire en PIP
  if (layout.type === 'picture_in_picture') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Locuteur principal — plein écran zoomé */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${cropZoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={videoSrc}
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
            alt=""
          />
        </div>
        {/* Locuteur secondaire — PIP en haut à droite */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 40,
            width: '30%',
            aspectRatio: '16/9',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            border: '3px solid rgba(255,255,255,0.3)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
        </div>
      </div>
    );
  }

  // Split horizontal : deux locuteurs côte à côte
  if (layout.type === 'split_horizontal') {
    const splitPos = layout.split_position ?? 'left';
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: splitPos === 'left' ? 'row' : 'row-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {speakers.slice(0, 2).map((speaker, i) => (
          <div
            key={speaker.box.speaker_id}
            style={{
              flex: 1,
              transform: `scale(${cropZoom})`,
              transformOrigin:
                splitPos === 'left'
                  ? i === 0
                    ? 'right center'
                    : 'left center'
                  : i === 0
                    ? 'left center'
                    : 'right center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={videoSrc}
                style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                alt=""
              />
            </div>
          ))}
      </div>
    );
  }

  // Grid / Split vertical : grille de locuteurs
  const columns = layout.type === 'grid' ? (layout as any).columns ?? 2 : 1;
  const rows = layout.type === 'split_vertical' ? Math.min(speakers.length, 2) : 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 4,
        padding: 4,
      }}
    >
      {speakers.map((speaker) => (
        <div
          key={speaker.box.speaker_id}
          style={{
            overflow: 'hidden',
            borderRadius: 8,
            transform: `scale(${cropZoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// NOTE : La registration ci-dessous n'est pas utilisée dans ce projet.
// Le composant est importé directement par le worker depuis le fichier
// lib/remotion/index.ts. Laisser la référence pour documentation.
// ═══════════════════════════════════════════════════════════