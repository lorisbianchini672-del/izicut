'use client';

/**
 * Studio d'effets (« Montage IA ») — la vidéo du client + des calques
 * modifiables à volonté : textes animés, emojis, zooms, formes, intro,
 * carte de fin, filtres, flashs. Tout se règle à la main (texte, durée,
 * position, animation…) ou en dictant à l'IA ce qu'on veut.
 * Aperçu et export se font dans le navigateur (canvas + MediaRecorder).
 */
import Link from 'next/link';
import { Montserrat } from 'next/font/google';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowLeft, Copy, Download, Film, Layers, Pause, Play, Plus, Send, Sparkles, Trash2, Undo2, Wand2 } from 'lucide-react';
import { detectBeats, takePendingVideo } from '@/lib/overlay/beats';
import { analyzeVideo, type VideoAnalysis } from '@/lib/overlay/analyze';
import { STYLES, generateEdit, type StyleId } from '@/lib/overlay/recipes';

import { Button } from '@/components/ui/button';
import { resolvePlanTier } from '@/lib/entitlements';
import { drawComposite, type Box } from '@/lib/overlay/render';
import {
  ANIM_LABELS,
  BOX_LABELS,
  EMOJI_ANIMS,
  FILTERS,
  FILTER_LABELS,
  FX_LABELS,
  VIDEO_FX,
  LAYER_COLORS,
  LAYER_LABELS,
  LayersSchema,
  SHAPES,
  TEXT_ANIMS,
  TEXT_BOXES,
  ZOOM_EASES,
  clampLayer,
  defaultLayer,
  newId,
  type Layer,
  type LayerType
} from '@/lib/overlay/types';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const font = Montserrat({ subsets: ['latin'], weight: ['800', '900'], display: 'swap' });
const W = 1080;
const H = 1920;
type Word = { word: string; start: number; end: number };
type Panel = 'styles' | 'ia' | 'ajouter' | 'calque';
const VIDEO_LAYER_TYPES = new Set(['speed', 'cut', 'freeze', 'effect', 'zoom', 'filter', 'flash']);
type Msg = { role: 'user' | 'ai'; text: string };

const AI_IDEAS = [
  'Synchronise des effets sur la musique',
  'Style clip de danse, sans texte',
  'Ralenti sur le meilleur moment',
  'Glitch et flash sur les temps forts',
  'Accélère les passages lents',
  'Look film vintage',
  'Fais un montage dynamique complet',
  'Retire tous les textes'
];
const EMOJIS = ['🔥', '😂', '😱', '💯', '👀', '❤️', '🚀', '💰', '👇', '✅', '❌', '⚡', '🎯', '🤯', '👏', '✨'];
const COLORS = ['#ffffff', '#c8ff3d', '#ffd400', '#ff3b6b', '#3de0ff', '#a855f7', '#ff8a00', '#000000'];
const VIDEO_TYPES: LayerType[] = ['effect', 'speed', 'cut', 'freeze', 'zoom', 'filter'];
const ADD_TYPES: LayerType[] = ['motion', 'text', 'emoji', 'shape', 'intro', 'endcard', 'progress', 'flash'];

function readWords(value: unknown): Word[] {
  const list = Array.isArray(value) ? value : Array.isArray((value as { words?: unknown })?.words) ? (value as { words: unknown[] }).words : [];
  return (list as Word[]).filter((w) => w && typeof w.word === 'string' && Number.isFinite(w.start)).map((w) => ({ word: w.word, start: Number(w.start), end: Number(w.end) }));
}

function pickMime(): { mime: string; ext: string } {
  const list = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];
  for (const c of list) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
  return { mime: '', ext: 'webm' };
}

