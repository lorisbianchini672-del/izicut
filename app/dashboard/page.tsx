'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Zap,
  Clock,
  Film,
  BarChart3,
  Plus,
  Search,
  ExternalLink,
  Youtube,
  FileVideo,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  fetchDashboardProjects,
  fetchMonthlyUsage,
  fetchProfileCredits,
  type DashboardProject,
  type ProfileCredits
} from '@/lib/data/projects';
import {
  creditUsagePercent,
  formatDuration,
  formatRelativeDate,
  projectStatusTone,
  secondsToMinutes,
  type StatusTone
} from '@/lib/format';
import { PROJECT_STATUS_LABELS } from '@/types';
import { YoutubeStatusBanner } from '@/components/dashboard/YoutubeStatusBanner';

/** Filtres rapides, alignés sur les tonalités de statut (pas sur les libellés). */
const STATUS_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'ready', label: 'Prêts' },
  { id: 'working', label: 'En cours' },
  { id: 'error', label: 'Échecs' }
] as const;

type StatusFilterId = (typeof STATUS_FILTERS)[number]['id'];

/** Couleurs de badge par tonalité : le statut brut ne pilote pas le style. */
const TONE_CLASSES: Record<StatusTone, string> = {
  ready: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  working: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  queued: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  error: 'bg-red-500/10 text-red-400 border border-red-500/30'
};

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [credits, setCredits] = useState<ProfileCredits | null>(null);
  const [usedSeconds, setUsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Client navigateur : la RLS limite chaque lecture aux lignes de
  // l'utilisateur connecté. Aucune clé de service n'entre dans l'interface.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setLoadError('Session expirée : reconnectez-vous pour voir vos projets.');
          setLoading(false);
        }
        return;
      }

      const [projectRows, profileCredits, monthlyUsage] = await Promise.all([
        fetchDashboardProjects(supabase),
        fetchProfileCredits(supabase, user.id),
        fetchMonthlyUsage(supabase, user.id)
      ]);

      if (cancelled) return;
      setProjects(projectRows);
      setCredits(profileCredits);
      setUsedSeconds(monthlyUsage);
      setLoading(false);
    };

    load().catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(
        error instanceof Error ? error.message : 'Impossible de charger vos projets.'
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Solde réel : les secondes viennent de `profiles.video_credits_seconds`.
  // Le total « ce mois-ci » = ce qu'il reste + ce qui a été consommé.
  const balanceSeconds = credits?.balanceSeconds ?? 0;
  const remainingCredits = secondsToMinutes(balanceSeconds);
  const usedCredits = secondsToMinutes(usedSeconds);
  const totalCredits = remainingCredits + usedCredits;
  const percentageRemaining = creditUsagePercent(balanceSeconds, totalCredits * 60);
  const isSubscribed = credits?.subscriptionStatus === 'active';

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || projectStatusTone(project.status) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background text-foreground pt-20 pb-16 px-4 relative overflow-hidden">
      {/* Orbes lumineux d'ambiance */}
      <div aria-hidden className="izi-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="container mx-auto max-w-7xl relative z-10 space-y-8">
        
        {/* En-tête de bienvenue */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Mes projets</h1>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30">
                {isSubscribed ? 'Abonnement actif' : 'Offre Free'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Collez un lien ou importez une vidéo : vos clips 9:16 sous-titrés arrivent ici.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11 rounded-xl border-neon/40 px-5 font-semibold text-neon" asChild>
              <Link href="/studio">Studio Motion · nouveau</Link>
            </Button>
            <Button variant="gradient" className="glow-primary h-11 px-6 font-bold" asChild>
              <Link href="/upload">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau projet vidéo
              </Link>
            </Button>
          </div>
        </div>

        <YoutubeStatusBanner />

        {/* ============================================================
            1. BARRE DE PROGRESSION ANIMÉE DES CRÉDITS DE MINUTES
            ============================================================ */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-6 sm:p-8 shadow-xl relative overflow-hidden"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-1">
                <Clock className="w-4 h-4" />
                Solde de crédits vidéo
              </div>
              <div className="text-3xl sm:text-4xl font-black text-foreground">
                {loading ? '—' : remainingCredits}{' '}
                <span className="text-xl font-normal text-muted-foreground">
                  min restantes
                  
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {usedCredits} min utilisée{usedCredits > 1 ? 's' : ''} ces 30 derniers jours · une vidéo
                échouée est recréditée automatiquement
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-xl" asChild>
                <Link href="/#pricing">Changer de plan</Link>
              </Button>
              <Button variant="gradient" size="sm" className="rounded-xl glow-primary font-bold" asChild>
                <Link href="/#pricing">
                  <Zap className="w-4 h-4 mr-1.5" />
                  Plus de minutes
                </Link>
              </Button>
            </div>
          </div>

          {/* Jauge animée */}
          <div className="space-y-2">
            <div className="h-4 bg-muted/60 rounded-full overflow-hidden p-0.5 border border-border/40">
              <motion.div
                className="h-full rounded-full bg-neon shadow-[0_0_16px_-2px_rgb(200_255_61/0.6)]"
                initial={{ width: 0 }}
                animate={{ width: `${percentageRemaining}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>0 min</span>
              <span className="text-primary font-bold">{percentageRemaining}% disponible</span>
              <span>{totalCredits > 0 ? `${totalCredits} min sur la période` : 'Aucun crédit'}</span>
            </div>
          </div>
        </motion.div>

        {/* ============================================================
            2. CARTES DE PROJETS & STATUTS TEMPS RÉEL
            ============================================================ */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Vidéos</h2>
              <p className="text-xs text-muted-foreground">
                Cliquez sur une vidéo pour voir ses clips et les exporter
              </p>
            </div>

            {/* Filtres & Recherche */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="Rechercher un projet..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/30 border border-border/60 focus:outline-none focus:border-primary w-full sm:w-64 text-foreground"
                />
              </div>

              <div className="grid grid-cols-4 gap-1 p-1 bg-muted/40 rounded-xl border border-border/40 text-xs sm:flex">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap',
                      statusFilter === filter.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grille des projets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
            {loading &&
              [0, 1, 2, 3].map((skeleton) => (
                <div
                  key={skeleton}
                  className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card/30"
                />
              ))}

            {!loading && loadError ? (
              <Card className="col-span-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
                <p className="mb-3 font-semibold">{loadError}</p>
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                  Recharger
                </Button>
              </Card>
            ) : null}

            {!loading && !loadError && projects.length === 0 ? (
              <Card className="col-span-full flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
                <Sparkles className="h-8 w-8 text-primary" />
                <h3 className="text-lg font-bold">Votre premier projet vous attend</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  Importez une vidéo longue : IziCut en extrait les meilleurs moments, les recadre
                  en 9:16 et les sous-titre mot à mot.
                </p>
                <Button variant="gradient" className="glow-primary font-bold" asChild>
                  <Link href="/upload">
                    <Plus className="w-4 h-4 mr-2" />
                    Importer une vidéo
                  </Link>
                </Button>
              </Card>
            ) : null}

            {!loading && !loadError && projects.length > 0 && filteredProjects.length === 0 ? (
              <p className="col-span-full text-center text-sm text-muted-foreground">
                Aucun projet ne correspond à cette recherche ou à ce filtre.
              </p>
            ) : null}

            {filteredProjects.map((project, idx) => {
              const tone = projectStatusTone(project.status);

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.4 }}
                >
                  <Link href={`/project/${project.id}`}>
                    <Card className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md hover:border-primary/60 hover:bg-card/70 transition-all duration-300 p-5 group cursor-pointer shadow-lg hover:shadow-primary/10">
                      <div className="flex flex-col-reverse items-start justify-between gap-3 mb-3 sm:flex-row sm:gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            {project.sourceType === 'external_url' ? (
                              <Youtube className="w-5 h-5 text-red-400" />
                            ) : (
                              <FileVideo className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {project.sourceType === 'external_url'
                                ? 'Source : lien externe'
                                : 'Source : fichier local'}
                            </span>
                            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-2">
                              {project.title}
                            </h3>
                          </div>
                        </div>

                        {/* Badge de statut : la couleur suit la tonalité, pas le libellé */}
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0',
                            TONE_CLASSES[tone]
                          )}
                        >
                          {tone === 'ready' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {tone === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {tone === 'queued' && <Upload className="w-3.5 h-3.5 animate-pulse" />}
                          {tone === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                          {PROJECT_STATUS_LABELS[project.status]}
                        </span>
                      </div>

                      {tone === 'error' && project.errorMessage ? (
                        <p className="mb-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs leading-relaxed text-red-300">
                          {project.errorMessage}
                        </p>
                      ) : null}

                      {/* Métadonnées */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-border/30 my-3 text-center">
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Durée source</p>
                          <p className="text-xs font-bold text-foreground mt-0.5">{formatDuration(project.durationSeconds)}</p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Clips IA générés</p>
                          <p className="text-xs font-bold text-primary mt-0.5">
                            {project.clipsCount} clip{project.clipsCount > 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Top Viralité</p>
                          <p className="text-xs font-bold text-amber-400 mt-0.5">
                            {project.bestScore ? `${project.bestScore}/100` : tone === 'error' ? '—' : 'En analyse'}
                          </p>
                        </div>
                      </div>

                      {/* Pied de carte */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>{formatRelativeDate(project.createdAt)}</span>
                        <span className="text-primary font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          {tone === 'error' ? 'Voir le détail' : 'Voir les clips'}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}