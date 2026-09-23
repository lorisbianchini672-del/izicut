'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Scissors,
  Volume2,
  VolumeX,
  Type,
  Crop,
  Shield,
  Download,
  Sparkles,
  Layers,
  Film,
  ZoomIn,
  ZoomOut,
  Save,
  CheckCircle2,
  Sliders,
  Move,
  Plus,
  Smile,
  Image as ImageIcon,
  ArrowLeft,
  ChevronRight,
  SplitSquareVertical,
  UserCheck,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export type VideoEditorProps = {
  clipId: string;
  initialTitle?: string;
  initialDuration?: number;
};

type WordItem = {
  id: string;
  word: string;
  start: number;
  end: number;
  emoji?: string;
};

const INITIAL_TRANSCRIPT: WordItem[] = [
  { id: '1', word: 'Si', start: 0.0, end: 0.3 },
  { id: '2', word: 'vous', start: 0.3, end: 0.5 },
  { id: '3', word: 'faites', start: 0.5, end: 0.8 },
  { id: '4', word: 'encore', start: 0.8, end: 1.1 },
  { id: '5', word: 'cette', start: 1.1, end: 1.4 },
  { id: '6', word: 'erreur', start: 1.4, end: 1.9, emoji: '⚠️' },
  { id: '7', word: 'en', start: 1.9, end: 2.1 },
  { id: '8', word: '2026', start: 2.1, end: 2.6, emoji: '🚀' },
  { id: '9', word: 'vous', start: 2.8, end: 3.1 },
  { id: '10', word: 'perdez', start: 3.1, end: 3.6 },
  { id: '11', word: 'votre', start: 3.6, end: 3.9 },
  { id: '12', word: 'temps', start: 3.9, end: 4.5, emoji: '⏳' },
  { id: '13', word: 'sur', start: 4.8, end: 5.1 },
  { id: '14', word: 'TikTok', start: 5.1, end: 5.8, emoji: '📱' },
  { id: '15', word: 'et', start: 5.8, end: 6.0 },
  { id: '16', word: 'Reels', start: 6.0, end: 6.6, emoji: '🔥' },
];