export function EffectsStudio({ clipId }: { clipId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const storageKey = clipId ? `izicut-effects-${clipId}` : `izicut-effects-local-${localFile?.name ?? ''}-${localFile?.size ?? 0}`;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('Mon clip');
  const [words, setWords] = useState<Word[]>([]);
  const [duration, setDuration] = useState(0);
  const [layers, setLayersState] = useState<Layer[]>([]);
  const [history, setHistory] = useState<Layer[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('styles');
  const [advanced, setAdvanced] = useState(false);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [style, setStyle] = useState<StyleId | null>(null);
  const [energy, setEnergy] = useState(0.7);
  const [variant, setVariant] = useState(0);
  const visionRef = useRef('');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [beats, setBeats] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layersRef = useRef(layers);
  const boxes = useRef(new Map<string, Box>());
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode } | null>(null);
  const exportingRef = useRef(false);
  const hydrated = useRef(false);
  const beatsRef = useRef<number[]>([]);
  const freezeRef = useRef<{ id: string; until: number } | null>(null);
  const prevTimeRef = useRef(0);
  layersRef.current = layers;
  beatsRef.current = beats;

  // ---------- Chargement : clip IziCut ou fichier de l'appareil ----------
  const restore = useCallback((key: string) => {
    try {
      const saved = window.localStorage.getItem(key);
      const parsed = saved ? LayersSchema.safeParse(JSON.parse(saved)) : null;
      setLayersState(parsed?.success ? parsed.data : []);
    } catch {
      setLayersState([]);
    }
    hydrated.current = true;
  }, []);

  const openLocal = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mov|mp4|webm|m4v|mkv)$/i.test(file.name)) { setNotice('Choisissez une vidéo (MP4, MOV, WebM).'); return; }
    hydrated.current = false;
    setLocalFile(file);
    setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Ma vidéo');
    setWords([]);
    setBeats([]);
    visionRef.current = '';
    setVideoUrl(URL.createObjectURL(file));
    restore(`izicut-effects-local-${file.name}-${file.size}`);
    void file.arrayBuffer().then((buf) => detectBeats(buf)).then(setBeats);
  }, [restore]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', auth.user.id).maybeSingle();
        if (!cancelled) setIsPaid(resolvePlanTier(profile?.plan, profile?.subscription_status) !== 'free');
      }
      if (!clipId) {
        const pending = takePendingVideo();
        if (pending && !cancelled) openLocal(pending);
        return;
      }
      if (!auth.user) throw new Error('Connectez-vous pour modifier ce clip.');
      const { data: clip } = await supabase
        .from('clips')
        .select('id, title, status, rendered_storage_path, transcript_json')
        .eq('id', clipId)
        .maybeSingle();
      if (!clip) throw new Error('Clip introuvable.');
      if (!clip.rendered_storage_path) throw new Error('Ce clip est encore en cours de montage. Revenez dans un instant.');
      const { data: signed } = await supabase.storage.from('clips').createSignedUrl(clip.rendered_storage_path, 3600);
      if (!signed?.signedUrl) throw new Error('Vidéo indisponible.');
      if (cancelled) return;
      setTitle(String(clip.title || 'Mon clip'));
      setWords(readWords(clip.transcript_json));
      setVideoUrl(signed.signedUrl);
      restore(`izicut-effects-${clipId}`);
      // Temps forts de la musique (pour les effets « au rythme »).
      void fetch(signed.signedUrl).then((r) => r.arrayBuffer()).then((buf) => detectBeats(buf)).then((b) => { if (!cancelled) setBeats(b); }).catch(() => undefined);
    })().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Chargement impossible.');
    });
    return () => {
      cancelled = true;
    };
  }, [clipId, openLocal, restore, supabase]);

  useEffect(() => {
    if (!hydrated.current) return; // ne pas écraser la sauvegarde avant de l'avoir lue
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layers));
    } catch {
      /* stockage indisponible */
    }
  }, [layers, storageKey]);

  /** Modification avec historique (bouton « Annuler »). */
  const setLayers = useCallback((next: Layer[] | ((prev: Layer[]) => Layer[]), record = true) => {
    setLayersState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (record) setHistory((h) => [...h.slice(-30), prev]);
      return value;
    });
  }, []);
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setLayersState(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };
  const patchLayer = (id: string, patch: Partial<Layer>, record = false) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? clampLayer({ ...l, ...patch } as Layer, duration || 9999) : l)), record);

  // Analyse visuelle (mouvement + position du sujet) dès que la vidéo est prête.
  useEffect(() => {
    if (!videoUrl || !duration) return;
    let cancelled = false;
    setAnalysis(null);
    setAnalyzing(0);
    analyzeVideo(videoUrl, duration, (p) => { if (!cancelled) setAnalyzing(p); })
      .then((a) => { if (!cancelled) setAnalysis(a); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setAnalyzing(null); });
    return () => { cancelled = true; };
  }, [videoUrl, duration]);

  /** Applique un style : montage vidéo régénéré, textes / emojis conservés. */
  const applyStyle = useCallback((id: StyleId, level: number, v: number, extra: Layer[] = [], dropOverlays = false) => {
    if (!duration) return;
    const base = generateEdit(id, { duration, beats: beatsRef.current, analysis, energy: level, variant: v });
    setStyle(id);
    setLayers((prev) => [...base, ...(dropOverlays ? [] : prev.filter((l) => !VIDEO_LAYER_TYPES.has(l.type))), ...extra].map((l) => clampLayer(l, duration)));
    const vid = videoRef.current;
    if (vid) { vid.currentTime = 0; prevTimeRef.current = 0; freezeRef.current = null; void vid.play(); setPlaying(true); }
  }, [analysis, duration, setLayers]);

  /**
   * Pilote de lecture : vitesse (ralenti / accéléré), coupes et arrêts sur
   * image modifient la VRAIE lecture de la vidéo, en direct et à l'export.
   */
  const drive = useCallback((video: HTMLVideoElement, now: number) => {
    const t = video.currentTime;
    const list = layersRef.current;
    const prev = prevTimeRef.current;
    prevTimeRef.current = t;
    const fr = freezeRef.current;
    if (fr) {
      if (now >= fr.until) { freezeRef.current = null; void video.play().catch(() => undefined); }
      return;
    }
    if (video.paused) return;
    const cut = list.find((l) => l.type === 'cut' && t >= l.start && t < l.end - 0.02);
    if (cut) { video.currentTime = Math.min(cut.end, video.duration || cut.end); return; }
    const freeze = list.find((l) => l.type === 'freeze' && prev < l.start && t >= l.start && t - l.start < 0.5);
    if (freeze && freeze.type === 'freeze') {
      video.pause();
      freezeRef.current = { id: freeze.id, until: now + freeze.hold * 1000 };
      return;
    }
    const speed = list.find((l) => l.type === 'speed' && t >= l.start && t < l.end);
    const target = speed && speed.type === 'speed' ? speed.rate : 1;
    // Rampe de vitesse progressive (rendu « speed ramp » pro, sans à-coup).
    const cur = video.playbackRate;
    const next = cur + (target - cur) * 0.35;
    const rate = Math.abs(target - next) < 0.03 ? target : next;
    if (Math.abs(cur - rate) > 0.01) video.playbackRate = Math.min(4, Math.max(0.25, rate));
  }, []);

  // ---------- Boucle d'aperçu ----------
  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const video = videoRef.current;
      if (ctx && !exportingRef.current) {
        if (video) drive(video, now);
        const t = video?.currentTime ?? 0;
        drawComposite(ctx, video ?? null, layersRef.current, t, { fontFamily: font.style.fontFamily, watermark: !isPaid, duration: duration || 1, boxes: boxes.current, beats: beatsRef.current, clock: now / 1000 });
        // Contour du calque sélectionné.
        if (selected) {
          const b = boxes.current.get(selected);
          if (b) {
            ctx.save();
            ctx.strokeStyle = '#c8ff3d';
            ctx.setLineDash([18, 12]);
            ctx.lineWidth = 5;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.restore();
          }
        }
        if (now - lastUi > 80) { lastUi = now; setTime(t); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drive, duration, isPaid, selected]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused && !freezeRef.current) { if (v.ended || v.currentTime >= duration - 0.05) v.currentTime = 0; prevTimeRef.current = v.currentTime; void v.play(); setPlaying(true); }
    else { freezeRef.current = null; v.pause(); setPlaying(false); }
  };
  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
    prevTimeRef.current = v.currentTime;
    freezeRef.current = null;
    setTime(v.currentTime);
  };

  // ---------- Glisser-déposer sur l'aperçu ----------
  const toCanvas = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e);
    const hit = [...layersRef.current].reverse().find((l) => {
      const b = boxes.current.get(l.id);
      return b && time >= l.start && time <= l.end && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    });
    if (hit && 'x' in hit && 'y' in hit) {
      setSelected(hit.id);
      setPanel('calque');
      drag.current = { id: hit.id, dx: p.x - hit.x * W, dy: p.y - hit.y * H, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      setHistory((h) => [...h.slice(-30), layersRef.current]);
    } else {
      togglePlay();
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    d.moved = true;
    const x = Math.min(1, Math.max(0, (p.x - d.dx) / W));
    const y = Math.min(1, Math.max(0, (p.y - d.dy) / H));
    setLayersState((prev) => prev.map((l) => (l.id === d.id ? ({ ...l, x, y } as Layer) : l)));
  };
  const onPointerUp = () => { drag.current = null; };

  // ---------- Calques ----------
  const addLayer = (type: LayerType, patch: Partial<Layer> = {}) => {
    const layer = { ...defaultLayer(type, time, duration || 10), ...patch } as Layer;
    setLayers((prev) => [...prev, clampLayer(layer, duration || 10)]);
    setSelected(layer.id);
    setPanel('calque');
  };
  const removeLayer = (id: string) => { setLayers((prev) => prev.filter((l) => l.id !== id)); setSelected(null); };
  const duplicateLayer = (id: string) => {
    const l = layers.find((x) => x.id === id);
    if (!l) return;
    const copy = clampLayer({ ...l, id: newId(l.type), start: l.end, end: l.end + (l.end - l.start) } as Layer, duration);
    setLayers((prev) => [...prev, copy]);
    setSelected(copy.id);
  };

  // ---------- IA ----------
  const askAi = async (text: string) => {
    const value = text.trim();
    if (!value || aiBusy || !duration) return;
    setAiBusy(true);
    setPrompt('');
    setMsgs((m) => [...m, { role: 'user', text: value }]);
    try {
      const res = await fetch('/api/overlay/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: value, duration, layers, words: words.slice(0, 3000), beats: beats.slice(0, 400), style, energy,
          motion: summarizeMotion(analysis),
          ...(visionRef.current ? { vision: visionRef.current } : analysis?.sheet ? { sheet: analysis.sheet } : {})
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (!Array.isArray(json.layers) && !json.recipe)) throw new Error(json.error ?? 'L’IA n’a pas pu répondre.');
      if (typeof json.vision === 'string' && json.vision) visionRef.current = json.vision;
      if (json.recipe && STYLES.some((st) => st.id === json.recipe)) {
        const level = typeof json.energy === 'number' ? json.energy : energy;
        setEnergy(level);
        const nextVariant = variant + 1;
        setVariant(nextVariant);
        applyStyle(json.recipe as StyleId, level, nextVariant, Array.isArray(json.layers) ? (json.layers as Layer[]) : [], Boolean(json.dropOverlays));
        setMsgs((m) => [...m, { role: 'ai', text: json.message ?? 'C’est fait.' }]);
      } else {
        setLayers((json.layers as Layer[]).map((l) => clampLayer(l, duration)));
        setMsgs((m) => [...m, { role: 'ai', text: `${json.message ?? 'C’est fait.'} (${json.layers.length} effets)` }]);
        seek(0);
        void videoRef.current?.play();
        setPlaying(true);
      }
    } catch (err) {
      setMsgs((m) => [...m, { role: 'ai', text: err instanceof Error ? err.message : 'Erreur de l’IA.' }]);
    } finally {
      setAiBusy(false);
    }
  };

  // ---------- Export (vidéo + son) ----------
  const exportVideo = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || exportingRef.current) return;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      setNotice('Votre navigateur ne permet pas l’export. Utilisez Chrome, Edge ou Safari récent sur ordinateur.');
      return;
    }
    try {
      if (!audioRef.current) {
        const ctx = new AudioContext();
        const src = ctx.createMediaElementSource(video);
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(ctx.destination);
        audioRef.current = { ctx, dest };
      }
      await audioRef.current.ctx.resume();
    } catch {
      /* sans son si le navigateur refuse */
    }
    const { mime, ext } = pickMime();
    exportingRef.current = true;
    setExporting(0);
    setSelected(null);
    video.pause();
    freezeRef.current = null;
    video.currentTime = 0;
    prevTimeRef.current = 0;
    await new Promise((r) => { video.onseeked = () => r(null); });
    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...(audioRef.current?.dest.stream.getAudioTracks() ?? [])
    ]);
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((r) => { recorder.onstop = () => r(); });
    const ctx = canvas.getContext('2d')!;
    recorder.start(250);
    await video.play();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        drive(video, now);
        const t = video.currentTime;
        drawComposite(ctx, video, layersRef.current, t, { fontFamily: font.style.fontFamily, watermark: !isPaid, duration, beats: beatsRef.current, clock: now / 1000 });
        setExporting(Math.min(99, Math.round((t / duration) * 100)));
        if (!freezeRef.current && (video.ended || t >= duration - 0.02)) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    await stopped;
    video.pause();
    video.playbackRate = 1;
    const blob = new Blob(chunks, { type: mime || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'izicut'}-montage.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    exportingRef.current = false;
    setExporting(null);
    setPlaying(false);
    setNotice(ext === 'mp4' ? 'Vidéo téléchargée en MP4 ✓' : 'Vidéo téléchargée (WebM). Sur Chrome ou Safari récent, l’export se fait en MP4.');
  };

  const sel = layers.find((l) => l.id === selected) ?? null;

  if (!clipId && !videoUrl && !loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-16 pt-28">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neon"><Sparkles className="h-3.5 w-3.5" /> Montage IA</p>
        <h1 className="izi-title-gradient mb-2 text-3xl font-semibold sm:text-4xl">Modifier ma vidéo</h1>
        <p className="mb-6 text-sm text-fg-muted">Ralentis, accélérés, coupes, effets calés sur la musique, glitch, filtres, textes… À la main ou en dictant à l’IA. Votre vidéo reste sur votre appareil.</p>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-neon/40 bg-neon/[0.03] p-10 text-center hover:bg-neon/[0.06]">
          <Film className="h-8 w-8 text-neon" />
          <span className="font-semibold text-fg">Choisir une vidéo</span>
          <span className="text-xs text-fg-muted">MP4, MOV, WebM — idéalement moins de 3 minutes</span>
          <input type="file" accept="video/*,.mov" className="sr-only" onChange={(e) => openLocal(e.target.files?.[0])} />
        </label>
        {notice ? <p className="mt-3 text-sm text-red-300">{notice}</p> : null}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-28 text-center">
        <p className="mb-4 text-fg">{loadError}</p>
        <Button variant="outline" className="rounded-xl" asChild><Link href="/dashboard">Mes projets</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-3 pb-16 pt-20 sm:px-6">
      {/* En-tête */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/dashboard" aria-label="Retour" className="rounded-lg p-2 text-fg-muted hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-neon"><Sparkles className="h-3.5 w-3.5" /> Montage IA</p>
          <h1 className="truncate text-lg font-semibold text-fg">{title}</h1>
        </div>
        <button type="button" onClick={() => { setAdvanced((a) => !a); if (advanced && (panel === 'ajouter' || panel === 'calque')) setPanel('styles'); }} className={cn('hidden cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold sm:block', advanced ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>
          Mode avancé {advanced ? '✓' : ''}
        </button>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={undo} disabled={!history.length} title="Annuler la dernière modification">
          <Undo2 className="h-4 w-4" /> <span className="hidden sm:inline">Annuler</span>
        </Button>
        <Button variant="gradient" className="rounded-xl font-bold" onClick={exportVideo} disabled={exporting !== null || !duration}>
          <Download className="h-4 w-4" /> {exporting !== null ? `${exporting} %` : 'Télécharger'}
        </Button>
      </div>

      {notice ? (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-neon/30 bg-neon/[0.06] px-4 py-2.5 text-sm">
          <span>{notice}</span>
          <button type="button" className="cursor-pointer text-fg-muted" onClick={() => setNotice(null)} aria-label="Fermer">×</button>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {/* Aperçu */}
          <div className="mx-auto overflow-hidden rounded-2xl border border-white/10 bg-black" style={{ aspectRatio: '9 / 16', maxWidth: 'min(100%, calc(62vh * 9 / 16))' }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="block h-full w-full touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              className="hidden"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onEnded={() => setPlaying(false)}
            />
          ) : null}
          {advanced ? (
            <p className="mt-2 text-center text-xs text-fg-subtle">
              Touchez un texte ou un emoji pour le sélectionner, glissez-le pour le déplacer. Touchez la vidéo pour lecture / pause.
            </p>
          ) : null}

          {analyzing !== null ? (
            <p className="mt-2 text-center text-xs text-neon">Analyse de votre vidéo (mouvements, musique)… {Math.round(analyzing * 100)} %</p>
          ) : null}
          {!advanced ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <button type="button" onClick={togglePlay} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-neon text-ink-950" aria-label={playing ? 'Pause' : 'Lecture'}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <input type="range" min={0} max={duration || 1} step={0.01} value={time} onChange={(e) => seek(Number(e.target.value))} className="flex-1 accent-[var(--color-neon)]" />
              <span className="w-20 text-right font-code text-xs text-fg-muted">{time.toFixed(1)} / {duration.toFixed(1)} s</span>
            </div>
          ) : null}
          {/* Timeline */}
          {advanced ? <Timeline
            beats={beats}
            duration={duration}
            time={time}
            layers={layers}
            selected={selected}
            playing={playing}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onSelect={(id) => { setSelected(id); setPanel('calque'); }}
            onChange={(id, start, end) => patchLayer(id, { start, end })}
            onDragStart={() => setHistory((h) => [...h.slice(-30), layersRef.current])}
          /> : null}
        </div>

        {/* Panneau */}
        <div className="flex min-h-[460px] flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className={cn('grid gap-1 border-b border-white/10 p-1.5', advanced ? 'grid-cols-4' : 'grid-cols-2')}>
            {(([['styles', 'Styles', <Sparkles key="s" className="h-4 w-4" />], ['ia', 'IA', <Wand2 key="a" className="h-4 w-4" />], ['ajouter', 'Ajouter', <Plus key="b" className="h-4 w-4" />], ['calque', 'Calque', <Layers key="c" className="h-4 w-4" />]] as [Panel, string, ReactNode][]).filter(([id]) => advanced || id === 'styles' || id === 'ia')).map(([id, label, icon]) => (
              <button key={id} type="button" onClick={() => setPanel(id)} className={cn('flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold', panel === id ? 'bg-neon text-ink-950' : 'text-fg-muted hover:bg-white/[0.05]')}>
                {icon}{label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {panel === 'styles' ? (
              <div className="space-y-4">
                <p className="text-sm text-fg-muted">Choisissez un style : le montage est créé d’après les mouvements et la musique de <b className="text-fg">votre</b> vidéo.</p>
                <div className="grid grid-cols-2 gap-2">
                  {STYLES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!duration}
                      onClick={() => { const v = variant + 1; setVariant(v); applyStyle(st.id, energy, v); }}
                      className={cn('cursor-pointer rounded-2xl border p-3 text-left transition', style === st.id ? 'border-neon bg-neon/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-neon/40')}
                    >
                      <span className="text-2xl">{st.emoji}</span>
                      <span className="mt-1 block text-sm font-bold text-fg">{st.name}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-fg-muted">{st.description}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs font-semibold text-fg-muted"><span>Énergie</span><span>{energy < 0.35 ? 'Douce' : energy < 0.7 ? 'Dynamique' : 'Explosive'}</span></div>
                  <input type="range" min={0} max={1} step={0.05} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} onPointerUp={() => style && applyStyle(style, energy, variant)} onKeyUp={() => style && applyStyle(style, energy, variant)} className="w-full accent-[var(--color-neon)]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-xl" disabled={!style} onClick={() => { if (!style) return; const v = variant + 1; setVariant(v); applyStyle(style, energy, v); }}>Autre version</Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => { setLayers([]); setStyle(null); }}>Tout retirer</Button>
                </div>
                <p className="text-xs text-fg-subtle">
                  {analysis ? 'Vidéo analysée ✓' : analyzing !== null ? 'Analyse en cours…' : 'Analyse indisponible : le montage suit la musique.'}
                  {beats.length ? ` · ${beats.length} temps forts` : ''} · Pour un détail précis, demandez à l’IA ou activez le « Mode avancé ».
                </p>
              </div>
            ) : null}

            {panel === 'ia' ? (
              <div className="flex h-full flex-col gap-3">
                <p className="text-sm text-fg-muted">Dites exactement ce que vous voulez : ralenti, accéléré, coupe, effets au rythme de la musique, filtre, texte… L’IA fait ce que vous demandez, rien de plus. Vous pouvez ensuite tout retoucher à la main.</p>
                <div className="flex-1 space-y-2">
                  {msgs.map((m, i) => (
                    <div key={i} className={cn('max-w-[90%] rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'ml-auto bg-neon text-ink-950' : 'bg-white/[0.06] text-fg')}>{m.text}</div>
                  ))}
                  {aiBusy ? <div className="flex items-center gap-2 text-sm text-fg-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-neon/20 border-t-neon" /> L’IA monte votre vidéo…</div> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AI_IDEAS.map((idea) => (
                    <button key={idea} type="button" disabled={aiBusy} onClick={() => askAi(idea)} className="cursor-pointer rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">{idea}</button>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); void askAi(prompt); }} className="flex items-end gap-2">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askAi(prompt); } }}
                    rows={2}
                    placeholder="Ex. : ajoute « INCROYABLE » en jaune à 3 s avec un emoji choqué"
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-fg outline-none focus:border-neon/50"
                  />
                  <Button type="submit" variant="gradient" className="h-[52px] rounded-xl" disabled={aiBusy || !prompt.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
                </form>
              </div>
            ) : null}

            {panel === 'ajouter' ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-fg-muted">Modifier la vidéo elle-même</p>
                  <div className="grid grid-cols-3 gap-2">
                    {VIDEO_TYPES.map((type) => (
                      <button key={type} type="button" onClick={() => addLayer(type)} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] px-2 py-3 text-xs font-semibold text-fg hover:border-neon/40">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[type] }} />
                        {LAYER_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-fg-muted">Effets vidéo rapides {beats.length ? `· ${beats.length} temps forts détectés` : ''}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VIDEO_FX.map((fx) => (
                      <button key={fx} type="button" onClick={() => addLayer('effect', { effect: fx, beat: ['pulse', 'strobe', 'glitch', 'rgb', 'shake'].includes(fx) } as Partial<Layer>)} className="cursor-pointer rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">{FX_LABELS[fx]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-fg-muted">Ajouter par-dessus</p>
                  <div className="grid grid-cols-3 gap-2">
                    {ADD_TYPES.map((type) => (
                      <button key={type} type="button" onClick={() => addLayer(type)} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] px-2 py-3 text-xs font-semibold text-fg hover:border-neon/40">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[type] }} />
                        {LAYER_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-fg-muted">Emojis rapides</p>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map((em) => (
                      <button key={em} type="button" onClick={() => addLayer('emoji', { emoji: em } as Partial<Layer>)} className="cursor-pointer rounded-lg py-1.5 text-xl hover:bg-white/10">{em}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-fg-subtle">L’effet est placé à la tête de lecture. Ajustez sa durée en tirant ses bords dans la timeline.</p>
              </div>
            ) : null}

            {panel === 'calque' ? (
              sel ? (
                <Inspector
                  layer={sel}
                  duration={duration}
                  onChange={(patch) => patchLayer(sel.id, patch)}
                  onDelete={() => removeLayer(sel.id)}
                  onDuplicate={() => duplicateLayer(sel.id)}
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-fg-muted">Sélectionnez un calque dans la timeline ou sur la vidéo.</p>
                  {layers.length === 0 ? <p className="text-xs text-fg-subtle">Aucun effet pour l’instant : demandez à l’IA ou ajoutez-en un.</p> : null}
                  {layers.map((l) => (
                    <button key={l.id} type="button" onClick={() => setSelected(l.id)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:border-neon/40">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[l.type] }} />
                      <span className="flex-1 truncate">{layerTitle(l)}</span>
                      <span className="font-code text-xs text-fg-subtle">{l.start.toFixed(1)}s</span>
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </div>
          {!isPaid ? (
            <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-fg-subtle">
              Offre Free : petite mention « Réalisé avec IziCut ». <Link href="/#pricing" className="text-neon underline">Passer en Pro</Link>
            </p>
          ) : null}
        </div>
      </div>
      {exporting !== null ? (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-black/85 px-4 py-3 text-center text-sm text-white">
          Création de la vidéo… {exporting} % — gardez cet onglet ouvert (la vidéo est lue une fois en entier).
        </div>
      ) : null}
    </div>
  );
}

function layerTitle(l: Layer): string {
  switch (l.type) {
    case 'text': return `Texte · ${l.text.replace(/\*/g, '')}`;
    case 'emoji': return `Emoji ${l.emoji}`;
    case 'intro': return `Intro · ${l.title.replace(/\*/g, '')}`;
    case 'endcard': return `Fin · ${l.title.replace(/\*/g, '')}`;
    case 'filter': return `Filtre ${FILTER_LABELS[l.filter]}`;
    case 'zoom': return `Zoom ×${l.scale.toFixed(1)}`;
    case 'speed': return l.rate < 1 ? `Ralenti ×${l.rate}` : `Accéléré ×${l.rate}`;
    case 'cut': return 'Coupé';
    case 'freeze': return `Arrêt ${l.hold}s`;
    case 'effect': return `${FX_LABELS[l.effect]}${l.beat ? ' ♪' : ''}`;
    case 'motion': return `Motion · ${l.name ?? (l.layers.find((x) => x.kind === 'text') as { text?: string } | undefined)?.text?.replace(/\*/g, '') ?? 'création IA'}`;
    default: return LAYER_LABELS[l.type];
  }
}

// ---------- Timeline (déplacer / redimensionner les calques) ----------
function Timeline(props: {
  beats: number[];
  duration: number;
  time: number;
  layers: Layer[];
  selected: string | null;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onChange: (id: string, start: number, end: number) => void;
  onDragStart: () => void;
}) {
  const { duration, time, layers, selected, playing } = props;
  const areaRef = useRef<HTMLDivElement>(null);
  const op = useRef<{ id: string; mode: 'move' | 'l' | 'r'; x0: number; s0: number; e0: number } | null>(null);
  const d = Math.max(duration, 0.1);

  const start = (e: ReactPointerEvent, l: Layer, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    props.onSelect(l.id);
    props.onDragStart();
    op.current = { id: l.id, mode, x0: e.clientX, s0: l.start, e0: l.end };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const o = op.current;
    const area = areaRef.current;
    if (!o || !area) return;
    const dt = ((e.clientX - o.x0) / area.clientWidth) * d;
    if (o.mode === 'move') {
      const len = o.e0 - o.s0;
      const s = Math.max(0, Math.min(d - len, o.s0 + dt));
      props.onChange(o.id, s, s + len);
    } else if (o.mode === 'l') {
      props.onChange(o.id, Math.max(0, Math.min(o.e0 - 0.1, o.s0 + dt)), o.e0);
    } else {
      props.onChange(o.id, o.s0, Math.max(o.s0 + 0.1, Math.min(d, o.e0 + dt)));
    }
  };
  const end = () => { op.current = null; };

  const seekFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    props.onSeek(((e.clientX - r.left) / r.width) * d);
  };

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-3">
        <button type="button" onClick={props.onTogglePlay} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-neon text-ink-950" aria-label={playing ? 'Pause' : 'Lecture'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="font-code text-xs text-fg-muted">{time.toFixed(1)} / {duration.toFixed(1)} s</span>
      </div>
      <div ref={areaRef} className="relative" onPointerMove={move} onPointerUp={end}>
        {/* Règle */}
        <div className="relative h-6 cursor-pointer rounded-md bg-white/[0.04]" onPointerDown={seekFrom}>
          {props.beats.map((b) => (
            <span key={`b${b}`} className="pointer-events-none absolute bottom-0 h-2 w-px bg-neon/70" style={{ left: `${(b / d) * 100}%` }} />
          ))}
          {Array.from({ length: Math.floor(d) + 1 }, (_, i) => (
            <span key={i} className="absolute top-0 h-full border-l border-white/10 pl-0.5 text-[9px] text-fg-subtle" style={{ left: `${(i / d) * 100}%` }}>{i % 2 === 0 ? `${i}s` : ''}</span>
          ))}
        </div>
        {/* Piste vidéo */}
        <div className="mt-1 h-7 rounded-md bg-gradient-to-r from-white/15 to-white/5 px-2 text-[10px] font-semibold leading-7 text-fg-muted">Vidéo</div>
        {/* Calques */}
        <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
          {layers.map((l) => (
            <div key={l.id} className="relative h-7 rounded-md bg-white/[0.02]">
              <div
                className={cn('absolute top-0 flex h-full cursor-grab items-center overflow-hidden rounded-md px-2 text-[10px] font-bold text-ink-950 active:cursor-grabbing', selected === l.id && 'ring-2 ring-white')}
                style={{ left: `${(l.start / d) * 100}%`, width: `${Math.max(1.5, ((l.end - l.start) / d) * 100)}%`, background: LAYER_COLORS[l.type] }}
                onPointerDown={(e) => start(e, l, 'move')}
              >
                <span className="pointer-events-none truncate">{layerTitle(l)}</span>
                <span className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize bg-black/25" onPointerDown={(e) => start(e, l, 'l')} />
                <span className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-black/25" onPointerDown={(e) => start(e, l, 'r')} />
              </div>
            </div>
          ))}
        </div>
        {/* Tête de lecture */}
        <span className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_white]" style={{ left: `${(time / d) * 100}%` }} />
      </div>
    </div>
  );
}

// ---------- Réglages du calque sélectionné ----------
const inputCls = 'w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-neon/50';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-fg-muted">{label}</p>
      {children}
    </div>
  );
}
function Chips<T extends string>({ options, value, labels, onChange }: { options: readonly T[]; value: T; labels?: Record<string, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className={cn('cursor-pointer rounded-lg border px-2.5 py-1 text-xs', value === o ? 'border-neon bg-neon/15 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => onChange(c)} className={cn('h-7 w-7 cursor-pointer rounded-full border-2', value.toLowerCase() === c ? 'border-neon' : 'border-white/20')} style={{ background: c }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent" />
    </div>
  );
}
function Slider({ value, min, max, step, onChange, suffix = '' }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--color-neon)]" />
      <span className="w-12 text-right font-code text-xs text-fg-muted">{Number(value.toFixed(2))}{suffix}</span>
    </div>
  );
}

function Inspector({ layer, duration, onChange, onDelete, onDuplicate }: { layer: Layer; duration: number; onChange: (p: Partial<Layer>) => void; onDelete: () => void; onDuplicate: () => void }) {
  const set = (p: Record<string, unknown>) => onChange(p as Partial<Layer>);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: LAYER_COLORS[layer.type] }} />{LAYER_LABELS[layer.type]}</p>
        <div className="flex gap-1">
          <button type="button" onClick={onDuplicate} title="Dupliquer" className="cursor-pointer rounded-lg p-1.5 text-fg-muted hover:bg-white/10"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={onDelete} title="Supprimer" className="cursor-pointer rounded-lg p-1.5 text-red-300 hover:bg-white/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Row label="Début (s)"><input type="number" step={0.1} min={0} max={duration} value={Number(layer.start.toFixed(2))} onChange={(e) => set({ start: Number(e.target.value) })} className={inputCls} /></Row>
        <Row label="Durée (s)"><input type="number" step={0.1} min={0.1} max={duration} value={Number((layer.end - layer.start).toFixed(2))} onChange={(e) => set({ end: layer.start + Math.max(0.1, Number(e.target.value)) })} className={inputCls} /></Row>
      </div>

      {layer.type === 'text' ? (
        <>
          <Row label="Texte (mettez un mot entre *astérisques* pour le colorer)">
            <textarea rows={2} maxLength={140} value={layer.text} onChange={(e) => set({ text: e.target.value || ' ' })} className={cn(inputCls, 'resize-none')} />
          </Row>
          <Row label="Taille"><Slider value={layer.size} min={30} max={200} step={2} onChange={(v) => set({ size: v })} /></Row>
          <Row label="Couleur du texte"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row>
          <Row label="Couleur des mots *accent*"><ColorRow value={layer.accent ?? '#c8ff3d'} onChange={(v) => set({ accent: v })} /></Row>
          <Row label="Style"><Chips options={TEXT_BOXES} value={layer.box} labels={BOX_LABELS} onChange={(v) => set({ box: v })} /></Row>
          {layer.box === 'box' || layer.box === 'pill' ? <Row label="Couleur du fond"><ColorRow value={layer.boxColor ?? '#000000'} onChange={(v) => set({ boxColor: v })} /></Row> : null}
          <Row label="Animation"><Chips options={TEXT_ANIMS} value={layer.anim} labels={ANIM_LABELS} onChange={(v) => set({ anim: v })} /></Row>
          <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={layer.uppercase ?? false} onChange={(e) => set({ uppercase: e.target.checked })} className="accent-[var(--color-neon)]" /> Majuscules</label>
        </>
      ) : null}

      {layer.type === 'emoji' ? (
        <>
          <Row label="Emoji">
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS.map((em) => <button key={em} type="button" onClick={() => set({ emoji: em })} className={cn('cursor-pointer rounded-lg py-1 text-xl', layer.emoji === em ? 'bg-neon/20' : 'hover:bg-white/10')}>{em}</button>)}
            </div>
          </Row>
          <Row label="Taille"><Slider value={layer.size} min={60} max={400} step={5} onChange={(v) => set({ size: v })} /></Row>
          <Row label="Animation"><Chips options={EMOJI_ANIMS} value={layer.anim} labels={{ pop: 'Pop', bounce: 'Rebond', float: 'Flotte', spin: 'Tourne', shake: 'Tremble' }} onChange={(v) => set({ anim: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'zoom' ? (
        <>
          <Row label="Force du zoom"><Slider value={layer.scale} min={1.05} max={2.2} step={0.05} onChange={(v) => set({ scale: v })} suffix="×" /></Row>
          <Row label="Type"><Chips options={ZOOM_EASES} value={layer.ease} labels={{ smooth: 'Doux', punch: 'Punch', shake: 'Secousse' }} onChange={(v) => set({ ease: v })} /></Row>
          <Row label="Point visé (horizontal)"><Slider value={layer.x} min={0} max={1} step={0.01} onChange={(v) => set({ x: v })} /></Row>
          <Row label="Point visé (vertical)"><Slider value={layer.y} min={0} max={1} step={0.01} onChange={(v) => set({ y: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'shape' ? (
        <>
          <Row label="Forme"><Chips options={SHAPES} value={layer.shape} labels={{ arrow: 'Flèche', circle: 'Cercle', underline: 'Soulignement', box: 'Cadre' }} onChange={(v) => set({ shape: v })} /></Row>
          <Row label="Couleur"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row>
          <Row label="Largeur"><Slider value={layer.w} min={0.05} max={1} step={0.01} onChange={(v) => set({ w: v })} /></Row>
          <Row label="Hauteur"><Slider value={layer.h} min={0.02} max={0.8} step={0.01} onChange={(v) => set({ h: v })} /></Row>
          <Row label="Rotation"><Slider value={layer.rotation} min={-180} max={180} step={5} onChange={(v) => set({ rotation: v })} suffix="°" /></Row>
        </>
      ) : null}

      {layer.type === 'progress' ? (
        <>
          <Row label="Couleur"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row>
          <Row label="Position"><Chips options={['top', 'bottom'] as const} value={layer.position} labels={{ top: 'En haut', bottom: 'En bas' }} onChange={(v) => set({ position: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'intro' ? (
        <>
          <Row label="Titre"><input maxLength={90} value={layer.title} onChange={(e) => set({ title: e.target.value || ' ' })} className={inputCls} /></Row>
          <Row label="Sous-titre"><input maxLength={110} value={layer.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value || undefined })} className={inputCls} /></Row>
          <Row label="Couleur"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row>
          <Row label="Fond"><Chips options={['dark', 'blur', 'color'] as const} value={layer.backdrop} labels={{ dark: 'Sombre', blur: 'Léger', color: 'Couleur' }} onChange={(v) => set({ backdrop: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'endcard' ? (
        <>
          <Row label="Titre"><input maxLength={80} value={layer.title} onChange={(e) => set({ title: e.target.value || ' ' })} className={inputCls} /></Row>
          <Row label="Bouton"><input maxLength={30} value={layer.button ?? ''} onChange={(e) => set({ button: e.target.value || undefined })} className={inputCls} /></Row>
          <Row label="Marque"><input maxLength={40} value={layer.brand ?? ''} onChange={(e) => set({ brand: e.target.value || undefined })} className={inputCls} /></Row>
          <Row label="Couleur"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'filter' ? (
        <>
          <Row label="Filtre"><Chips options={FILTERS} value={layer.filter} labels={FILTER_LABELS} onChange={(v) => set({ filter: v })} /></Row>
          <Row label="Intensité"><Slider value={layer.intensity} min={0} max={1} step={0.05} onChange={(v) => set({ intensity: v })} /></Row>
        </>
      ) : null}

      {layer.type === 'flash' ? <Row label="Couleur"><ColorRow value={layer.color} onChange={(v) => set({ color: v })} /></Row> : null}

      {layer.type === 'speed' ? (
        <>
          <Row label="Vitesse">
            <div className="flex flex-wrap gap-1.5">
              {[0.25, 0.5, 0.75, 1.5, 2, 3].map((r) => (
                <button key={r} type="button" onClick={() => set({ rate: r })} className={cn('cursor-pointer rounded-lg border px-2.5 py-1 text-xs', layer.rate === r ? 'border-neon bg-neon/15 text-neon' : 'border-white/10 text-fg-muted')}>
                  {r < 1 ? `Ralenti ×${r}` : `×${r}`}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Réglage fin"><Slider value={layer.rate} min={0.25} max={4} step={0.05} onChange={(v) => set({ rate: v })} suffix="×" /></Row>
        </>
      ) : null}

      {layer.type === 'cut' ? <p className="text-sm text-fg-muted">Ce passage est retiré de la vidéo. Tirez les bords dans la timeline pour choisir ce qui est coupé.</p> : null}

      {layer.type === 'freeze' ? <Row label="Durée de l’arrêt sur image"><Slider value={layer.hold} min={0.2} max={5} step={0.1} onChange={(v) => set({ hold: v })} suffix="s" /></Row> : null}

      {layer.type === 'motion' ? (
        <>
          <p className="text-xs text-fg-subtle">Motion design dessiné par l’IA ({layer.layers.length} calque{layer.layers.length > 1 ? 's' : ''}). Retouchez les textes ici ; pour les formes, couleurs et mouvements, décrivez-les à l’IA (« plus néon », « fais exploser le titre en particules »…).</p>
          {layer.layers.map((x, k) => (x.kind === 'text' ? (
            <input key={k} value={x.text} maxLength={120} onChange={(e) => set({ layers: layer.layers.map((y, j) => (j === k && y.kind === 'text' ? { ...y, text: e.target.value || ' ' } : y)) } as Partial<Layer>)} className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-neon/50" />
          ) : null))}
        </>
      ) : null}
      {layer.type === 'effect' ? (
        <>
          <Row label="Effet"><Chips options={VIDEO_FX} value={layer.effect} labels={FX_LABELS} onChange={(v) => set({ effect: v })} /></Row>
          <Row label="Intensité"><Slider value={layer.intensity} min={0.05} max={1} step={0.05} onChange={(v) => set({ intensity: v })} /></Row>
          <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={layer.beat ?? false} onChange={(e) => set({ beat: e.target.checked })} className="accent-[var(--color-neon)]" /> Au rythme de la musique (sur chaque temps fort)</label>
        </>
      ) : null}
    </div>
  );
}

/** Résumé du mouvement pour l'IA : moments les plus et les moins animés. */
function summarizeMotion(a: VideoAnalysis | null): { peaks: number[]; calm: number[] } | undefined {
  if (!a || !a.motion.length) return undefined;
  const idx = a.motion.map((m, i) => ({ m, t: Math.round(i * a.step * 10) / 10 }));
  const sorted = [...idx].sort((x, y) => y.m - x.m);
  return { peaks: sorted.slice(0, 8).map((x) => x.t).sort((x, y) => x - y), calm: sorted.slice(-5).map((x) => x.t).sort((x, y) => x - y) };
}
