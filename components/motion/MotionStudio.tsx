'use client';

/**
 * Studio Motion — vidéos animées (motion design) créées et modifiées avec l'IA.
 * Aperçu en direct sur un canvas, export MP4/WebM directement dans le
 * navigateur (aucun serveur de rendu nécessaire).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setPendingVideo } from '@/lib/overlay/beats';
import { Montserrat } from 'next/font/google';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  FileText,
  Paperclip,
  ArrowUp,
  Download,
  ImagePlus,
  Lock,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  Film,
  Building2,
  Images,
  Volume2,
  VolumeX,
  Clapperboard,
  Mic,
  MicOff,
  Loader2
} from 'lucide-react';

import { BrandPanel, EMPTY_BRAND, loadBrand, saveBrand } from '@/components/motion/BrandPanel';
import { CertificationPanel } from '@/components/motion/CertificationPanel';
import { QuickBar } from '@/components/motion/QuickBar';
import { Button } from '@/components/ui/button';
import type { BrandProfile } from '@/lib/brand/types';
import { detectBrandName } from '@/lib/brand/detect';
import { FREE_LIMITS, FREE_MOTION_CREATIONS, clampToFree, type MotionQuota } from '@/lib/motion/plan';
import { displayName } from '@/lib/motion/autoad';
import { BlockSchema, blockScene } from '@/lib/motion/compose';
import { buildSignatureAd } from '@/lib/motion/signature';
import { resolvePlanTier } from '@/lib/entitlements';
import { nudge } from '@/lib/motion/keys';
import { drawFrame, layerBoxes, locate, mediaTargets, type MotionAssets } from '@/lib/motion/render';
import { LayerEditor, type LayerSel } from '@/components/motion/LayerEditor';
import { AiPrefsPanel, loadPrefs } from '@/components/motion/AiPrefsPanel';
import type { AiPrefs } from '@/lib/motion/prefs';
import { BACKDROPS, BACKDROP_LABELS, drawBackdrop, type BackdropKind } from '@/lib/motion/gl-bg';
import { SoundPlayer, renderSoundtrack, type VoiceTrack } from '@/lib/motion/sound';
import { exportExact, mixWithMedia } from '@/lib/motion/export';
import {
  FORMAT_SIZE,
  MAX_PHOTOS,
  MAX_SCENES,
  MOTIFS,
  MOTIF_LABELS,
  MUSIC,
  MUSIC_LABELS,
  SFX,
  SFX_LABELS,
  TEXT_ANIMS,
  TEXT_ANIM_LABELS,
  type TextAnim,
  TRANSITIONS,
  TRANSITION_LABELS,
  MAGIC_KINDS,
  MAGIC_LABELS,
  type Concept,
  type Magic,
  type MagicKind,
  type Sfx,
  SCENE_LABELS,
  BLANK_PROJECT,
  isBlankProject,
  THEME_PRESETS,
  defaultScene,
  totalDuration,
  type MotionProject,
  type Scene,
  type SceneType
} from '@/lib/motion/types';
import { trackAd } from '@/lib/ads';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const motionFont = Montserrat({ subsets: ['latin'], weight: ['800', '900'], display: 'swap' });
const STORAGE_KEY = 'izicut-motion-project-v2';
const CONCEPT_KEY = 'izicut-motion-concept-v1';

type Tab = 'ia' | 'marque' | 'medias' | 'scenes' | 'style';
type Media = { name: string; url: string; duration: number; el: HTMLVideoElement; file: File };
type Photo = { name: string; url: string; img: HTMLImageElement };
type ChatMessage = { role: 'user' | 'ai'; text: string; plan?: string[] };

const NEW_IDEAS = [
  'Pub de 15 s pour ma boulangerie : pain bio, livraison le matin, -20 % la 1re commande',
  'Présente mon appli de coaching sportif : 3 avantages et un appel à télécharger',
  'Annonce l’ouverture de mon restaurant italien samedi à Lyon'
];
const EDIT_IDEAS = ['Rends-la plus dynamique', 'Ajoute un texte surligné avec mon offre', 'Ajoute un mot géant en écho', 'Mets le titre en lignes géantes qui claquent', 'Passe en bleu et blanc', 'Passe au format 16:9 pour YouTube'];

function loadSaved(): MotionProject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MotionProject) : null;
  } catch {
    return null;
  }
}

function pickMime(withAudio = false): { mime: string; ext: string } {
  // H.264 « High » niveau 5.1 en priorité : gère le 1080p et le 1440p à 60 i/s avec une vraie netteté.
  const avc = ['avc1.640033', 'avc1.640032', 'avc1.4D0033', 'avc1.42E033', 'avc1.42E01E'];
  const candidates = [
    ...(withAudio ? [...avc.map((v) => ({ mime: `video/mp4;codecs=${v},mp4a.40.2`, ext: 'mp4' })), { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' }] : []),
    ...avc.map((v) => ({ mime: `video/mp4;codecs=${v}`, ext: 'mp4' })),
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];
  for (const c of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
  return { mime: '', ext: 'webm' };
}

/**
 * Planche contact numérotée (3 × 2) des photos du client, pour que l'IA
 * « voie » ce que montre chaque photo et choisisse la bonne au bon moment.
 */
function photoSheets(photos: Photo[]): string[] {
  const sheets: string[] = [];
  for (let start = 0; start < photos.length; start += 6) {
    const group = photos.slice(start, start + 6);
    const cw = 300;
    const ch = 300;
    const canvas = document.createElement('canvas');
    canvas.width = cw * 3;
    canvas.height = ch * Math.ceil(group.length / 3);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    group.forEach((ph, k) => {
      const x = (k % 3) * cw;
      const y = Math.floor(k / 3) * ch;
      const img = ph.img;
      const sc = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * sc;
      const h = img.naturalHeight * sc;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cw, ch);
      ctx.clip();
      ctx.drawImage(img, x + (cw - w) / 2, y + (ch - h) / 2, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x + 6, y + 6, 54, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(start + k), x + 16, y + 27);
    });
    sheets.push(canvas.toDataURL('image/jpeg', 0.72));
  }
  return sheets;
}

function contrastText(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160 ? '#101225' : '#ffffff';
}