export function VideoEditor({ clipId, initialTitle = "Clip IA #1 — Le piège mental qui détruit 90% des créateurs", initialDuration = 35.5 }: VideoEditorProps) {
  // Lecture & Playhead
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(2.4);
  const duration = initialDuration;

  // Montage In / Out
  const [inPoint, setInPoint] = useState(0.0);
  const [outPoint, setOutPoint] = useState(duration);
  const [silenceRemoved, setSilenceRemoved] = useState(false);

  // Sous-titres
  const [words, setWords] = useState<WordItem[]>(INITIAL_TRANSCRIPT);
  const [activeTab, setActiveTab] = useState<'captions' | 'cadrage' | 'habillage' | 'audio'>('captions');
  const [selectedFont, setSelectedFont] = useState('Montserrat');
  const [fontSize, setFontSize] = useState(24);
  const [activeColor, setActiveColor] = useState('#FACC15'); // Jaune Hormozi
  const [captionYPosition, setCaptionYPosition] = useState(72); // % depuis le haut
  const [captionAnimation, setCaptionAnimation] = useState<'karaoke' | 'pop' | 'glow'>('karaoke');

  // Cadrage
  const [framingMode, setFramingMode] = useState<'face_tracking' | 'split_screen' | 'manual'>('face_tracking');
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [backgroundType, setBackgroundType] = useState<'blur' | 'color' | 'gradient'>('blur');

  // Export
  const [fps, setFps] = useState<'30' | '60'>('60');
  const [bitrate, setBitrate] = useState<'8' | '16'>('16');
  const [isExporting, setIsExporting] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Simulation playhead
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= outPoint) {
            setIsPlaying(false);
            return inPoint;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, inPoint, outPoint]);

  // Suppression des silences
  const handleRemoveSilence = () => {
    setSilenceRemoved(true);
    // Ajuste le outPoint pour simuler le gain de 4.2 secondes
    setOutPoint((prev) => Math.max(prev - 4.2, 5));
  };

  // Édition de mot
  const handleWordChange = (id: string, newText: string) => {
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, word: newText } : w)));
  };

  // Déclencher export
  const startExport = () => {
    setExportModal(true);
    setIsExporting(true);
    setExportProgress(0);

    const step = setInterval(() => {
      setExportProgress((p) => {
        if (p >= 100) {
          clearInterval(step);
          setIsExporting(false);
          return 100;
        }
        return p + 10;
      });
    }, 200);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pt-16">
      
      {/* ============================================================
          BARRE SUPÉRIEURE DU STUDIO (Command Bar)
          ============================================================ */}
      <header className="h-14 border-b border-border/50 bg-card/60 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="rounded-xl h-9" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>

          <span className="text-border">|</span>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
              {clipId}
            </span>
            <input
              type="text"
              defaultValue={initialTitle}
              className="text-xs sm:text-sm font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 text-foreground max-w-[200px] sm:max-w-md truncate"
            />
          </div>
        </div>

        {/* Réglages d'encodage & Export */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-muted/40 px-2.5 py-1 rounded-xl border border-border/40 text-xs">
            <span className="text-muted-foreground font-semibold">Rendu Remotion :</span>
            <select
              value={fps}
              onChange={(e) => setFps(e.target.value as any)}
              className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="30" className="bg-card">30 FPS</option>
              <option value="60" className="bg-card">60 FPS (Ultra)</option>
            </select>
            <span className="text-border">·</span>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(e.target.value as any)}
              className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="8" className="bg-card">8 Mbps</option>
              <option value="16" className="bg-card">16 Mbps (Master)</option>
            </select>
          </div>

          <Button
            variant="gradient"
            size="sm"
            onClick={startExport}
            className="glow-primary h-9 px-4 font-bold rounded-xl"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Exporter MP4 HD
          </Button>
        </div>
      </header>

      {/* ============================================================
          ZONE CENTRALE : LECTEUR 9:16 + PANNEAU DE CONTRÔLES
          ============================================================ */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* 1. LECTEUR SMARTPHONE VERTICAL 9:16 */}
        <div className="flex-1 bg-black/40 p-4 sm:p-6 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Orbe ambiant */}
          <div className="bg-orb bg-orb-purple w-[400px] h-[400px] opacity-20 pointer-events-none" />

          {/* Smartphone 9:16 */}
          <div className="relative w-[260px] sm:w-[300px] bg-slate-950 rounded-[2.8rem] border-4 border-slate-700/80 shadow-2xl overflow-hidden" style={{ aspectRatio: '9/16' }}>
            
            {/* Notch */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-30" />

            {/* Fond vidéo simulé */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-300"
              style={{
                background: backgroundType === 'blur'
                  ? 'radial-gradient(circle, #3b0764 0%, #0f172a 100%)'
                  : backgroundType === 'gradient'
                  ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
                  : '#020617'
              }}
            >
              {/* Effet cadrage */}
              {framingMode === 'split_screen' && (
                <div className="absolute inset-0 flex flex-col">
                  <div className="flex-1 border-b-2 border-white/20 flex items-center justify-center bg-purple-950/40">
                    <span className="text-xs font-bold text-white/60">Intervenant 1 (Hôte)</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center bg-blue-950/40">
                    <span className="text-xs font-bold text-white/60">Intervenant 2 (Invité)</span>
                  </div>
                </div>
              )}

              {framingMode === 'face_tracking' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-44 rounded-2xl border-2 border-emerald-400/60 bg-emerald-400/5 flex flex-col items-center justify-between p-2">
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-black/60 px-1 rounded">AI Face Track</span>
                    <span className="text-[10px] text-white/60">Sujet centré</span>
                  </div>
                </div>
              )}

              {/* Sous-titres dynamiques mot-à-mot (Draggable Y) */}
              <div
                className="absolute left-0 right-0 px-4 text-center z-20 transition-all cursor-move select-none"
                style={{
                  top: `${captionYPosition}%`,
                  fontFamily: selectedFont
                }}
              >
                <div className="inline-flex flex-wrap justify-center gap-1.5 p-2 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 shadow-xl">
                  {words.slice(0, 8).map((w, idx) => (
                    <span
                      key={w.id}
                      className={cn(
                        'font-black tracking-tight text-sm uppercase transition-all duration-200',
                        idx === 2 ? 'scale-115' : ''
                      )}
                      style={{
                        fontSize: `${fontSize}px`,
                        color: idx === 2 ? activeColor : '#FFFFFF',
                        textShadow: idx === 2 ? `0 0 14px ${activeColor}90, 0 2px 4px #000` : '0 2px 4px #000'
                      }}
                    >
                      {w.word} {w.emoji && <span>{w.emoji}</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Masques Safe Zones TikTok / Reels */}
              {showSafeZones && (
                <div className="absolute inset-0 pointer-events-none z-30">
                  <div className="absolute top-0 left-0 right-0 h-[14%] bg-red-500/20 border-b-2 border-red-500/40 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-red-300 uppercase tracking-widest">TikTok UI (Haut)</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-[22%] bg-red-500/20 border-t-2 border-red-500/40 flex items-end justify-center pb-2">
                    <span className="text-[9px] font-bold text-red-300 uppercase tracking-widest">Description & Audio (Bas)</span>
                  </div>
                  <div className="absolute top-0 right-0 bottom-0 w-[18%] bg-red-500/10 border-l-2 border-red-500/30 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-red-300 rotate-90 uppercase tracking-widest">Boutons like/partage</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton de lecture central */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white transition-all transform hover:scale-110 z-20"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5 fill-white" />}
            </button>
          </div>

          {/* Contrôles de lecture sous le smartphone */}
          <div className="flex items-center gap-4 mt-4 bg-card/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-border/50 text-xs">
            <button
              onClick={() => { setCurrentTime(inPoint); setIsPlaying(false); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Retour au début In"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>
            <span className="font-mono text-xs font-bold text-foreground">
              {currentTime.toFixed(1)}s / {outPoint.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* 2. PANNEAU LATÉRAL DROIT : ÉDITION POUSSÉE */}
        <div className="w-full lg:w-[460px] border-l border-border/50 bg-card/40 backdrop-blur-xl flex flex-col shrink-0">
          
          {/* Onglets de personnalisation */}
          <div className="flex border-b border-border/50 p-2 gap-1 bg-muted/20">
            {[
              { id: 'captions', label: 'Sous-titres', icon: <Type className="w-3.5 h-3.5" /> },
              { id: 'cadrage', label: 'Cadrage 9:16', icon: <Crop className="w-3.5 h-3.5" /> },
              { id: 'habillage', label: 'Habillage', icon: <Smile className="w-3.5 h-3.5" /> },
              { id: 'audio', label: 'Audio & Silences', icon: <Volume2 className="w-3.5 h-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Corps de l'onglet actif */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6">

            {/* TAB 1 : SOUS-TITRES POUSSÉS */}
            {activeTab === 'captions' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-black text-foreground mb-1">Typographie & Animation</h3>
                  <p className="text-xs text-muted-foreground">Style karaoké mot-à-mot inspiré d'Alex Hormozi.</p>
                </div>

                {/* Couleur active */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Couleur du mot actif
                  </label>
                  <div className="flex items-center gap-2">
                    {['#FACC15', '#EC4899', '#38BDF8', '#34D399', '#FFFFFF', '#A855F7'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setActiveColor(c)}
                        style={{ background: c }}
                        className={cn(
                          'w-8 h-8 rounded-xl border-2 transition-transform',
                          activeColor === c ? 'scale-110 border-white shadow-lg' : 'border-transparent'
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Police & Taille */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Police
                    </label>
                    <select
                      value={selectedFont}
                      onChange={(e) => setSelectedFont(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="Montserrat">Montserrat (Gras)</option>
                      <option value="Inter">Inter (Épuré)</option>
                      <option value="Space Grotesk">Space Grotesk (High-Tech)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Taille</label>
                      <span className="text-xs font-mono font-bold">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={36}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="w-full accent-primary mt-2"
                    />
                  </div>
                </div>

                {/* Position Y des sous-titres */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5" /> Position verticale
                    </label>
                    <span className="text-xs font-mono font-bold">{captionYPosition}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={85}
                    value={captionYPosition}
                    onChange={(e) => setCaptionYPosition(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Haut (20%)</span>
                    <span>Centre (50%)</span>
                    <span>Bas (75% - Idéal)</span>
                  </div>
                </div>

                {/* Éditeur mot-à-mot */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Transcription mot-à-mot (Édition manuelle)
                    </label>
                    <span className="text-[10px] text-primary">Modifiable en direct</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-muted/20 border border-border/40 max-h-56 overflow-y-auto space-y-2">
                    {words.map((w, idx) => (
                      <div key={w.id} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0">
                          {w.start.toFixed(1)}s
                        </span>
                        <input
                          type="text"
                          value={w.word}
                          onChange={(e) => handleWordChange(w.id, e.target.value)}
                          className="flex-1 p-1.5 text-xs font-semibold rounded-lg bg-card/60 border border-border/40 focus:border-primary text-foreground"
                        />
                        {w.emoji && (
                          <span className="text-sm px-1.5 py-0.5 rounded bg-muted">{w.emoji}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2 : CADRAGE 9:16 & SAFE ZONES */}
            {activeTab === 'cadrage' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-black text-foreground mb-1">Cadrage Intelligent</h3>
                  <p className="text-xs text-muted-foreground">Adaptez la vidéo horizontale au format vertical 9:16.</p>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    onClick={() => setFramingMode('face_tracking')}
                    className={cn(
                      'p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between',
                      framingMode === 'face_tracking'
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <UserCheck className="w-5 h-5 text-primary" />
                      <div>
                        <div className="text-xs font-bold text-foreground">Suivi de Visage IA (Face Tracking)</div>
                        <div className="text-[11px] text-muted-foreground">Centre automatiquement l'orateur principal.</div>
                      </div>
                    </div>
                    {framingMode === 'face_tracking' && <Check className="w-4 h-4 text-primary" />}
                  </button>

                  <button
                    onClick={() => setFramingMode('split_screen')}
                    className={cn(
                      'p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between',
                      framingMode === 'split_screen'
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <SplitSquareVertical className="w-5 h-5 text-accent" />
                      <div>
                        <div className="text-xs font-bold text-foreground">Split-Screen Multi-intervenants</div>
                        <div className="text-[11px] text-muted-foreground">Écran scindé pour interviews et podcasts.</div>
                      </div>
                    </div>
                    {framingMode === 'split_screen' && <Check className="w-4 h-4 text-primary" />}
                  </button>
                </div>

                {/* Safe Zones Mask Switch */}
                <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Shield className={cn('w-4 h-4', showSafeZones ? 'text-red-400' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-xs font-bold text-foreground">Masque Safe Zones</p>
                      <p className="text-[10px] text-muted-foreground">Afficher les zones TikTok / Instagram Reels</p>
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
              </div>
            )}

            {/* TAB 3 : HABILLAGE & B-ROLLS */}
            {activeTab === 'habillage' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-black text-foreground mb-1">Habillage & Arrière-plan</h3>
                  <p className="text-xs text-muted-foreground">Gérez le fond et ajoutez des éléments d'accroche.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Style d'arrière-plan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'blur', label: 'Flou Vidéo' },
                      { id: 'gradient', label: 'Dégradé IA' },
                      { id: 'color', label: 'Noir Pur' },
                    ].map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setBackgroundType(b.id as any)}
                        className={cn(
                          'p-2.5 rounded-xl border text-xs font-bold transition-all text-center',
                          backgroundType === b.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/60 bg-muted/20 text-muted-foreground'
                        )}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Autocollants & Emojis tendance</label>
                  <div className="grid grid-cols-6 gap-2 text-xl p-3 bg-muted/20 rounded-2xl border border-border/40">
                    {['🔥', '🚀', '💡', '⚠️', '📈', '🎯', '👀', '🤯', '💰', '⚡', '⏳', '🏆'].map((em) => (
                      <button
                        key={em}
                        onClick={() => alert(`Emoji ${em} ajouté au clip à la position actuelle`)}
                        className="p-2 rounded-lg hover:bg-muted hover:scale-125 transition-all text-center"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4 : AUDIO & SUPPRESSION SILENCES */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-black text-foreground mb-1">Dynamique Sonore</h3>
                  <p className="text-xs text-muted-foreground">Optimisez le rythme pour captiver l'algorithme.</p>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 via-accent/10 to-transparent border border-primary/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <VolumeX className="w-5 h-5 text-accent" />
                      <div>
                        <h4 className="font-bold text-xs text-foreground">Suppression Automatique des Silences</h4>
                        <p className="text-[10px] text-muted-foreground">Coupe les pauses & hésitations {'>'} 0.3s</p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleRemoveSilence}
                    disabled={silenceRemoved}
                    className="w-full rounded-xl text-xs font-bold bg-accent hover:bg-accent/90 text-white shadow-lg"
                  >
                    {silenceRemoved ? '✓ 4.2s de silences supprimés' : '⚡ Supprimer les silences en 1 clic'}
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ============================================================
          ZONE INFÉRIEURE : TIMELINE MULTI-PISTES INTERACTIVE
          ============================================================ */}
      <footer className="h-44 border-t border-border/50 bg-card/60 backdrop-blur-xl p-3 flex flex-col shrink-0">
        
        {/* En-tête timeline : Outils de coupe & Zoom */}
        <div className="flex items-center justify-between pb-2 border-b border-border/30 text-xs">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => alert(`Coupe réalisée à ${currentTime.toFixed(2)}s`)}
              className="h-7 text-xs rounded-lg border-border/60"
            >
              <Scissors className="w-3.5 h-3.5 mr-1" />
              Scinder au curseur
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleRemoveSilence}
              className="h-7 text-xs rounded-lg border-border/60 text-accent"
            >
              <VolumeX className="w-3.5 h-3.5 mr-1" />
              Nettoyer blancs
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-xs text-primary">
              Point In: {inPoint.toFixed(1)}s ➔ Out: {outPoint.toFixed(1)}s (Durée: {(outPoint - inPoint).toFixed(1)}s)
            </span>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded hover:bg-muted text-muted-foreground"><ZoomOut className="w-3.5 h-3.5" /></button>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground"><ZoomIn className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        {/* Pistes de montage */}
        <div className="flex-1 pt-2 space-y-1.5 relative overflow-x-auto select-none">
          
          {/* Piste 1 : Vidéo & Cut Points */}
          <div className="h-7 bg-muted/30 rounded-lg flex items-center px-2 relative border border-border/30">
            <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0 flex items-center gap-1">
              <Film className="w-3 h-3 text-primary" /> Vidéo
            </span>
            <div className="flex-1 h-5 bg-primary/20 rounded relative flex items-center px-2">
              <span className="text-[10px] font-semibold text-primary truncate">1080x1920 (Source HD)</span>
              {/* Point In Draggable marker */}
              <div
                className="absolute top-0 bottom-0 w-2 bg-primary rounded cursor-ew-resize"
                style={{ left: `${(inPoint / duration) * 100}%` }}
                title="Point In"
              />
              {/* Point Out Draggable marker */}
              <div
                className="absolute top-0 bottom-0 w-2 bg-primary rounded cursor-ew-resize"
                style={{ left: `${(outPoint / duration) * 100}%` }}
                title="Point Out"
              />
            </div>
          </div>

          {/* Piste 2 : Audio & Silences */}
          <div className="h-7 bg-muted/30 rounded-lg flex items-center px-2 relative border border-border/30">
            <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0 flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-accent" /> Audio
            </span>
            <div className="flex-1 h-5 bg-accent/20 rounded relative flex items-center px-2 overflow-hidden">
              {/* Onde sonore stylisée */}
              <div className="w-full flex items-center gap-0.5 opacity-60">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-accent rounded-full"
                    style={{ height: `${(i % 5 + 1) * 3}px` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Piste 3 : Sous-titres */}
          <div className="h-7 bg-muted/30 rounded-lg flex items-center px-2 relative border border-border/30">
            <span className="text-[10px] font-bold text-muted-foreground w-16 shrink-0 flex items-center gap-1">
              <Type className="w-3 h-3 text-amber-400" /> Légendes
            </span>
            <div className="flex-1 h-5 bg-amber-500/20 rounded relative flex items-center px-2">
              <span className="text-[10px] font-semibold text-amber-300 truncate">Hormozi Karaoke Sync (16 mots)</span>
            </div>
          </div>

          {/* Curseur de lecture vertical (Playhead) */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-20 flex flex-col items-center"
            style={{ left: `calc(4rem + ${(currentTime / duration) * 80}%)` }}
          >
            <div className="w-2.5 h-2.5 bg-white rotate-45 -mt-1 shadow" />
          </div>
        </div>

      </footer>

      {/* ============================================================
          MODAL D'EXPORTATION MP4 HD AVEC REMOTION
          ============================================================ */}
      <AnimatePresence>
        {exportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border/80 rounded-3xl p-6 shadow-2xl text-center space-y-5"
            >
              <div className="w-16 h-16 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mx-auto">
                <Download className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-black text-foreground">
                  {isExporting ? 'Génération du rendu Remotion...' : 'Exportation Terminée !'}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Format 1080×1920 HD · {fps} FPS · {bitrate} Mbps
                </p>
              </div>

              {/* Barre de progression */}
              <div className="space-y-2">
                <div className="h-3 bg-muted/60 rounded-full overflow-hidden p-0.5 border border-border/40">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs font-mono text-muted-foreground">
                  <span>Encodage H.264</span>
                  <span className="font-bold text-primary">{exportProgress}%</span>
                </div>
              </div>

              {!isExporting && (
                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="gradient"
                    className="w-full rounded-xl font-bold h-11 glow-primary"
                    onClick={() => {
                      alert('Téléchargement du fichier MP4 (1080x1920) démarré !');
                      setExportModal(false);
                    }}
                  >
                    Télécharger le MP4 (1080×1920)
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl h-10"
                    onClick={() => setExportModal(false)}
                  >
                    Retour à l'éditeur
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

