'use client';

/**
 * ============================================================
 * components/editor/ClipStudio.tsx — Éditeur de clip « façon CapCut »
 * ------------------------------------------------------------
 * Un écran, trois zones, zéro jargon :
 *   1. l'aperçu 9:16 (la vraie vidéo + les sous-titres en direct) ;
 *   2. la barre de temps (lecture + poignées pour couper début / fin) ;
 *   3. la barre d'outils en bas : Style · Couleur · Texte · Format ·
 *      Titre. Un outil ouvre un panneau simple, avec de gros boutons.
 * Le bouton « Exporter » en haut lance le montage ; une fois prêt, il
 * devient « Télécharger ».
 * ============================================================
 */

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Lock,
  Palette,
  Pause,
  Play,
  RectangleVertical,
  Scissors,
  Sparkles,
  Type,
  Undo2,
  Wand2,
  X
} from 'lucide-react';

import {
  CAPTION_TEMPLATES,
  ENTITLEMENTS,
  FREE_ACTIVE_COLORS,
  hasFeature,
  overlaySignature,
  resolvePlanTier,
  sanitizeRenderSettings,
  type CaptionTemplate,
  type PlanTier,
  type RenderSettings
} from '@/lib/entitlements';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ClipStatus, TranscriptWord } from '@/types';

type Row = Record<string, unknown>;
type Tool = 'style' | 'couleur' | 'texte' | 'format' | 'titre' | 'couper' | null;

const PRO_COLORS = ['#FFD400', '#22D3EE', '#4ADE80', '#FF3B6B', '#A855F7', '#FF8A00', '#FFFFFF'];
const TEXT_COLORS = ['#FFFFFF', '#FFD400', '#000000'];

const TEMPLATE_LOOK: Record<CaptionTemplate, { words: number; size: number }> = {
  hormozi: { words: 3, size: 1 },
  clean: { words: 6, size: 0.8 },
  karaoke_box: { words: 4, size: 0.95 },
  neon: { words: 3, size: 1 },
  bold_pop: { words: 1, size: 1.55 },
  minimal: { words: 7, size: 0.6 }
};

