'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Youtube, Link2, Zap, CheckCircle, Loader2, Scissors, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type UploadStep = 'idle' | 'uploading' | 'transcribing' | 'analyzing' | 'done';

const STEP_LABELS: Record<UploadStep, string> = {
  idle: '',
  uploading: 'Chargement de la vidéo...',
  transcribing: 'Transcription Whisper mot-à-mot...',
  analyzing: 'Analyse IA des moments forts...',
  done: 'Clips prêts à éditer !',
};

const STEP_PROGRESS: Record<UploadStep, number> = {
  idle: 0,
  uploading: 20,
  transcribing: 55,
  analyzing: 85,
  done: 100,
};

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<'file' | 'url' | 'twitch'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [step, setStep] = useState<UploadStep>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const simulateProcessing = useCallback(async () => {
    setStep('uploading');
    await delay(1200);
    setStep('transcribing');
    await delay(1800);
    setStep('analyzing');
    await delay(1400);
    setStep('done');
    await delay(800);
    window.location.href = '/dashboard';
  }, []);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    simulateProcessing();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUrlSubmit = () => {
    if (!videoUrl.trim()) return;
    simulateProcessing();
  };

  const isProcessing = step !== 'idle' && step !== 'done';
  const progress = STEP_PROGRESS[step];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center px-4 pt-20 pb-12">
      {/* Orbes de fond */}
      <div className="bg-orb bg-orb-purple w-[500px] h-[500px] top-0 left-0 opacity-60" />
      <div className="bg-orb bg-orb-pink w-[400px] h-[400px] bottom-0 right-0 opacity-50" />

      <div className="relative z-10 w-full max-w-xl">
        {/* En-tête */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-sm font-medium text-primary mb-6">
            <Zap className="w-4 h-4" />
            Traitement IA en moins de 2 minutes
          </div>
          <h1 className="text-4xl font-black mb-3">
            <span className="text-gradient">Importez votre vidéo</span>
          </h1>
          <p className="text-muted-foreground">
            Fichier local jusqu'à 10 Go · YouTube · Twitch VOD
          </p>
        </motion.div>

        {/* État de traitement */}
        <AnimatePresence mode="wait">
          {step !== 'idle' ? (
            <motion.div
              key="processing"
              className="glass rounded-3xl p-8 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {step === 'done' ? (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-foreground mb-2">Clips générés !</h2>
                  <p className="text-muted-foreground">Redirection vers le dashboard...</p>
                </motion.div>
              ) : (
                <>
                  {/* Icônes d'étapes */}
                  <div className="flex justify-center gap-4 mb-6">
                    {[
                      { icon: <Upload className="w-5 h-5" />, s: 'uploading' },
                      { icon: <Scissors className="w-5 h-5" />, s: 'transcribing' },
                      { icon: <BarChart3 className="w-5 h-5" />, s: 'analyzing' },
                    ].map(({ icon, s }) => {
                      const steps: UploadStep[] = ['uploading', 'transcribing', 'analyzing', 'done'];
                      const isActive = step === s;
                      const isDone = steps.indexOf(step) > steps.indexOf(s as UploadStep);
                      return (
                        <div
                          key={s}
                          className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500',
                            isActive ? 'bg-primary text-primary-foreground scale-110 shadow-lg shadow-primary/30' :
                            isDone ? 'bg-green-500/20 text-green-400' :
                            'bg-muted text-muted-foreground'
                          )}
                        >
                          {isActive ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-lg font-semibold mb-6">{STEP_LABELS[step]}</p>

                  {/* Barre de progression */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="upload-form"
              className="glass rounded-3xl p-8"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              {/* Onglets */}
              <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-xl">
                {(
                  [
                    { key: 'file', label: 'Fichier', icon: <Upload className="w-4 h-4" /> },
                    { key: 'url', label: 'YouTube', icon: <Youtube className="w-4 h-4" /> },
                    { key: 'twitch', label: 'Twitch', icon: <Link2 className="w-4 h-4" /> },
                  ] as const
                ).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                      activeTab === key
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* Contenu de l'onglet actif */}
              <AnimatePresence mode="wait">
                {activeTab === 'file' ? (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className={cn(
                        'relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300',
                        isDragging
                          ? 'border-primary bg-primary/10 scale-[1.01]'
                          : 'border-border/60 hover:border-primary/50 hover:bg-muted/20'
                      )}
                    >
                      {isDragging && (
                        <div className="absolute inset-0 rounded-2xl animate-shimmer pointer-events-none" />
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      />
                      <div className={cn(
                        'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all duration-300',
                        isDragging ? 'bg-primary/20 scale-110' : 'bg-muted'
                      )}>
                        <Upload className={cn('w-7 h-7', isDragging ? 'text-primary' : 'text-muted-foreground')} />
                      </div>
                      <p className="text-lg font-semibold mb-2">
                        {isDragging ? '✦ Déposez votre vidéo ici !' : 'Glissez ou cliquez pour importer'}
                      </p>
                      <p className="text-sm text-muted-foreground">MP4 · MOV · WebM · MKV — jusqu'à 10 Go</p>
                    </div>
                  </motion.div>
                ) : activeTab === 'url' ? (
                  <motion.div
                    key="url"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://youtube.com/watch?v=..."
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                          className="pl-11 h-12 bg-muted/30 border-border/50 focus:border-primary"
                        />
                      </div>
                      <Button
                        variant="gradient"
                        onClick={handleUrlSubmit}
                        disabled={!videoUrl.trim()}
                        className="h-12 px-6 glow-primary"
                      >
                        <Zap className="w-4 h-4" />
                        Go
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      YouTube · YouTube Shorts · Unlisted videos
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="twitch"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://twitch.tv/videos/..."
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                          className="pl-11 h-12 bg-muted/30 border-border/50 focus:border-primary"
                        />
                      </div>
                      <Button
                        variant="gradient"
                        onClick={handleUrlSubmit}
                        disabled={!videoUrl.trim()}
                        className="h-12 px-6 glow-primary"
                      >
                        <Zap className="w-4 h-4" />
                        Go
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      VODs Twitch publiques · Clips Twitch
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Formats supportés */}
              <div className="mt-6 pt-4 border-t border-border/30 flex flex-wrap justify-center gap-2">
                {['MP4', 'MOV', 'WebM', 'MKV', 'YouTube', 'Twitch', 'M4V'].map((f) => (
                  <span key={f} className="text-xs px-2 py-1 bg-muted/50 rounded-md text-muted-foreground font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Social proof */}
        <motion.p
          className="text-center text-xs text-muted-foreground mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          🔒 Vos fichiers sont chiffrés et supprimés après 48h · Aucune carte requise
        </motion.p>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

