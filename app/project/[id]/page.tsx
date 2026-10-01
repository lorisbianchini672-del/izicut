'use client';

import { useState, use, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  Play,
  Pause,
  Sparkles,
  Shield,
  Subtitles,
  Palette,
  Check,
  Share2,
  Copy,
  Scissors,
  Flame,
  Clock,
  Eye,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  createClipSignedUrl,
  fetchProjectDetail,
  type ProjectClip,
  type ProjectDetail
} from '@/lib/data/projects';
import { formatDuration, formatRelativeDate, projectStatusTone, type StatusTone } from '@/lib/format';
import { CLIP_STATUS_LABELS, PROJECT_STATUS_LABELS, type TranscriptWord } from '@/types';


const PRESETS = [
  { id: 'hormozi', name: 'Hormozi', activeColor: '#FACC15', bg: '#000000' },
  { id: 'viral_pink', name: 'Cyber Neon', activeColor: '#EC4899', bg: '#0F172A' },
  { id: 'clean_white', name: 'Minimal', activeColor: '#FFFFFF', bg: '#000000' },
  { id: 'emerald', name: 'Finance Pro', activeColor: '#34D399', bg: '#064E3B' },
];

/** Couleurs de badge par tonalité de statut (teintes du tableau de bord). */
const STATUS_BADGE_CLASSES: Record<StatusTone, string> = {
  ready: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  working: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  queued: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  error: 'bg-red-500/10 text-red-400 border border-red-500/20'
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [clips, setClips] = useState<ProjectClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  /**
   * Mots affichés par clip, indexés par identifiant. Ils viennent de
   * `clips.transcript_json` et sont RELATIFS au clip (0 = début du clip) :
   * c'est le worker qui les a recalés, pas l'interface.
   */
  const [words, setWords] = useState<Record<string, TranscriptWord[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(PRESETS[0]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Client navigateur : la RLS ne laisse voir que les projets de
  // l'utilisateur connecté, et les rendus ne sont accessibles que par
  // URL signée (le compartiment `clips` est privé).
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const detail = await fetchProjectDetail(supabase, projectId);
      if (cancelled) return;

      if (!detail) {
        setLoadError('Projet introuvable : il a peut-être été supprimé.');
        setLoading(false);
        return;
      }

      setProject(detail.project);
      setClips(detail.clips);
      setSelectedClipId(detail.clips[0]?.id ?? null);
      setWords(
        Object.fromEntries(detail.clips.map((clip) => [clip.id, clip.words]))
      );
      setLoading(false);
    };

    load().catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(
        error instanceof Error ? error.message : 'Impossible de charger ce projet.'
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const selectedClip =
    clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null;
  const selectedWords = selectedClip ? words[selectedClip.id] ?? [] : [];
  const selectedDuration = selectedClip
    ? Math.max(1, Math.round(selectedClip.endTime - selectedClip.startTime))
    : 0;
  const selectedTone = project ? projectStatusTone(project.status) : 'queued';
  /** Un clip n'est téléchargeable que si le worker a produit son rendu. */
  // `?.` obligatoire : ce calcul précède le retour anticipé « aucun clip »,
  // et un projet encore en analyse n'a pas de clip sélectionné.
  const clipIsReady =
    selectedClip?.status === 'ready' && Boolean(selectedClip?.renderedStoragePath);

  /**
   * Correction d'un mot : elle reste LOCALE. Le rendu a déjà été produit à
   * partir de la transcription ; réécrire le texte affiché ne change pas la
   * vidéo, et l'interface n'a aucun droit d'écriture sur `transcripts`.
   */
  const handleWordEdit = (index: number, newWord: string) => {
    if (!selectedClip) return;
    setWords((previous) => {
      const current = previous[selectedClip.id] ?? [];
      const next = [...current];
      next[index] = { ...next[index], word: newWord };
      return { ...previous, [selectedClip.id]: next };
    });
  };

  /** Téléchargement réel du rendu : URL signée courte, bucket privé. */
  const handleExport = async () => {
    if (!selectedClip?.renderedStoragePath) return;

    setIsExporting(true);
    setExportError(null);

    try {
      const signedUrl = await createClipSignedUrl(supabase, selectedClip.renderedStoragePath);
      if (!signedUrl) {
        throw new Error('Rendu indisponible : ce clip n’a pas encore été généré.');
      }
      window.open(signedUrl, '_blank', 'noopener');
      setExportSuccess(true);
      window.setTimeout(() => setExportSuccess(false), 4000);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : 'Téléchargement impossible.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Chargement, erreur ou projet sans clip : on n'affiche pas le studio,
  // qui suppose un clip sélectionné (rendu, score, mots horodatés).
  if (loading || loadError || !selectedClip) {
    return (
      <div className="min-h-screen bg-background text-foreground px-4 pt-24 pb-16">
        <div className="container mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tableau de bord
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

          {!loading && !loadError && !selectedClip ? (
            <Card className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
              <Scissors className="mx-auto mb-3 h-8 w-8 text-primary" />
              <p className="mb-2 font-semibold">Aucun clip pour ce projet</p>
              <p className="text-sm text-muted-foreground">
                Le traitement est peut-être encore en cours : l’analyse des moments forts précède
                le découpage.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-20 pb-16 px-4 relative overflow-hidden">
      {/* Orbes d'ambiance */}
      <div className="bg-orb bg-orb-purple w-[600px] h-[600px] -top-32 -left-32 opacity-25 pointer-events-none" />
      <div className="bg-orb bg-orb-pink w-[500px] h-[500px] top-1/2 -right-32 opacity-20 pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10 space-y-6">

        {/* Barre supérieure / Navigation projet */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="rounded-xl" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tableau de bord
              </Link>
            </Button>
            <span className="text-border">|</span>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <span className="line-clamp-1">{project?.title ?? 'Projet'}</span>
                <span
                  className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0',
                    STATUS_BADGE_CLASSES[selectedTone]
                  )}
                >
                  {project ? PROJECT_STATUS_LABELS[project.status] : 'En attente'}
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                {clips.length} clip{clips.length > 1 ? 's' : ''} 9:16
                {project?.durationSeconds
                  ? ` · Durée source : ${formatDuration(project.durationSeconds)}`
                  : ''}
                {project ? ` · importé ${formatRelativeDate(project.createdAt)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="gradient"
              className="glow-primary h-10 px-5 font-bold"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Rendu MP4 HD...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Exporter MP4 HD (1080x1920)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Notification d'exportation réussie */}
        <AnimatePresence>
          {exportSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md p-4 flex items-center justify-between text-emerald-400 text-sm shadow-xl"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Clip exporté avec succès en 1080×1920 HD ! Prêt pour TikTok, Reels et Shorts.
              </div>
              <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20" onClick={handleExport}>
                Télécharger à nouveau
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grille principale : Liste des clips (gauche) & Studio de prévisualisation (droite) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ============================================================
              COLONNE GAUCHE (5 cols) : LISTE DES CLIPS TRIÉS PAR SCORE
              ============================================================ */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  Clips découpés par l'IA
                </h2>
                <p className="text-xs text-muted-foreground">Triés par Score de Viralité décroissant</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">
                {clips.length} moments forts
              </span>
            </div>

            <div className="space-y-3">
              {clips.map((clip) => {
                const isSelected = clip.id === selectedClip.id;

                return (
                  <motion.div
                    key={clip.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedClipId(clip.id)}
                    className={cn(
                      'rounded-2xl p-4 border transition-all cursor-pointer relative overflow-hidden backdrop-blur-md',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-lg shadow-primary/15 ring-1 ring-primary'
                        : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        {/* Badge de Score de Viralité */}
                        <div className={cn(
                          'px-2.5 py-1 rounded-xl font-black text-xs flex items-center gap-1 shadow-sm',
                          (clip.viralityScore ?? 0) >= 90
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                            : 'bg-primary text-primary-foreground'
                        )}>
                          ⭐ {clip.viralityScore ?? '—'}/100
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {Math.round(clip.endTime - clip.startTime)}s
                        </span>
                      </div>

                      <span className="text-[11px] text-muted-foreground font-mono">
                        {Math.floor(clip.startTime / 60)}:{(clip.startTime % 60).toFixed(0).padStart(2, '0')} ➔ {Math.floor(clip.endTime / 60)}:{(clip.endTime % 60).toFixed(0).padStart(2, '0')}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-foreground mb-1 leading-snug line-clamp-1">
                      {clip.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 italic">
                      « {clip.hookText} »
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                          {CLIP_STATUS_LABELS[clip.status]}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Eye className="w-3.5 h-3.5" />
                        {isSelected ? 'En lecture' : 'Sélectionner'}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* ============================================================
              COLONNE DROITE (7 cols) : LECTEUR 9:16 + SOUS-TITRES ÉDITABLES
              ============================================================ */}
          <div className="lg:col-span-7 space-y-6">

            <Card className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex flex-col md:flex-row gap-6 items-center">

                {/* Smartphone 9:16 vertical avec lecture et Safe Zones */}
                <div className="relative shrink-0">
                  <div className="w-[240px] sm:w-[270px] bg-slate-950 rounded-[2.5rem] border-4 border-slate-700/80 shadow-2xl overflow-hidden relative" style={{ aspectRatio: '9/16' }}>

                    {/* Notch smartphone */}
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-900 rounded-full z-30" />

                    {/* Fond d'animation vidéo simulée */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center p-4 transition-colors duration-500"
                      style={{ background: selectedPreset.bg }}
                    >
                      {/* Gradient dynamique */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                      {/* Score flottant en haut */}
                      <div className="absolute top-8 right-3 z-20 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl border border-amber-500/30 text-amber-400 text-xs font-black">
                        ⭐ {selectedClip.viralityScore ?? '—'}
                      </div>

                      {/* Sous-titres dynamiques mot-à-mot */}
                      <div className="relative z-20 text-center px-2 py-4">
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {selectedWords.map((item, idx) => (
                            <span
                              key={idx}
                              className="font-black text-sm uppercase px-1 py-0.5 rounded transition-all duration-300 shadow-md"
                              style={{
                                color: idx <= 3 ? selectedPreset.activeColor : '#FFFFFF',
                                textShadow: idx <= 3 ? `0 0 10px ${selectedPreset.activeColor}80` : '0 2px 4px #000',
                                transform: idx === 2 ? 'scale(1.15)' : 'scale(1)',
                              }}
                            >
                              {item.word}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Bouton Play/Pause central */}
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white transition-all transform hover:scale-110 z-20 my-auto"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-white" />}
                      </button>

                      {/* Indicateur de durée */}
                      <div className="absolute bottom-4 left-4 z-20 text-[10px] font-mono text-white/70 bg-black/50 px-2 py-0.5 rounded">
                        00:{isPlaying ? '14' : '00'} / 00:{selectedDuration.toFixed(0)}
                      </div>
                    </div>

                    {/* Overlay Safe Zones TikTok & Reels */}
                    {showSafeZones && (
                      <div className="absolute inset-0 pointer-events-none z-30">
                        <div className="absolute top-0 left-0 right-0 h-[14%] bg-red-500/20 border-b-2 border-red-500/40 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-red-300 uppercase tracking-widest">TikTok UI Zone</span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[22%] bg-red-500/20 border-t-2 border-red-500/40 flex items-end justify-center pb-2">
                          <span className="text-[9px] font-bold text-red-300 uppercase tracking-widest">Zone Masquée (Description)</span>
                        </div>
                        <div className="absolute top-0 right-0 bottom-0 w-[18%] bg-red-500/10 border-l-2 border-red-500/30 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-red-300 rotate-90 uppercase">Boutons d'interaction</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Panneau de contrôle et réglages */}
                <div className="flex-1 space-y-5 w-full">
                  <div>
                    <h3 className="font-extrabold text-lg text-foreground mb-1">{selectedClip.title}</h3>
                    <p className="text-xs text-muted-foreground">Personnalisez le style des sous-titres mot-à-mot et préparez l'export.</p>
                  </div>

                  {/* Bouton Safe Zones */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border/40">
                    <div className="flex items-center gap-2">
                      <Shield className={cn('w-4 h-4', showSafeZones ? 'text-red-400' : 'text-muted-foreground')} />
                      <div>
                        <p className="text-xs font-bold text-foreground">Safe Zones (TikTok & Reels)</p>
                        <p className="text-[10px] text-muted-foreground">Afficher les marges masquées par l'interface</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSafeZones(!showSafeZones)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                        showSafeZones ? 'bg-primary' : 'bg-muted'
                      )}
                    >
                      <span className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        showSafeZones ? 'translate-x-6' : 'translate-x-1'
                      )} />
                    </button>
                  </div>

                  {/* Presets de sous-titres animés */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Subtitles className="w-3.5 h-3.5" />
                      Styles de sous-titres animés
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setSelectedPreset(preset)}
                          className={cn(
                            'p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between',
                            selectedPreset.id === preset.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <span>{preset.name}</span>
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20"
                            style={{ background: preset.activeColor }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Édition interactive des sous-titres */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Correction interactive mot-à-mot
                      </label>
                      <span className="text-[10px] text-amber-400">Aperçu local, non enregistré</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-muted/20 border border-border/40 max-h-36 overflow-y-auto space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {selectedWords.map((item, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={item.word}
                            onChange={(e) => handleWordEdit(idx, e.target.value)}
                            className="text-xs font-semibold px-2 py-1 rounded-lg bg-muted/60 border border-border/40 focus:border-primary focus:bg-card text-foreground transition-colors w-auto min-w-[3rem] text-center"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Studio : styles, montage IA, cadrage, re-rendu */}
                  <Button variant="outline" className="w-full font-bold h-11" asChild>
                    <Link href={`/editor/${selectedClip.id}`}>
                      <Sliders className="w-4 h-4 mr-2" />
                      Ouvrir le studio (styles, montage IA, cadrage)
                    </Link>
                  </Button>

                  {/* Export réel : URL signée du rendu (compartiment privé) */}
                  <Button
                    variant="gradient"
                    className="w-full glow-primary font-bold h-11"
                    onClick={handleExport}
                    disabled={isExporting || !clipIsReady}
                  >
                    {isExporting
                      ? 'Préparation du téléchargement…'
                      : clipIsReady
                        ? 'Télécharger ce clip MP4 (1080×1920)'
                        : `Rendu ${CLIP_STATUS_LABELS[selectedClip.status].toLowerCase()}…`}
                  </Button>
                  {exportError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {exportError}
                    </p>
                  ) : null}
                </div>

              </div>
            </Card>

          </div>

        </div>

      </div>
    </div>
  );
}