export function MotionStudio() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [project, setProject] = useState<MotionProject>(BLANK_PROJECT);
  /** Écran : « start » = on décrit la vidéo, « edit » = on la modifie et on la télécharge. */
  const [stage, setStage] = useState<'start' | 'edit'>('start');
  const [assets, setAssets] = useState<MotionAssets>({});
  // Documents d'inspiration : gardés en mémoire seulement (jamais enregistrés dans le navigateur ni sur le serveur).
  const [docs, setDocs] = useState<{ name: string; text: string }[]>([]);
  const [docsBusy, setDocsBusy] = useState(false);
  const [safeZones, setSafeZones] = useState(false);
  // Chat : on descend tout seul au dernier message (uniquement quand un message arrive, jamais pendant la lecture).
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const addDocs = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!loggedIn) { setNotice('Connectez-vous (gratuit) pour ajouter des documents.'); return; }
    setDocsBusy(true);
    try {
      for (const f of Array.from(files).slice(0, 3)) {
        // Vidéo d'inspiration : analysée dans le navigateur (rythme, couleurs), seule une planche réduite part pour décrire le style.
        if (f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name)) {
          try {
            const { analyzeVideoRef } = await import('@/lib/motion/video-ref');
            const ref = await analyzeVideoRef(f);
            let text = ref.text;
            if (ref.sheet) {
              const r = await fetch('/api/motion/docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: ref.sheet }) });
              const j = await r.json().catch(() => ({}));
              if (typeof j.style === 'string' && j.style) text += `\nStyle observé : ${j.style}`;
            }
            setDocs((d) => [...d.filter((x) => x.name !== ref.name), { name: ref.name, text }].slice(-3));
          } catch {
            setNotice(`${f.name} : vidéo illisible dans ce navigateur.`);
          }
          continue;
        }
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch('/api/motion/docs', { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || typeof j.text !== 'string') { setNotice(`${f.name} : ${j.error ?? 'lecture impossible'}`); continue; }
        setDocs((d) => [...d.filter((x) => x.name !== j.name), { name: j.name, text: j.text }].slice(-3));
      }
    } finally {
      setDocsBusy(false);
    }
  };
  /** Photos libres de droits demandées par l'IA (« search:… »), avec leur crédit. */
  const [webImgs, setWebImgs] = useState<Record<string, HTMLImageElement | null>>({});
  const [webCredits, setWebCredits] = useState<Record<string, string>>({});
  const webPending = useRef(new Set<string>());
  const [media, setMedia] = useState<Media[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  /** Description des photos par l'IA (vision), gardée tant que les photos ne changent pas. */
  const photoNotesRef = useRef<{ key: string; notes: string } | null>(null);
  const [brand, setBrand] = useState<BrandProfile>(EMPTY_BRAND);
  const brandRef = useRef<BrandProfile>(EMPTY_BRAND);
  brandRef.current = brand;
  const [autoStep, setAutoStep] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const brandLoaded = useRef(false);
  const mediaRef = useRef<Media[]>([]);
  const audioRef = useRef<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode; wired: Set<HTMLVideoElement> } | null>(null);
  const [tab, setTab] = useState<Tab>('ia');
  // Téléphone : deux espaces bien séparés, « Modifier » et « Télécharger ».
  const [view, setView] = useState<'edit' | 'export'>('edit');
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [prompt, setPrompt] = useState('');
  // Idée tapée sur l'accueil (/studio?idee=…) : pré-remplit le chat.
  useEffect(() => {
    const idee = new URLSearchParams(window.location.search).get('idee');
    if (idee) setPrompt(idee.slice(0, 600));
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    if (tab !== 'ia') return;
    const el = panelScrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, aiBusy, tab]);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Vidéo exportée, gardée en mémoire : bouton « Enregistrer » toujours disponible (certains navigateurs bloquent le téléchargement automatique).
  const [ready, setReady] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [hooks, setHooks] = useState<Scene[]>([]);
  const [quota, setQuota] = useState<MotionQuota | null>(null);
  const [voiceTrack, setVoiceTrack] = useState<VoiceTrack | null>(null);
  const voiceRef = useRef<VoiceTrack | null>(null);
  voiceRef.current = voiceTrack;
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'femme' | 'homme'>('femme');
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;
  const playerRef = useRef<SoundPlayer | null>(null);
  if (!playerRef.current && typeof window !== 'undefined') playerRef.current = new SoundPlayer();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(true);
  const projectRef = useRef(project);
  const assetsRef = useRef(assets);
  const exportingRef = useRef(false);
  projectRef.current = project;
  assetsRef.current = { ...assets, videos: media.map((m) => m.el), photos: photos.map((ph) => ph.img), web: webImgs };

  // L'IA peut demander des photos du web (« search:croissant doré ») : on trouve une image libre de droits et on la charge.
  useEffect(() => {
    const wanted = new Set<string>();
    const visit = (l: { kind: string; src?: string; children?: unknown[]; items?: { src?: string }[] }) => {
      if (l.kind === 'image' && typeof l.src === 'string' && l.src.startsWith('search:')) wanted.add(l.src);
      if (l.kind === 'gallery') for (const it of l.items ?? []) if (typeof it.src === 'string' && it.src.startsWith('search:')) wanted.add(it.src);
      if (l.kind === 'group') (l.children as { kind: string; src?: string }[]).forEach(visit);
    };
    for (const sc of project.scenes) if (sc.type === 'free') sc.layers.forEach((l) => visit(l as { kind: string; src?: string; children?: unknown[]; items?: { src?: string }[] }));
    const orientation = project.format === '9:16' ? 'portrait' : project.format === '16:9' ? 'landscape' : 'square';
    for (const src of wanted) {
      if (src in webImgs || webPending.current.has(src)) continue;
      webPending.current.add(src);
      void fetch(`/api/media/search?q=${encodeURIComponent(src.slice(7))}&o=${orientation}`)
        .then((r) => r.json())
        .then(async (j: { hits?: { url: string; credit: string }[] }) => {
          for (const hit of (j.hits ?? []).slice(0, 3)) {
            const img = new Image();
            img.decoding = 'async';
            const ok = await new Promise<boolean>((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = `/api/brand/image?url=${encodeURIComponent(hit.url)}`; });
            if (ok) { setWebImgs((w) => ({ ...w, [src]: img })); setWebCredits((c) => ({ ...c, [src]: hit.credit })); return; }
          }
          setWebImgs((w) => ({ ...w, [src]: null }));
        })
        .catch(() => setWebImgs((w) => ({ ...w, [src]: null })))
        .finally(() => webPending.current.delete(src));
    }
  }, [project, webImgs]);
  mediaRef.current = media;
  photosRef.current = photos;
  playingRef.current = playing;

  const duration = totalDuration(project);
  const [quality, setQuality] = useState<'1080p' | '1440p'>('1080p');
  const renderScale = quality === '1440p' ? 4 / 3 : 1;
  /**
   * Aperçu calculé à la taille réellement affichée (souvent 3 à 4× moins de
   * pixels que l'export) : lecture fluide même sur un ordinateur modeste.
   * L'export, lui, est calculé à part en pleine définition (1080p / 1440p).
   */
  const [previewScale, setPreviewScale] = useState(0.6);
  const scaleRef = useRef(0.6);
  scaleRef.current = previewScale;
  const size = FORMAT_SIZE[project.format];
  const watermark = !isPaid;

  // Projet sauvegardé dans ce navigateur + connexion / offre.
  useEffect(() => {
    const saved = loadSaved();
    if (saved?.scenes?.length) { setProject(saved); if (saved.scenes.some((sc) => sc.type === 'free')) setStage('edit'); }
    setBrand(loadBrand());
    brandLoaded.current = true;
    try {
      const c = window.localStorage.getItem(CONCEPT_KEY);
      if (c) setConcept(JSON.parse(c) as Concept);
    } catch {
      /* rien */
    }
    supabase.auth.getUser().then(async ({ data }) => {
      setLoggedIn(Boolean(data.user));
      if (!data.user) return;
      const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', data.user.id).maybeSingle();
      setIsPaid(resolvePlanTier(profile?.plan, profile?.subscription_status) !== 'free');
      fetch('/api/motion/quota').then((r) => (r.ok ? r.json() : null)).then((q) => { if (!q) return; setQuota(q as MotionQuota); if ((q as MotionQuota).tier !== 'free') setIsPaid(true); }).catch(() => undefined);
    });
  }, [supabase]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      /* stockage indisponible : pas grave */
    }
  }, [project]);

  useEffect(() => {
    if (brandLoaded.current) saveBrand(brand);
  }, [brand]);

  // Bande-son (musique + effets) recalculée quand le projet change.
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      renderSoundtrack(project, voiceTrack).then((buf) => { if (alive) playerRef.current?.setBuffer(buf); });
    }, 250);
    return () => { alive = false; window.clearTimeout(id); };
  }, [project, voiceTrack]);
  useEffect(() => () => playerRef.current?.stop(), []);

  useEffect(() => {
    const family = motionFont.style.fontFamily;
    Promise.all([document.fonts.load(`900 40px ${family}`), document.fonts.load(`800 40px ${family}`)])
      .catch(() => undefined)
      .finally(() => setFontReady(true));
  }, []);

  /**
   * Vidéos du client : on cale la lecture de chaque vidéo importée sur la
   * scène qui l'utilise (départ « from » + temps local de la scène).
   */
  const syncMedia = useCallback((t: number, live: boolean) => {
    const list = mediaRef.current;
    if (!list.length) return;
    const targets = mediaTargets(projectRef.current, t, list.length);
    list.forEach((m, i) => {
      const v = m.el;
      const tg = targets[i];
      if (tg !== null && tg !== undefined) {
        const target = Math.min(Math.max(0, m.duration - 0.05), tg);
        if (live) {
          if (v.paused) void v.play().catch(() => undefined);
          if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
        }
      } else if (!v.paused) {
        v.pause();
      }
    });
  }, []);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      drawFrame(ctx, projectRef.current, t, assetsRef.current, { fontFamily: motionFont.style.fontFamily, watermark, scale: scaleRef.current });
    },
    [watermark]
  );

  // Définition de l'aperçu = taille affichée × densité de l'écran (bornée), recalculée si la fenêtre change.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (!w) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = Math.max(0.35, Math.min(1, (w * dpr) / size.width));
      setPreviewScale((old) => (Math.abs(old - k) > 0.04 ? Math.round(k * 100) / 100 : old));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width]);

  // Boucle d'animation de l'aperçu.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!exportingRef.current) {
        if (playingRef.current) {
          const total = totalDuration(projectRef.current);
          timeRef.current = (timeRef.current + dt) % total;
        }
        syncMedia(timeRef.current, playingRef.current);
        playerRef.current?.sync(timeRef.current, playingRef.current, soundOnRef.current);
        draw(timeRef.current);
        if (now - lastUi > 100) { lastUi = now; setTime(timeRef.current); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, syncMedia, fontReady, project.format]);

  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(duration - 0.01, t));
    setTime(timeRef.current);
    draw(timeRef.current);
  };

  const proOnly = () => setNotice('Cette option fait partie de l’offre Pro (toutes les musiques, textures et transitions, pubs illimitées, sans filigrane).');

  // ---------- Édition directe dans la vidéo (sélection + déplacement des calques) ----------
  const [sel, setSel] = useState<LayerSel | null>(null);
  const [aiPrefs, setAiPrefs] = useState<AiPrefs>({});
  useEffect(() => { setAiPrefs(loadPrefs()); }, []);
  const dragRef = useRef<{ layer: LayerSel | null; last: { x: number; y: number }; moved: boolean } | null>(null);
  const pointAt = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height };
  };
  const boxesNow = () => {
    const ctx = canvasRef.current?.getContext('2d');
    return ctx ? layerBoxes(ctx, projectRef.current, timeRef.current, motionFont.style.fontFamily) : { index: 0, boxes: [] };
  };
  const hitLayer = (pt: { x: number; y: number }): LayerSel | null => {
    const { index, boxes } = boxesNow();
    let best: (typeof boxes)[number] | null = null;
    for (const b of boxes) if (Math.abs(pt.x - b.x) <= b.w / 2 + 14 && Math.abs(pt.y - b.y) <= b.h / 2 + 14 && (!best || b.w * b.h < best.w * best.h)) best = b;
    return best ? { scene: index, layer: best.i } : null;
  };
  const shiftK = (k: unknown, dlt: number, def: number) => (k === undefined ? def + dlt : typeof k === 'number' ? k + dlt : (k as { t: number; v: number }[]).map((q) => ({ ...q, v: q.v + dlt })));
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = pointAt(e);
    const hit = hitLayer(pt);
    dragRef.current = { layer: hit, last: pt, moved: false };
    if (hit) {
      setSel(hit);
      setPlaying(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dr = dragRef.current;
    if (!dr?.layer) return;
    const pt = pointAt(e);
    const dx = (pt.x - dr.last.x) / size.width, dy = (pt.y - dr.last.y) / size.height;
    if (Math.abs(dx) + Math.abs(dy) < 0.0008) return;
    dr.moved = true;
    dr.last = pt;
    const { scene, layer } = dr.layer;
    setProject((p) => {
      const sc = p.scenes[scene];
      if (!sc || sc.type !== 'free' || !sc.layers[layer]) return p;
      const layers = sc.layers.slice();
      const L = layers[layer];
      // Calque animé : on modifie l'image clé à l'instant courant (comme After Effects), sinon on déplace tout.
      const st = p.scenes.slice(0, scene).reduce((n, x) => n + x.duration, 0);
      const lt = Math.max(0, timeRef.current - st);
      layers[layer] = { ...L, x: Array.isArray(L.x) ? nudge(L.x, lt, dx, 0.5) : shiftK(L.x, dx, 0.5), y: Array.isArray(L.y) ? nudge(L.y, lt, dy, 0.5) : shiftK(L.y, dy, 0.5) } as typeof L;
      const scenes = p.scenes.slice();
      scenes[scene] = { ...sc, layers };
      return { ...p, scenes };
    });
  };
  const onCanvasUp = () => {
    const dr = dragRef.current;
    dragRef.current = null;
    if (!dr || dr.layer) return;
    if (sel) setSel(null);
    else setPlaying((pl) => !pl);
  };

  useEffect(() => { if (sel) panelScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [sel?.scene, sel?.layer]); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceProject = (next: MotionProject) => {
    setSel(null);
    setProject(next);
    timeRef.current = 0;
    setPlaying(true);
  };

  const updateScene = (index: number, patch: Partial<Scene>) => {
    setProject((p) => ({ ...p, scenes: p.scenes.map((s, i) => (i === index ? ({ ...s, ...patch } as Scene) : s)) }));
  };
  const moveScene = (index: number, dir: -1 | 1) => {
    setProject((p) => {
      const scenes = [...p.scenes];
      const j = index + dir;
      if (j < 0 || j >= scenes.length) return p;
      [scenes[index], scenes[j]] = [scenes[j], scenes[index]];
      return { ...p, scenes };
    });
  };
  const removeScene = (index: number) => setProject((p) => (p.scenes.length <= 1 ? p : { ...p, scenes: p.scenes.filter((_, i) => i !== index) }));
  const addScene = (type: SceneType) => setProject((p) => (p.scenes.length >= MAX_SCENES ? p : { ...p, scenes: [...p.scenes, defaultScene(type)] }));

  const loadImage = (file: File | undefined, key: keyof MotionAssets) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice('Choisissez une image (PNG, JPG, WebP).'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setAssets((a) => ({ ...a, [key]: img }));
    img.src = url;
  };

  const addVideo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mov|mp4|webm|m4v|mkv)$/i.test(file.name)) { setNotice('Choisissez une vidéo (MP4, MOV, WebM).'); return; }
    const maxVideos = isPaid ? 3 : FREE_LIMITS.videos;
    if (mediaRef.current.length >= maxVideos) { setNotice(isPaid ? '3 vidéos maximum par projet.' : `Offre Free : ${FREE_LIMITS.videos} vidéo par pub. Passez en Pro pour en ajouter jusqu’à 3.`); return; }
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.src = url;
    el.playsInline = true;
    el.preload = 'auto';
    el.onloadedmetadata = () => {
      const item: Media = { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), url, duration: el.duration || 0, el, file };
      const index = mediaRef.current.length;
      setMedia((list) => [...list, item]);
      // Première vidéo : on l'ajoute tout de suite au projet en plein écran.
      setProject((p) => {
        if (p.scenes.some((sc) => sc.type === 'video') || p.scenes.length >= MAX_SCENES) return p;
        const scene: Scene = { type: 'video', duration: Math.min(8, Math.max(2, Math.round(item.duration * 10) / 10 || 4)), media: index, from: 0, caption: 'Découvrez *notre savoir-faire*', layout: 'full' };
        return { ...p, scenes: [p.scenes[0], scene, ...p.scenes.slice(1)] };
      });
      setNotice('Vidéo ajoutée ✓ Demandez à l’IA « crée une pub à partir de ma vidéo » pour qu’elle construise tout autour.');
    };
    el.onerror = () => setNotice('Cette vidéo ne peut pas être lue par votre navigateur. Essayez un MP4.');
  };
  const removeVideo = (index: number) => {
    setMedia((list) => list.filter((_, i) => i !== index));
    setProject((p) => {
      const scenes = p.scenes
        .filter((sc) => !(sc.type === 'video' && sc.media === index))
        .map((sc) => (sc.type === 'video' && sc.media > index ? { ...sc, media: sc.media - 1 } : sc));
      return { ...p, scenes: scenes.length ? scenes : [defaultScene('title')] };
    });
  };

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    const maxPhotos = isPaid ? MAX_PHOTOS : FREE_LIMITS.photos;
    const room = maxPhotos - photosRef.current.length;
    if (room <= 0) { setNotice(isPaid ? `${MAX_PHOTOS} photos maximum par projet.` : `Offre Free : ${FREE_LIMITS.photos} photos par pub. Passez en Pro pour en ajouter jusqu’à ${MAX_PHOTOS}.`); return; }
    const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!list.length) { setNotice('Choisissez des images (JPG, PNG, WebP, HEIC converti).'); return; }
    let loaded = 0;
    const added: Photo[] = [];
    list.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        added.push({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), url, img });
        loaded += 1;
        if (loaded === list.length) finish();
      };
      img.onerror = () => { loaded += 1; if (loaded === list.length) finish(); };
      img.src = url;
    });
    const finish = () => {
      if (!added.length) { setNotice('Ces images ne peuvent pas être lues par votre navigateur.'); return; }
      const first = photosRef.current.length;
      setPhotos((prev) => [...prev, ...added]);
      setProject((p) => {
        if (p.scenes.some((sc) => sc.type === 'photo') || p.scenes.length >= MAX_SCENES) return p;
        const scene: Scene = { type: 'photo', duration: 3, photo: first, caption: 'Fait *avec passion*', layout: 'full' };
        return { ...p, scenes: [p.scenes[0], scene, ...p.scenes.slice(1)] };
      });
      setNotice(`${added.length} photo${added.length > 1 ? 's' : ''} ajoutée${added.length > 1 ? 's' : ''} ✓ Cliquez sur « Créer une pub avec mes médias » : l’IA regarde vos photos et construit la pub autour.`);
    };
  };
  /** Logo + visuels du site du client (via le serveur, pour que l'export reste possible). */
  const importSite = ({ logo, images }: { logo?: string; images: string[] }): Promise<Photo[]> => {
    const load = (u: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 1 ? img : null);
        img.onerror = () => resolve(null);
        img.src = `/api/brand/image?url=${encodeURIComponent(u)}`;
      });
    const maxPhotos = (isPaid ? MAX_PHOTOS : FREE_LIMITS.photos) - photosRef.current.length;
    return (async () => {
      const logoImg = logo ? await load(logo) : null;
      if (logoImg) setAssets((a) => ({ ...a, logo: logoImg }));
      // On charge large puis on garde les plus belles images (assez grandes, de la plus grande à la plus petite).
      const loaded = (await Promise.all(images.slice(0, 12).map(load))).filter((x): x is HTMLImageElement => Boolean(x) && (x as HTMLImageElement).naturalWidth >= 500 && (x as HTMLImageElement).naturalHeight >= 300);
      const imgs = loaded.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight).slice(0, Math.max(0, maxPhotos));
      const start = photosRef.current.length;
      const added: Photo[] = imgs.map((img, i) => ({ name: `Visuel du site ${start + i + 1}`, url: img.src, img }));
      const all = [...photosRef.current, ...added];
      if (added.length) { setPhotos(all); photosRef.current = all; }
      setNotice(`${logoImg ? 'Logo' : 'Aucun logo'} et ${imgs.length} visuel${imgs.length > 1 ? 's' : ''} importé${imgs.length > 1 ? 's' : ''} depuis le site ✓`);
      return all;
    })();
  };

  const removePhoto = (index: number) => {
    setPhotos((list) => list.filter((_, i) => i !== index));
    setProject((p) => {
      const scenes = p.scenes
        .filter((sc) => !(sc.type === 'photo' && sc.photo === index))
        .map((sc) => (sc.type === 'photo' && sc.photo > index ? { ...sc, photo: sc.photo - 1 } : sc))
        .map((sc) => (sc.type === 'mockup' && sc.photo !== undefined ? { ...sc, photo: sc.photo === index ? undefined : sc.photo > index ? sc.photo - 1 : sc.photo } : sc));
      return { ...p, scenes: scenes.length ? scenes : [defaultScene('title')] };
    });
  };

  /**
   * Pub automatique : à partir de l'entreprise choisie, on retrouve son site,
   * on en tire couleurs / logo / visuels, l'IA rédige la fiche marque puis crée
   * la pub. Le client n'a plus qu'à demander ses modifications.
   */
  /** Pub au rendu des grandes campagnes d'applis, montée tout de suite avec les photos du client. */
  const signatureAd = (fromChat?: string) => {
    const b = brandRef.current;
    const name = b.company?.name || b.site?.title ? displayName(b) : project.brand || 'Votre marque';
    const next = buildSignatureAd({
      photos: photosRef.current.length,
      brand: name,
      theme: project.theme,
      hasLogo: Boolean(assetsRef.current.logo),
      tagline: b.brief?.pitch?.split(/[.!?]/)[0],
      points: b.brief?.strengths,
      labels: photosRef.current.map((ph) => ph.name),
      link: b.link || b.site?.url?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      format: project.format
    });
    replaceProject(isPaid ? next : clampToFree(next));
    setVoiceTrack(null);
    setTab('ia');
    if (fromChat) setMessages((m) => [...m, { role: 'user', text: fromChat }]);
    setMessages((m) => [...m, {
      role: 'ai',
      text: `Voilà votre pub au rendu des grandes campagnes d’applis, montée avec vos ${photosRef.current.length} photo${photosRef.current.length > 1 ? 's' : ''} : révélation de la marque, carrousel numéroté, mur d’images incliné, carte en verre avec plongée de caméra et validation, liste défilante, signature finale. Tout se modifie : demandez-moi un autre texte, une autre couleur, un autre fond, ou changez l’ordre des scènes.`,
      plan: ['Scène 1 (2,6 s) — le logo et le nom apparaissent, puis la phrase les pousse hors champ avec un flou de mouvement.', 'Scène 2 (2,6 s) — « Pensé pour vous » : vos photos glissent en carrousel, numérotées 01, 02…', 'Scène 3 (2,6 s) — mur de vos photos incliné qui défile derrière le titre.', 'Scène 4 (3,4 s) — carte en verre (photo, titre, barre de lecture), la caméra plonge sur le bouton, coche qui se dessine + notification.', 'Scène 5 (3 s) — vos points forts défilent dans une carte en verre.', 'Scène 6 (2,6 s) — signature : logo, nom, lien.']
    }]);
  };

  const autoAd = async (owner: boolean) => {
    if (!loggedIn) { setNotice('Connectez-vous (gratuit) pour créer une pub automatique.'); return; }
    let b: BrandProfile = { ...brandRef.current };
    const save = (next: BrandProfile) => { b = next; brandRef.current = next; setBrand(next); };
    try {
      if (!b.site && b.company?.name) {
        setAutoStep('Recherche du site de l’entreprise…');
        const f = await fetch(`/api/brand/find-site?name=${encodeURIComponent(b.company.name)}&city=${encodeURIComponent(b.company.city ?? '')}`).then((r) => r.json()).catch(() => ({}));
        if (f.url) {
          setAutoStep('Analyse du site (couleurs, logo, visuels)…');
          const s = await fetch(`/api/brand/site?url=${encodeURIComponent(f.url)}`).then((r) => r.json()).catch(() => ({}));
          if (s.site) save({ ...b, site: s.site, link: b.link || String(s.site.url).replace(/^https?:\/\//, '').replace(/\/$/, '') });
        }
      }
      if (!b.brief) {
        setAutoStep('L’IA étudie l’entreprise (fiche marque)…');
        const r = await fetch('/api/brand/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: b.company, notes: b.notes, site: b.site ?? null }) }).then((x) => x.json()).catch(() => ({}));
        if (r.brief) save({ ...b, brief: r.brief });
      }
      if (b.brief?.palette) {
        const pal = b.brief.palette;
        setProject((p) => ({ ...p, theme: { ...p.theme, primary: pal.primary, accent: pal.accent, background: pal.background, text: contrastText(pal.background), radius: b.site?.radius ?? p.theme.radius } }));
      }
      let photosNow = photosRef.current;
      if (owner && b.site && (b.site.logo || b.site.images?.length)) {
        setAutoStep('Import du logo et des visuels…');
        photosNow = await importSite({ logo: b.site.logo, images: b.site.images ?? [] });
      }
      // Création 100 % sur mesure par le directeur de création IA (aucun modèle imposé).
      setAutoStep('Le directeur de création IA imagine une pub unique…');
      setTab('ia');
      const ok = await askAi('Crée une pub motion design UNIQUE et spectaculaire pour cette entreprise, en t’appuyant sur toutes ses données (registre, fiche marque, faits, site web, couleurs, logo, visuels). Invente l’esthétique qui lui correspond (n’applique aucun modèle), dessine-la avec des scènes libres, mets ses vraies photos en valeur et utilise des images du web libres de droits si elles servent l’idée.', { fresh: true, brand: b, photos: photosNow });
      if (ok) setStage('edit');
    } finally {
      setAutoStep(null);
    }
  };

  /** Voix-off réelle intégrée à la vidéo (musique baissée de 12 dB pendant qu'elle parle). */
  const generateVoice = async () => {
    const lines = (concept?.voiceover ?? [])
      .map((v) => ({ start: (Number(v.time.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.')) || 0) + 0.15, text: v.text.trim() }))
      .filter((l) => l.text)
      .slice(0, 6);
    if (!lines.length) return;
    setVoiceBusy(true);
    try {
      const res = await fetch('/api/motion/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines, voice: voiceGender }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json.clips)) throw new Error(json.error ?? 'Voix-off indisponible.');
      const ctx = playerRef.current?.context();
      if (!ctx) throw new Error('Audio indisponible dans ce navigateur.');
      const clips = await Promise.all(
        (json.clips as { start: number; data: string }[]).map(async (c) => {
          const bin = Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0));
          return { start: c.start, buffer: await ctx.decodeAudioData(bin.buffer) };
        })
      );
      setVoiceTrack({ key: `${Date.now()}`, clips });
      void playerRef.current?.unlock();
      setSoundOn(true);
      timeRef.current = 0;
      setPlaying(true);
      setNotice('Voix-off ajoutée à la vidéo ✓ La musique baisse automatiquement quand la voix parle.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Voix-off indisponible.');
    } finally {
      setVoiceBusy(false);
    }
  };

  /** Dictée : on parle à l'IA au lieu d'écrire (Chrome, Edge, Safari). */
  const toggleListening = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { setNotice('La dictée vocale n’est pas disponible dans ce navigateur (essayez Chrome ou Safari).'); return; }
    const rec = new Ctor();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      setPrompt((finalText + interim).trim());
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) void askAi(finalText.trim());
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const askAi = async (text: string, opts: { fresh?: boolean; voice?: boolean; brand?: BrandProfile; photos?: Photo[] } = {}): Promise<boolean> => {
    const photos = opts.photos ?? photosRef.current;
    const brand = opts.brand ?? brandRef.current;
    const value = text.trim();
    if (!value || aiBusy) return false;
    if (!loggedIn) { setNotice('Connectez-vous (gratuit) pour utiliser l’IA du Studio.'); return false; }
    // « Le même rendu que la pub Spotify avec mes photos » : rendu signature garanti, monté tout de suite.
    if (photos.length && /\b(spotify|apple|netflix|grandes? (applis?|marques?)|style appli|m[eê]me rendu|pub signature)\b/i.test(value) && !/\b(modifi|chang|remplac|enl[eè]ve|retire)/i.test(value)) {
      setPrompt('');
      signatureAd(value);
      return true;
    }
    setAiBusy(true);
    setPrompt('');
    const steps = ['Je lis votre demande et j’analyse la marque…', 'Je réfléchis au concept et à l’esthétique…', 'Je dessine les scènes, calque par calque…', 'J’anime : courbes, caméra, transitions…', 'Sound design : musique et bruitages…', 'Contrôle qualité final…'];
    let stepIdx = 0;
    setAiStatus(steps[0]);
    const stepTimer = window.setInterval(() => { stepIdx = Math.min(steps.length - 1, stepIdx + 1); setAiStatus(steps[stepIdx]); }, 9000);
    const photoKey = photos.map((ph) => ph.url).join('|');
    // Nouvelle pub (et non retouche) : premier message, toile vierge, ou demande explicite d'une autre pub.
    const wantsNew = /\b(fais|fait|faire|cr[ée]e[rz]?|g[ée]n[èe]re[rz]?|r[ée]alise[rz]?|imagine[rz]?|monte[rz]?|refais|nouvelle|autre)\b[^.?!]{0,40}\b(pub|publicit[ée]|vid[ée]o|spot|annonce|clip|reel|tiktok)\b/i.test(value) && !/\b(modifi|chang|remplac|garde|ajoute|enl[eè]ve|retire|corrige|plus |moins )/i.test(value);
    const fresh = Boolean(opts.fresh) || !messages.length || isBlankProject(project) || wantsNew;
    setMessages((m) => [...m, { role: 'user', text: docs.length ? `${value}\n📎 ${docs.map((d) => d.name).join(' · ')}` : value }]);
    try {
      // Jusqu'à 3 essais : si l'IA est saturée ou se trompe de format, on relance
      // automatiquement sans afficher d'erreur technique au client.
      let res: Response | null = null;
      let json: Record<string, unknown> & { [k: string]: any } = {};
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          setAiStatus(attempt === 1 ? 'Je peaufine encore un peu…' : 'Dernière passe, la pub arrive…');
          await new Promise((r) => setTimeout(r, attempt * 5000));
        }
        res = await fetch('/api/motion/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: value,
            // Premier message = nouvelle pub (concept complet) ; ensuite = modifications.
            project: !fresh ? project : undefined,
            media: media.map((m, i) => ({ index: i, name: m.name, duration: Math.round(m.duration * 10) / 10 })),
            photos: photos.map((ph, i) => ({ index: i, name: ph.name })),
            hasLogo: Boolean(assets.logo),
            ...(docs.length ? { docs } : {}),
            format: project.format,
            currentScene: current,
            ...(Object.keys(aiPrefs).length ? { prefs: aiPrefs } : {}),
            ...(photos.length ? (photoNotesRef.current?.key === photoKey ? { photoNotes: photoNotesRef.current.notes } : { photoSheets: photoSheets(photos) }) : {}),
            brand: brand.company || brand.notes.trim() || brand.brief || brand.site || brand.link ? { ...brand, site: brand.site ?? null, link: brand.link || undefined } : undefined
          })
        });
        json = await res.json().catch(() => ({}));
        if (res.ok || res.status === 401 || res.status === 402 || res.status === 400 || String(json.error ?? '').includes('Reformulez')) break;
      }
      if (!res) throw new Error('Connexion impossible.');

      if (typeof json.photoNotes === 'string' && json.photoNotes) photoNotesRef.current = { key: photoKey, notes: json.photoNotes };
      if (json.quota) setQuota(json.quota as MotionQuota);
      if (!res.ok || !json.project) throw new Error(json.error ?? 'L’IA n’a pas pu répondre.');
      if (!fresh || !json.concept) { /* retouche : on garde les accroches */ } else setHooks(Array.isArray(json.hooks) ? (json.hooks as Scene[]) : []);
      replaceProject(json.project as MotionProject);
      if (json.concept) {
        setConcept(json.concept as Concept);
        try { window.localStorage.setItem(CONCEPT_KEY, JSON.stringify(json.concept)); } catch { /* rien */ }
      }
      const aiSays = [typeof json.message === 'string' ? json.message : '', typeof json.question === 'string' ? json.question : ''].filter(Boolean).join(' ');
      if (json.concept) setVoiceTrack(null);
      const plan = Array.isArray(json.plan) ? (json.plan as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 16) : undefined;
      setMessages((m) => [...m, {
        role: 'ai',
        plan,
        text: aiSays ? `${aiSays}${json.concept ? `\n\n${json.project.scenes.length} scènes · ${Math.round(totalDuration(json.project))} s · concept complet dans « Direction artistique ».` : ''}` : json.concept
          ? `Votre pub est prête : ${json.project.scenes.length} scènes, ${Math.round(totalDuration(json.project))} s, avec musique et effets sonores (activez le son sous l’aperçu). Le concept complet est dans « Direction artistique ». Demandez-moi n’importe quelle modification.`
          : `C’est fait : ${json.project.scenes.length} scènes, ${Math.round(totalDuration(json.project))} s. Demandez-moi une autre modification si besoin.`
      }]);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setMessages((m) => [...m, { role: 'ai', text: /Pro|gratuites|Connectez|Free|Reformulez/.test(msg) ? msg : 'Je n’ai pas réussi à terminer cette version, l’IA est très sollicitée. Réessayez dans un instant : votre pub actuelle est conservée.' }]);
      return false;
    } finally {
      window.clearInterval(stepTimer);
      setAiStatus(null);
      setAiBusy(false);
    }
  };

  /** Positionne exactement chaque vidéo importée sur l'image à exporter (export image par image). */
  const seekMediaExact = async (t: number) => {
    const list = mediaRef.current;
    if (!list.length) return;
    const targets = mediaTargets(projectRef.current, t, list.length);
    await Promise.all(list.map((m, i) => {
      const v = m.el;
      if (!v.paused) v.pause();
      const tg = targets[i];
      if (tg === null || tg === undefined) return undefined;
      const target = Math.min(Math.max(0, m.duration - 0.05), tg);
      if (Math.abs(v.currentTime - target) < 0.004) return undefined;
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        v.addEventListener('seeked', done, { once: true });
        window.setTimeout(done, 700);
        v.currentTime = target;
      });
    }));
  };

  const downloadBlob = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const name = `izicut-video-${projectRef.current.format.replace(':', 'x')}.${ext}`;
    setReady((old) => { if (old) URL.revokeObjectURL(old.url); return { url, name, blob }; });
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* le bouton « Enregistrer la vidéo » prend le relais */
    }
  };
  const shareReady = async () => {
    if (!ready) return;
    const file = new File([ready.blob], ready.name, { type: ready.blob.type || 'video/mp4' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Ma vidéo izicut' }); return; }
    } catch {
      /* partage annulé : on garde le lien direct */
    }
    window.open(ready.url, '_blank');
  };

  const exportVideo = async () => {
    trackAd('Lead', { content_name: 'export' });
    if (exportingRef.current) return;
    const proj = projectRef.current;
    const total = totalDuration(proj);
    const S = renderScale;
    // Canvas d'export dédié, en pleine définition (l'aperçu reste léger).
    const out = document.createElement('canvas');
    out.width = Math.round(size.width * S);
    out.height = Math.round(size.height * S);
    out.style.cssText = 'position:fixed;left:-100000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(out);
    const octx = out.getContext('2d');
    if (!octx) { out.remove(); return; }
    exportingRef.current = true;
    setExporting(0);
    setPlaying(false);
    playerRef.current?.stop();
    const opts = { fontFamily: motionFont.style.fontFamily, watermark, scale: S };
    try {
      const soundtrack = await renderSoundtrack(proj, voiceRef.current);
      // 1) Export image par image (WebCodecs) : 60 i/s parfaits, aucune image perdue.
      const clips: { url: string; start: number; from: number; duration: number }[] = [];
      let at = 0;
      for (const sc of proj.scenes) {
        const m = sc.type === 'video' ? mediaRef.current[sc.media] : undefined;
        if (sc.type === 'video' && m) clips.push({ url: m.url, start: at, from: sc.from, duration: sc.duration });
        at += sc.duration;
      }
      const audio = await mixWithMedia(soundtrack, clips, total).catch(() => soundtrack);
      const blob = await exportExact({
        canvas: out,
        duration: total,
        fps: 60,
        bitrate: S > 1 ? 32_000_000 : 20_000_000,
        audio,
        renderFrame: async (t) => { await seekMediaExact(t); drawFrame(octx, proj, Math.min(t, total - 0.001), assetsRef.current, opts); },
        onProgress: (r) => setExporting(Math.min(99, Math.round(r * 100)))
      }).catch(() => null);
      if (blob) {
        downloadBlob(blob, 'mp4');
        setNotice('Vidéo prête ✓ Si le téléchargement n’a pas démarré, touchez « Enregistrer la vidéo ».');
        return;
      }
      // 2) Navigateur sans WebCodecs : enregistrement en direct (secours).
      await legacyExport(out, octx, proj, total, opts, soundtrack);
    } catch (err) {
      console.warn('[export] échec', err);
      setNotice('L’export n’a pas abouti. Réessayez, de préférence sur Chrome ou Edge sur ordinateur (Safari sur iPhone peut bloquer les longues vidéos).');
    } finally {
      out.remove();
      mediaRef.current.forEach((m) => m.el.pause());
      exportingRef.current = false;
      setExporting(null);
    }
  };

  const legacyExport = async (canvas: HTMLCanvasElement, octx: CanvasRenderingContext2D, proj: MotionProject, total: number, opts: { fontFamily: string; watermark: boolean; scale: number }, soundtrack: AudioBuffer | null) => {
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      setNotice('Votre navigateur ne permet pas l’export vidéo. Utilisez Chrome, Edge ou Safari récent sur ordinateur.');
      return;
    }
    const { mime, ext } = pickMime(mediaRef.current.length > 0 || Boolean(soundtrack));
    const draw = (t: number) => drawFrame(octx, proj, t, assetsRef.current, opts);
    // Son des vidéos importées + bande-son (musique, effets) dans l'export.
    let audioTracks: MediaStreamTrack[] = [];
    let soundSrc: AudioBufferSourceNode | null = null;
    if (mediaRef.current.length || soundtrack) {
      try {
        if (!audioRef.current) {
          const ac = new AudioContext();
          audioRef.current = { ctx: ac, dest: ac.createMediaStreamDestination(), wired: new Set() };
        }
        const a = audioRef.current;
        for (const m of mediaRef.current) {
          if (a.wired.has(m.el)) continue;
          const src = a.ctx.createMediaElementSource(m.el);
          src.connect(a.dest);
          src.connect(a.ctx.destination);
          a.wired.add(m.el);
        }
        await a.ctx.resume();
        if (soundtrack) {
          soundSrc = a.ctx.createBufferSource();
          soundSrc.buffer = soundtrack;
          soundSrc.connect(a.dest);
          soundSrc.connect(a.ctx.destination);
        }
        audioTracks = a.dest.stream.getAudioTracks();
      } catch {
        audioTracks = [];
      }
    }
    const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...audioTracks]);
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: opts.scale > 1 ? 32_000_000 : 20_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    draw(0);
    recorder.start(250);
    soundSrc?.start();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = (now - t0) / 1000;
        if (t >= total + 0.15) { resolve(); return; }
        syncMedia(Math.min(t, total - 0.001), true);
        draw(Math.min(t, total - 0.001));
        setExporting(Math.min(99, Math.round((t / total) * 100)));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    await done;
    try { soundSrc?.stop(); } catch { /* fini */ }
    mediaRef.current.forEach((m) => m.el.pause());
    stream.getVideoTracks().forEach((tr) => tr.stop());
    const blob = new Blob(chunks, { type: mime || 'video/webm' });
    downloadBlob(blob, ext);
    setNotice(ext === 'mp4' ? 'Vidéo exportée en MP4 ✓' : 'Vidéo exportée (WebM). Astuce : sur Chrome ou Safari récent, l’export se fait en MP4.');
  };


  // ---------- Nouveau parcours : 1. on décrit / on donne sa marque / ses images → 2. on modifie → 3. on télécharge ----------
  const [brandInput, setBrandInput] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'ia' | 'add' | 'style'>('ia');

  /** Analyse d'une entreprise à partir de son lien (site) OU de son nom (registre officiel puis recherche du site). */
  const analyzeBrand = async (raw: string) => {
    const value = raw.trim();
    if (value.length < 2) return;
    if (!loggedIn) { setBrandError('Connectez-vous (gratuit) pour analyser une entreprise.'); return; }
    setBrandBusy(true);
    setBrandError(null);
    // Nouvelle entreprise analysée : on repart d'une fiche vierge (pas de mélange avec l'ancienne).
    let b: BrandProfile = { ...EMPTY_BRAND };
    const save = (next: BrandProfile) => { b = next; brandRef.current = next; setBrand(next); };
    try {
      const looksLikeUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value) && !/\s/.test(value);
      if (looksLikeUrl) {
        const r = await fetch(`/api/brand/site?url=${encodeURIComponent(value)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.site) throw new Error(j.error ?? 'Site introuvable : vérifiez l’adresse.');
        save({ ...b, site: j.site, link: String(j.site.url).replace(/^https?:\/\//, '').replace(/\/$/, '') });
      } else {
        const r = await fetch(`/api/brand/search?q=${encodeURIComponent(value)}`);
        const j = await r.json().catch(() => ({}));
        const first = Array.isArray(j.results) ? j.results[0] : null;
        if (first) save({ ...b, company: first });
        else save({ ...b, notes: b.notes || value });
        const f = await fetch(`/api/brand/find-site?name=${encodeURIComponent(first?.name ?? value)}&city=${encodeURIComponent(first?.city ?? '')}`).then((x) => x.json()).catch(() => ({}));
        if (f.url) {
          const s = await fetch(`/api/brand/site?url=${encodeURIComponent(f.url)}`).then((x) => x.json()).catch(() => ({}));
          if (s.site) save({ ...b, site: s.site, link: b.link || String(s.site.url).replace(/^https?:\/\//, '').replace(/\/$/, '') });
        }
        if (!first && !f.url) setBrandError('Entreprise introuvable : collez plutôt le lien de son site, ou décrivez-la dans l’idée.');
      }
      // Couleurs du site reprises tout de suite.
      if (b.site?.colors?.length) {
        const vivid = b.site.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c) && !/^#(f{6}|0{6})$/i.test(c));
        if (vivid[0]) setProject((p) => ({ ...p, theme: { ...p.theme, primary: vivid[0], accent: vivid[1] ?? p.theme.accent } }));
      }
      // Logo et visuels du site importés pour la pub (le client est le titulaire de la marque).
      if (b.site && (b.site.logo || b.site.images?.length) && !photosRef.current.length) await importSite({ logo: b.site.logo, images: b.site.images ?? [] });
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Analyse impossible.');
    } finally {
      setBrandBusy(false);
    }
  };

  /** Lance la création depuis l'écran d'accueil du Studio. */
  const startCreate = async () => {
    const b = brandRef.current;
    const who = b.company?.name || b.site?.title || '';
    const text = prompt.trim() || (who ? `Crée une pub motion design pour ${who}` : '');
    if (!text) { setNotice('Décrivez votre vidéo en une phrase (ex. : pub pour ma boulangerie, -20 % ce week-end).'); return; }
    trackAd('ViewContent', { content_name: 'create' });
    // Marque citée dans la demande (« les magasins Carrefour ») : on l'analyse d'abord (site, logo, couleurs, visuels).
    const named = !b.company && !b.site ? detectBrandName(text) : null;
    if (named) { setBrandInput(named); await analyzeBrand(named); }
    const ok = await askAi(text, { fresh: true, brand: brandRef.current, photos: photosRef.current });
    if (ok) { setStage('edit'); setPanel('ia'); }
  };

  /** Ajoute une scène animée (bloc premium, style tiré au sort) juste après la scène en cours. */
  const addBlock = (block: Record<string, unknown>) => {
    const parsedB = BlockSchema.safeParse(block);
    if (!parsedB.success) return;
    setProject((p) => {
      if (p.scenes.length >= MAX_SCENES) return p;
      const at = Math.min(p.scenes.length, locate(p, timeRef.current).index + 1);
      const scene = blockScene(parsedB.data, p, at, { hasLogo: Boolean(assetsRef.current.logo), photos: photosRef.current.length, videos: mediaRef.current.length });
      const scenes = p.scenes.slice();
      scenes.splice(at, 0, scene);
      window.setTimeout(() => seek(scenes.slice(0, at).reduce((n, x) => n + x.duration, 0)), 30);
      return { ...p, scenes };
    });
    setPlaying(true);
  };


  const current = locate(project, time).index;
  const sceneName = (s: Scene) => (s.type === 'free' ? s.name ?? 'Scène' : SCENE_LABELS[s.type]);
  const brandName = brand.company?.name || brand.site?.title || '';
  const proxied = (u: string) => `/api/brand/image?url=${encodeURIComponent(u)}`;
  const createSteps = ['Analyse de votre demande', 'Idée créative et direction artistique', 'Animation des scènes', 'Musique, bruitages et finitions'];
  const stepIndex = Math.max(0, ['Je lis', 'Je réfléchis', 'Je dessine', 'J’anime', 'Sound', 'Contrôle', 'Je peaufine', 'Dernière'].findIndex((k) => (aiStatus ?? '').startsWith(k)));

  const noticeBar = notice ? (
    <div className="mb-4 flex items-start justify-between gap-3 border-l-2 border-[#f28be0] bg-white/[0.04] px-4 py-3 text-sm text-white/90">
      <span>
        {notice}{' '}
        {notice.includes('Connectez-vous') ? <Link href="/login?next=/studio" className="font-semibold text-white underline">Se connecter</Link> : null}
      </span>
      <button type="button" className="cursor-pointer text-white/50 hover:text-white" onClick={() => setNotice(null)} aria-label="Fermer">×</button>
    </div>
  ) : null;

  return (
    <div className="izi-dark-scope relative min-h-dvh overflow-hidden bg-[#0a0a0a] font-[family-name:var(--font-geist)] text-white">
      {/* Halo dégradé de la marque izicut (bleu → rose → rouge), fondu en haut et en bas. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] opacity-60">
        <div className="absolute left-1/2 top-[-30%] h-[90%] w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(59,108,246,.35),transparent)] blur-3xl" />
        <div className="absolute left-[60%] top-[-20%] h-[70%] w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(242,139,224,.28),transparent)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6">
        {stage === 'start' ? (
          /* ======================= 1. CRÉER ======================= */
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/50">Studio izicut</p>
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Votre vidéo en motion design</h1>
              <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-white/60">Décrivez votre idée, ajoutez votre entreprise et vos images. L’IA conçoit et anime chaque scène ; vous retouchez ensuite en un message ou à la main.</p>
              {quota ? (
                <p className="mt-4 text-xs text-white/50">
                  {quota.limit === null ? `Offre ${quota.tier === 'agency' ? 'Agence' : 'Pro'} · vidéos illimitées` : <>Essai gratuit · {Math.max(0, quota.limit - quota.used)}/{quota.limit} vidéos restantes · <Link href="/#pricing" className="text-white underline">Passer en Pro</Link></>}
                </p>
              ) : null}
            </div>

            {noticeBar}

            {aiBusy ? (
              /* Création en cours : étapes claires, pas d'écran figé. */
              <div className="mx-auto max-w-md py-10 text-center">
                <div className="relative mx-auto mb-6 h-20 w-20">
                  <div className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,#8fa6ff,#f28be0,#ff7a62,transparent_70%)] [animation-duration:1.6s]" />
                  <div className="absolute inset-[3px] grid place-items-center rounded-full bg-[#0a0a0a]"><Sparkles className="h-6 w-6 text-white" /></div>
                </div>
                <p className="text-lg font-semibold">Votre vidéo se crée</p>
                <p className="mt-1 text-sm text-white/55">{aiStatus ?? 'Création en cours…'}</p>
                <ol className="mt-6 space-y-2 text-left text-sm">
                  {createSteps.map((s, k) => {
                    const done = k < Math.min(3, Math.floor(stepIndex / 1.6));
                    const active = k === Math.min(3, Math.floor(stepIndex / 1.6));
                    return (
                      <li key={s} className={cn('flex items-center gap-3', done ? 'text-white/80' : active ? 'text-white' : 'text-white/35')}>
                        <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[10px]', done ? 'bg-white text-black' : active ? 'border border-white' : 'border border-white/20')}>{done ? '✓' : k + 1}</span>
                        {s}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-6 text-xs text-white/40">Environ 1 minute. Gardez cette page ouverte.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/10 border-y border-white/10">
                {/* Étape 1 : l'idée */}
                <section className="grid gap-4 py-6 sm:grid-cols-[150px_1fr]">
                  <div><p className="text-xs text-white/40">01</p><p className="font-medium">Votre idée</p></div>
                  <div>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={3}
                      maxLength={600}
                      placeholder="Ex. : pub pour ma boulangerie à Lyon, nouveau pain au levain, -20 % ce week-end"
                      className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-white/30"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {NEW_IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => setPrompt(idea)} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-white/60 transition hover:border-white/30 hover:text-white">{idea}</button>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Étape 2 : l'entreprise */}
                <section className="grid gap-4 py-6 sm:grid-cols-[150px_1fr]">
                  <div><p className="text-xs text-white/40">02</p><p className="font-medium">Votre entreprise</p><p className="text-xs text-white/40">facultatif</p></div>
                  <div>
                    <form onSubmit={(e) => { e.preventDefault(); void analyzeBrand(brandInput); }} className="flex gap-2">
                      <input value={brandInput} onChange={(e) => setBrandInput(e.target.value)} placeholder="Lien du site (monsite.fr) ou nom de l’entreprise" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30" />
                      <button type="submit" disabled={brandBusy || brandInput.trim().length < 2} className="shrink-0 cursor-pointer rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-40">{brandBusy ? 'Analyse…' : 'Analyser'}</button>
                    </form>
                    {brandError ? <p className="mt-2 text-xs text-[#ff9a8a]">{brandError}</p> : null}
                    {brandName || brand.site ? (
                      <div className="mt-3 flex items-center gap-3">
                        {brand.site?.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxied(brand.site.logo)} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
                        ) : <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06] text-sm font-semibold">{(brandName || '?').slice(0, 1)}</span>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{brandName || brand.site?.url}</p>
                          <p className="truncate text-xs text-white/45">{[brand.company?.activityLabel, brand.company?.city, brand.site ? 'site analysé' : null].filter(Boolean).join(' · ')}</p>
                        </div>
                        {brand.site?.colors?.slice(0, 4).map((c) => <span key={c} className="h-5 w-5 rounded-full border border-white/20" style={{ background: c }} />)}
                        <button type="button" onClick={() => { setBrand(EMPTY_BRAND); brandRef.current = EMPTY_BRAND; setBrandInput(''); }} className="cursor-pointer text-xs text-white/40 hover:text-white">Retirer</button>
                      </div>
                    ) : null}
                  </div>
                </section>

                {/* Étape 3 : les images */}
                <section className="grid gap-4 py-6 sm:grid-cols-[150px_1fr]">
                  <div><p className="text-xs text-white/40">03</p><p className="font-medium">Vos images</p><p className="text-xs text-white/40">facultatif</p></div>
                  <div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-white/15 px-2 py-4 text-center text-xs text-white/70 transition hover:border-white/40">
                        <Images className="h-5 w-5" /> Photos
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                      </label>
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-white/15 px-2 py-4 text-center text-xs text-white/70 transition hover:border-white/40">
                        <Film className="h-5 w-5" /> Vidéo
                        <input type="file" accept="video/*,.mov" className="sr-only" onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-white/15 px-2 py-4 text-center text-xs text-white/70 transition hover:border-white/40">
                        <Building2 className="h-5 w-5" /> {assets.logo ? 'Logo ✓' : 'Logo'}
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { loadImage(e.target.files?.[0], 'logo'); e.target.value = ''; }} />
                      </label>
                    </div>
                    {photos.length || media.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {photos.map((ph, i) => (
                          <span key={ph.url} className="relative h-14 w-14 overflow-hidden rounded-lg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ph.url} alt={ph.name} className="h-full w-full object-cover" />
                            <button type="button" aria-label="Retirer la photo" onClick={() => removePhoto(i)} className="absolute right-0.5 top-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-black/70 text-[10px]">×</button>
                          </span>
                        ))}
                        {media.map((m, i) => (
                          <span key={m.url} className="relative grid h-14 w-20 place-items-center rounded-lg bg-white/[0.06] text-[10px] text-white/70">
                            <Film className="h-4 w-4" /> {m.duration.toFixed(0)} s
                            <button type="button" aria-label="Retirer la vidéo" onClick={() => removeVideo(i)} className="absolute right-0.5 top-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-black/70 text-[10px]">×</button>
                          </span>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs text-white/40">Sans images, l’IA utilise des photos libres de droits adaptées.</p>}
                  </div>
                </section>

                {/* Étape 4 : format + style */}
                <section className="grid gap-4 py-6 sm:grid-cols-[150px_1fr]">
                  <div><p className="text-xs text-white/40">04</p><p className="font-medium">Format</p></div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1">
                      {([['9:16', 'Vertical', 'TikTok · Reels'], ['16:9', 'Horizontal', 'YouTube'], ['1:1', 'Carré', 'Post']] as const).map(([f, l, s]) => (
                        <button key={f} type="button" onClick={() => setProject((p) => ({ ...p, format: f }))} className={cn('cursor-pointer rounded-lg py-2 text-sm transition', project.format === f ? 'bg-white text-black' : 'text-white/60 hover:text-white')}>
                          <span className="block font-medium">{l}</span>
                          <span className="block text-[10px] opacity-60">{s}</span>
                        </button>
                      ))}
                    </div>
                    <AiPrefsPanel prefs={aiPrefs} onChange={setAiPrefs} />
                  </div>
                </section>
              </div>
            )}

            {!aiBusy ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                {loggedIn === false ? (
                  <Link href="/login?next=/studio" className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-base font-semibold text-black">Se connecter pour créer (gratuit)</Link>
                ) : (
                  <button type="button" onClick={() => void startCreate()} disabled={docsBusy} className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-black shadow-[0_0_0_1px_rgba(255,255,255,.2),0_10px_40px_-10px_rgba(242,139,224,.6)] transition hover:scale-[1.02] disabled:opacity-50">
                    <Sparkles className="h-4 w-4" /> Créer ma vidéo
                  </button>
                )}
                {!isBlankProject(project) ? (
                  <button type="button" onClick={() => setStage('edit')} className="cursor-pointer text-sm text-white/50 underline-offset-4 hover:text-white hover:underline">Reprendre ma vidéo en cours</button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          /* ======================= 2. MODIFIER / 3. TÉLÉCHARGER ======================= */
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => { setSel(null); setStage('start'); }} className="inline-flex cursor-pointer items-center gap-2 text-sm text-white/60 transition hover:text-white">
                <RotateCcw className="h-4 w-4" /> Nouvelle vidéo
              </button>
              <div className="hidden min-w-0 text-center sm:block">
                <p className="truncate text-sm font-medium">{project.brand || brandName || 'Ma vidéo'}</p>
                <p className="text-xs text-white/45">{project.format === '9:16' ? 'Vertical' : project.format === '16:9' ? 'Horizontal' : 'Carré'} · {project.scenes.length} scènes · {duration.toFixed(0)} s</p>
              </div>
              <button type="button" disabled={exporting !== null} onClick={exportVideo} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:opacity-60">
                <Download className="h-4 w-4" /> {exporting !== null ? `Export… ${exporting} %` : 'Télécharger'}
              </button>
            </div>

            {noticeBar}
            {ready ? (
              <div className="mb-4 flex flex-col gap-2 border-l-2 border-[#8fa6ff] bg-white/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Votre vidéo est prête ({(ready.blob.size / 1_000_000).toFixed(1)} Mo).</p>
                <div className="flex gap-2">
                  <a href={ready.url} download={ready.name} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black sm:flex-none"><Download className="h-4 w-4" /> Enregistrer</a>
                  <button type="button" onClick={() => void shareReady()} className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-medium sm:flex-none">Partager / Photos</button>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              {/* ---------- Aperçu + timeline ---------- */}
              <div className="z-30 -mx-4 flex min-w-0 flex-col items-center bg-[#0a0a0a]/95 px-4 pb-2 pt-1 backdrop-blur-xl max-lg:sticky max-lg:top-0 lg:sticky lg:top-4 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
                <div
                  className="relative w-full max-w-[min(100%,calc(36dvh*var(--r)))] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9),0_0_0_1px_rgba(255,255,255,.08)] lg:max-w-[min(100%,calc(66vh*var(--r)))]"
                  style={{ aspectRatio: `${size.width} / ${size.height}`, ['--r' as string]: String(size.width / size.height) }}
                >
                  <canvas ref={canvasRef} width={Math.round(size.width * previewScale)} height={Math.round(size.height * previewScale)} className={cn('block h-full w-full max-w-full', sel ? 'cursor-move' : 'cursor-pointer')} style={{ touchAction: sel ? 'none' : 'auto' }} onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={() => { dragRef.current = null; }} title="Cliquez sur un élément pour le modifier" />
                  {sel ? (() => {
                    const b = boxesNow().boxes.find((x) => x.i === sel.layer);
                    if (!b || locate(project, time).index !== sel.scene) return null;
                    return <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.6)]" style={{ left: `${((b.x - b.w / 2) / size.width) * 100}%`, top: `${((b.y - b.h / 2) / size.height) * 100}%`, width: `${(b.w / size.width) * 100}%`, height: `${(b.h / size.height) * 100}%` }} />;
                  })() : null}
                  {safeZones && project.format === '9:16' ? (
                    <div className="pointer-events-none absolute inset-0" aria-hidden>
                      <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-red-400/70 bg-red-500/15" />
                      <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-dashed border-red-400/70 bg-red-500/15" />
                      <div className="absolute bottom-[22%] right-0 top-[40%] w-[14%] border-l border-dashed border-red-400/70 bg-red-500/15" />
                    </div>
                  ) : null}
                  {aiBusy ? (
                    <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm">
                      <div className="text-center"><Sparkles className="mx-auto h-6 w-6 animate-pulse" /><p className="mt-2 text-sm">{aiStatus ?? 'L’IA modifie la vidéo…'}</p></div>
                    </div>
                  ) : null}
                  {exporting !== null ? <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-xs">Enregistrement… gardez cet onglet ouvert ({exporting} %)</div> : null}
                </div>
                {Object.keys(webCredits).length ? <p className="mt-1.5 max-w-2xl text-center text-[10px] text-white/35">Photos libres de droits : {[...new Set(Object.values(webCredits))].slice(0, 6).join(' · ')}</p> : null}

                {/* Lecture */}
                <div className="mt-3 flex w-full max-w-2xl items-center gap-2">
                  <button type="button" onClick={() => setPlaying((p) => !p)} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-black" aria-label={playing ? 'Pause' : 'Lecture'}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                  </button>
                  <span className="w-20 shrink-0 font-code text-xs text-white/55">{time.toFixed(1)} / {duration.toFixed(0)} s</span>
                  <div className="flex-1" />
                  {project.format === '9:16' ? (
                    <button type="button" onClick={() => setSafeZones((v) => !v)} className={cn('h-9 shrink-0 cursor-pointer rounded-full border px-3 text-[11px] transition', safeZones ? 'border-red-400/60 text-red-300' : 'border-white/10 text-white/55 hover:text-white')} title="Zones cachées par TikTok / Reels">Zones TikTok</button>
                  ) : null}
                  <button type="button" onClick={() => { void playerRef.current?.unlock(); setSoundOn((v) => !v); }} className={cn('grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border transition', soundOn ? 'border-white/50 text-white' : 'border-white/10 text-white/55 hover:text-white')} aria-label={soundOn ? 'Couper le son' : 'Activer le son'}>
                    {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                </div>

                {/* Timeline des scènes */}
                <div className="mt-3 w-full max-w-2xl">
                  <div className="relative flex gap-1 overflow-x-auto pb-1">
                    {project.scenes.map((s, i) => (
                      <div key={i} className={cn('group relative shrink-0 rounded-lg border px-2 py-1.5 text-left transition', i === current ? 'border-white bg-white/[0.08]' : 'border-white/10 hover:border-white/30')} style={{ width: `${Math.max(92, (s.duration / duration) * 640)}px` }}>
                        <button type="button" onClick={() => seek(project.scenes.slice(0, i).reduce((n, x) => n + x.duration, 0))} className="block w-full cursor-pointer text-left">
                          <span className="block text-[10px] text-white/40">{i + 1} · {s.duration.toFixed(1)} s</span>
                          <span className="block truncate text-xs font-medium">{sceneName(s)}</span>
                        </button>
                        <span className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                          <button type="button" aria-label="Avancer la scène" onClick={() => moveScene(i, -1)} className="grid h-5 w-5 cursor-pointer place-items-center rounded bg-black/60 text-white/70 hover:text-white"><ArrowUp className="h-3 w-3 -rotate-90" /></button>
                          <button type="button" aria-label="Reculer la scène" onClick={() => moveScene(i, 1)} className="grid h-5 w-5 cursor-pointer place-items-center rounded bg-black/60 text-white/70 hover:text-white"><ArrowDown className="h-3 w-3 -rotate-90" /></button>
                          <button type="button" aria-label="Supprimer la scène" onClick={() => removeScene(i)} className="grid h-5 w-5 cursor-pointer place-items-center rounded bg-black/60 text-[#ff9a8a]"><Trash2 className="h-3 w-3" /></button>
                        </span>
                        {i === current ? <span className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded bg-gradient-to-r from-[#8fa6ff] via-[#f28be0] to-[#ff7a62]" style={{ width: `${Math.min(100, ((time - project.scenes.slice(0, i).reduce((n, x) => n + x.duration, 0)) / s.duration) * 100)}%` }} /> : null}
                      </div>
                    ))}
                    <button type="button" onClick={() => setPanel('add')} className="grid w-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed border-white/15 text-white/50 hover:border-white/40 hover:text-white" aria-label="Ajouter une scène"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="hidden w-full justify-center lg:flex">
                  <LayerEditor time={time} videos={media.length} photos={photos.length} project={project} sel={sel} onSelect={setSel} onChange={setProject} onSeek={seek} sceneStart={project.scenes.slice(0, sel?.scene ?? 0).reduce((n, x) => n + x.duration, 0)} accent={project.theme.primary} />
                </div>
                {!sel ? <p className="mt-2 text-center text-[11px] text-white/40">Cliquez sur un texte, une image ou une forme dans la vidéo pour le modifier, l’animer ou le déplacer.</p> : null}
              </div>

              {/* ---------- Panneau ---------- */}
              <div className="flex min-h-[420px] flex-col rounded-2xl bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,.08)] lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:self-start">
                <div className="grid grid-cols-3 gap-1 p-1.5">
                  {([['ia', 'Modifier', <Wand2 key="i" className="h-4 w-4" />], ['add', 'Ajouter', <Plus key="a" className="h-4 w-4" />], ['style', 'Style', <Palette key="s" className="h-4 w-4" />]] as ['ia' | 'add' | 'style', string, ReactNode][]).map(([id, label, icon]) => (
                    <button key={id} type="button" onClick={() => setPanel(id)} className={cn('flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition', panel === id ? 'bg-white text-black' : 'text-white/55 hover:bg-white/[0.05] hover:text-white')}>{icon}{label}</button>
                  ))}
                </div>
                <div ref={panelScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  {sel ? (
                    <div className="lg:hidden [&>div]:mb-4 [&>div]:mt-0">
                      <LayerEditor time={time} videos={media.length} photos={photos.length} project={project} sel={sel} onSelect={setSel} onChange={setProject} onSeek={seek} sceneStart={project.scenes.slice(0, sel.scene).reduce((n, x) => n + x.duration, 0)} accent={project.theme.primary} />
                    </div>
                  ) : null}

                  {panel === 'ia' ? (
              <div className="flex h-full flex-col gap-3">
                {loggedIn === false ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-fg-muted">
                    <Lock className="mr-1 inline h-3.5 w-3.5" /> <Link href="/login?next=/studio" className="font-semibold text-neon underline">Connectez-vous</Link> (gratuit) pour que l’IA crée et modifie vos vidéos. Vous pouvez déjà tester les modèles et tout modifier à la main.
                  </p>
                ) : null}
                {concept ? <ConceptCard concept={concept} onVoice={generateVoice} voiceBusy={voiceBusy} hasVoice={Boolean(voiceTrack)} gender={voiceGender} onGender={setVoiceGender} canVoice={isPaid} /> : null}
                {hooks.length ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="mb-1.5 text-xs font-semibold text-fg">Accroches A/B — testez celle qui retient le plus</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {hooks.map((h, i) => {
                        const label = ['A · Problème', 'B · Bénéfice', 'C · Curiosité'][i] ?? `Accroche ${i + 1}`;
                        const active = JSON.stringify(project.scenes[0]) === JSON.stringify(h);
                        const text = h.type === 'title' ? h.title : h.type === 'stat' ? `${h.prefix ?? ''}${h.value}${h.suffix ?? ''} ${h.label}` : h.type === 'quote' ? h.text : '';
                        return (
                          <button key={i} type="button" title={text.replace(/\*/g, '')} onClick={() => { setProject((p) => ({ ...p, scenes: [h, ...p.scenes.slice(1)] })); seek(0); setPlaying(true); }} className={cn('cursor-pointer rounded-lg border px-2 py-1.5 text-left text-[11px] transition', active ? 'border-neon bg-neon/15 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>
                            <span className="block font-semibold">{label}</span>
                            <span className="line-clamp-2 opacity-80">{text.replace(/\*/g, '')}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : !isPaid && concept ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-fg-muted">
                    <Lock className="mr-1 inline h-3 w-3" /> En Pro : 3 accroches A/B au choix et le script de voix-off. <Link href="/#pricing" className="text-neon underline">Voir l’offre</Link>
                  </p>
                ) : null}
                <div className="flex-1 space-y-2">
                  {messages.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-fg-muted">Décrivez la vidéo que vous voulez, ou partez d’une idée :</p>
                      {NEW_IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => askAi(idea, { fresh: true })} className="block w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-fg transition hover:border-neon/40">
                          {idea}
                        </button>
                      ))}
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={cn('max-w-[90%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'ml-auto bg-neon text-ink-950' : 'bg-white/[0.06] text-fg')}>
                        {m.text}
                        {m.plan?.length ? (
                          <details className="mt-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs" open={i === messages.length - 1}>
                            <summary className="cursor-pointer select-none font-semibold text-neon">Le plan, scène par scène</summary>
                            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-fg-muted">
                              {m.plan.map((step, k) => <li key={k}>{step}</li>)}
                            </ol>
                          </details>
                        ) : null}
                      </div>
                    ))
                  )}
                  {aiBusy ? (
                    <div className="izi-card flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-fg">
                      <span className="relative grid h-7 w-7 shrink-0 place-items-center">
                        <span className="absolute inset-0 animate-ping rounded-full bg-neon/30" />
                        <Sparkles className="relative h-4 w-4 text-neon" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">Votre directeur de création IA travaille</span>
                        <span className="block text-xs text-fg-muted">{aiStatus ?? 'Création en cours…'}</span>
                      </span>
                    </div>
                  ) : null}
                </div>
                {messages.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {EDIT_IDEAS.map((idea) => (
                      <button key={idea} type="button" onClick={() => askAi(idea)} className="cursor-pointer rounded-full border border-white/10 px-2.5 py-1 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">
                        {idea}
                      </button>
                    ))}
                  </div>
                ) : null}
                {docs.length || photos.length || docsBusy ? (
                  <div className="flex flex-wrap gap-1.5">
                    {docsBusy ? <span className="rounded-full bg-neon/15 px-2.5 py-1 text-[11px] font-semibold text-neon">Analyse de la pièce jointe…</span> : null}
                    {docs.map((d) => (
                      <span key={d.name} className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2.5 py-1 text-[11px] text-fg">
                        <Paperclip className="h-3 w-3 shrink-0 text-neon" />
                        <span className="truncate">{d.name}</span>
                        <button type="button" aria-label="Retirer la pièce jointe" onClick={() => setDocs((x) => x.filter((y) => y.name !== d.name))} className="cursor-pointer text-red-300">×</button>
                      </span>
                    ))}
                    {photos.length ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-fg-muted">{photos.length} photo{photos.length > 1 ? 's' : ''} jointe{photos.length > 1 ? 's' : ''}</span> : null}
                  </div>
                ) : null}
                <form
                  onSubmit={(e) => { e.preventDefault(); void askAi(prompt); }}
                  className="flex items-end gap-2"
                >
                  <label className={cn('grid h-[52px] w-12 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/10 text-fg-muted transition hover:border-neon/40 hover:text-fg', docsBusy && 'pointer-events-none opacity-50')} title="Joindre une vidéo, un document ou des photos (l’IA s’en inspire)" aria-label="Joindre un fichier">
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,.mov,.pdf,.docx,.txt,.md,.csv"
                      className="sr-only"
                      onChange={(e) => {
                        const all = Array.from(e.target.files ?? []);
                        const imgs = all.filter((f) => f.type.startsWith('image/'));
                        const rest = all.filter((f) => !f.type.startsWith('image/'));
                        if (imgs.length) { const dt = new DataTransfer(); imgs.forEach((f) => dt.items.add(f)); addPhotos(dt.files); }
                        if (rest.length) { const dt = new DataTransfer(); rest.forEach((f) => dt.items.add(f)); void addDocs(dt.files); }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askAi(prompt); } }}
                    rows={2}
                    placeholder={messages.length ? 'Ex. : mets le titre en jaune, plus rapide…' : 'Ex. : pub pour mon salon de coiffure, -30 % en mai…'}
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-fg outline-none focus:border-neon/50"
                  />
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={cn('grid h-[52px] w-12 shrink-0 cursor-pointer place-items-center rounded-xl border transition', listening ? 'animate-pulse border-rec bg-rec/20 text-rec' : 'border-white/10 text-fg-muted hover:text-fg')}
                    aria-label={listening ? 'Arrêter la dictée' : 'Parler à l’IA'}
                    title={listening ? 'Arrêter' : 'Dicter à l’IA'}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <Button type="submit" variant="gradient" className="h-[52px] rounded-xl" disabled={aiBusy || docsBusy || !prompt.trim()} aria-label="Envoyer à l’IA">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
                  ) : null}

                  {panel === 'add' ? (
                    <div className="space-y-6">
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">Scènes animées</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([
                            ['Texte qui claque', { block: 'kinetic', lines: ['Votre *message*', 'en grand'], style: 'stack' }],
                            ['Texte surligné', { block: 'kinetic', lines: ['L’offre', 'à ne pas *rater*'], style: 'highlight' }],
                            ['Mot géant en écho', { block: 'kinetic', lines: ['WOW', 'Votre phrase ici'], style: 'echo' }],
                            ['Barre de recherche', { block: 'search', query: brandName || project.brand || 'votre recherche', imgs: photos.length ? photos.slice(0, 6).map((_, k) => `photo:${k}`) : undefined }],
                            ['Bouton qui se transforme', { block: 'button', label: 'Réserver', final: (project.brand || brandName || 'À très vite').slice(0, 30), icon: 'calendar' }],
                            ['Conversation', { block: 'chat', ask: 'Vous êtes ouverts ce week-end ?', reply: 'Oui, on vous attend !' }],
                            ['Chiffre dans un anneau', { block: 'clock', big: '24 h', sub: 'pour vous répondre' }],
                            ['Atouts en cartes', { block: 'problem', title: 'Pourquoi *nous*', items: [{ icon: '★', text: 'Qualité' }, { icon: '✓', text: 'Rapidité' }, { icon: '♥', text: 'Proximité' }] }],
                            ['Liste qui défile', { block: 'list', title: 'Au programme', lines: ['Première ligne', 'Deuxième ligne', 'Troisième ligne'] }],
                            ['Signature finale', { block: 'cta', title: (project.brand || brandName) ? `${project.brand || brandName}, *on vous attend*` : 'À *très vite*', button: 'Découvrir' }]
                          ] as [string, Record<string, unknown>][]).map(([label, block]) => (
                            <button key={label} type="button" onClick={() => addBlock(block)} className="cursor-pointer rounded-xl border border-white/10 px-3 py-2.5 text-left text-sm text-white/80 transition hover:border-white/30 hover:text-white">{label}</button>
                          ))}
                        </div>
                        <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('place') as HTMLInputElement | null)?.value.trim(); if (v) void (async () => { const r = await fetch(`/api/motion/map?place=${encodeURIComponent(v)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null); addBlock({ block: 'map', place: v.slice(0, 60), ...(r?.geo ? { geo: r.geo } : {}) }); })(); }}>
                          <input name="place" placeholder="Carte animée : ville, quartier, adresse…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30" />
                          <button type="submit" className="shrink-0 cursor-pointer rounded-xl border border-white/15 px-3 text-sm">Ajouter</button>
                        </form>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">Vos photos et vidéos</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {photos.map((ph, i) => (
                            <button key={ph.url} type="button" title="Ajouter cette photo en scène (mise en scène tirée au sort)" onClick={() => addBlock({ block: 'photo', img: `photo:${i}`, imgs: photos.slice(0, 8).map((_, k) => `photo:${k}`) })} className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ph.url} alt={ph.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[10px] opacity-0 transition group-hover:opacity-100">+ Scène</span>
                            </button>
                          ))}
                          <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-white/15 text-white/50 hover:border-white/40 hover:text-white" title="Ajouter des photos">
                            <Images className="h-5 w-5" />
                            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                          </label>
                        </div>
                        {photos.length >= 3 ? <button type="button" onClick={() => addBlock({ block: 'masonry', imgs: photos.slice(0, 12).map((_, k) => `photo:${k}`), title: 'Tout pour vous' })} className="mt-1.5 w-full cursor-pointer rounded-xl border border-white/10 py-2 text-sm text-white/80 hover:border-white/30">Colonnes de photos qui défilent</button> : null}
                        <div className="mt-3 space-y-1.5">
                          {media.map((m, i) => (
                            <div key={m.url} className="flex items-center gap-2 text-sm">
                              <Film className="h-4 w-4 shrink-0 text-white/50" />
                              <span className="min-w-0 flex-1 truncate">{m.name}</span>
                              <button type="button" onClick={() => addBlock({ block: 'phone', img: `video:${i}`, hook: 'Regardez ça', caption: project.brand || brandName || undefined })} className="cursor-pointer rounded-full border border-white/15 px-2.5 py-1 text-xs">+ Téléphone 3D</button>
                              <button type="button" onClick={() => { setPendingVideo(m.file); router.push('/montage/nouveau'); }} className="cursor-pointer rounded-full border border-white/15 px-2.5 py-1 text-xs">Monter le clip</button>
                            </div>
                          ))}
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-2 text-sm text-white/60 hover:border-white/40 hover:text-white">
                            <Film className="h-4 w-4" /> Ajouter une vidéo
                            <input type="file" accept="video/*,.mov" className="sr-only" onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ''; }} />
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {panel === 'style' ? (
                    <div className="space-y-5">
                      <QuickBar project={project} onChange={setProject} canUse={(tr) => isPaid || FREE_LIMITS.transitions.includes(tr)} onLocked={proOnly} />
                      <AiPrefsPanel prefs={aiPrefs} onChange={setAiPrefs} />
                      <details className="group">
                        <summary className="cursor-pointer select-none text-sm font-medium text-white/70 hover:text-white">Réglages avancés (fond, couleurs, musique, scènes…)</summary>
                        <div className="mt-4 space-y-5">
              <div className="space-y-5">
                <Field label="Format">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([['9:16', 'TikTok / Reels'], ['1:1', 'Carré'], ['16:9', 'YouTube']] as const).map(([f, l]) => (
                      <Choice key={f} active={project.format === f} onClick={() => setProject((p) => ({ ...p, format: f }))}>
                        <span className="block font-bold">{f}</span>
                        <span className="text-[10px] opacity-70">{l}</span>
                      </Choice>
                    ))}
                  </div>
                </Field>
                <Field label="Fond animé (qualité cinéma)">
                  <div className="grid grid-cols-4 gap-1.5">
                    <button type="button" onClick={() => setProject((p) => ({ ...p, theme: { ...p.theme, backdrop: undefined } }))} className={cn('cursor-pointer rounded-lg border p-1 text-[10px] transition', !project.theme.backdrop ? 'border-neon text-neon' : 'border-white/10 text-fg-muted hover:border-neon/40')}>
                      <span className="mb-1 grid aspect-[9/16] w-full place-items-center rounded-md bg-white/[0.04] text-base">∅</span>
                      Classique
                    </button>
                    {BACKDROPS.filter((k) => k !== 'custom' || project.theme.backdrop?.kind === 'custom').map((k) => (
                      <button key={k} type="button" onClick={() => setProject((p) => ({ ...p, theme: { ...p.theme, backdrop: { ...(p.theme.backdrop?.kind === k ? p.theme.backdrop : {}), kind: k, glsl: k === 'custom' ? p.theme.backdrop?.glsl : undefined } } }))} className={cn('cursor-pointer rounded-lg border p-1 text-[10px] transition', project.theme.backdrop?.kind === k ? 'border-neon text-neon' : 'border-white/10 text-fg-muted hover:border-neon/40')}>
                        <BackdropThumb kind={k} colors={project.theme.backdrop?.kind === k && project.theme.backdrop.colors?.length ? project.theme.backdrop.colors : undefined} theme={project.theme} glsl={k === 'custom' ? project.theme.backdrop?.glsl : undefined} />
                        {BACKDROP_LABELS[k]}
                      </button>
                    ))}
                  </div>
                  {project.theme.backdrop ? (
                    <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                      <div className="grid grid-cols-4 gap-2">
                        {[0, 1, 2, 3].map((i) => {
                          const bd = project.theme.backdrop!;
                          const def = [project.theme.primary, project.theme.primary, project.theme.accent, project.theme.accent];
                          const cols = bd.colors?.length ? [...bd.colors, ...def].slice(0, 4) : def;
                          return (
                            <label key={i} className="flex flex-col items-center gap-1 text-[10px] text-fg-muted">
                              <input type="color" value={cols[i]} onChange={(e) => setProject((p) => ({ ...p, theme: { ...p.theme, backdrop: { ...p.theme.backdrop!, colors: cols.map((c, j) => (j === i ? e.target.value : c)) } } }))} className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                              Couleur {i + 1}
                            </label>
                          );
                        })}
                      </div>
                      {([['speed', 'Vitesse', 0, 3, 1], ['intensity', 'Intensité', 0, 2, 1], ['scale', 'Échelle', 0.3, 3, 1]] as const).map(([key, label, min, max, def]) => (
                        <label key={key} className="flex items-center gap-2 text-xs text-fg-muted">
                          <span className="w-16">{label}</span>
                          <input type="range" min={min} max={max} step={0.05} value={project.theme.backdrop?.[key] ?? def} onChange={(e) => setProject((p) => ({ ...p, theme: { ...p.theme, backdrop: { ...p.theme.backdrop!, [key]: Number(e.target.value) } } }))} className="flex-1 accent-[var(--color-neon)]" />
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <form
                    className="mt-2 flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.currentTarget.elements.namedItem('bgwish') as HTMLInputElement | null);
                      const wish = input?.value.trim();
                      if (!wish) return;
                      if (input) input.value = '';
                      setPanel('ia');
                      void askAi(`Change uniquement le fond animé de la pub (theme.backdrop) selon ce souhait : « ${wish} ». Choisis le fond le plus adapté avec ses couleurs et réglages, ou invente-le en "custom" (glsl) si aucun ne correspond. Ne modifie rien d’autre.`);
                    }}
                  >
                    <input name="bgwish" maxLength={200} placeholder="Décrivez votre fond : flammes, marbre noir et or, océan au coucher du soleil…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-neon/50" />
                    <button type="submit" disabled={aiBusy} className="izi-cta shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">Créer</button>
                  </form>
                </Field>
                <Field label="Ambiance">
                  <div className="grid grid-cols-5 gap-1.5">
                    {THEME_PRESETS.map((preset) => (
                      <button key={preset.name} type="button" onClick={() => setProject((p) => ({ ...p, theme: preset.theme }))} className="cursor-pointer rounded-lg border border-white/10 p-1 text-[10px] text-fg-muted hover:border-neon/40" title={preset.name}>
                        <span className="mb-1 flex h-7 overflow-hidden rounded-md" style={{ background: preset.theme.background }}>
                          <span className="m-auto h-3 w-3 rounded-full" style={{ background: preset.theme.primary }} />
                        </span>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Couleurs">
                  <div className="grid grid-cols-4 gap-2">
                    {([['primary', 'Principale'], ['accent', 'Accent'], ['background', 'Fond'], ['text', 'Texte']] as const).map(([key, label]) => (
                      <label key={key} className="flex flex-col items-center gap-1 text-[10px] text-fg-muted">
                        <input type="color" value={project.theme[key]} onChange={(e) => setProject((p) => ({ ...p, theme: { ...p.theme, [key]: e.target.value } }))} className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                        {label}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Effets">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([['neon', 'Néon'], ['clean', 'Épuré'], ['bold', 'Marqueur']] as const).map(([s, l]) => (
                      <Choice key={s} active={project.theme.style === s} onClick={() => setProject((p) => ({ ...p, theme: { ...p.theme, style: s } }))}>{l}</Choice>
                    ))}
                  </div>
                </Field>
                <Field label="Qualité d’export">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Choice active={quality === '1080p'} onClick={() => setQuality('1080p')}><span className="block font-bold">1080p</span><span className="text-[10px] opacity-70">Full HD · 20 Mb/s</span></Choice>
                    <Choice locked={!isPaid} active={quality === '1440p'} onClick={() => (isPaid ? setQuality('1440p') : proOnly())}><span className="block font-bold">1440p</span><span className="text-[10px] opacity-70">2K · 32 Mb/s</span></Choice>
                  </div>
                </Field>
                <Field label="Typographie cinétique">
                  <div className="grid grid-cols-5 gap-1.5">
                    {TEXT_ANIMS.map((a) => (
                      <Choice key={a} active={(project.theme.anim ?? 'rise') === a} onClick={() => setProject((p) => ({ ...p, theme: { ...p.theme, anim: a } }))}>{TEXT_ANIM_LABELS[a]}</Choice>
                    ))}
                  </div>
                </Field>
                <Field label="Texture signature">
                  <div className="grid grid-cols-4 gap-1.5">
                    {MOTIFS.map((m) => (
                      <Choice key={m} locked={!isPaid && !FREE_LIMITS.motifs.includes(m)} active={(project.theme.motif ?? 'particles') === m} onClick={() => (!isPaid && !FREE_LIMITS.motifs.includes(m) ? proOnly() : setProject((p) => ({ ...p, theme: { ...p.theme, motif: m } })))}>{MOTIF_LABELS[m]}</Choice>
                    ))}
                  </div>
                </Field>
                <Field label="Transitions">
                  <div className="grid grid-cols-5 gap-1.5">
                    {TRANSITIONS.map((tr) => (
                      <Choice key={tr} locked={!isPaid && !FREE_LIMITS.transitions.includes(tr)} active={(project.transition ?? 'flash') === tr} onClick={() => (!isPaid && !FREE_LIMITS.transitions.includes(tr) ? proOnly() : setProject((p) => ({ ...p, transition: tr })))}>{TRANSITION_LABELS[tr]}</Choice>
                    ))}
                  </div>
                </Field>
                <Field label="Musique (générée, libre de droits)">
                  <div className="grid grid-cols-4 gap-1.5">
                    {MUSIC.map((mu) => (
                      <Choice key={mu} locked={!isPaid && !FREE_LIMITS.music.includes(mu)} active={(project.sound?.music ?? 'none') === mu} onClick={() => { if (!isPaid && !FREE_LIMITS.music.includes(mu)) { proOnly(); return; } void playerRef.current?.unlock(); setSoundOn(mu !== 'none'); setProject((p) => ({ ...p, sound: mu === 'none' && !p.sound ? undefined : { bpm: p.sound?.bpm ?? 110, volume: p.sound?.volume, music: mu } })); }}>{MUSIC_LABELS[mu]}</Choice>
                    ))}
                  </div>
                  {project.sound ? (
                    <div className="mt-2 space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-fg-muted">
                        Tempo
                        <input type="range" min={60} max={170} step={1} value={project.sound.bpm} onChange={(e) => setProject((p) => (p.sound ? { ...p, sound: { ...p.sound, bpm: Number(e.target.value) } } : p))} className="flex-1 accent-[var(--color-neon)]" />
                        <span className="w-14 text-right font-code">{project.sound.bpm} bpm</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-fg-muted">
                        Volume
                        <input type="range" min={0} max={1} step={0.05} value={project.sound.volume ?? 0.6} onChange={(e) => setProject((p) => (p.sound ? { ...p, sound: { ...p.sound, volume: Number(e.target.value) } } : p))} className="flex-1 accent-[var(--color-neon)]" />
                        <span className="w-14 text-right font-code">{Math.round((project.sound.volume ?? 0.6) * 100)} %</span>
                      </label>
                    </div>
                  ) : null}
                </Field>
                <Field label="Nom de la marque">
                  <input value={project.brand} maxLength={40} onChange={(e) => setProject((p) => ({ ...p, brand: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-fg outline-none focus:border-neon/50" />
                </Field>
                <p className="text-[11px] text-fg-subtle">Logo, photos et vidéos : onglet « Médias ».</p>
              </div>
              <div className="mb-4">
                <CertificationPanel
              project={project}
              onFix={(next) => { setProject(next); timeRef.current = 0; setPlaying(true); setNotice('Pub corrigée ✓ Vérifiez le résultat dans l’aperçu.'); }}
              hasLogo={Boolean(assets.logo)}
              link={brand.link}
              notes={brand.notes}
              concept={concept?.creative_concept}
              loggedIn={loggedIn}
              onExport={exportVideo}
              exporting={exporting}
            />
              </div>
              <div className="space-y-3">
                <p className="text-xs text-fg-subtle">Astuce : mettez un mot entre *astérisques* pour le colorer.</p>
                {project.scenes.map((scene, i) => (
                  <div key={i} className={cn('rounded-xl border p-3', i === current ? 'border-neon/40 bg-neon/[0.04]' : 'border-white/10 bg-white/[0.02]')}>
                    <div className="mb-2 flex items-center justify-between">
                      <button type="button" className="cursor-pointer text-sm font-semibold text-fg" onClick={() => seek(project.scenes.slice(0, i).reduce((n, x) => n + x.duration, 0))}>
                        {i + 1}. {SCENE_LABELS[scene.type]}
                      </button>
                      <div className="flex items-center gap-1 text-fg-muted">
                        <IconBtn label="Monter" onClick={() => moveScene(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label="Descendre" onClick={() => moveScene(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn label="Supprimer" onClick={() => removeScene(i)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    </div>
                    <SceneFields scene={scene} media={media} photos={photos} onChange={(patch) => updateScene(i, patch)} />
                    <MagicFields magic={scene.magic ?? []} duration={scene.duration} onChange={(magic) => updateScene(i, { magic: magic.length ? magic : undefined })} />
                    <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                      Animation du texte
                      <select value={scene.anim ?? ''} onChange={(e) => updateScene(i, { anim: (e.target.value || undefined) as TextAnim | undefined })} className="flex-1 cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-fg outline-none">
                        <option value="">Par défaut</option>
                        {TEXT_ANIMS.map((x) => <option key={x} value={x}>{TEXT_ANIM_LABELS[x]}</option>)}
                      </select>
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                      Son d’entrée
                      <select value={scene.sfx ?? ''} onChange={(e) => updateScene(i, { sfx: (e.target.value || undefined) as Sfx | undefined })} className="flex-1 cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-fg outline-none">
                        <option value="">Automatique</option>
                        {SFX.map((x) => <option key={x} value={x}>{SFX_LABELS[x]}</option>)}
                      </select>
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                      Durée
                      <input type="range" min={1.5} max={scene.type === 'video' ? 15 : 8} step={0.5} value={scene.duration} onChange={(e) => updateScene(i, { duration: Number(e.target.value) })} className="flex-1 accent-[var(--color-neon)]" />
                      <span className="w-8 text-right font-code">{scene.duration}s</span>
                    </label>
                  </div>
                ))}
                </div>
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">Marque</p>
              <BrandPanel
                profile={brand}
                onChange={setBrand}
                loggedIn={loggedIn}
                onApplyPalette={(pal) => setProject((p) => {
                  const light = parseInt(pal.background.slice(1, 3), 16) * 0.299 + parseInt(pal.background.slice(3, 5), 16) * 0.587 + parseInt(pal.background.slice(5, 7), 16) * 0.114 > 160;
                  return { ...p, theme: { ...p.theme, primary: pal.primary, accent: pal.accent, background: pal.background, text: light ? '#101225' : '#ffffff' } };
                })}
                onImportSite={(a) => { void importSite(a); }}
                onAutoAd={autoAd}
                autoStep={autoStep}
                onCreateAd={(idea) => { setPanel('ia'); void askAi(`Crée cette pub pour ma marque : ${idea}`, { fresh: true }); }}
              />
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">Médias et documents</p>
              <div className="space-y-4">
                <div className="rounded-xl border border-neon/30 bg-neon/[0.05] p-3 text-sm text-fg">
                  <p className="font-semibold">Partez de vos propres images</p>
                  <p className="mt-1 text-xs text-fg-muted">Photos et vidéos de vos produits, de votre boutique, de votre équipe, de vos événements… L’IA les regarde et construit la pub animée autour.</p>
                </div>
                <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-neon/40 p-5 text-center text-sm text-fg hover:bg-neon/[0.04]">
                  <Images className="h-6 w-6 text-neon" />
                  <span className="font-semibold">Ajouter des photos</span>
                  <span className="text-[11px] text-fg-muted">JPG, PNG, WebP · plusieurs à la fois · {MAX_PHOTOS} maximum</span>
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                </label>
                {photos.length ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {photos.map((ph, i) => (
                      <div key={ph.url} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ph.url} alt={ph.name} className="h-full w-full object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">{i + 1}</span>
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                          <button type="button" title="Ajouter en scène" onClick={() => addBlock({ block: 'photo', img: `photo:${i}`, imgs: photos.slice(0, 8).map((_, k) => `photo:${k}`) })} className="flex-1 cursor-pointer py-0.5 text-[10px] text-white hover:text-neon">+ Scène</button>
                          <button type="button" title="Retirer" aria-label="Retirer la photo" onClick={() => removePhoto(i)} className="cursor-pointer px-1.5 py-0.5 text-[10px] text-red-300">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-neon/40 p-5 text-center text-sm text-fg hover:bg-neon/[0.04]">
                  <Film className="h-6 w-6 text-neon" />
                  <span className="font-semibold">Ajouter une vidéo</span>
                  <span className="text-[11px] text-fg-muted">MP4, MOV, WebM · 3 vidéos maximum</span>
                  <input type="file" accept="video/*,.mov" className="sr-only" onChange={(e) => { addVideo(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {media.map((m, i) => (
                  <div key={m.url} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-fg">Vidéo {i + 1} · {m.name}</p>
                      <span className="shrink-0 font-code text-xs text-fg-muted">{m.duration.toFixed(1)} s</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button type="button" onClick={() => addBlock({ block: 'photo', img: `video:${i}`, style: 'full' })} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">+ Plein écran</button>
                      <button type="button" onClick={() => addBlock({ block: 'phone', img: `video:${i}`, hook: 'Regardez ça' })} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">+ Dans un cadre</button>
                      <button type="button" onClick={() => removeVideo(i)} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-red-300 hover:border-red-400/40">Retirer</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPendingVideo(m.file); router.push('/montage/nouveau'); }}
                      className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-neon to-[#f6b48f] px-2 py-1.5 text-xs font-bold text-ink-950"
                    >
                      <Wand2 className="h-3.5 w-3.5" /> Modifier directement cette vidéo (ralentis, effets, rythme…)
                    </button>
                  </div>
                ))}
                {photos.length ? (
                  <Button variant="gradient" className="w-full rounded-xl font-bold" disabled={aiBusy} onClick={() => signatureAd()}>
                    <Wand2 className="h-4 w-4" /> Pub signature « grandes applis » avec mes photos
                  </Button>
                ) : null}
                {media.length || photos.length ? (
                  <Button variant="gradient" className="w-full rounded-xl font-bold" disabled={aiBusy} onClick={() => { setPanel('ia'); void askAi('Crée une pub professionnelle à partir de mes photos et vidéos : accroche forte, mes images en vedette avec des textes animés, mes points forts, et un appel à l’action', { fresh: true }); }}>
                    <Sparkles className="h-4 w-4" /> Créer une pub avec mes médias (IA)
                  </Button>
                ) : null}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg"><FileText className="h-4 w-4 text-neon" /> Documents d’inspiration</p>
                  <p className="mt-1 text-[11px] text-fg-muted">Brochure, menu, fiche produit, brief, charte, ou une vidéo qui vous plaît (rythme, couleurs, style)… L’IA s’en inspire (ton, produits, arguments) sans recopier. Confidentiel : emails, téléphones et numéros sont masqués, rien n’est enregistré, et ces documents ne sont envoyés qu’à des IA qui ne s’entraînent pas sur vos données.</p>
                  <label className={cn('mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-neon/40 px-3 py-2 text-xs font-semibold text-fg hover:bg-neon/[0.04]', docsBusy && 'pointer-events-none opacity-60')}>
                    {docsBusy ? 'Analyse…' : 'Ajouter un document ou une vidéo d’inspiration'}
                    <input type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,text/plain,video/*,.mov" multiple className="sr-only" onChange={(e) => { void addDocs(e.target.files); e.target.value = ''; }} />
                  </label>
                  {docs.length ? (
                    <ul className="mt-2 space-y-1">
                      {docs.map((d) => (
                        <li key={d.name} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-fg">
                          <span className="min-w-0 truncate">{d.name}</span>
                          <button type="button" aria-label="Retirer le document" onClick={() => setDocs((x) => x.filter((y) => y.name !== d.name))} className="cursor-pointer text-red-300">×</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Upload label="Logo" hint="scène finale" loaded={Boolean(assets.logo)} onFile={(f) => loadImage(f, 'logo')} onClear={() => setAssets((a) => ({ ...a, logo: null }))} />
                  <Upload label="Capture d’écran" hint="scène « capture produit »" loaded={Boolean(assets.screenshot)} onFile={(f) => loadImage(f, 'screenshot')} onClear={() => setAssets((a) => ({ ...a, screenshot: null }))} />
                </div>
                <p className="text-[11px] text-fg-subtle">Vos fichiers restent sur votre appareil : ils ne sont pas envoyés sur nos serveurs. Gardez cette page ouverte pendant votre création.</p>
              </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : null}
                </div>
                {watermark ? <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/40">Offre Free : petite mention « Réalisé avec izicut ». <Link href="/#pricing" className="text-white underline">Passer en Pro</Link></p> : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MAGIC_DEFAULTS: Record<MagicKind, Magic> = {
  notification: { kind: 'notification', text: 'Réservation confirmée', sub: 'À tout à l’heure !', emoji: '✅', at: 0.4 },
  sticker: { kind: 'sticker', text: 'Lien en bio', emoji: '👇', at: 0.5 },
  badge: { kind: 'badge', text: 'Nouveau', at: 0.4 },
  button: { kind: 'button', text: 'Réserver', at: 0.3 },
  emoji: { kind: 'emoji', text: '', emoji: '✨', at: 0.3 },
  review: { kind: 'review', text: 'Collez ici un vrai avis client', sub: 'Prénom', at: 0.4 },
  qr: { kind: 'qr', text: 'Scannez-moi', sub: 'monsite.fr', at: 0.4 }
};

/** Apparitions magiques d'une scène : ajouter, modifier, retirer. */
function MagicFields({ magic, duration, onChange }: { magic: Magic[]; duration: number; onChange: (m: Magic[]) => void }) {
  const set = (k: number, patch: Partial<Magic>) => onChange(magic.map((m, i) => (i === k ? { ...m, ...patch } : m)));
  return (
    <div className="mt-2 space-y-1.5">
      {magic.map((m, k) => (
        <div key={k} className="rounded-lg border border-neon/20 bg-neon/[0.04] p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-neon">
            ✨ {MAGIC_LABELS[m.kind]}
            <button type="button" onClick={() => onChange(magic.filter((_, i) => i !== k))} className="cursor-pointer text-fg-subtle hover:text-fg" aria-label="Retirer">×</button>
          </div>
          <div className="grid grid-cols-[1fr_48px] gap-1">
            <input className={inputCls} value={m.text} maxLength={60} onChange={(e) => set(k, { text: e.target.value || ' ' })} placeholder="Texte" />
            <input className={cn(inputCls, 'text-center')} value={m.emoji ?? ''} maxLength={8} onChange={(e) => set(k, { emoji: e.target.value || undefined })} placeholder="😀" aria-label="Emoji" />
          </div>
          {m.kind === 'notification' || m.kind === 'button' || m.kind === 'review' || m.kind === 'sticker' || m.kind === 'qr' ? (
            <input className={cn(inputCls, 'mt-1')} value={m.sub ?? ''} maxLength={60} onChange={(e) => set(k, { sub: e.target.value || undefined })} placeholder={m.kind === 'review' ? 'Prénom du client' : m.kind === 'qr' ? 'Lien encodé dans le QR code' : 'Sous-texte / lien (facultatif)'} />
          ) : null}
          <label className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
            Apparaît à
            <input type="range" min={0} max={Math.max(0, duration - 0.6)} step={0.1} value={m.at} onChange={(e) => set(k, { at: Number(e.target.value) })} className="flex-1 accent-[var(--color-neon)]" />
            <span className="w-8 text-right font-code">{m.at.toFixed(1)}s</span>
          </label>
        </div>
      ))}
      {magic.length < 3 ? (
        <select value="" onChange={(e) => { const k = e.target.value as MagicKind; if (k) onChange([...magic, { ...MAGIC_DEFAULTS[k], at: Math.min(MAGIC_DEFAULTS[k].at, Math.max(0, duration - 0.6)) }]); }} className="w-full cursor-pointer rounded-lg border border-dashed border-white/15 bg-transparent px-2 py-1 text-xs text-fg-muted outline-none">
          <option value="">+ Apparition magique…</option>
          {MAGIC_KINDS.map((k) => <option key={k} value={k}>{MAGIC_LABELS[k]}</option>)}
        </select>
      ) : null}
    </div>
  );
}


type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
};

function ConceptCard({ concept, onVoice, voiceBusy, hasVoice, gender, onGender, canVoice }: { concept: Concept; onVoice: () => void; voiceBusy: boolean; hasVoice: boolean; gender: 'femme' | 'homme'; onGender: (g: 'femme' | 'homme') => void; canVoice: boolean }) {
  const [open, setOpen] = useState(false);
  const ad = concept.art_direction;
  return (
    <div className="rounded-xl border border-neon/30 bg-neon/[0.05] p-3 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 font-semibold text-fg"><Clapperboard className="h-4 w-4 text-neon" /> Direction artistique</span>
        <span className="text-xs text-fg-muted">{open ? 'Masquer' : 'Voir'}</span>
      </button>
      <p className="mt-1.5 text-xs text-fg-muted">{concept.creative_concept}</p>
      {open ? (
        <div className="mt-3 space-y-2.5 text-xs">
          {concept.strategy ? (
            <div className="grid grid-cols-2 gap-1.5">
              {([['Valeur', concept.strategy.value], ['Cible', concept.strategy.audience], ['Émotion', concept.strategy.emotion], ['Levier', concept.strategy.lever]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.04] p-1.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{k}</p><p className="text-fg-muted">{v}</p></div>
              ))}
            </div>
          ) : null}
          <p><span className="font-semibold text-fg">Univers visuel : </span><span className="text-fg-muted">{ad.visual_theme}</span></p>
          {concept.signatures?.length ? (
            <div>
              <p className="font-semibold text-fg">Signatures de marque</p>
              <ul className="mt-0.5 space-y-0.5 text-fg-muted">{concept.signatures.map((x) => <li key={x}>• {x}</li>)}</ul>
            </div>
          ) : null}
          <p><span className="font-semibold text-fg">Musique : </span><span className="text-fg-muted">{ad.music_style}</span></p>
          {ad.brand_signature_sfx.length ? <p><span className="font-semibold text-fg">Sons signature : </span><span className="text-fg-muted">{ad.brand_signature_sfx.join(' · ')}</span></p> : null}
          {ad.color_palette.length ? (
            <div className="flex flex-wrap gap-1.5">
              {ad.color_palette.map((col) => <span key={col} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-fg-muted">{col}</span>)}
            </div>
          ) : null}
          {concept.voiceover?.length ? (
            <div className="space-y-1 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-fg">Voix-off</p>
              </div>
              {concept.voiceover.map((v, i) => (
                <p key={i} className="text-fg-muted"><span className="font-code text-[10px] text-neon">{v.time}</span> {v.text} {v.sfx ? <span className="text-fg-subtle">{v.sfx}</span> : null}</p>
              ))}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {(['femme', 'homme'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => onGender(g)} className={cn('cursor-pointer rounded-full border px-2 py-0.5 text-[10px]', gender === g ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>Voix {g}</button>
                ))}
                <button type="button" disabled={voiceBusy || !canVoice} onClick={onVoice} className="izi-cta ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold disabled:opacity-50">
                  {voiceBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />} {hasVoice ? 'Regénérer la voix-off' : 'Mettre la voix-off dans la vidéo'}
                </button>
              </div>
              <p className="text-[10px] text-fg-subtle">{canVoice ? 'Voix de synthèse calée sur chaque scène ; la musique baisse de 12 dB quand elle parle (ducking).' : 'Voix-off intégrée à la vidéo : offre Pro.'}</p>
            </div>
          ) : null}
          <div className="space-y-1.5 border-t border-white/10 pt-2">
            {concept.scenes.map((sc) => (
              <div key={sc.timeframe}>
                <p className="font-code text-[10px] font-semibold text-neon">{sc.timeframe}</p>
                <p className="text-fg">{sc.text_on_screen}</p>
                <p className="text-fg-muted">{sc.visual_motion_description}</p>
                {sc.motion_design_effects ? <p className="text-fg-subtle">✦ {sc.motion_design_effects}</p> : null}
                {sc.brand_assets_integration ? <p className="text-fg-subtle">◆ Marque : {sc.brand_assets_integration}</p> : null}
                <p className="text-fg-subtle">♪ {sc.sound_design}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Vignette animée d'un fond GPU (rendue une fois, aux couleurs de la marque). */
function BackdropThumb({ kind, colors, theme, glsl }: { kind: BackdropKind; colors?: string[]; theme: MotionProject['theme']; glsl?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${kind}|${(colors ?? []).join(',')}|${theme.primary}|${theme.accent}|${glsl ?? ''}`;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const fallback = [theme.primary, theme.primary, theme.accent, theme.accent];
    const ok = drawBackdrop(ctx, { kind, colors, glsl }, 9, 54, 96, { w: 108, h: 192 }, colors?.length ? [] : fallback);
    if (!ok) { ctx.fillStyle = theme.primary; ctx.fillRect(0, 0, 54, 96); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} width={54} height={96} className="mb-1 block aspect-[9/16] w-full rounded-md" />;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="cursor-pointer rounded-md p-1.5 hover:bg-white/10 hover:text-fg">
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-fg-muted">{label}</p>
      {children}
    </div>
  );
}

function Choice({ active, onClick, children, locked }: { active: boolean; onClick: () => void; children: ReactNode; locked?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('relative cursor-pointer rounded-lg border px-2 py-2 text-xs transition', active ? 'border-neon bg-neon/15 text-neon' : 'border-white/10 text-fg-muted hover:text-fg', locked && 'opacity-60')}>
      {children}
      {locked ? <Lock className="absolute right-1 top-1 h-2.5 w-2.5" aria-label="Pro" /> : null}
    </button>
  );
}

function Upload({ label, hint, loaded, onFile, onClear }: { label: string; hint: string; loaded: boolean; onFile: (f: File | undefined) => void; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 p-3 text-center">
      <label className="flex cursor-pointer flex-col items-center gap-1 text-xs text-fg-muted">
        <ImagePlus className={cn('h-5 w-5', loaded ? 'text-neon' : '')} />
        <span className="font-semibold text-fg">{label}</span>
        <span className="text-[10px]">{loaded ? 'Image ajoutée ✓' : hint}</span>
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {loaded ? <button type="button" onClick={onClear} className="mt-1 cursor-pointer text-[10px] text-fg-subtle underline">Retirer</button> : null}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-neon/50';

function SceneFields({ scene, media, photos, onChange }: { scene: Scene; media: Media[]; photos: Photo[]; onChange: (patch: Partial<Scene>) => void }) {
  switch (scene.type) {
    case 'photo':
      return (
        <div className="space-y-1.5">
          {photos.length === 0 ? <p className="text-xs text-amber-300">Ajoutez d’abord vos photos dans l’onglet « Médias ».</p> : (
            <div className="flex flex-wrap gap-1">
              {photos.map((ph, k) => (
                <button key={ph.url} type="button" onClick={() => onChange({ photo: k })} className={cn('h-10 w-10 cursor-pointer overflow-hidden rounded-md border-2', scene.photo === k ? 'border-neon' : 'border-transparent opacity-70')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <input className={inputCls} value={scene.caption ?? ''} maxLength={80} onChange={(e) => onChange({ caption: e.target.value || undefined })} placeholder="Texte sur la photo (facultatif)" />
          <div className="flex gap-1.5">
            {(['top', 'bottom'] as const).map((pos) => (
              <button key={pos} type="button" onClick={() => onChange({ captionPos: pos })} className={cn('flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs', (scene.captionPos ?? 'bottom') === pos ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>Texte en {pos === 'top' ? 'haut' : 'bas'}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(['full', 'frame'] as const).map((lay) => (
              <button key={lay} type="button" onClick={() => onChange({ layout: lay })} className={cn('flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs', scene.layout === lay ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>{lay === 'full' ? 'Plein écran' : 'Tirage photo'}</button>
            ))}
          </div>
        </div>
      );
    case 'free': {
      // Création libre de l'IA : on peut retoucher chaque texte ici, le reste se modifie en parlant à l'IA.
      const texts: { path: [number, number | null]; text: string }[] = [];
      scene.layers.forEach((l, i) => {
        if (l.kind === 'text') texts.push({ path: [i, null], text: l.text });
        if (l.kind === 'group') l.children.forEach((ch, j) => { if (ch.kind === 'text') texts.push({ path: [i, j], text: ch.text }); });
      });
      const setText = (path: [number, number | null], text: string) => onChange({
        layers: scene.layers.map((l, i) => {
          if (i !== path[0]) return l;
          if (path[1] === null && l.kind === 'text') return { ...l, text };
          if (path[1] !== null && l.kind === 'group') return { ...l, children: l.children.map((ch, j) => (j === path[1] && ch.kind === 'text' ? { ...ch, text } : ch)) };
          return l;
        })
      } as Partial<Scene>);
      return (
        <div className="space-y-1.5">
          <p className="text-[10px] text-fg-subtle">Création libre de l’IA : {scene.layers.length} calque{scene.layers.length > 1 ? 's' : ''} animé{scene.layers.length > 1 ? 's' : ''}{scene.name ? ` — « ${scene.name} »` : ''}. Retouchez les textes ici ; pour le reste (couleurs, mouvements, formes, style), dites-le à l’IA : « cette scène plus néon », « fais tourner le logo »…</p>
          {texts.map((t) => (
            <input key={t.path.join('-')} className={inputCls} value={t.text} maxLength={120} onChange={(e) => setText(t.path, e.target.value || ' ')} />
          ))}
        </div>
      );
    }
    case 'logo':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title} maxLength={32} onChange={(e) => onChange({ title: e.target.value })} placeholder="Nom de la marque" />
          <input className={inputCls} value={scene.subtitle ?? ''} maxLength={80} onChange={(e) => onChange({ subtitle: e.target.value || undefined })} placeholder="Signature (facultatif)" />
          <p className="text-[10px] text-fg-subtle">Votre logo (onglet Marque) apparaît en lumière ; sans logo, un signe lumineux le remplace.</p>
        </div>
      );
    case 'chips':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title ?? ''} maxLength={60} onChange={(e) => onChange({ title: e.target.value || undefined })} placeholder="Question au-dessus (facultatif)" />
          {scene.items.map((item, j) => (
            <div key={j} className="flex items-center gap-1.5">
              <button type="button" title="Le curseur clique ici" onClick={() => onChange({ pick: j })} className={cn('h-5 w-5 shrink-0 cursor-pointer rounded-full border text-[10px]', scene.pick === j ? 'border-neon bg-neon/20 text-neon' : 'border-white/20 text-fg-subtle')}>{scene.pick === j ? '●' : ''}</button>
              <input className={inputCls} value={item} maxLength={22} onChange={(e) => onChange({ items: scene.items.map((x, k) => (k === j ? e.target.value : x)) })} />
              {scene.items.length > 2 ? (
                <button type="button" aria-label="Retirer" onClick={() => onChange({ items: scene.items.filter((_, k) => k !== j), pick: Math.min(scene.pick, scene.items.length - 2) })} className="cursor-pointer px-1 text-fg-subtle hover:text-fg">×</button>
              ) : null}
            </div>
          ))}
          {scene.items.length < 5 ? <button type="button" onClick={() => onChange({ items: [...scene.items, 'Option'] })} className="cursor-pointer text-xs text-neon">+ Ajouter un bouton</button> : null}
          <p className="text-[10px] text-fg-subtle">● = le bouton sur lequel le curseur vient cliquer.</p>
        </div>
      );
    case 'prompt':
      return (
        <div className="space-y-1.5">
          <textarea className={cn(inputCls, 'resize-none')} rows={2} value={scene.text} maxLength={120} onChange={(e) => onChange({ text: e.target.value })} placeholder="La demande de votre client, tapée lettre par lettre" />
          <input className={inputCls} value={scene.label ?? ''} maxLength={24} onChange={(e) => onChange({ label: e.target.value || undefined })} placeholder="Libellé dans la barre (ex. votre marque)" />
        </div>
      );
    case 'mockup':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title} maxLength={60} onChange={(e) => onChange({ title: e.target.value })} placeholder="Titre de la page (*mot* = couleur)" />
          <input className={inputCls} value={(scene.nav ?? []).join(', ')} maxLength={70} onChange={(e) => onChange({ nav: e.target.value.split(',').map((x) => x.trim().slice(0, 14)).filter(Boolean).slice(0, 4) })} placeholder="Menu : Accueil, Offres, Contact" />
          <input className={inputCls} value={scene.button ?? ''} maxLength={24} onChange={(e) => onChange({ button: e.target.value || undefined })} placeholder="Bouton (facultatif)" />
          {photos.length ? (
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => onChange({ photo: undefined })} className={cn('h-10 cursor-pointer rounded-md border-2 px-2 text-[10px]', scene.photo === undefined ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>Dégradé</button>
              {photos.map((ph, k) => (
                <button key={ph.url} type="button" onClick={() => onChange({ photo: k })} className={cn('h-10 w-10 cursor-pointer overflow-hidden rounded-md border-2', scene.photo === k ? 'border-neon' : 'border-transparent opacity-70')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" checked={Boolean(scene.recolor)} onChange={(e) => onChange({ recolor: e.target.checked ? '#2f6bff' : undefined })} />
            Changement de couleur en direct
            {scene.recolor ? <input type="color" value={scene.recolor} onChange={(e) => onChange({ recolor: e.target.value })} className="ml-auto h-6 w-8 cursor-pointer rounded border-0 bg-transparent" /> : null}
          </label>
        </div>
      );
    case 'title':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title} maxLength={90} onChange={(e) => onChange({ title: e.target.value })} placeholder="Titre" />
          <input className={inputCls} value={scene.subtitle ?? ''} maxLength={120} onChange={(e) => onChange({ subtitle: e.target.value || undefined })} placeholder="Sous-titre (facultatif)" />
        </div>
      );
    case 'bullets':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title} maxLength={60} onChange={(e) => onChange({ title: e.target.value })} placeholder="Titre" />
          {scene.items.map((item, j) => (
            <div key={j} className="flex gap-1.5">
              <input className={inputCls} value={item} maxLength={60} onChange={(e) => onChange({ items: scene.items.map((x, k) => (k === j ? e.target.value : x)) })} />
              {scene.items.length > 1 ? (
                <button type="button" aria-label="Retirer" onClick={() => onChange({ items: scene.items.filter((_, k) => k !== j) })} className="cursor-pointer px-1 text-fg-subtle hover:text-fg">×</button>
              ) : null}
            </div>
          ))}
          {scene.items.length < 4 ? (
            <button type="button" onClick={() => onChange({ items: [...scene.items, 'Nouvel élément'] })} className="cursor-pointer text-xs text-neon">+ Ajouter un élément</button>
          ) : null}
        </div>
      );
    case 'stat':
      return (
        <div className="grid grid-cols-[60px_1fr_60px] gap-1.5">
          <input className={inputCls} value={scene.prefix ?? ''} maxLength={4} onChange={(e) => onChange({ prefix: e.target.value || undefined })} placeholder="+" />
          <input className={inputCls} type="number" value={scene.value} onChange={(e) => onChange({ value: Number(e.target.value) || 0 })} />
          <input className={inputCls} value={scene.suffix ?? ''} maxLength={6} onChange={(e) => onChange({ suffix: e.target.value || undefined })} placeholder="%" />
          <input className={cn(inputCls, 'col-span-3')} value={scene.label} maxLength={70} onChange={(e) => onChange({ label: e.target.value })} placeholder="Légende" />
        </div>
      );
    case 'screenshot':
      return <input className={inputCls} value={scene.caption} maxLength={80} onChange={(e) => onChange({ caption: e.target.value })} placeholder="Texte au-dessus de la capture" />;
    case 'quote':
      return (
        <div className="space-y-1.5">
          <textarea className={cn(inputCls, 'resize-none')} rows={2} value={scene.text} maxLength={160} onChange={(e) => onChange({ text: e.target.value })} />
          <input className={inputCls} value={scene.author ?? ''} maxLength={50} onChange={(e) => onChange({ author: e.target.value || undefined })} placeholder="Auteur (facultatif)" />
        </div>
      );
    case 'cta':
      return (
        <div className="space-y-1.5">
          <input className={inputCls} value={scene.title} maxLength={70} onChange={(e) => onChange({ title: e.target.value })} placeholder="Titre" />
          <input className={inputCls} value={scene.button} maxLength={30} onChange={(e) => onChange({ button: e.target.value })} placeholder="Texte du bouton" />
        </div>
      );
    case 'video': {
      const m = media[scene.media];
      return (
        <div className="space-y-1.5">
          {media.length === 0 ? <p className="text-xs text-amber-300">Ajoutez d’abord une vidéo dans l’onglet « Médias ».</p> : null}
          {media.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {media.map((mm, k) => (
                <button key={mm.url} type="button" onClick={() => onChange({ media: k })} className={cn('cursor-pointer rounded-lg border px-2 py-1 text-xs', scene.media === k ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>Vidéo {k + 1}</button>
              ))}
            </div>
          ) : null}
          <input className={inputCls} value={scene.caption ?? ''} maxLength={80} onChange={(e) => onChange({ caption: e.target.value || undefined })} placeholder="Texte sur la vidéo (facultatif)" />
          <div className="flex gap-1.5">
            {(['top', 'bottom'] as const).map((pos) => (
              <button key={pos} type="button" onClick={() => onChange({ captionPos: pos })} className={cn('flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs', (scene.captionPos ?? 'bottom') === pos ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>Texte en {pos === 'top' ? 'haut' : 'bas'}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(['full', 'frame'] as const).map((lay) => (
              <button key={lay} type="button" onClick={() => onChange({ layout: lay })} className={cn('flex-1 cursor-pointer rounded-lg border px-2 py-1 text-xs', scene.layout === lay ? 'border-neon text-neon' : 'border-white/10 text-fg-muted')}>{lay === 'full' ? 'Plein écran' : 'Dans un cadre'}</button>
            ))}
          </div>
          {m ? (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Départ
              <input type="range" min={0} max={Math.max(0, m.duration - 0.5)} step={0.1} value={Math.min(scene.from, m.duration)} onChange={(e) => onChange({ from: Number(e.target.value) })} className="flex-1 accent-[var(--color-neon)]" />
              <span className="w-10 text-right font-code">{scene.from.toFixed(1)}s</span>
            </label>
          ) : null}
        </div>
      );
    }
  }
}
