'use client';

/**
 * ============================================================
 * components/editor/VideoEditor.tsx — Studio d'édition d'un clip
 * ------------------------------------------------------------
 * Données RÉELLES (clip, transcription, offre) lues avec le client
 * navigateur : la RLS ne laisse voir que les clips de l'utilisateur.
 *
 * Aperçu en direct : la vidéo source (URL signée, bucket privé) avec
 * les sous-titres superposés, calculés comme au rendu. Le bouton
 * « Générer » envoie les réglages à POST /api/clips/[id]/render, qui
 * les rabote selon l'offre puis met le rendu en file.
 *
 * Les fonctions payantes sont visibles mais verrouillées (cadenas +
 * lien vers les offres) : l'utilisateur voit ce qu'il gagnerait.
 * ============================================================
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Crop,
  Crown,
  Download,
  Loader2,
  Lock,
  Pause,
  Play,
  Scissors,
  Shield,
  Sparkles,
  Type,
  Wand2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CAPTION_TEMPLATES,
  ENTITLEMENTS,
  FREE_ACTIVE_COLORS,
  PLAN_TIER_LABELS,
  hasFeature,
  overlaySignature,
  requiredTier,
  resolvePlanTier,
  sanitizeRenderSettings,
  type CaptionTemplate,
  type LockableFeature,
  type PlanTier,
  type RenderSettings
} from '@/lib/entitlements';
import { createClipSignedUrl } from '@/lib/data/projects';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CLIP_STATUS_LABELS, type ClipStatus, type TranscriptWord } from '@/types';

export type VideoEditorProps = {
  clipId: string;
};

type LoadedClip = {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  status: ClipStatus;
  renderedStoragePath: string | null;
  sourceDuration: number | null;
  storagePath: string | null;
};

type Tab = 'style' | 'montage' | 'cadrage' | 'texte' | 'export';

const PRO_COLORS = ['#FFD400', '#FF3B6B', '#22D3EE', '#4ADE80', '#A855F7', '#FFFFFF', '#FF8A00'];
const PREVIEW_WIDTH = 270;
const PREVIEW_SCALE = PREVIEW_WIDTH / 1080;

const PAGE_WORDS: Record<CaptionTemplate, number> = {
  hormozi: 3,
  clean: 6,
  karaoke_box: 4,
  neon: 3,
  bold_pop: 1,
  minimal: 7
};
const SIZE_FACTOR: Record<CaptionTemplate, number> = {
  hormozi: 1,
  clean: 0.8,
  karaoke_box: 0.95,
  neon: 1,
  bold_pop: 1.55,
  minimal: 0.6
};

type Row = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readWords(value: unknown): TranscriptWord[] {
  const list = Array.isArray((value as Row | null)?.words) ? ((value as Row).words as Row[]) : [];
  return list
    .map((w) => ({ word: String(w.word ?? ''), start: asNumber(w.start, -1), end: asNumber(w.end, -1) }))
    .filter((w) => w.word.trim() && w.start >= 0 && w.end >= 0);
}

type PageWord = TranscriptWord & { i: number };
type CaptionPage = { words: PageWord[]; start: number; end: number };

/** Page de sous-titres affichée à l'instant t (même logique que le rendu). */
function pageAt(words: TranscriptWord[], t: number, maxWords: number): CaptionPage | null {
  const pages: CaptionPage[] = [];
  let current: PageWord[] = [];
  words.forEach((w, i) => {
    const prev = current[current.length - 1];
    if (
      prev &&
      (current.length >= maxWords || w.start - prev.end > 0.6 || /[.!?…]$/.test(prev.word.trim()))
    ) {
      pages.push({ words: current, start: current[0].start, end: prev.end });
      current = [];
    }
    current.push({ ...w, i });
  });
  if (current.length) {
    pages.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
  }
  let page: CaptionPage | null = null;
  for (let p = 0; p < pages.length; p++) {
    if (pages[p].start > t) break;
    const next = pages[p + 1];
    page = t < Math.min(pages[p].end + 0.5, next ? next.start : Infinity) ? pages[p] : null;
  }
  return page;
}

