'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Scissors,
  ChevronDown,
  Sparkles,
  Zap,
  Film,
  Subtitles,
  Crop,
  Flame,
  Shield,
  VolumeX,
  Play,
  BookOpen,
  Code2,
  HelpCircle,
  Menu,
  X,
  ArrowRight,
  Upload,
  Laptop
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/landing/Logo';
import { cn } from '@/lib/utils';

type MegamenuCategory = 'outils' | 'ia' | 'ressources' | null;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MegamenuCategory>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fermer le menu si clic en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header
        ref={navRef}
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'border-b border-border/50 bg-background/80 backdrop-blur-2xl shadow-xl shadow-black/20'
            : 'bg-transparent'
        )}
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-7xl">
          
          {/* Logo */}
          <Logo href="/" subtitle="AI Video Studio" />

          {/* ============================================================
              MÉGAMENU DESKTOP DÉROULANT
              ============================================================ */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* 1. Outils */}
            <div
              className="relative"
              onMouseEnter={() => setActiveMenu('outils')}
            >
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'outils' ? null : 'outils')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
                  activeMenu === 'outils'
                    ? 'text-foreground bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                Outils
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', activeMenu === 'outils' && 'rotate-180')} />
              </button>
            </div>

            {/* 2. Fonctionnalités IA */}
            <div
              className="relative"
              onMouseEnter={() => setActiveMenu('ia')}
            >
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'ia' ? null : 'ia')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
                  activeMenu === 'ia'
                    ? 'text-foreground bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Fonctionnalités IA
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', activeMenu === 'ia' && 'rotate-180')} />
              </button>
            </div>

            {/* 3. Ressources */}
            <div
              className="relative"
              onMouseEnter={() => setActiveMenu('ressources')}
            >
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'ressources' ? null : 'ressources')}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all',
                  activeMenu === 'ressources'
                    ? 'text-foreground bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                Ressources
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', activeMenu === 'ressources' && 'rotate-180')} />
              </button>
            </div>

            {/* 4. Tarifs */}
            <Link
              href="/#pricing"
              onMouseEnter={() => setActiveMenu(null)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
            >
              Tarifs
            </Link>

            {/* 5. Dashboard */}
            <Link
              href="/dashboard"
              onMouseEnter={() => setActiveMenu(null)}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
            >
              Dashboard SaaS
            </Link>
          </nav>

          {/* Boutons d'action droite */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/login"
              className="px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
            >
              Connexion
            </Link>

            {/* Modal de Démo interactive */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDemoOpen(true)}
              className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-semibold"
            >
              <Play className="w-3.5 h-3.5 mr-1.5 fill-primary" />
              Démo en direct
            </Button>

            <Button variant="ghost" size="sm" className="rounded-xl font-semibold" asChild>
              <Link href="/login">Se connecter</Link>
            </Button>

            <Button
              variant="gradient"
              size="sm"
              className="glow-primary rounded-xl font-bold h-9 px-4"
              asChild
            >
              <Link href="/login?mode=signup">
                <Zap className="w-3.5 h-3.5 mr-1" />
                Créer un compte
              </Link>
            </Button>
          </div>

          {/* Mobile menu trigger */}
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* ============================================================
            PANNEAU DU MÉGAMENU DÉROULANT (DESKTOP)
            ============================================================ */}
        <AnimatePresence>
          {activeMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onMouseLeave={() => setActiveMenu(null)}
              className="absolute top-16 left-0 right-0 border-b border-border/60 bg-background/95 backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden"
            >
              <div className="container mx-auto px-4 py-8 max-w-7xl">
                {/* 1. Outils */}
                {activeMenu === 'outils' && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Link
                      href="/upload"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                        <Scissors className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">Découpage Vidéo IA</h4>
                      <p className="text-xs text-muted-foreground mt-1">Découpe automatique de vidéos longues en clips verticaux 9:16 viraux.</p>
                    </Link>

                    <Link
                      href="/editor/clip-demo"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 group-hover:scale-105 transition-transform">
                        <VolumeX className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors">Suppresseur de Silences</h4>
                      <p className="text-xs text-muted-foreground mt-1">Élimination des hésitations et des blancs pour un rythme haletant.</p>
                    </Link>

                    <Link
                      href="/editor/clip-demo"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform">
                        <Subtitles className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-amber-400 transition-colors">Générateur de Sous-titres</h4>
                      <p className="text-xs text-muted-foreground mt-1">Animation mot-à-mot style Alex Hormozi avec emojis automatiques.</p>
                    </Link>

                    <Link
                      href="/editor/clip-demo"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                        <Crop className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors">Recadrage Intelligent 9:16</h4>
                      <p className="text-xs text-muted-foreground mt-1">Suivi automatique du visage et split-screen multi-intervenants.</p>
                    </Link>
                  </div>
                )}

                {/* 2. Fonctionnalités IA */}
                {activeMenu === 'ia' && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Link
                      href="/#features"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                        <Flame className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">Score de Viralité (0-100)</h4>
                      <p className="text-xs text-muted-foreground mt-1">Analyse prédictive de rétention pour isoler les passages à fort potentiel.</p>
                    </Link>

                    <Link
                      href="/#features"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors">Détection des Hooks</h4>
                      <p className="text-xs text-muted-foreground mt-1">Repérage des premières secondes décisives pour captiver l'audience.</p>
                    </Link>

                    <Link
                      href="/#features"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                        <Shield className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors">Safe Zones Dynamiques</h4>
                      <p className="text-xs text-muted-foreground mt-1">Masques précis pour TikTok, Reels et Shorts sans obstruction.</p>
                    </Link>

                    <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent border border-primary/20 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-primary tracking-widest">Pipeline IA v2</span>
                        <h4 className="font-bold text-sm text-foreground mt-1">Whisper + GPT-4o-mini</h4>
                        <p className="text-xs text-muted-foreground mt-1">Transcription ultra-fidèle en français et 40+ langues avec rendu Remotion.</p>
                      </div>
                      <Button variant="outline" size="sm" className="mt-3 rounded-xl text-xs" asChild>
                        <Link href="/upload">Essayer le moteur IA →</Link>
                      </Button>
                    </div>
                  </div>
                )}

                {/* 3. Ressources */}
                {activeMenu === 'ressources' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => { setActiveMenu(null); setDemoOpen(true); }}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                        <Play className="w-5 h-5 fill-primary" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">Studio Démo Live</h4>
                      <p className="text-xs text-muted-foreground mt-1">Testez l'éditeur interactif directement dans le navigateur sans créer de compte.</p>
                    </button>

                    <Link
                      href="/guide-9-16"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 group-hover:scale-105 transition-transform">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-accent transition-colors">Guide des Formats 9:16</h4>
                      <p className="text-xs text-muted-foreground mt-1">Safe Zones, réglages d'export et bonnes pratiques de rétention.</p>
                    </Link>

                    <Link
                      href="/docs"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
                        <Code2 className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors">Documentation API</h4>
                      <p className="text-xs text-muted-foreground mt-1">Endpoints REST, webhooks signés et quotas par formule.</p>
                    </Link>

                    <Link
                      href="/blog"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-3 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-sky-400 transition-colors">Blog créateurs</h4>
                      <p className="text-xs text-muted-foreground mt-1">Méthodes, analyses de hooks et monétisation des shorts.</p>
                    </Link>

                    <Link
                      href="/#faq"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition-transform">
                        <HelpCircle className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-amber-400 transition-colors">FAQ & Support</h4>
                      <p className="text-xs text-muted-foreground mt-1">Toutes les réponses sur les quotas, formats et intégrations Stripe.</p>
                    </Link>

                    <Link
                      href="/dashboard"
                      onClick={() => setActiveMenu(null)}
                      className="p-4 rounded-2xl border border-border/40 bg-card/40 hover:border-primary/50 hover:bg-card transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">Accès Dashboard</h4>
                      <p className="text-xs text-muted-foreground mt-1">Gérez vos crédits de minutes et retrouvez l'historique de vos exports.</p>
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================
            DRAWER MOBILE
            ============================================================ */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-border/50 bg-background/95 backdrop-blur-2xl overflow-hidden"
            >
              <div className="container mx-auto px-4 py-6 space-y-3">
                <Link
                  href="/#features"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Fonctionnalités IA
                </Link>
                <Link
                  href="/#pricing"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Tarifs & Quotas
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Dashboard SaaS
                </Link>
                <Link
                  href="/editor/clip-demo"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Studio de Montage
                </Link>
                <Link
                  href="/guide-9-16"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Guide des formats 9:16
                </Link>
                <Link
                  href="/docs"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Documentation API
                </Link>
                <Link
                  href="/blog"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Blog créateurs
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Connexion
                </Link>

                <div className="pt-4 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setMobileOpen(false); setDemoOpen(true); }}
                    className="w-full rounded-xl"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Démo en direct
                  </Button>
                  <Button variant="gradient" className="w-full rounded-xl glow-primary font-bold" asChild>
                    <Link href="/login?mode=signup" onClick={() => setMobileOpen(false)}>
                      <Zap className="w-4 h-4 mr-2" />
                      Créer un compte
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ============================================================
          MODAL DE DÉMONSTRATION EN DIRECT (CLIQUABLE)
          ============================================================ */}
      <AnimatePresence>
        {demoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden"
            >
              {/* Orbe interne */}
              <div className="bg-orb bg-orb-purple w-[400px] h-[400px] -top-20 -right-20 opacity-30 pointer-events-none" />

              <div className="flex items-center justify-between pb-4 border-b border-border/40 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-foreground">Démo Interactive IziCut</h3>
                    <p className="text-xs text-muted-foreground">Testez l'éditeur directement sans inscription</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDemoOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 text-sm space-y-2">
                  <p className="font-semibold text-foreground">💡 Que souhaitez-vous tester en priorité ?</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5">
                    <li>• <strong>Studio de Montage Manuel</strong> : Timeline multi-pistes, points In/Out, Safe Zones TikTok.</li>
                    <li>• <strong>Éditeur de Sous-titres</strong> : Surlignage mot-à-mot style Hormozi et correction textuelle.</li>
                    <li>• <strong>Import Vidéo Direct</strong> : Testez l'ingestion d'une vidéo YouTube ou fichier local.</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="rounded-xl h-12 font-bold justify-start px-4"
                    asChild
                    onClick={() => setDemoOpen(false)}
                  >
                    <Link href="/editor/clip-demo">
                      <Scissors className="w-4 h-4 mr-2 text-primary" />
                      Ouvrir le Studio Manuel
                    </Link>
                  </Button>

                  <Button
                    variant="gradient"
                    className="rounded-xl h-12 font-bold justify-start px-4 glow-primary"
                    asChild
                    onClick={() => setDemoOpen(false)}
                  >
                    <Link href="/upload">
                      <Upload className="w-4 h-4 mr-2" />
                      Importer un lien ou fichier
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
