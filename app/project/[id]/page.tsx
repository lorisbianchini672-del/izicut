'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Download, Pencil, Play, Flame, Clock, Scissors, Plus, Sparkles, Copy, Check, X, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  createClipSignedUrl,
  fetchProjectDetail,
  type ProjectClip,
  type ProjectDetail
} from '@/lib/data/projects';
import { formatDuration, projectStatusTone } from '@/lib/format';
import { CLIP_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/types';
import { StepGuide, estimateRemainingSeconds, formatRemaining } from '@/components/guide/StepGuide';

/**
 * Page projet, version « simple » : une grille de clips façon galerie.
 * Chaque carte montre la vidéo finale, et deux gros boutons :
 * Télécharger (le fichier prêt) et Modifier (ouvre le studio).
 */
export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [clips, setClips] = useState<ProjectClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    fetchProjectDetail(supabase, projectId)
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          setLoadError('Projet introuvable : il a peut-être été supprimé.');
        } else {
          setProject(detail.project);
          setClips(
            [...detail.clips].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0))
          );
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger ce projet.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase, reloadTick]);

  const stillWorking =
    !!project &&
    (projectStatusTone(project.status) === 'working' ||
      projectStatusTone(project.status) === 'queued' ||
      clips.some((clip) => clip.status === 'queued' || clip.status === 'rendering'));

  useEffect(() => {
    if (!stillWorking) return;
    const timer = window.setInterval(() => setReloadTick((tick) => tick + 1), 5000);
    return () => window.clearInterval(timer);
  }, [stillWorking]);

  const selectedClip = clips[0] ?? null;

  // Chargement, erreur ou projet sans clip.
  // Chargement, erreur ou projet sans clip : on n'affiche pas le studio,
  // qui suppose un clip sélectionné (rendu, score, mots horodatés).
  if (loading || loadError || !selectedClip) {
    return (
      <div className="min-h-screen bg-background text-foreground px-4 pt-24 pb-16">
        <div className="container mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Mes projets
            </Link>
          </Button>

          {loading ? (
            <Card className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
              Chargement du projet…
            </Card>
          ) : null}

          {!loading && loadError ? (
            <Card className="rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">
              {loadError}
            </Card>
          ) : null}

          {!loading && !loadError && !selectedClip && project?.status === 'error' ? (
            <Card className="rounded-2xl border border-red-500/30 bg-red-500/5 p-10 text-center">
              <p className="mb-2 font-display text-lg font-semibold text-fg">Cette vidéo n’a pas pu être traitée</p>
              <p className="mx-auto mb-2 max-w-md text-sm text-red-300">
                {project.errorMessage ?? 'Une erreur est survenue pendant le traitement.'}
              </p>
              <p className="mb-6 text-xs text-muted-foreground">
                Vos minutes ont été recréditées automatiquement.
              </p>
              <div>
                <Button variant="gradient" className="font-bold" asChild>
                  <Link href="/upload">Essayer une autre vidéo</Link>
                </Button>
              </div>
            </Card>
          ) : null}

          {!loading && !loadError && !selectedClip && project && project.status !== 'error' ? (
            <Card className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
              {project.status === 'completed' ? (
                <>
                  <Scissors className="mx-auto mb-3 h-8 w-8 text-primary" />
                  <p className="mb-2 font-semibold">Aucun moment fort détecté</p>
                  <p className="text-sm text-muted-foreground">
                    L’IA n’a pas trouvé de passage assez percutant dans cette vidéo. Essayez une vidéo
                    où l’on parle davantage face caméra.
                  </p>
                </>
              ) : (
                <>
                  <StepGuide current={2} className="mb-6 text-left" />
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
                  <p className="mb-1 font-display text-lg font-semibold text-fg">
                    {PROJECT_STATUS_LABELS[project.status]}…
                  </p>
                  <p className="mb-3 text-2xl font-bold text-neon">
                    {formatRemaining(estimateRemainingSeconds(project.durationSeconds, project.createdAt))}
                  </p>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    L’IA écoute votre vidéo et choisit les meilleurs moments. Vous n’avez rien à faire :
                    cette page se met à jour toute seule, vous pouvez même la fermer et revenir plus tard.
                  </p>
                  <ol className="mx-auto mt-6 flex w-full max-w-sm justify-between text-[11px] text-fg-subtle">
                    {(['processing_audio', 'transcribing', 'analyzing', 'completed'] as const).map((step) => {
                      const order = ['draft', 'uploading', 'processing_audio', 'transcribing', 'analyzing', 'completed'];
                      const done = order.indexOf(project.status) >= order.indexOf(step);
                      return (
                        <li key={step} className={cn('flex flex-col items-center gap-1.5', done && 'text-neon')}>
                          <span className={cn('h-2 w-2 rounded-full', done ? 'bg-neon shadow-[0_0_10px_rgb(200_255_61/0.8)]' : 'bg-white/15')} />
                          {step === 'processing_audio' ? 'Vidéo' : step === 'transcribing' ? 'Paroles' : step === 'analyzing' ? 'Moments forts' : 'Montage'}
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    );
  }

  const readyCount = clips.filter((c) => c.status === 'ready' && c.renderedStoragePath).length;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 pt-24 pb-16">
      <div className="container mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Button variant="ghost" size="sm" className="-ml-2 rounded-xl" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Mes projets
              </Link>
            </Button>
            <h1 className="line-clamp-2 font-display text-2xl font-semibold tracking-tight">
              {project?.title ?? 'Projet'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {clips.length} clip{clips.length > 1 ? 's' : ''} trouvé{clips.length > 1 ? 's' : ''} par l’IA
              {' · '}
              {readyCount} prêt{readyCount > 1 ? 's' : ''} à publier
              {project && project.status !== 'completed' ? ` · ${PROJECT_STATUS_LABELS[project.status]}` : ''}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/upload">
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle vidéo
            </Link>
          </Button>
        </div>

        <StepGuide
          current={readyCount > 0 ? 3 : 2}
          detail={
            readyCount > 0 ? (
              <>
                Cliquez sur <b className="text-fg">Télécharger</b> pour publier un clip tel quel, ou sur{' '}
                <b className="text-fg">Modifier</b> pour changer le style, le texte ou la coupe.
              </>
            ) : (
              <>Montage de vos clips en cours : ils apparaissent ici un par un, sans recharger la page.</>
            )
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {clips.map((clip, index) => (
            <ClipCard key={clip.id} clip={clip} rank={index + 1} supabase={supabase} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  rank,
  supabase
}: {
  clip: ProjectClip;
  rank: number;
  supabase: ReturnType<typeof createClient>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ready = clip.status === 'ready' && Boolean(clip.renderedStoragePath);
  const working = clip.status === 'queued' || clip.status === 'rendering';
  const duration = Math.max(1, Math.round(clip.endTime - clip.startTime));

  useEffect(() => {
    let cancelled = false;
    if (!ready || !clip.renderedStoragePath) {
      setUrl(null);
      return;
    }
    createClipSignedUrl(supabase, clip.renderedStoragePath).then((signed) => {
      if (!cancelled) setUrl(signed ? `${signed}#t=0.5` : null);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, clip.renderedStoragePath, supabase]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const download = async () => {
    if (!clip.renderedStoragePath) return;
    setDownloading(true);
    try {
      const name = `${(clip.title || 'clip-izicut').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'clip-izicut'}.mp4`;
      const { data } = await supabase.storage
        .from('clips')
        .createSignedUrl(clip.renderedStoragePath, 600, { download: name });
      if (data?.signedUrl) window.location.href = data.signedUrl;
    } finally {
      window.setTimeout(() => setDownloading(false), 1500);
    }
  };

  return (
    <Card className="group overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-0">
      {showSocial ? <SocialPanel clipId={clip.id} onClose={() => setShowSocial(false)} /> : null}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
        {ready && url ? (
          <>
            <video
              ref={videoRef}
              src={url}
              playsInline
              preload="metadata"
              loop
              onClick={togglePlay}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              className="h-full w-full cursor-pointer object-cover"
            />
            {!playing ? (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Lire le clip"
                className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/10"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-xl">
                  <Play className="ml-1 h-6 w-6 fill-current" />
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
            {working ? (
              <>
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
                <p className="text-xs text-fg-muted">Montage en cours…</p>
              </>
            ) : (
              <>
                <Scissors className="h-7 w-7 text-fg-subtle" />
                <p className="text-xs text-fg-muted">{CLIP_STATUS_LABELS[clip.status]}</p>
              </>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">#{rank}</span>
          {clip.viralityScore != null ? (
            <span className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-neon">
              <Flame className="h-3 w-3" />
              {Math.round(clip.viralityScore)}
            </span>
          ) : null}
        </div>
        <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
          <Clock className="h-3 w-3" />
          {formatDuration(duration)}
        </span>
      </div>
      <div className="space-y-3 p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
          {clip.hookText || clip.title}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="gradient"
            size="sm"
            className={cn('rounded-xl font-bold', !ready && 'opacity-50')}
            disabled={!ready || downloading}
            onClick={download}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {downloading ? '…' : 'Télécharger'}
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" asChild>
            <Link href={`/editor/${clip.id}`}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Modifier
            </Link>
          </Button>
        </div>
        <Link
          href={`/montage/${clip.id}`}
          aria-disabled={!ready}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-neon to-[#3de0ff] px-3 py-2 text-xs font-bold text-ink-950 transition hover:opacity-90',
            !ready && 'pointer-events-none opacity-40'
          )}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Montage IA · effets & motion
        </Link>
        <button
          type="button"
          onClick={() => setShowSocial(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neon/30 bg-neon/[0.06] px-3 py-2 text-xs font-semibold text-neon transition hover:bg-neon/[0.12]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Texte à publier (IA)
        </button>
      </div>
    </Card>
  );
}

type SocialText = { description: string; hashtags: string[]; hooks: string[] };

/** Fenêtre « Texte à publier » : description, hashtags et accroches générés par l'IA. */
function SocialPanel({ clipId, onClose }: { clipId: string; onClose: () => void }) {
  const [data, setData] = useState<SocialText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/clips/${clipId}/social`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Génération impossible');
        if (!cancelled) setData(json as SocialText);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Génération impossible');
      });
    return () => {
      cancelled = true;
    };
  }, [clipId, tick]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* presse-papiers refusé : l'utilisateur peut sélectionner le texte */
    }
  };

  const all = data ? `${data.description}\n\n${data.hashtags.join(' ')}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-950 p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-neon" />
            Texte à publier
          </h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="cursor-pointer rounded-lg p-1.5 text-fg-muted hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!data && !error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-fg-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neon/20 border-t-neon" />
            L’IA écrit votre légende…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setTick((t) => t + 1)}>
              Réessayer
            </Button>
          </div>
        ) : null}

        {data ? (
          <div className="space-y-4">
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Légende</p>
              <p className="whitespace-pre-line rounded-xl bg-white/[0.04] p-3 text-sm leading-relaxed">{data.description}</p>
            </section>
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Hashtags</p>
              <p className="rounded-xl bg-white/[0.04] p-3 text-sm text-neon">{data.hashtags.join(' ')}</p>
            </section>
            <Button variant="gradient" className="w-full rounded-xl font-bold" onClick={() => copy('all', all)}>
              {copied === 'all' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === 'all' ? 'Copié !' : 'Copier légende + hashtags'}
            </Button>
            <section>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Autres accroches (texte sur la vidéo)</p>
              <ul className="space-y-2">
                {data.hooks.map((hook, i) => (
                  <li key={hook} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                    <span>{hook}</span>
                    <button type="button" onClick={() => copy(`h${i}`, hook)} className="shrink-0 cursor-pointer rounded-lg p-1.5 text-fg-muted hover:bg-white/10" aria-label="Copier l’accroche">
                      {copied === `h${i}` ? <Check className="h-4 w-4 text-neon" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <button type="button" onClick={() => setTick((t) => t + 1)} className="w-full cursor-pointer text-center text-xs text-fg-muted underline-offset-2 hover:underline">
              Proposer une autre version
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
