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
import { Button } from '@/components/ui/button';
import type { BrandProfile } from '@/lib/brand/types';
import { FREE_LIMITS, FREE_MOTION_CREATIONS, clampToFree, type MotionQuota } from '@/lib/motion/plan';
import { buildCinematicAd } from '@/lib/motion/autoad';
import { resolvePlanTier } from '@/lib/entitlements';
import { drawFrame, locate, type MotionAssets } from '@/lib/motion/render';
import { BACKDROPS, BACKDROP_LABELS, drawBackdrop, type BackdropKind } from '@/lib/motion/gl-bg';
import { SoundPlayer, renderSoundtrack, type VoiceTrack } from '@/lib/motion/sound';
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
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const motionFont = Montserrat({ subsets: ['latin'], weight: ['800', '900'], display: 'swap' });
const STORAGE_KEY = 'izicut-motion-project-v1';
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
const EDIT_IDEAS = ['Rends-la plus dynamique', 'Passe en bleu et blanc', 'Ajoute une scène avec un chiffre clé', 'Passe au format 16:9 pour YouTube', 'Raccourcis à 10 secondes'];

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
  const [assets, setAssets] = useState<MotionAssets>({});
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
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [fontReady, setFontReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    const visit = (l: { kind: string; src?: string; children?: unknown[] }) => {
      if (l.kind === 'image' && typeof l.src === 'string' && l.src.startsWith('search:')) wanted.add(l.src);
      if (l.kind === 'group') (l.children as { kind: string; src?: string }[]).forEach(visit);
    };
    for (const sc of project.scenes) if (sc.type === 'free') sc.layers.forEach((l) => visit(l as { kind: string; src?: string; children?: unknown[] }));
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
  const scaleRef = useRef(1);
  scaleRef.current = renderScale;
  const size = FORMAT_SIZE[project.format];
  const watermark = !isPaid;

  // Projet sauvegardé dans ce navigateur + connexion / offre.
  useEffect(() => {
    const saved = loadSaved();
    if (saved?.scenes?.length) setProject(saved);
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
    const proj = projectRef.current;
    const { index, lt } = locate(proj, t);
    const scene = proj.scenes[index];
    list.forEach((m, i) => {
      const v = m.el;
      if (scene?.type === 'video' && scene.media === i) {
        const target = Math.min(Math.max(0, m.duration - 0.05), scene.from + lt);
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

  const replaceProject = (next: MotionProject) => {
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
      setNotice(`${logoImg ? 'Logo' : 'Aucun logo'} et ${imgs.length} visuel${imgs.length > 1 ? 's' : ''} importé${imgs.length > 1 ? 's' : ''} depuis votre site ✓ Demandez maintenant une pub à l’IA.`);
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
      // Secours seulement si l'IA est indisponible : une pub montée à partir des vraies données, jamais d'écran vide.
      if (!ok) {
        const quick = buildCinematicAd(b, { photos: photosNow.length, format: project.format });
        replaceProject(isPaid ? quick : clampToFree(quick));
        setNotice('L’IA est très sollicitée : voici une première version montée avec vos données. Relancez la création dans un instant pour une pub sur mesure.');
      }
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
    setMessages((m) => [...m, { role: 'user', text: value }]);
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
            ...(photos.length ? (photoNotesRef.current?.key === photoKey ? { photoNotes: photoNotesRef.current.notes } : { photoSheets: photoSheets(photos) }) : {}),
            brand: brand.company || brand.notes.trim() || brand.brief || brand.site || brand.link ? { ...brand, site: brand.site ?? null, link: brand.link || undefined } : undefined
          })
        });
        json = await res.json().catch(() => ({}));
        if (res.ok || res.status === 401 || res.status === 402 || res.status === 400) break;
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
      setMessages((m) => [...m, { role: 'ai', text: /Pro|gratuites|Connectez|Free/.test(msg) ? msg : 'Je n’ai pas réussi à terminer cette version, l’IA est très sollicitée. Réessayez dans un instant : votre pub actuelle est conservée.' }]);
      return false;
    } finally {
      window.clearInterval(stepTimer);
      setAiStatus(null);
      setAiBusy(false);
    }
  };

  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || exportingRef.current) return;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      setNotice('Votre navigateur ne permet pas l’export vidéo. Utilisez Chrome, Edge ou Safari récent sur ordinateur.');
      return;
    }
    const soundtrack = await renderSoundtrack(projectRef.current, voiceRef.current);
    const { mime, ext } = pickMime(mediaRef.current.length > 0 || Boolean(soundtrack));
    exportingRef.current = true;
    setExporting(0);
    setPlaying(false);
    playerRef.current?.stop();
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
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: scaleRef.current > 1 ? 32_000_000 : 20_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const total = totalDuration(projectRef.current);
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `izicut-motion-${projectRef.current.format.replace(':', 'x')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    exportingRef.current = false;
    setExporting(null);
    setNotice(ext === 'mp4' ? 'Vidéo exportée en MP4 ✓' : 'Vidéo exportée (WebM). Astuce : sur Safari ou Chrome récent, l’export se fait en MP4.');
  };

  const current = locate(project, time).index;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-3 py-1 text-xs font-semibold text-neon">
            <Sparkles className="h-3.5 w-3.5" /> Nouveau
          </p>
          <h1 className="izi-title-gradient font-display text-3xl font-semibold tracking-tight sm:text-5xl">Studio Motion</h1>
          {quota ? (
            <p className="izi-glass-pill mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-fg-muted">
              {quota.limit === null ? (
                <><Sparkles className="h-3.5 w-3.5 text-neon" /> Offre {quota.tier === 'agency' ? 'Agence' : 'Pro'} · pubs illimitées</>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-neon" /> Essai gratuit · {Math.max(0, quota.limit - quota.used)}/{quota.limit} pubs restantes
                  <Link href="/#pricing" className="font-semibold text-neon underline">Passer en Pro</Link>
                </>
              )}
            </p>
          ) : null}
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            Décrivez votre vidéo, l’IA crée l’animation. Modifiez-la en lui parlant, puis téléchargez-la.
          </p>
        </div>
        <Button variant="gradient" className="rounded-xl font-bold" disabled={exporting !== null} onClick={exportVideo}>
          <Download className="h-4 w-4" />
          {exporting !== null ? `Export… ${exporting} %` : 'Télécharger la vidéo'}
        </Button>
      </div>

      {notice ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-neon/30 bg-neon/[0.06] px-4 py-3 text-sm text-fg">
          <span>
            {notice}{' '}
            {notice.includes('Connectez-vous') ? <Link href="/login?next=/studio" className="font-semibold text-neon underline">Se connecter</Link> : null}
          </span>
          <button type="button" className="cursor-pointer text-fg-muted" onClick={() => setNotice(null)} aria-label="Fermer">×</button>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------- Aperçu ---------- */}
        <div className="flex min-w-0 flex-col items-center">

          <div
            className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]"
            style={{ aspectRatio: `${size.width} / ${size.height}`, maxWidth: `min(100%, calc(70vh * ${size.width / size.height}))` }}
          >
            <canvas ref={canvasRef} width={Math.round(size.width * renderScale)} height={Math.round(size.height * renderScale)} className="block h-full w-full max-w-full" onClick={() => setPlaying((p) => !p)} />
            {exporting !== null ? (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-xs text-white">
                Enregistrement de la vidéo… gardez cet onglet ouvert ({exporting} %)
              </div>
            ) : null}
          </div>
          {Object.keys(webCredits).length ? (
            <p className="mt-1.5 max-w-2xl text-center text-[10px] text-fg-subtle">Photos libres de droits : {[...new Set(Object.values(webCredits))].slice(0, 6).join(' · ')}</p>
          ) : null}
          {/* Lecture + scènes */}
          <div className="mt-3 w-full max-w-2xl">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPlaying((p) => !p)} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-neon text-ink-950" aria-label={playing ? 'Pause' : 'Lecture'}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <div className="relative flex h-10 flex-1 overflow-hidden rounded-xl bg-white/[0.04]">
                {project.scenes.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => seek(project.scenes.slice(0, i).reduce((n, x) => n + x.duration, 0))}
                    className={cn('h-full cursor-pointer border-r border-black/40 px-1 text-[10px] font-semibold transition', i === current ? 'bg-neon/25 text-neon' : 'text-fg-subtle hover:bg-white/[0.05]')}
                    style={{ width: `${(s.duration / duration) * 100}%` }}
                  >
                    <span className="block truncate">{SCENE_LABELS[s.type]}</span>
                  </button>
                ))}
                <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${(time / duration) * 100}%` }} />
              </div>
              <button
                type="button"
                onClick={() => { void playerRef.current?.unlock(); setSoundOn((v) => !v); }}
                className={cn('grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border transition', soundOn ? 'border-neon/50 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}
                aria-label={soundOn ? 'Couper le son' : 'Activer le son'}
                title={soundOn ? 'Couper le son' : 'Écouter la musique et les effets'}
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <span className="w-16 shrink-0 text-right font-code text-xs text-fg-muted">{time.toFixed(1)} / {duration.toFixed(0)} s</span>
            </div>
          </div>
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

        {/* ---------- Panneau d'édition ---------- */}
        <div className="flex min-h-[420px] flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="grid grid-cols-5 gap-1 border-b border-white/10 p-1.5">
            {([['ia', 'IA', <Wand2 key="i" className="h-4 w-4" />], ['marque', 'Marque', <Building2 key="b" className="h-4 w-4" />], ['medias', 'Médias', <Film key="m" className="h-4 w-4" />], ['scenes', 'Scènes', <Plus key="s" className="h-4 w-4" />], ['style', 'Style', <Palette key="p" className="h-4 w-4" />]] as [Tab, string, ReactNode][]).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn('flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold transition sm:flex-row sm:gap-1 sm:text-xs', tab === id ? 'bg-neon text-ink-950' : 'text-fg-muted hover:bg-white/[0.05]')}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'ia' ? (
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
                <form
                  onSubmit={(e) => { e.preventDefault(); void askAi(prompt); }}
                  className="flex items-end gap-2"
                >
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
                  <Button type="submit" variant="gradient" className="h-[52px] rounded-xl" disabled={aiBusy || !prompt.trim()} aria-label="Envoyer à l’IA">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ) : null}

            {tab === 'marque' ? (
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
                onCreateAd={(idea) => { setTab('ia'); void askAi(`Crée cette pub pour ma marque : ${idea}`, { fresh: true }); }}
              />
            ) : null}

            {tab === 'medias' ? (
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
                          <button type="button" title="Ajouter en scène" onClick={() => setProject((p) => (p.scenes.length >= MAX_SCENES ? p : { ...p, scenes: [...p.scenes, { type: 'photo', duration: 3, photo: i, layout: 'full' }] }))} className="flex-1 cursor-pointer py-0.5 text-[10px] text-white hover:text-neon">+ Scène</button>
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
                      <button type="button" onClick={() => setProject((p) => (p.scenes.length >= MAX_SCENES ? p : { ...p, scenes: [...p.scenes, { type: 'video', duration: Math.min(8, Math.max(2, m.duration)), media: i, from: 0, layout: 'full' }] }))} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">+ Plein écran</button>
                      <button type="button" onClick={() => setProject((p) => (p.scenes.length >= MAX_SCENES ? p : { ...p, scenes: [...p.scenes, { type: 'video', duration: Math.min(6, Math.max(2, m.duration)), media: i, from: 0, layout: 'frame', caption: 'Votre *produit*' }] }))} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">+ Dans un cadre</button>
                      <button type="button" onClick={() => removeVideo(i)} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-red-300 hover:border-red-400/40">Retirer</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPendingVideo(m.file); router.push('/montage/nouveau'); }}
                      className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-neon to-[#ffbe76] px-2 py-1.5 text-xs font-bold text-ink-950"
                    >
                      <Wand2 className="h-3.5 w-3.5" /> Modifier directement cette vidéo (ralentis, effets, rythme…)
                    </button>
                  </div>
                ))}
                {media.length || photos.length ? (
                  <Button variant="gradient" className="w-full rounded-xl font-bold" disabled={aiBusy} onClick={() => { setTab('ia'); void askAi('Crée une pub professionnelle à partir de mes photos et vidéos : accroche forte, mes images en vedette avec des textes animés, mes points forts, et un appel à l’action', { fresh: true }); }}>
                    <Sparkles className="h-4 w-4" /> Créer une pub avec mes médias (IA)
                  </Button>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Upload label="Logo" hint="scène finale" loaded={Boolean(assets.logo)} onFile={(f) => loadImage(f, 'logo')} onClear={() => setAssets((a) => ({ ...a, logo: null }))} />
                  <Upload label="Capture d’écran" hint="scène « capture produit »" loaded={Boolean(assets.screenshot)} onFile={(f) => loadImage(f, 'screenshot')} onClear={() => setAssets((a) => ({ ...a, screenshot: null }))} />
                </div>
                <p className="text-[11px] text-fg-subtle">Vos fichiers restent sur votre appareil : ils ne sont pas envoyés sur nos serveurs. Gardez cette page ouverte pendant votre création.</p>
              </div>
            ) : null}

            {tab === 'scenes' ? (
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
                {project.scenes.length < MAX_SCENES ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-fg-muted">Ajouter une scène</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(SCENE_LABELS) as SceneType[]).map((type) => (
                        <button key={type} type="button" onClick={() => addScene(type)} className="cursor-pointer rounded-lg border border-white/10 px-2 py-1.5 text-xs text-fg-muted hover:border-neon/40 hover:text-fg">
                          + {SCENE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === 'style' ? (
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
                      setTab('ia');
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
            ) : null}
          </div>
          {watermark ? (
            <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-fg-subtle">
              Offre Free : petite mention « Réalisé avec IziCut ». <Link href="/#pricing" className="text-neon underline">Passer en Pro</Link> pour la retirer.
            </p>
          ) : null}
          <button type="button" onClick={() => { replaceProject(BLANK_PROJECT); setMessages([]); setAssets({}); setPhotos([]); setConcept(null); setHooks([]); try { window.localStorage.removeItem(CONCEPT_KEY); } catch { /* rien */ } }} className="flex cursor-pointer items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs text-fg-subtle hover:text-fg">
            <RotateCcw className="h-3 w-3" /> Repartir de zéro
          </button>
        </div>
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
