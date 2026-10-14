'use client';

import { useEffect, useMemo, useRef } from 'react';

import { buildCompDocument } from '@/lib/motion2/runtime';
import { COMP_SIZE, type Comp } from '@/lib/motion2/types';

/**
 * Aperçu du moteur pro : la composition tourne pour de vrai dans un cadre
 * isolé (aucun accès au site ni au compte), exactement comme à l'export.
 */
export function ProPlayer({ comp, assets, playing, seekTo, onTime, onError, onReady, className }: {
  comp: Comp;
  assets: Record<string, string>;
  playing: boolean;
  /** Nouvelle position demandée (s) — change la valeur pour déclencher. */
  seekTo?: { t: number; n: number } | null;
  onTime?: (t: number) => void;
  onError?: (msg: string) => void;
  onReady?: (duration: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const { w, h } = COMP_SIZE[comp.format];
  const doc = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return buildCompDocument(comp, { assets: { ...(comp.assets ?? {}), ...assets }, gsap: { src: `${origin}/vendor/gsap.min.js` }, mode: 'preview' });
  }, [comp, assets]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { iz?: string; t?: number; msg?: string; duration?: number };
      if (d?.iz === 'time' && typeof d.t === 'number') onTime?.(d.t);
      else if (d?.iz === 'error' && d.msg) onError?.(d.msg);
      else if (d?.iz === 'ready') {
        onReady?.(d.duration ?? comp.duration);
        if (!playing) ref.current?.contentWindow?.postMessage({ iz: 'pause' }, '*');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onTime, onError, onReady, playing, comp.duration]);

  // Document chargé après le montage (le cadre doit déjà être isolé quand le contenu arrive, sinon certains navigateurs ne lancent pas les scripts).
  useEffect(() => { if (ref.current && ref.current.srcdoc !== doc) ref.current.srcdoc = doc; }, [doc]);
  useEffect(() => { ref.current?.contentWindow?.postMessage({ iz: playing ? 'play' : 'pause' }, '*'); }, [playing]);
  useEffect(() => { if (seekTo) ref.current?.contentWindow?.postMessage({ iz: 'seek', t: seekTo.t }, '*'); }, [seekTo]);

  return (
    <iframe
      ref={ref}
      title="Aperçu de la vidéo"
      sandbox="allow-scripts"
      className={className}
      style={{ aspectRatio: `${w} / ${h}`, border: 0, display: 'block', width: '100%', background: '#000' }}
    />
  );
}