const num = (v: unknown, d = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const fmt = (s: number) => {
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
};

function readWords(value: unknown): TranscriptWord[] {
  const list = Array.isArray((value as Row | null)?.words)
    ? ((value as Row).words as Row[])
    : Array.isArray(value)
      ? (value as Row[])
      : [];
  return list
    .map((w) => ({ word: String(w.word ?? ''), start: num(w.start, -1), end: num(w.end, -1) }))
    .filter((w) => w.word.trim() && w.start >= 0 && w.end >= 0);
}

/** Groupe de mots affiché à l'instant t (même découpage que le montage). */
function captionAt(words: TranscriptWord[], t: number, maxWords: number) {
  const groups: { items: (TranscriptWord & { i: number })[]; start: number; end: number }[] = [];
  let cur: (TranscriptWord & { i: number })[] = [];
  words.forEach((w, i) => {
    const prev = cur[cur.length - 1];
    if (prev && (cur.length >= maxWords || w.start - prev.end > 0.8 || /[.!?…]$/.test(prev.word.trim()))) {
      groups.push({ items: cur, start: cur[0].start, end: prev.end });
      cur = [];
    }
    cur.push({ ...w, i });
  });
  if (cur.length) groups.push({ items: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  for (let g = 0; g < groups.length; g++) {
    const next = groups[g + 1];
    if (t >= groups[g].start && t < (next ? next.start : groups[g].end + 0.4)) return groups[g];
  }
  return null;
}

// ---------- Sous-titre d'aperçu ----------
function CaptionPreview({
  settings,
  items,
  activeIndex,
  scale
}: {
  settings: RenderSettings;
  items: { word: string; i: number }[];
  activeIndex: number;
  scale: number;
}) {
  const tpl = settings.template;
  const upper = settings.uppercase && tpl !== 'clean' && tpl !== 'minimal';
  const size = settings.font_size * TEMPLATE_LOOK[tpl].size * scale;
  const outline = Math.max(1, (tpl === 'clean' || tpl === 'minimal' ? 2.5 : 5) * scale * 1.4);
  const stroke = `-${outline}px -${outline}px 0 #000, ${outline}px -${outline}px 0 #000, -${outline}px ${outline}px 0 #000, ${outline}px ${outline}px 0 #000, 0 ${outline * 1.5}px ${outline * 2}px rgba(0,0,0,.6)`;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-[6%]"
      style={{ top: `${settings.position * 100}%`, transform: 'translateY(-50%)' }}
    >
      <p
        className="text-center leading-[1.15]"
        style={{
          fontSize: size,
          fontWeight: tpl === 'minimal' ? 700 : 900,
          textTransform: upper ? 'uppercase' : 'none',
          color: settings.text_color,
          textShadow: stroke,
          fontFamily: 'var(--font-geist), system-ui, sans-serif'
        }}
      >
        {items.map((w) => {
          const active = w.i === activeIndex;
          const style: React.CSSProperties = active
            ? tpl === 'karaoke_box'
              ? { background: settings.active_color, color: '#fff', borderRadius: size * 0.18, padding: `0 ${size * 0.12}px`, textShadow: 'none' }
              : tpl === 'neon'
                ? { color: settings.active_color, textShadow: `0 0 ${size * 0.25}px ${settings.active_color}, 0 0 ${size * 0.5}px ${settings.active_color}` }
                : { color: settings.active_color, display: 'inline-block', transform: tpl === 'clean' || tpl === 'minimal' ? undefined : 'scale(1.08)' }
            : {};
          return (
            <Fragment key={w.i}>
              <span style={style}>{w.word}</span>{' '}
            </Fragment>
          );
        })}
      </p>
    </div>
  );
}

// ---------- Petits blocs d'interface ----------
function ToolButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[56px] flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors',
        active ? 'bg-neon/15 text-neon' : 'text-fg-muted hover:bg-white/[0.05] hover:text-fg'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LockBadge() {
  return (
    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-neon">
      <Lock className="h-3 w-3" />
    </span>
  );
}

function Choice({
  selected,
  locked,
  onClick,
  children,
  className
}: {
  selected: boolean;
  locked?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative cursor-pointer rounded-xl border px-3 py-3 text-sm font-semibold transition-colors',
        selected ? 'border-neon bg-neon/10 text-fg' : 'border-line-strong bg-white/[0.03] text-fg-muted hover:text-fg',
        locked && 'opacity-60',
        className
      )}
    >
      {locked ? <LockBadge /> : null}
      {children}
    </button>
  );
}

