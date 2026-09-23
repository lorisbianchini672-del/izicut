'use client';

import { useState } from 'react';
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

export type ProjectItem = {
  id: string;
  title: string;
  source_type: 'upload' | 'url';
  source_url?: string;
  status: 'Upload' | 'Transcription' | 'Prêt';
  duration_seconds: number;
  clips_count: number;
  best_score: number;
  created_at: string;
};

const INITIAL_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-1',
    title: 'Podcast Tech & IA — Épisode 42 (DeepSeek vs GPT)',
    source_type: 'url',
    source_url: 'https://youtube.com/watch?v=ScAJMChP4qs',
    status: 'Prêt',
    duration_seconds: 2450, // 40m50s
    clips_count: 5,
    best_score: 94,
    created_at: 'Il y a 2 heures',
  },
  {
    id: 'proj-2',
    title: 'Masterclass E-commerce & Scalabilité 2026',
    source_type: 'upload',
    status: 'Transcription',
    duration_seconds: 1820,
    clips_count: 3,
    best_score: 87,
    created_at: 'Il y a 5 heures',
  },
  {
    id: 'proj-3',
    title: 'Interview Live Twitch — Décryptage Monétisation',
    source_type: 'url',
    source_url: 'https://twitch.tv/videos/123456',
    status: 'Upload',
    duration_seconds: 3600,
    clips_count: 0,
    best_score: 0,
    created_at: 'Hier',
  },
  {
    id: 'proj-4',
    title: 'Formation Productivité & Deep Work',
    source_type: 'upload',
    status: 'Prêt',
    duration_seconds: 940,
    clips_count: 4,
    best_score: 91,
    created_at: 'Il y a 2 jours',
  },
];

export default function DashboardPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projects] = useState<ProjectItem[]>(INITIAL_PROJECTS);

  // Crédits de minutes (150 min quota, 75 min utilisées)
  const totalCredits = 150;
  const usedCredits = 55;
  const remainingCredits = totalCredits - usedCredits;
  const percentageRemaining = Math.round((remainingCredits / totalCredits) * 100);

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background text-foreground pt-20 pb-16 px-4 relative overflow-hidden">
      {/* Orbes lumineux d'ambiance */}
      <div className="bg-orb bg-orb-purple w-[600px] h-[600px] -top-32 -right-32 opacity-30 pointer-events-none" />
      <div className="bg-orb bg-orb-pink w-[500px] h-[500px] bottom-10 -left-20 opacity-20 pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10 space-y-8">
        
        {/* En-tête de bienvenue */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-black text-foreground">Tableau de bord SaaS</h1>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary border border-primary/30">
                Plan Pro
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Gérez vos projets vidéo, suivez vos crédits et exportez vos clips 9:16 prêts pour les réseaux.
            </p>
          </div>

          <Button variant="gradient" className="glow-primary h-11 px-6 font-bold" asChild>
            <Link href="/upload">
              <Plus className="w-4 h-4 mr-2" />
              Nouveau projet vidéo
            </Link>
          </Button>
        </div>

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
                Solde de crédits vidéo mensuels
              </div>
              <div className="text-3xl sm:text-4xl font-black text-foreground">
                {remainingCredits} <span className="text-xl font-normal text-muted-foreground">min restantes / {totalCredits} min</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Renouvellement automatique le 1er du mois prochain · {usedCredits} minutes traitées ce mois-ci
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-xl" asChild>
                <Link href="/#pricing">Changer de plan</Link>
              </Button>
              <Button variant="gradient" size="sm" className="rounded-xl glow-primary font-bold" asChild>
                <Link href="/#pricing">
                  <Zap className="w-4 h-4 mr-1.5" />
                  Recharger des crédits
                </Link>
              </Button>
            </div>
          </div>

          {/* Jauge animée */}
          <div className="space-y-2">
            <div className="h-4 bg-muted/60 rounded-full overflow-hidden p-0.5 border border-border/40">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-accent to-emerald-400 rounded-full shadow-lg shadow-primary/30"
                initial={{ width: 0 }}
                animate={{ width: `${percentageRemaining}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>0 min</span>
              <span className="text-primary font-bold">{percentageRemaining}% disponible</span>
              <span>{totalCredits} min (Plan Pro)</span>
            </div>
          </div>
        </motion.div>

        {/* ============================================================
            2. CARTES DE PROJETS & STATUTS TEMPS RÉEL
            ============================================================ */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-foreground">Vos Projets Vidéo</h2>
              <p className="text-xs text-muted-foreground">
                Statuts synchronisés en temps réel · Cliquez sur un projet pour ouvrir le Studio de découpage
              </p>
            </div>

            {/* Filtres & Recherche */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="Rechercher un projet..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/30 border border-border/60 focus:outline-none focus:border-primary w-52 sm:w-64 text-foreground"
                />
              </div>

              <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border border-border/40 text-xs">
                {['all', 'Prêt', 'Transcription', 'Upload'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg font-semibold transition-all',
                      statusFilter === st
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {st === 'all' ? 'Tous' : st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grille des projets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
            {filteredProjects.map((project, idx) => {
              const minutes = Math.floor(project.duration_seconds / 60);
              const seconds = project.duration_seconds % 60;
              const formattedDuration = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.4 }}
                >
                  <Link href={`/project/${project.id}`}>
                    <Card className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md hover:border-primary/60 hover:bg-card/70 transition-all duration-300 p-5 group cursor-pointer shadow-lg hover:shadow-primary/10">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            {project.source_type === 'url' ? (
                              <Youtube className="w-5 h-5 text-red-400" />
                            ) : (
                              <FileVideo className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {project.source_type === 'url' ? 'Source : Lien externe' : 'Source : Fichier local'}
                            </span>
                            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {project.title}
                            </h3>
                          </div>
                        </div>

                        {/* Badge de statut temps réel */}
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0',
                            project.status === 'Prêt' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
                            project.status === 'Transcription' && 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
                            project.status === 'Upload' && 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          )}
                        >
                          {project.status === 'Prêt' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {project.status === 'Transcription' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {project.status === 'Upload' && <Upload className="w-3.5 h-3.5 animate-pulse" />}
                          {project.status}
                        </span>
                      </div>

                      {/* Métadonnées */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-border/30 my-3 text-center">
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Durée source</p>
                          <p className="text-xs font-bold text-foreground mt-0.5">{formattedDuration}</p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Clips IA générés</p>
                          <p className="text-xs font-bold text-primary mt-0.5">{project.clips_count} clips</p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-2">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Top Viralité</p>
                          <p className="text-xs font-bold text-amber-400 mt-0.5">
                            {project.best_score > 0 ? `⭐ ${project.best_score}/100` : 'En analyse'}
                          </p>
                        </div>
                      </div>

                      {/* Pied de carte */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>{project.created_at}</span>
                        <span className="text-primary font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Ouvrir l'éditeur 9:16
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