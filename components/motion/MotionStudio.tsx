'use client';

/**
 * Studio Motion — vidéos animées (motion design) créées et modifiées avec l'IA.
 * Aperçu en direct sur un canvas, export MP4/WebM directement dans le
 * navigateur (aucun serveur de rendu nécessaire).
 */
import Link from 'next/link';
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
  Wand2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { resolvePlanTier } from '@/lib/entitlements';
import { drawFrame, locate, type MotionAssets } from '@/lib/motion/render';
import {
  FORMAT_SIZE,
  SCENE_LABELS,
  TEMPLATES,
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

type Tab = 'ia' | 'scenes' | 'style';
type ChatMessage = { role: 'user' | 'ai'; text: string };

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

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];
  for (const c of candidates) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
  return { mime: '', ext: 'webm' };
}

export function MotionStudio() {
  const supabase = useMemo(() => createClient(), []);
  const [project, setProject] = useState<MotionProject>(TEMPLATES[0].project);
  const [assets, setAssets] = useState<MotionAssets>({});
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(true);
  const projectRef = useRef(project);
  const assetsRef = useRef(assets);
  const exportingRef = useRef(false);
  projectRef.current = project;
  assetsRef.current = assets;
  playingRef.current = playing;

  const duration = totalDuration(project);
  const size = FORMAT_SIZE[project.format];
  const watermark = !isPaid;

  // Projet sauvegardé dans ce navigateur + connexion / offre.
  useEffect(() => {
    const saved = loadSaved();
    if (saved?.scenes?.length) setProject(saved);
    supabase.auth.getUser().then(async ({ data }) => {
      setLoggedIn(Boolean(data.user));
      if (!data.user) return;
      const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', data.user.id).maybeSingle();
      setIsPaid(resolvePlanTier(profile?.plan, profile?.subscription_status) !== 'free');
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
    const family = motionFont.style.fontFamily;
    Promise.all([document.fonts.load(`900 40px ${family}`), document.fonts.load(`800 40px ${family}`)])
      .catch(() => undefined)
      .finally(() => setFontReady(true));
  }, []);

  const draw = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      drawFrame(ctx, projectRef.current, t, assetsRef.current, { fontFamily: motionFont.style.fontFamily, watermark });
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
        draw(timeRef.current);
        if (now - lastUi > 100) { lastUi = now; setTime(timeRef.current); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, fontReady, project.format]);

  const seek = (t: number) => {
    timeRef.current = Math.max(0, Math.min(duration - 0.01, t));
    setTime(timeRef.current);
    draw(timeRef.current);
  };

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
  const addScene = (type: SceneType) => setProject((p) => (p.scenes.length >= 8 ? p : { ...p, scenes: [...p.scenes, defaultScene(type)] }));

  const loadImage = (file: File | undefined, key: keyof MotionAssets) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice('Choisissez une image (PNG, JPG, WebP).'); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setAssets((a) => ({ ...a, [key]: img }));
    img.src = url;
  };

  const askAi = async (text: string) => {
    const value = text.trim();
    if (!value || aiBusy) return;
    if (!loggedIn) { setNotice('Connectez-vous (gratuit) pour utiliser l’IA du Studio.'); return; }
    setAiBusy(true);
    setPrompt('');
    setMessages((m) => [...m, { role: 'user', text: value }]);
    try {
      const res = await fetch('/api/motion/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: value, project: messages.length || project !== TEMPLATES[0].project ? project : undefined })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.project) throw new Error(json.error ?? 'L’IA n’a pas pu répondre.');
      replaceProject(json.project as MotionProject);
      setMessages((m) => [...m, { role: 'ai', text: `C’est fait : ${json.project.scenes.length} scènes, ${Math.round(totalDuration(json.project))} s. Demandez-moi une autre modification si besoin.` }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'ai', text: err instanceof Error ? err.message : 'Erreur de l’IA.' }]);
    } finally {
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
    const { mime, ext } = pickMime();
    exportingRef.current = true;
    setExporting(0);
    setPlaying(false);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 10_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const total = totalDuration(projectRef.current);
    draw(0);
    recorder.start(250);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = (now - t0) / 1000;
        if (t >= total + 0.15) { resolve(); return; }
        draw(Math.min(t, total - 0.001));
        setExporting(Math.min(99, Math.round((t / total) * 100)));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
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
          <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Studio Motion</h1>
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
          <div className="mb-3 flex w-full flex-wrap justify-center gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => { replaceProject(tpl.project); setMessages([]); }}
                className="cursor-pointer rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-fg-muted transition hover:border-neon/40 hover:text-fg"
                title={tpl.description}
              >
                {tpl.name}
              </button>
            ))}
          </div>
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]"
            style={{ aspectRatio: `${size.width} / ${size.height}`, maxWidth: `min(100%, calc(70vh * ${size.width / size.height}))` }}
          >
            <canvas ref={canvasRef} width={size.width} height={size.height} className="block h-full w-full max-w-full" onClick={() => setPlaying((p) => !p)} />
            {exporting !== null ? (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-xs text-white">
                Enregistrement de la vidéo… gardez cet onglet ouvert ({exporting} %)
              </div>
            ) : null}
          </div>
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
              <span className="w-16 shrink-0 text-right font-code text-xs text-fg-muted">{time.toFixed(1)} / {duration.toFixed(0)} s</span>
            </div>
          </div>
        </div>

        {/* ---------- Panneau d'édition ---------- */}
        <div className="flex min-h-[420px] flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="grid grid-cols-3 gap-1 border-b border-white/10 p-1.5">
            {([['ia', 'IA', <Wand2 key="i" className="h-4 w-4" />], ['scenes', 'Scènes', <Plus key="s" className="h-4 w-4" />], ['style', 'Style', <Palette key="p" className="h-4 w-4" />]] as [Tab, string, ReactNode][]).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn('flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition', tab === id ? 'bg-neon text-ink-950' : 'text-fg-muted hover:bg-white/[0.05]')}
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
                <div className="flex-1 space-y-2">
                  {messages.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-fg-muted">Décrivez la vidéo que vous voulez, ou partez d’une idée :</p>
                      {NEW_IDEAS.map((idea) => (
                        <button key={idea} type="button" onClick={() => askAi(idea)} className="block w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-fg transition hover:border-neon/40">
                          {idea}
                        </button>
                      ))}
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={cn('max-w-[90%] rounded-2xl px-3 py-2 text-sm', m.role === 'user' ? 'ml-auto bg-neon text-ink-950' : 'bg-white/[0.06] text-fg')}>
                        {m.text}
                      </div>
                    ))
                  )}
                  {aiBusy ? <div className="flex items-center gap-2 text-sm text-fg-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-neon/20 border-t-neon" /> L’IA prépare votre animation…</div> : null}
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
                  <Button type="submit" variant="gradient" className="h-[52px] rounded-xl" disabled={aiBusy || !prompt.trim()} aria-label="Envoyer à l’IA">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
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
                    <SceneFields scene={scene} onChange={(patch) => updateScene(i, patch)} />
                    <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                      Durée
                      <input type="range" min={1.5} max={8} step={0.5} value={scene.duration} onChange={(e) => updateScene(i, { duration: Number(e.target.value) })} className="flex-1 accent-[var(--color-neon)]" />
                      <span className="w-8 text-right font-code">{scene.duration}s</span>
                    </label>
                  </div>
                ))}
                {project.scenes.length < 8 ? (
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
                <Field label="Nom de la marque">
                  <input value={project.brand} maxLength={40} onChange={(e) => setProject((p) => ({ ...p, brand: e.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-fg outline-none focus:border-neon/50" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Upload label="Logo" hint="scène finale" loaded={Boolean(assets.logo)} onFile={(f) => loadImage(f, 'logo')} onClear={() => setAssets((a) => ({ ...a, logo: null }))} />
                  <Upload label="Capture d’écran" hint="scène produit" loaded={Boolean(assets.screenshot)} onFile={(f) => loadImage(f, 'screenshot')} onClear={() => setAssets((a) => ({ ...a, screenshot: null }))} />
                </div>
                <p className="text-[11px] text-fg-subtle">Vos images restent sur votre appareil : elles ne sont pas envoyées sur nos serveurs.</p>
              </div>
            ) : null}
          </div>
          {watermark ? (
            <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-fg-subtle">
              Offre Free : petite mention « Réalisé avec IziCut ». <Link href="/#pricing" className="text-neon underline">Passer en Pro</Link> pour la retirer.
            </p>
          ) : null}
          <button type="button" onClick={() => { replaceProject(TEMPLATES[0].project); setMessages([]); setAssets({}); }} className="flex cursor-pointer items-center justify-center gap-1.5 border-t border-white/10 py-2 text-xs text-fg-subtle hover:text-fg">
            <RotateCcw className="h-3 w-3" /> Repartir de zéro
          </button>
        </div>
      </div>
    </div>
  );
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

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('cursor-pointer rounded-lg border px-2 py-2 text-xs transition', active ? 'border-neon bg-neon/15 text-neon' : 'border-white/10 text-fg-muted hover:text-fg')}>
      {children}
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

function SceneFields({ scene, onChange }: { scene: Scene; onChange: (patch: Partial<Scene>) => void }) {
  switch (scene.type) {
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
  }
}