// ---------- Studio ----------
export function ClipStudio({ clipId }: { clipId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [tier, setTier] = useState<PlanTier>('free');
  const [status, setStatus] = useState<ClipStatus>('suggested');
  const [renderedPath, setRenderedPath] = useState<string | null>(null);
  const [settings, setSettings] = useState<RenderSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<string>('');
  const [words, setWords] = useState<TranscriptWord[]>([]);
  const [title, setTitle] = useState('');
  const [clipStart, setClipStart] = useState(0); // début enregistré (source)
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [video, setVideo] = useState<{ url: string; offset: number; length: number } | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [showFinal, setShowFinal] = useState(false);

  const [tool, setTool] = useState<Tool>(null);
  // Sur ordinateur, on ouvre directement l'outil « Style » : pas de panneau vide.
  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setTool((t) => t ?? 'style');
  }, []);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0); // temps source courant
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string; upgrade?: boolean } | null>(null);
  const [editingWord, setEditingWord] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameWidth, setFrameWidth] = useState(300);

  const can = (f: Parameters<typeof hasFeature>[1]) => hasFeature(tier, f);
  const allowedTemplates = ENTITLEMENTS[tier].templates;

  // ---------- Chargement ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Connectez-vous pour modifier ce clip.');
      const { data: row } = await supabase
        .from('clips')
        .select('id, title, start_time, end_time, status, style_config, transcript_json, rendered_storage_path, projects ( storage_path, duration_seconds )')
        .eq('id', clipId)
        .maybeSingle();
      if (!row) throw new Error('Clip introuvable.');
      const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', user.id).maybeSingle();
      const userTier = resolvePlanTier(profile?.plan, profile?.subscription_status);
      const r = row as Row;
      const project = (r.projects ?? null) as Row | null;
      const s = num(r.start_time);
      const e = num(r.end_time);

      // Vidéo d'aperçu : fichier importé (source complète) ou aperçu brut
      // généré par le moteur pour les liens YouTube (± 3 s autour du clip).
      let v: { url: string; offset: number; length: number } | null = null;
      if (typeof project?.storage_path === 'string' && !project.storage_path.endsWith('.manifest.json')) {
        const { data } = await supabase.storage.from('raw-videos').createSignedUrl(project.storage_path, 3600);
        if (data?.signedUrl) v = { url: data.signedUrl, offset: 0, length: num(project.duration_seconds, e + 30) };
      }
      if (!v) {
        const { data } = await supabase.storage.from('clips').createSignedUrl(`${user.id}/${clipId}-preview.mp4`, 3600);
        if (data?.signedUrl) v = { url: data.signedUrl, offset: Math.max(0, s - 3), length: e - s + 6 };
      }
      const rendered = typeof r.rendered_storage_path === 'string' ? r.rendered_storage_path : null;
      let fin: string | null = null;
      if (rendered) {
        const { data } = await supabase.storage.from('clips').createSignedUrl(rendered, 3600);
        fin = data?.signedUrl ?? null;
      }
      if (cancelled) return;
      const st = sanitizeRenderSettings(r.style_config, userTier).settings;
      setUserId(user.id);
      setTier(userTier);
      setStatus((r.status as ClipStatus) ?? 'suggested');
      setRenderedPath(rendered);
      setSettings(st);
      setSavedSettings(JSON.stringify(st));
      setWords(readWords(r.transcript_json));
      setTitle(String(r.title ?? 'Mon clip'));
      setClipStart(s);
      setStart(s);
      setEnd(e);
      setNow(s);
      setVideo(v);
      setFinalUrl(fin);
      setShowFinal(!v && Boolean(fin));
      setLoading(false);
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Impossible de charger ce clip.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clipId, supabase]);

  // Largeur de l'aperçu (taille des sous-titres proportionnelle).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // ---------- Suivi du montage ----------
  useEffect(() => {
    if (status !== 'queued' && status !== 'rendering') return;
    const timer = window.setInterval(async () => {
      const { data } = await supabase.from('clips').select('status, rendered_storage_path').eq('id', clipId).maybeSingle();
      const { data: job } = await supabase
        .from('render_jobs')
        .select('progress')
        .eq('clip_id', clipId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (job) setProgress(num(job.progress));
      if (!data) return;
      const next = data.status as ClipStatus;
      setStatus(next);
      if (next === 'ready' && typeof data.rendered_storage_path === 'string') {
        setRenderedPath(data.rendered_storage_path);
        const { data: signed } = await supabase.storage.from('clips').createSignedUrl(data.rendered_storage_path, 3600);
        setFinalUrl(signed?.signedUrl ?? null);
        setShowFinal(true);
        setProgress(null);
        setToast({ kind: 'ok', text: 'Ta vidéo est prête ! Tu peux la télécharger.' });
      } else if (next === 'failed') {
        setProgress(null);
        setToast({ kind: 'error', text: 'Le montage a échoué. Réessaie, ou change un réglage.' });
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, clipId, supabase]);

  // ---------- Lecture ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && video) {
        const src = v.currentTime + video.offset;
        if (src >= end) {
          v.pause();
          bgRef.current?.pause();
          setPlaying(false);
          setNow(start);
          v.currentTime = Math.max(0, start - video.offset);
        } else setNow(src);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end, video]);

  const seek = (src: number) => {
    const v = videoRef.current;
    const clamped = Math.min(end, Math.max(start, src));
    setNow(clamped);
    if (v && video) {
      v.currentTime = Math.max(0, clamped - video.offset);
      if (bgRef.current) bgRef.current.currentTime = v.currentTime;
    }
  };

  const togglePlay = () => {
    if (showFinal) return;
    const v = videoRef.current;
    if (!v || !video) return;
    if (playing) {
      v.pause();
      bgRef.current?.pause();
      setPlaying(false);
      return;
    }
    const src = v.currentTime + video.offset;
    if (src < start || src >= end - 0.05) v.currentTime = Math.max(0, start - video.offset);
    if (bgRef.current) {
      bgRef.current.currentTime = v.currentTime;
      void bgRef.current.play().catch(() => undefined);
    }
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const update = useCallback(<K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }, []);

  const upsell = (text: string) => setToast({ kind: 'error', text, upgrade: true });

  // ---------- Export ----------
  const boundsChanged = Math.abs(start - clipStart) > 0.01;
  const dirty =
    !!settings &&
    (JSON.stringify(settings) !== savedSettings || boundsChanged || renderedPath === null || status === 'failed');

  const exportClip = async () => {
    if (!settings) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          start_time: start,
          end_time: end,
          title: title.trim() || undefined,
          ...(boundsChanged ? {} : { words })
        })
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; upgrade?: boolean };
      if (!res.ok) {
        setToast({ kind: 'error', text: payload.error ?? 'Export impossible.', upgrade: payload.upgrade });
        return;
      }
      setStatus('queued');
      setProgress(0);
      setSavedSettings(JSON.stringify(settings));
      setClipStart(start);
      setShowFinal(false);
    } catch {
      setToast({ kind: 'error', text: 'Connexion impossible. Réessaie.' });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!renderedPath) return;
    const { data } = await supabase.storage
      .from('clips')
      .createSignedUrl(renderedPath, 600, { download: `${(title || 'clip').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 60)}.mp4` });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  };

  // ---------- Rendu ----------
  if (loading || error || !settings) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-950 px-4 pt-16 text-fg">
        <div className="text-center">
          {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : <Loader2 className="mx-auto h-8 w-8 animate-spin text-neon" />}
          <Link href="/dashboard" className="text-sm text-fg-muted underline">
            Retour à mes projets
          </Link>
        </div>
      </div>
    );
  }

  const rendering = status === 'queued' || status === 'rendering';
  const ready = status === 'ready' && !!renderedPath;
  const scale = frameWidth / 1080;
  const rel = now - clipStart; // temps relatif aux mots
  const group = captionAt(words, rel, TEMPLATE_LOOK[settings.template].words);
  const activeIndex = group ? group.items.findIndex((w) => rel >= w.start && rel < w.end) : -1;
  const shown = group ? group.items : words.slice(0, TEMPLATE_LOOK[settings.template].words).map((w, i) => ({ ...w, i }));
  const signature = overlaySignature(settings, tier);
  const windowStart = video ? video.offset : start;
  const windowEnd = video ? video.offset + video.length : end;
  const pct = (s: number) => ((s - windowStart) / Math.max(0.1, windowEnd - windowStart)) * 100;
  const hook = settings.hook_title ? settings.hook_title_text || title : '';

  const PANEL: Record<Exclude<Tool, null>, ReactNode> = {
    style: (
      <div className="grid grid-cols-3 gap-2">
        {CAPTION_TEMPLATES.map((tpl) => {
          const locked = !allowedTemplates.includes(tpl.key);
          return (
            <Choice
              key={tpl.key}
              selected={settings.template === tpl.key}
              locked={locked}
              onClick={() => (locked ? upsell(`Le style « ${tpl.label} » fait partie de l'offre Pro.`) : update('template', tpl.key))}
              className="flex h-20 flex-col items-center justify-center gap-1"
            >
              <span
                className="text-base font-black"
                style={{
                  color: tpl.key === 'karaoke_box' ? '#fff' : settings.active_color,
                  background: tpl.key === 'karaoke_box' ? settings.active_color : undefined,
                  borderRadius: 6,
                  padding: '0 6px',
                  textShadow: tpl.key === 'neon' ? `0 0 10px ${settings.active_color}` : '0 2px 0 #000',
                  textTransform: tpl.key === 'clean' || tpl.key === 'minimal' ? 'none' : 'uppercase',
                  fontSize: tpl.key === 'bold_pop' ? 22 : tpl.key === 'minimal' ? 12 : 16
                }}
              >
                Wow
              </span>
              <span className="text-[11px] font-medium text-fg-muted">{tpl.label}</span>
            </Choice>
          );
        })}
      </div>
    ),
    couleur: (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-muted">Couleur du mot prononcé</p>
          <div className="flex flex-wrap gap-3">
            {PRO_COLORS.map((c) => {
              const locked = !can('customColors') && !FREE_ACTIVE_COLORS.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  onClick={() => (locked ? upsell('Toutes les couleurs sont incluses dans l\'offre Pro.') : update('active_color', c))}
                  className={cn('relative h-11 w-11 cursor-pointer rounded-full border-2', settings.active_color === c ? 'border-fg' : 'border-transparent', locked && 'opacity-50')}
                  style={{ background: c }}
                >
                  {settings.active_color === c ? <Check className="mx-auto h-5 w-5 text-black" /> : null}
                  {locked ? <Lock className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-black p-0.5 text-neon" /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-muted">Couleur des autres mots</p>
          <div className="flex gap-3">
            {TEXT_COLORS.map((c) => {
              const locked = !can('customColors') && c !== '#FFFFFF';
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Texte ${c}`}
                  onClick={() => (locked ? upsell('Les couleurs de texte sont incluses dans l\'offre Pro.') : update('text_color', c))}
                  className={cn('h-11 w-11 cursor-pointer rounded-full border-2', settings.text_color === c ? 'border-neon' : 'border-line-strong', locked && 'opacity-50')}
                  style={{ background: c }}
                />
              );
            })}
          </div>
        </div>
      </div>
    ),
    texte: (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-muted">Taille</p>
          <div className="grid grid-cols-3 gap-2">
            {([['Petit', 64], ['Moyen', 84], ['Grand', 110]] as const).map(([label, size]) => (
              <Choice key={label} selected={Math.abs(settings.font_size - size) < 10} onClick={() => update('font_size', size)}>
                {label}
              </Choice>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-muted">Position</p>
          <div className="grid grid-cols-3 gap-2">
            {([['En haut', 0.22], ['Au milieu', 0.5], ['En bas', 0.72]] as const).map(([label, pos]) => (
              <Choice key={label} selected={Math.abs(settings.position - pos) < 0.08} onClick={() => update('position', pos)}>
                {label}
              </Choice>
            ))}
          </div>
        </div>
        <Choice selected={settings.uppercase} onClick={() => update('uppercase', !settings.uppercase)} className="w-full">
          {settings.uppercase ? 'MAJUSCULES : oui' : 'Majuscules : non'}
        </Choice>
        <div>
          <p className="mb-2 text-xs font-semibold text-fg-muted">Corriger un mot (touche-le)</p>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-line p-2">
            {words.map((w, i) =>
              editingWord === i ? (
                <input
                  key={i}
                  autoFocus
                  defaultValue={w.word}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val) setWords((ws) => ws.map((x, j) => (j === i ? { ...x, word: val } : x)));
                    setEditingWord(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-24 rounded-md border border-neon bg-ink-900 px-1.5 py-0.5 text-xs text-fg outline-none"
                />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setEditingWord(i);
                    seek(clipStart + w.start);
                  }}
                  className={cn('cursor-pointer rounded-md px-1.5 py-0.5 text-xs', group?.items.some((g) => g.i === i) ? 'bg-neon/20 text-neon' : 'bg-white/[0.05] text-fg-muted hover:text-fg')}
                >
                  {w.word}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    ),
    format: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Choice selected={settings.layout === 'crop'} onClick={() => update('layout', 'crop')} className="flex flex-col items-center gap-2 py-4">
            <RectangleVertical className="h-7 w-7" />
            Plein écran
          </Choice>
          <Choice
            selected={settings.layout === 'blur_fit'}
            locked={!can('blurLayout')}
            onClick={() => (can('blurLayout') ? update('layout', 'blur_fit') : upsell('Le fond flou est inclus dans l\'offre Pro.'))}
            className="flex flex-col items-center gap-2 py-4"
          >
            <span className="grid h-7 w-5 place-items-center rounded-sm bg-white/20">
              <span className="h-3 w-5 rounded-[2px] bg-white/80" />
            </span>
            Vidéo entière + fond flou
          </Choice>
        </div>
        {settings.layout === 'crop' ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-fg-muted">Qui doit être au centre ?</p>
            <div className="grid grid-cols-3 gap-2">
              {([['Gauche', 0.2], ['Centre', 0.5], ['Droite', 0.8]] as const).map(([label, fx]) => (
                <Choice
                  key={label}
                  selected={Math.abs(settings.focus_x - fx) < 0.1}
                  locked={fx !== 0.5 && !can('manualReframe')}
                  onClick={() => (fx === 0.5 || can('manualReframe') ? update('focus_x', fx) : upsell('Le recadrage manuel est inclus dans l\'offre Pro.'))}
                >
                  {label}
                </Choice>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    ),
    titre: (
      <div className="space-y-3">
        <Choice
          selected={settings.hook_title}
          locked={!can('hookTitle')}
          onClick={() => (can('hookTitle') ? update('hook_title', !settings.hook_title) : upsell('Le titre d\'accroche est inclus dans l\'offre Pro.'))}
          className="w-full"
        >
          {settings.hook_title ? 'Titre en haut de la vidéo : affiché' : 'Afficher un titre en haut de la vidéo'}
        </Choice>
        {settings.hook_title ? (
          <input
            value={settings.hook_title_text || title}
            maxLength={80}
            onChange={(e) => update('hook_title_text', e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-ink-900 px-3 py-3 text-sm text-fg outline-none focus:border-neon"
            placeholder="Ex : Le secret que personne ne dit"
          />
        ) : null}
        <div>
          <p className="mb-1 text-xs font-semibold text-fg-muted">Nom du fichier</p>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-ink-900 px-3 py-3 text-sm text-fg outline-none focus:border-neon"
          />
        </div>
      </div>
    ),
    couper: (
      <div className="space-y-4">
        {(['start', 'end'] as const).map((which) => (
          <div key={which} className="flex items-center justify-between gap-3">
            <span className="w-20 text-sm text-fg-muted">{which === 'start' ? 'Début' : 'Fin'}</span>
            <div className="flex items-center gap-2">
              {[-1, -0.2, 0.2, 1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    if (which === 'start') setStart((s) => Math.min(end - 3, Math.max(windowStart, s + d)));
                    else setEnd((e) => Math.max(start + 3, Math.min(windowEnd, e + d)));
                  }}
                  className="cursor-pointer rounded-lg border border-line-strong px-2.5 py-2 text-xs font-semibold text-fg hover:border-neon"
                >
                  {d > 0 ? '+' : ''}
                  {d}s
                </button>
              ))}
            </div>
            <span className="w-12 text-right font-code text-sm text-fg">{fmt(which === 'start' ? start - windowStart : end - windowStart)}</span>
          </div>
        ))}
        <p className="text-xs text-fg-subtle">Durée du clip : {Math.round(end - start)} s · tu peux aussi glisser les poignées jaunes sur la barre.</p>
      </div>
    )
  };

  const TOOLS: { id: Exclude<Tool, null>; label: string; icon: ReactNode }[] = [
    { id: 'style', label: 'Style', icon: <Wand2 className="h-5 w-5" /> },
    { id: 'couleur', label: 'Couleur', icon: <Palette className="h-5 w-5" /> },
    { id: 'texte', label: 'Texte', icon: <Type className="h-5 w-5" /> },
    { id: 'format', label: 'Format', icon: <RectangleVertical className="h-5 w-5" /> },
    { id: 'titre', label: 'Titre', icon: <Sparkles className="h-5 w-5" /> },
    { id: 'couper', label: 'Couper', icon: <Scissors className="h-5 w-5" /> }
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-950 pt-16 text-fg">
      {/* Barre du haut */}
      <header className="flex h-14 items-center gap-3 border-b border-line px-3 sm:px-5">
        <Link href="/dashboard" aria-label="Retour" className="grid h-10 w-10 place-items-center rounded-xl text-fg-muted hover:bg-white/[0.05] hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold">{title}</p>
        {ready && !dirty ? (
          <button type="button" onClick={download} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neon px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-fg">
            <Download className="h-4 w-4" /> Télécharger
          </button>
        ) : (
          <button
            type="button"
            onClick={exportClip}
            disabled={busy || rendering}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neon px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-fg disabled:cursor-wait disabled:opacity-70"
          >
            {busy || rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {rendering ? `Montage… ${progress ? Math.round(progress) + ' %' : ''}` : 'Exporter'}
          </button>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:px-6 lg:py-6">
        {/* Aperçu */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-4">
          {finalUrl && video ? (
            <div className="flex rounded-full border border-line bg-white/[0.03] p-1 text-xs">
              <button type="button" onClick={() => setShowFinal(false)} className={cn('cursor-pointer rounded-full px-3 py-1.5', !showFinal ? 'bg-neon text-ink-950 font-semibold' : 'text-fg-muted')}>
                Modifier
              </button>
              <button type="button" onClick={() => { setShowFinal(true); videoRef.current?.pause(); setPlaying(false); }} className={cn('cursor-pointer rounded-full px-3 py-1.5', showFinal ? 'bg-neon text-ink-950 font-semibold' : 'text-fg-muted')}>
                Résultat final
              </button>
            </div>
          ) : null}

          <div
            ref={frameRef}
            onClick={togglePlay}
            className="relative aspect-[9/16] w-full max-w-[min(340px,calc((100dvh-22rem)*9/16))] cursor-pointer overflow-hidden rounded-[22px] border border-line-strong bg-black shadow-[0_30px_80px_-30px_rgb(200_255_61/0.25)]"
          >
            {showFinal && finalUrl ? (
              <video src={finalUrl} controls playsInline className="h-full w-full object-cover" onClick={(e) => e.stopPropagation()} />
            ) : video ? (
              <>
                {settings.layout === 'blur_fit' ? (
                  <video ref={bgRef} src={video.url} muted playsInline preload="auto" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75" />
                ) : null}
                <video
                  ref={videoRef}
                  src={video.url}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => ((e.target as HTMLVideoElement).currentTime = Math.max(0, start - video.offset))}
                  className={cn('absolute inset-0 h-full w-full', settings.layout === 'blur_fit' ? 'object-contain' : 'object-cover')}
                  style={settings.layout === 'crop' ? { objectPosition: `${settings.focus_x * 100}% 50%` } : undefined}
                />
                {hook ? (
                  <div className="absolute inset-x-0 top-[7%] flex justify-center px-[8%]">
                    <span className="rounded-lg bg-black/80 px-3 py-1.5 text-center font-bold text-white" style={{ fontSize: 58 * scale }}>
                      {hook}
                    </span>
                  </div>
                ) : null}
                <CaptionPreview settings={settings} items={shown} activeIndex={group ? group.items[activeIndex]?.i ?? -1 : -1} scale={scale} />
                {signature ? (
                  <span className="absolute inset-x-0 bottom-[3%] text-center font-semibold text-white/60" style={{ fontSize: 30 * scale }}>
                    {signature}
                  </span>
                ) : null}
                {!playing ? (
                  <span className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 backdrop-blur">
                    <Play className="ml-1 h-6 w-6 text-white" />
                  </span>
                ) : null}
              </>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-fg-muted">
                {rendering ? 'Préparation de l’aperçu…' : 'Aperçu disponible après le premier montage. Clique sur « Exporter ».'}
              </div>
            )}
            {rendering ? (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-xs text-fg">
                <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full bg-neon transition-all" style={{ width: `${Math.max(5, progress ?? 5)}%` }} />
                </div>
                Montage en cours… tu peux rester ou revenir plus tard.
              </div>
            ) : null}
          </div>

          {/* Barre de temps */}
          {video && !showFinal ? (
            <div className="w-full max-w-[420px]">
              <div className="mb-1 flex items-center justify-between font-code text-[11px] text-fg-muted">
                <button type="button" onClick={togglePlay} className="flex cursor-pointer items-center gap-1 text-fg">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {fmt(now - start)} / {fmt(end - start)}
                </button>
                {start !== clipStart ? (
                  <button type="button" onClick={() => { setStart(clipStart); }} className="flex cursor-pointer items-center gap-1 hover:text-fg">
                    <Undo2 className="h-3.5 w-3.5" /> Annuler la coupe
                  </button>
                ) : null}
              </div>
              <div
                className="relative h-12 cursor-pointer rounded-xl bg-white/[0.06]"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  seek(windowStart + ((e.clientX - r.left) / r.width) * (windowEnd - windowStart));
                }}
              >
                {/* zone gardée */}
                <div className="absolute inset-y-0 rounded-lg border-2 border-neon bg-neon/10" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
                {/* tête de lecture */}
                <div className="pointer-events-none absolute inset-y-[-4px] w-0.5 bg-white" style={{ left: `${pct(now)}%` }} />
                {/* poignées */}
                {(['start', 'end'] as const).map((which) => (
                  <input
                    key={which}
                    type="range"
                    aria-label={which === 'start' ? 'Début du clip' : 'Fin du clip'}
                    min={windowStart}
                    max={windowEnd}
                    step={0.1}
                    value={which === 'start' ? start : end}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (which === 'start') setStart(Math.min(end - 3, val));
                      else setEnd(Math.max(start + 3, val));
                    }}
                    className="izi-trim pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Outils */}
        <div className="sticky bottom-0 border-t border-line bg-ink-950/95 backdrop-blur-xl lg:static lg:rounded-2xl lg:border lg:bg-white/[0.02]">
          {toast ? (
            <div className={cn('mx-3 mt-3 flex items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-sm', toast.kind === 'ok' ? 'bg-neon/10 text-neon' : 'bg-red-500/10 text-red-300')}>
              <span>
                {toast.text}{' '}
                {toast.upgrade ? (
                  <Link href="/#pricing" className="font-semibold underline">
                    Voir l’offre Pro (7 €/mois)
                  </Link>
                ) : null}
              </span>
              <button type="button" onClick={() => setToast(null)} aria-label="Fermer" className="cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {tool ? (
            <div className="max-h-[45dvh] overflow-y-auto p-4 lg:max-h-none">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-sm font-semibold">{TOOLS.find((x) => x.id === tool)?.label}</p>
                <button type="button" onClick={() => setTool(null)} className="cursor-pointer rounded-lg bg-neon px-3 py-1.5 text-xs font-bold text-ink-950">
                  OK
                </button>
              </div>
              {PANEL[tool]}
            </div>
          ) : (
            <p className="hidden px-4 pt-4 text-sm text-fg-muted lg:block">Choisis un outil ci-dessous. L’aperçu change en direct ; clique sur « Exporter » quand c’est bon.</p>
          )}
          <nav className="flex gap-0.5 overflow-x-auto px-1 py-2 lg:grid lg:grid-cols-3 lg:gap-1 lg:px-2" aria-label="Outils">
            {TOOLS.map((x) => (
              <ToolButton key={x.id} icon={x.icon} label={x.label} active={tool === x.id} onClick={() => setTool(tool === x.id ? null : x.id)} />
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
