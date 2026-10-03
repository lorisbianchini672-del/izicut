'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Youtube, Upload, Play, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIntake } from '@/stores/use-intake';
import { validateVideoFile, validateVideoUrl } from '@/components/upload/validate-intake';
import { VideoMockup } from './VideoMockup';

export function HeroSection() {
  const router = useRouter();
  const { setUrl, setFile } = useIntake();
  const [activeTab, setActiveTab] = useState<'url' | 'file'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Parallaxe souris : les orbes réagissent légèrement au curseur.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const orbX = useSpring(useTransform(mouseX, [0, 1], [-30, 30]), { stiffness: 40, damping: 20 });
  const orbY = useSpring(useTransform(mouseY, [0, 1], [-20, 20]), { stiffness: 40, damping: 20 });
  const orbX2 = useSpring(useTransform(mouseX, [0, 1], [24, -24]), { stiffness: 35, damping: 20 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth);
      mouseY.set(e.clientY / window.innerHeight);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [mouseX, mouseY]);

  /**
   * Le choix de l'utilisateur (lien ou fichier) est mémorisé dans le store
   * `useIntake`, puis on navigue CÔTÉ CLIENT : la page d'import retrouve la
   * source sans la redemander, et la barrière d'authentification du
   * middleware s'applique normalement (`/upload` est protégé).
   */
  const goToUpload = () => {
    setIsGenerating(true);
    router.push('/upload');
  };

  const handleGenerate = () => {
    const trimmed = videoUrl.trim();
    const message = trimmed
      ? validateVideoUrl(trimmed)
      : 'Collez un lien vidéo ou importez un fichier pour commencer.';
    setUrlError(message);
    if (message) return;
    setUrl(trimmed);
    goToUpload();
  };

  /** Fichier déposé ou choisi : validation immédiate, puis passage à l'import. */
  const handleFileSelection = (file: File | undefined | null) => {
    if (!file) return;
    const message = validateVideoFile({ name: file.name, size: file.size });
    setUrlError(message);
    if (message) return;
    setFile(file);
    goToUpload();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files?.[0]);
  };

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-20 pb-8">
      {/* ---- Orbes de fond (parallaxe souris + dérive lente) ---- */}
      <motion.div
        className="bg-orb bg-orb-purple w-[700px] h-[700px] -top-32 -left-32 animate-aurora"
        style={{ x: orbX, y: orbY }}
      />
      <motion.div
        className="bg-orb bg-orb-pink w-[500px] h-[500px] top-1/3 -right-32 animate-aurora"
        style={{ x: orbX2, y: orbY, animationDelay: '6s' }}
      />
      <div className="bg-orb bg-orb-blue w-[400px] h-[400px] bottom-0 left-1/3 animate-pulse-glow" style={{ animationDelay: '2s' }} />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto text-center">

          {/* Fil d'Ariane lumineux */}
          <motion.div
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-primary/40 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 backdrop-blur-md text-sm font-semibold text-white mb-8 shadow-lg shadow-primary/20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <Sparkles className="w-4 h-4 text-accent animate-spin-slow" />
            <span>IziCut AI v2.0 · Propulsé par Whisper + GPT-4o-mini + Remotion</span>
          </motion.div>

          {/* Titre principal */}
          <motion.h1
            className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <span className="text-gradient animate-gradient-x inline-block">Transformez vos vidéos</span>
            <br />
            <span className="text-foreground">en clips viraux</span>
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            Collez un lien YouTube/Twitch ou importez un fichier.{' '}
            Notre IA détecte les moments forts, génère des sous-titres animés
            mot-à-mot et rend des clips <strong className="text-foreground">9:16 prêts à publier</strong>.
          </motion.p>

          {/* Zone d'import */}
          <motion.div
            className="max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {/* Onglets */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'url'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Youtube className="w-4 h-4" />
                Coller un lien
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  activeTab === 'file'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Upload className="w-4 h-4" />
                Importer un fichier
              </button>
            </div>

            {/* Champ URL */}
            {activeTab === 'url' ? (
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    className="pl-12 h-14 text-base bg-card/50 border-border/50 focus:border-primary rounded-xl"
                  />
                  {urlError ? (
                    <p
                      role="alert"
                      className="absolute -bottom-6 left-1 text-xs font-medium text-destructive"
                    >
                      {urlError}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="gradient"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={isGenerating || !videoUrl.trim()}
                  className="h-14 px-8 rounded-xl glow-primary text-base font-bold transition-all duration-300 shine-hover"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Analyse...
                    </span>
                  ) : (
                    <>
                      Passer à l'IA
                      <ArrowRight className="w-5 h-5 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            ) : (
              /* Zone Drag & Drop */
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
                  isDragging
                    ? 'border-primary bg-primary/10 scale-[1.02]'
                    : 'border-border/50 hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                {isDragging && (
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-shimmer" />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp4,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska"
                  className="sr-only"
                  onChange={(event) => {
                    handleFileSelection(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="text-lg font-semibold mb-1">
                  {isDragging ? 'Déposez votre vidéo ici !' : 'Glissez votre vidéo ou cliquez pour parcourir'}
                </p>
                <p className="text-sm text-muted-foreground">MP4, MOV, WebM, MKV — jusqu'à 800 Mo</p>
              </div>
            )}
          </motion.div>

          {/* Bouton secondaire "Voir une démo" */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex items-center justify-center gap-4 text-sm text-muted-foreground"
          >
            <Button variant="ghost" size="lg" className="gap-2">
              <Play className="w-5 h-5" />
              Voir une démo
            </Button>
            <span>·</span>
            <span>Pas de carte bancaire requise</span>
            <span>·</span>
            <span>10 minutes offertes</span>
          </motion.div>
          {/* Indicateur de scroll */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="hidden md:flex flex-col items-center gap-1 text-muted-foreground/60 mt-10"
          >
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">Découvrir</span>
            <ChevronDown className="w-5 h-5 animate-scroll-hint" />
          </motion.div>
        </div>

        {/* Mockup 9:16 avec widgets */}
        <VideoMockup />
      </div>
    </section>
  );
}