// ---------- Petits composants ----------

function TierBadge({ tier }: { tier: PlanTier }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
        tier === 'agency'
          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
          : 'bg-gradient-to-r from-primary to-accent text-white'
      )}
    >
      <Crown className="h-3 w-3" />
      {PLAN_TIER_LABELS[tier]}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

/** Ligne d'option : verrouillée (cadenas + lien offres) si non incluse. */
function FeatureRow({
  title,
  description,
  feature,
  tier,
  children
}: {
  title: string;
  description: string;
  feature?: LockableFeature;
  tier: PlanTier;
  children: ReactNode;
}) {
  const locked = feature ? !hasFeature(tier, feature) : false;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border p-3.5',
        locked ? 'border-border/40 bg-muted/10' : 'border-border/50 bg-muted/20'
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          {title}
          {locked && feature ? <TierBadge tier={requiredTier(feature)} /> : null}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      </div>
      {locked ? (
        <Link
          href="/#pricing"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10"
        >
          <Lock className="h-3 w-3" /> Débloquer
        </Link>
      ) : (
        children
      )}
    </div>
  );
}

// ---------- Studio ----------

export function VideoEditor({ clipId }: VideoEditorProps) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clip, setClip] = useState<LoadedClip | null>(null);
  const [tier, setTier] = useState<PlanTier>('free');
  const [settings, setSettings] = useState<RenderSettings | null>(null);
  const [words, setWords] = useState<TranscriptWord[]>([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'live' | 'final'>('live');
  const [tab, setTab] = useState<Tab>('style');
  const [showSafeZones, setShowSafeZones] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Copie floutée de la vidéo (cadrage « fond flou »), synchronisée à la lecture. */
  const bgRef = useRef<HTMLVideoElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string; upgrade?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  const entitlements = ENTITLEMENTS[tier];

  // ---------- Chargement ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Connectez-vous pour éditer ce clip.');

      const { data: row, error } = await supabase
        .from('clips')
        .select(
          'id, title, start_time, end_time, status, style_config, transcript_json, rendered_storage_path, projects ( storage_path, duration_seconds )'
        )
        .eq('id', clipId)
        .maybeSingle();
      if (error || !row) throw new Error('Clip introuvable : il a peut-être été supprimé.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, subscription_status')
        .eq('id', user.id)
        .maybeSingle();
      const userTier = resolvePlanTier(profile?.plan, profile?.subscription_status);

      const r = row as Row;
      const project = (r.projects ?? null) as Row | null;
      const loaded: LoadedClip = {
        id: String(r.id),
        title: String(r.title ?? 'Clip sans titre'),
        startTime: asNumber(r.start_time),
        endTime: asNumber(r.end_time),
        status: (r.status as ClipStatus) ?? 'suggested',
        renderedStoragePath: typeof r.rendered_storage_path === 'string' ? r.rendered_storage_path : null,
        sourceDuration: project?.duration_seconds != null ? asNumber(project.duration_seconds) : null,
        storagePath: typeof project?.storage_path === 'string' ? project.storage_path : null
      };

      let source: string | null = null;
      if (loaded.storagePath) {
        const { data: signed } = await supabase.storage
          .from('raw-videos')
          .createSignedUrl(loaded.storagePath, 3600);
        source = signed?.signedUrl ?? null;
      }
      const rendered = loaded.renderedStoragePath
        ? await createClipSignedUrl(supabase, loaded.renderedStoragePath)
        : null;

      if (cancelled) return;
      setClip(loaded);
      setTier(userTier);
      setSettings(sanitizeRenderSettings(r.style_config, userTier).settings);
      setWords(readWords(r.transcript_json));
      setTitle(loaded.title);
      setStart(loaded.startTime);
      setEnd(loaded.endTime);
      setSourceUrl(source);
      setRenderedUrl(rendered);
      setPreviewMode(source ? 'live' : 'final');
      setLoading(false);
    })().catch((err: unknown) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger ce clip.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clipId, supabase]);

  // ---------- Suivi du rendu en cours ----------
  const status = clip?.status;
  useEffect(() => {
    if (status !== 'queued' && status !== 'rendering') return;
    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from('clips')
        .select('status, rendered_storage_path')
        .eq('id', clipId)
        .maybeSingle();
      if (!data) return;
      const next = data.status as ClipStatus;
      const path = typeof data.rendered_storage_path === 'string' ? data.rendered_storage_path : null;
      setClip((c) => (c ? { ...c, status: next, renderedStoragePath: path } : c));
      if (next === 'ready' && path) {
        setRenderedUrl(await createClipSignedUrl(supabase, path));
        setPreviewMode('final');
        setNotice({ kind: 'ok', text: 'Votre vidéo est prête : aperçu final affiché.' });
      } else if (next === 'failed') {
        setNotice({ kind: 'error', text: 'Le rendu a échoué. Modifiez un réglage puis relancez.' });
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, clipId, supabase]);

  // ---------- Lecture de l'aperçu en direct ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        if (v.currentTime >= end) {
          v.pause();
          bgRef.current?.pause();
          v.currentTime = start;
          setPlaying(false);
        }
        setT(Math.max(0, v.currentTime - start));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    const bg = bgRef.current;
    if (playing) {
      v.pause();
      bg?.pause();
      setPlaying(false);
    } else {
      if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
      if (bg) {
        bg.currentTime = v.currentTime;
        void bg.play().catch(() => undefined);
      }
      void v.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const update = useCallback(<K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setDirty(true);
  }, []);

  // ---------- Enregistrement + rendu ----------
  const boundsChanged = clip ? Math.abs(start - clip.startTime) > 0.01 || Math.abs(end - clip.endTime) > 0.01 : false;

  const save = async () => {
    if (!clip || !settings) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/clips/${clip.id}/render`, {
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
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        upgrade?: boolean;
        removed?: string[];
      };
      if (!res.ok) {
        setNotice({ kind: 'error', text: payload.error ?? 'Enregistrement impossible.', upgrade: payload.upgrade });
        return;
      }
      setClip({ ...clip, status: 'queued', startTime: start, endTime: end, title });
      setDirty(false);
      setNotice({
        kind: 'ok',
        text:
          payload.removed && payload.removed.length > 0
            ? 'Rendu lancé. Certaines options réservées aux offres supérieures ont été ignorées.'
            : 'Rendu lancé ! La vidéo finale apparaîtra ici automatiquement.',
        upgrade: Boolean(payload.removed && payload.removed.length > 0)
      });
    } catch {
      setNotice({ kind: 'error', text: 'Connexion impossible. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!clip?.renderedStoragePath) return;
    const url = await createClipSignedUrl(supabase, clip.renderedStoragePath);
    if (url) window.open(url, '_blank', 'noopener');
  };

  // ---------- États de chargement ----------
  if (loading || loadError || !clip || !settings) {
    return (
      <div className="min-h-screen bg-background px-4 pb-16 pt-24 text-foreground">
        <div className="container mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tableau de bord
            </Link>
          </Button>
          <Card
            className={cn(
              'rounded-2xl p-10 text-center text-sm',
              loadError ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'text-muted-foreground'
            )}
          >
            {loadError ?? 'Chargement du studio…'}
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Aperçu : sous-titres à l'instant t ----------
  const template = settings.template;
  const page = pageAt(words, t, PAGE_WORDS[template]);
  const activeIdx = page ? page.words.findIndex((w) => t >= w.start && t < w.end) : -1;
  const previewFont = Math.round(settings.font_size * SIZE_FACTOR[template] * PREVIEW_SCALE);
  const signature = overlaySignature(settings, tier);
  const rendering = clip.status === 'queued' || clip.status === 'rendering';
  const duration = Math.max(0, end - start);
  const hookText = settings.hook_title ? settings.hook_title_text || title : '';

  const shownWords: PageWord[] = page
    ? page.words
    : playing
      ? []
      : words.slice(0, PAGE_WORDS[template]).map((w, i) => ({ ...w, i }));

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'style', label: 'Style', icon: <Type className="h-3.5 w-3.5" /> },
    { id: 'montage', label: 'Montage IA', icon: <Wand2 className="h-3.5 w-3.5" /> },
    { id: 'cadrage', label: 'Cadrage', icon: <Crop className="h-3.5 w-3.5" /> },
    { id: 'texte', label: 'Texte', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: 'export', label: 'Découpe', icon: <Scissors className="h-3.5 w-3.5" /> }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pt-16 text-foreground">
      {/* ===== Barre supérieure ===== */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-card/60 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" className="h-9 rounded-xl" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
          <input
            type="text"
            value={title}
            maxLength={80}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="min-w-0 max-w-md truncate border-b border-transparent bg-transparent px-1 text-sm font-bold text-foreground hover:border-border focus:border-primary focus:outline-none"
          />
          {tier === 'free' ? (
            <span className="hidden rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground sm:inline">
              Free
            </span>
          ) : (
            <TierBadge tier={tier} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {clip.renderedStoragePath && clip.status === 'ready' ? (
            <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={download}>
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Télécharger</span>
            </Button>
          ) : null}
          <Button
            variant="gradient"
            size="sm"
            onClick={save}
            disabled={saving || rendering}
            className="glow-primary h-9 rounded-xl px-4 font-bold"
          >
            {saving || rendering ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {rendering ? CLIP_STATUS_LABELS[clip.status] : dirty ? 'Générer la vidéo' : 'Régénérer'}
          </Button>
        </div>
      </header>

      {/* ===== Bandeau offre Free ===== */}
      {tier === 'free' ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-primary/20 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 px-4 py-2 text-center text-xs">
          <Crown className="h-4 w-4 text-primary" />
          <span className="text-foreground">
            Offre Free : filigrane, 2 styles, 30 fps. Le <b>Pro</b> coupe les silences, ajoute zooms dynamiques, titre
            d’accroche, fond flou, audio studio et 60 fps.
          </span>
          <Link href="/#pricing" className="font-bold text-primary underline-offset-2 hover:underline">
            Voir les offres →
          </Link>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold',
            notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'
          )}
        >
          {notice.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {notice.text}
          {notice.upgrade ? (
            <Link href="/#pricing" className="underline">
              Passer à l’offre supérieure
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ===== Aperçu 9:16 ===== */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 bg-black/40 p-4 sm:p-6">
          <div className="flex gap-1 rounded-xl bg-muted/30 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPreviewMode('live')}
              disabled={!sourceUrl}
              className={cn(
                'rounded-lg px-3 py-1.5',
                previewMode === 'live' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                !sourceUrl && 'opacity-40'
              )}
            >
              Aperçu en direct
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('final')}
              disabled={!renderedUrl}
              className={cn(
                'rounded-lg px-3 py-1.5',
                previewMode === 'final' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                !renderedUrl && 'opacity-40'
              )}
            >
              Vidéo finale
            </button>
          </div>

          <div
            className="relative overflow-hidden rounded-[2.2rem] border-4 border-slate-700/80 bg-black shadow-2xl"
            style={{ width: PREVIEW_WIDTH, aspectRatio: '9 / 16' }}
          >
            {previewMode === 'final' && renderedUrl ? (
              <video src={renderedUrl} controls playsInline className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <>
                {sourceUrl ? (
                  <>
                    {settings.layout === 'blur_fit' ? (
                      <video
                        src={sourceUrl}
                        muted
                        playsInline
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-125 object-cover"
                        style={{ filter: 'blur(14px) brightness(0.55)' }}
                        ref={bgRef}
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime = videoRef.current?.currentTime ?? start;
                        }}
                      />
                    ) : null}
                    <video
                      ref={videoRef}
                      src={sourceUrl}
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        e.currentTarget.currentTime = start;
                      }}
                      className={cn(
                        'absolute inset-0 h-full w-full',
                        settings.layout === 'blur_fit' ? 'object-contain' : 'object-cover'
                      )}
                      style={{ objectPosition: `${settings.focus_x * 100}% 50%` }}
                    />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-slate-900 to-black p-6 text-center text-[11px] text-muted-foreground">
                    Aperçu vidéo indisponible pour une source en lien. Les sous-titres ci-dessous reflètent le rendu.
                  </div>
                )}

                {/* Barre de progression */}
                {settings.progress_bar ? (
                  <div
                    className="absolute left-0 top-0 h-[3px]"
                    style={{ width: `${Math.min(100, (t / Math.max(0.1, duration)) * 100)}%`, background: settings.active_color }}
                  />
                ) : null}

                {/* Signature / filigrane */}
                {signature ? (
                  <div className="absolute inset-x-0 flex justify-center" style={{ top: '14.5%' }}>
                    <span className="rounded-full bg-black/35 px-2 py-0.5 text-[9px] font-bold text-white/80">
                      {signature}
                    </span>
                  </div>
                ) : null}

                {/* Titre d'accroche (3 premières secondes) */}
                {hookText && t < 3.2 ? (
                  <div className="absolute inset-x-4 flex justify-center" style={{ top: '20%' }}>
                    <div
                      className="rounded-lg bg-white px-2.5 py-1.5 text-center text-[15px] font-black leading-tight text-neutral-900 shadow-xl"
                      style={{ borderBottom: `3px solid ${settings.active_color}` }}
                    >
                      {hookText}
                    </div>
                  </div>
                ) : null}

                {/* Sous-titres */}
                <div
                  className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 flex-wrap items-center justify-center gap-1 px-4"
                  style={{ top: `${settings.position * 100}%` }}
                >
                  {shownWords.map(
                    (w, idx) => {
                      const active = page ? idx === activeIdx : idx === 0;
                      const box = template === 'karaoke_box' && active;
                      return (
                        <span
                          key={`${w.i}-${idx}`}
                          style={{
                            fontSize: previewFont,
                            fontWeight: template === 'minimal' ? 600 : 900,
                            lineHeight: 1.1,
                            textTransform: settings.uppercase && template !== 'minimal' ? 'uppercase' : 'none',
                            color: box ? '#0A0A0A' : active ? settings.active_color : settings.text_color,
                            background: box ? settings.active_color : 'transparent',
                            padding: box ? '1px 4px' : undefined,
                            borderRadius: 4,
                            WebkitTextStroke:
                              template === 'hormozi' || template === 'bold_pop' ? '1px #000' : undefined,
                            textShadow:
                              template === 'neon' && active
                                ? `0 0 6px ${settings.active_color}, 0 0 14px ${settings.active_color}`
                                : '0 2px 6px rgba(0,0,0,0.8)'
                          }}
                        >
                          {w.word}
                        </span>
                      );
                    }
                  )}
                </div>

                {/* Safe zones */}
                {showSafeZones ? (
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-x-0 top-0 h-[14%] border-b border-red-500/50 bg-red-500/20" />
                    <div className="absolute inset-x-0 bottom-0 h-[22%] border-t border-red-500/50 bg-red-500/20" />
                    <div className="absolute bottom-0 right-0 top-0 w-[15%] border-l border-red-500/40 bg-red-500/10" />
                  </div>
                ) : null}

                {sourceUrl ? (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause' : 'Lecture'}
                    className={cn(
                      'absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-md transition',
                      playing && 'opacity-0 hover:opacity-100'
                    )}
                  >
                    {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6 fill-white" />}
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">
              {t.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
            <span>·</span>
            <span>{CLIP_STATUS_LABELS[clip.status]}</span>
            <span>·</span>
            <button
              type="button"
              onClick={() => setShowSafeZones((v) => !v)}
              className={cn('flex items-center gap-1', showSafeZones && 'text-red-400')}
            >
              <Shield className="h-3.5 w-3.5" /> Safe zones
            </button>
          </div>
          {settings.remove_silences && previewMode === 'live' ? (
            <p className="max-w-xs text-center text-[11px] text-muted-foreground">
              L’aperçu en direct garde les silences : ils sont coupés dans la vidéo finale.
            </p>
          ) : null}
        </div>

        {/* ===== Panneau de réglages ===== */}
        <div className="flex w-full shrink-0 flex-col border-l border-border/50 bg-card/40 backdrop-blur-xl lg:w-[460px]">
          <div className="flex gap-1 border-b border-border/50 bg-muted/20 p-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold transition-all',
                  tab === item.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* ---------- STYLE ---------- */}
            {tab === 'style' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {CAPTION_TEMPLATES.map((tpl) => {
                    const allowed = entitlements.templates.includes(tpl.key);
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => (allowed ? update('template', tpl.key) : undefined)}
                        className={cn(
                          'relative rounded-2xl border p-3 text-left transition-all',
                          settings.template === tpl.key
                            ? 'border-primary bg-primary/10'
                            : 'border-border/50 bg-muted/20 hover:border-primary/40',
                          !allowed && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex items-center justify-between text-xs font-black">
                          {tpl.label}
                          {!allowed ? <TierBadge tier="pro" /> : null}
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{tpl.description}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Couleur du mot prononcé
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {(entitlements.customColors ? PRO_COLORS : FREE_ACTIVE_COLORS).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => update('active_color', c)}
                        style={{ background: c }}
                        className={cn(
                          'h-8 w-8 rounded-xl border-2 transition-transform',
                          settings.active_color === c ? 'scale-110 border-white' : 'border-transparent'
                        )}
                      />
                    ))}
                    {entitlements.customColors ? (
                      <input
                        type="color"
                        value={settings.active_color}
                        onChange={(e) => update('active_color', e.target.value.toUpperCase())}
                        className="h-8 w-8 cursor-pointer rounded-lg border border-border"
                      />
                    ) : (
                      <Link href="/#pricing" className="flex items-center gap-1 text-[11px] font-bold text-primary">
                        <Lock className="h-3 w-3" /> Couleurs libres en Pro
                      </Link>
                    )}
                  </div>
                </div>

                <FeatureRow
                  title="Couleur du texte"
                  description="Adaptez les sous-titres à votre charte."
                  feature="customColors"
                  tier={tier}
                >
                  <input
                    type="color"
                    value={settings.text_color}
                    onChange={(e) => update('text_color', e.target.value.toUpperCase())}
                    className="h-8 w-8 cursor-pointer rounded-lg border border-border"
                  />
                </FeatureRow>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Taille</span>
                    <span className="font-mono">{settings.font_size}px</span>
                  </div>
                  <input
                    type="range"
                    min={48}
                    max={140}
                    value={settings.font_size}
                    onChange={(e) => update('font_size', Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Position verticale</span>
                    <span className="font-mono">{Math.round(settings.position * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    value={Math.round(settings.position * 100)}
                    onChange={(e) => update('position', Number(e.target.value) / 100)}
                    className="w-full accent-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Idéal : 65–75 %, au-dessus de la zone masquée par la description.
                  </p>
                </div>

                <FeatureRow title="Majuscules" description="Plus d’impact, lecture plus rapide." tier={tier}>
                  <Toggle checked={settings.uppercase} onChange={(v) => update('uppercase', v)} />
                </FeatureRow>
              </>
            ) : null}

            {/* ---------- MONTAGE IA ---------- */}
            {tab === 'montage' ? (
              <>
                <FeatureRow
                  title="Suppression des silences"
                  description="Coupe les blancs et hésitations > 0,45 s : rythme serré, meilleure rétention."
                  feature="removeSilences"
                  tier={tier}
                >
                  <Toggle checked={settings.remove_silences} onChange={(v) => update('remove_silences', v)} />
                </FeatureRow>
                <FeatureRow
                  title="Zooms dynamiques"
                  description="Punch-in automatique sur les débuts de phrase et les moments forts."
                  feature="autoZoom"
                  tier={tier}
                >
                  <Toggle checked={settings.auto_zoom} onChange={(v) => update('auto_zoom', v)} />
                </FeatureRow>
                <FeatureRow
                  title="Titre d’accroche animé"
                  description="Un titre choc les 3 premières secondes pour stopper le scroll."
                  feature="hookTitle"
                  tier={tier}
                >
                  <Toggle checked={settings.hook_title} onChange={(v) => update('hook_title', v)} />
                </FeatureRow>
                {settings.hook_title && hasFeature(tier, 'hookTitle') ? (
                  <input
                    type="text"
                    maxLength={80}
                    value={settings.hook_title_text}
                    placeholder={`Par défaut : « ${title} »`}
                    onChange={(e) => update('hook_title_text', e.target.value)}
                    className="w-full rounded-xl border border-border/50 bg-muted/30 p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                ) : null}
                <FeatureRow
                  title="Barre de progression"
                  description="Incite à regarder jusqu’au bout."
                  feature="progressBar"
                  tier={tier}
                >
                  <Toggle checked={settings.progress_bar} onChange={(v) => update('progress_bar', v)} />
                </FeatureRow>
                <FeatureRow
                  title="Audio studio"
                  description="Réduction du souffle, filtre des basses parasites, compression de la voix."
                  feature="enhanceAudio"
                  tier={tier}
                >
                  <Toggle checked={settings.enhance_audio} onChange={(v) => update('enhance_audio', v)} />
                </FeatureRow>
                <p className="text-[11px] text-muted-foreground">
                  Toutes les offres bénéficient d’un volume normalisé (−14 LUFS, standard TikTok/YouTube).
                </p>
              </>
            ) : null}

            {/* ---------- CADRAGE ---------- */}
            {tab === 'cadrage' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'crop', label: 'Plein écran', desc: 'Recadrage 9:16 sur le sujet', feature: undefined },
                      { id: 'blur_fit', label: 'Fond flou', desc: 'Vidéo entière, rien n’est coupé', feature: 'blurLayout' }
                    ] as const
                  ).map((opt) => {
                    const allowed = !opt.feature || hasFeature(tier, opt.feature);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => (allowed ? update('layout', opt.id) : undefined)}
                        className={cn(
                          'rounded-2xl border p-3 text-left',
                          settings.layout === opt.id ? 'border-primary bg-primary/10' : 'border-border/50 bg-muted/20',
                          !allowed && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex items-center justify-between text-xs font-black">
                          {opt.label}
                          {!allowed ? <TierBadge tier="pro" /> : null}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <FeatureRow
                  title="Recadrage manuel"
                  description="Choisissez la zone gardée (orateur à gauche, à droite…)."
                  feature="manualReframe"
                  tier={tier}
                >
                  <span className="font-mono text-xs">{Math.round(settings.focus_x * 100)}%</span>
                </FeatureRow>
                {hasFeature(tier, 'manualReframe') ? (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(settings.focus_x * 100)}
                    onChange={(e) => update('focus_x', Number(e.target.value) / 100)}
                    className="w-full accent-primary"
                  />
                ) : null}
              </>
            ) : null}

            {/* ---------- TEXTE ---------- */}
            {tab === 'texte' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Corriger les sous-titres
                  </label>
                  <span className="text-[10px] text-muted-foreground">{words.length} mots</span>
                </div>
                {boundsChanged ? (
                  <p className="rounded-xl bg-amber-500/10 p-2 text-[11px] text-amber-400">
                    Vous avez modifié la découpe : les sous-titres seront recalculés depuis la transcription.
                  </p>
                ) : null}
                <div className="flex max-h-[60vh] flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-border/40 bg-muted/20 p-3">
                  {words.map((w, i) => (
                    <input
                      key={i}
                      type="text"
                      value={w.word}
                      maxLength={60}
                      title={`${w.start.toFixed(1)}s`}
                      onChange={(e) => {
                        const value = e.target.value;
                        setWords((prev) => prev.map((x, j) => (j === i ? { ...x, word: value } : x)));
                        setDirty(true);
                      }}
                      style={{ width: `${Math.max(3, w.word.length + 1)}ch` }}
                      className="rounded-lg border border-border/40 bg-card/60 px-1.5 py-1 text-center text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* ---------- DÉCOUPE & EXPORT ---------- */}
            {tab === 'export' ? (
              <>
                {(
                  [
                    { label: 'Début', value: start, set: setStart },
                    { label: 'Fin', value: end, set: setEnd }
                  ] as const
                ).map((b) => (
                  <div key={b.label} className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {b.label} (secondes dans la vidéo source)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[-1, -0.25].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            b.set(Math.max(0, Math.round((b.value + d) * 100) / 100));
                            setDirty(true);
                          }}
                          className="rounded-lg bg-muted px-2 py-1 text-xs"
                        >
                          {d}s
                        </button>
                      ))}
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={clip.sourceDuration ?? undefined}
                        value={b.value}
                        onChange={(e) => {
                          b.set(Math.max(0, Number(e.target.value) || 0));
                          setDirty(true);
                        }}
                        className="w-24 rounded-lg border border-border/50 bg-muted/30 p-1.5 text-center font-mono text-xs"
                      />
                      {[0.25, 1].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            b.set(Math.round((b.value + d) * 100) / 100);
                            setDirty(true);
                          }}
                          className="rounded-lg bg-muted px-2 py-1 text-xs"
                        >
                          +{d}s
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className={cn('text-xs', duration < 5 || duration > 90 ? 'text-destructive' : 'text-muted-foreground')}>
                  Durée : <b>{duration.toFixed(1)} s</b> (entre 5 et 90 s). Idéal : 20–45 s.
                </p>

                <FeatureRow
                  title="60 images/seconde"
                  description="Mouvements et animations plus fluides."
                  feature="fps60"
                  tier={tier}
                >
                  <Toggle checked={settings.fps === 60} onChange={(v) => update('fps', v ? 60 : 30)} />
                </FeatureRow>

                <FeatureRow
                  title="Sans filigrane"
                  description={
                    entitlements.watermark
                      ? 'Vos vidéos Free portent « Réalisé avec IziCut ».'
                      : 'Vos vidéos sont livrées sans filigrane.'
                  }
                  feature="noWatermark"
                  tier={tier}
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </FeatureRow>

                <FeatureRow
                  title="Votre marque sur la vidéo"
                  description="Votre @pseudo ou nom de marque incrusté à la place du filigrane."
                  feature="brandText"
                  tier={tier}
                >
                  <span />
                </FeatureRow>
                {hasFeature(tier, 'brandText') ? (
                  <input
                    type="text"
                    maxLength={40}
                    value={settings.brand_text}
                    placeholder="@votremarque"
                    onChange={(e) => update('brand_text', e.target.value)}
                    className="w-full rounded-xl border border-border/50 bg-muted/30 p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                ) : null}

                <p className="text-[11px] text-muted-foreground">
                  Qualité d’encodage : {tier === 'free' ? 'standard' : 'maximale'} · Rendus par clip :{' '}
                  {entitlements.maxRendersPerClip === null ? 'illimités' : entitlements.maxRendersPerClip}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
