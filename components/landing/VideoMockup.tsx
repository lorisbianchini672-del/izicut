'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Subtitles, Shield, Sparkles, Check, Eye } from 'lucide-react';

const SAFE_ZONES = [
  {
    id: 'tiktok',
    label: 'TikTok',
    color: '#ff0050',
    top: 12,
    bottom: 20,
  },
  {
    id: 'reels',
    label: 'Reels',
    color: '#e1306c',
    top: 10,
    bottom: 16,
  },
  {
    id: 'shorts',
    label: 'Shorts',
    color: '#ff0000',
    top: 9,
    bottom: 14,
  },
] as const;

type ZoneId = (typeof SAFE_ZONES)[number]['id'];

type CaptionStyle = {
  name: string;
  activeColor: string;
  inactiveColor: string;
  bg: string | null;
  stroke: string;
  glow: boolean;
};

const SUBTITLE_STYLES: CaptionStyle[] = [
  {
    name: 'Hormozi',
    activeColor: '#c084fc',
    inactiveColor: '#ffffff',
    bg: null,
    stroke: '#000000',
    glow: true,
  },
  {
    name: 'Minimal',
    activeColor: '#ffffff',
    inactiveColor: '#9ca3af',
    bg: null,
    stroke: 'transparent',
    glow: false,
  },
  {
    name: 'Colorful',
    activeColor: '#fbbf24',
    inactiveColor: '#ffffff',
    bg: '#1d1d2ecc',
    stroke: '#1d1d2e',
    glow: false,
  },
];

const WORDS = ['Votre', 'contenu', 'devient', 'viral'];

const BG_COLORS = [
  { c: '#1a1a2e', label: 'Nuit' },
  { c: '#16213e', label: 'Océan' },
  { c: '#0f3460', label: 'Abysse' },
  { c: '#533483', label: 'Améthyste' },
  { c: '#e94560', label: 'Coucher' },
  { c: '#7c3aed', label: 'Violet' },
];

/**
 * Mockup 9:16 INTERACTIF : les widgets ne sont pas décoratifs.
 *  - style de sous-titres → change le rendu dans le téléphone ;
 *  - couleur de fond → change le fond du téléphone ;
 *  - ligne Safe Zone → affiche l'overlay de la plateforme choisie.
 */
export function VideoMockup() {
  const [styleIndex, setStyleIndex] = useState(0);
  const [bgColor, setBgColor] = useState(BG_COLORS[0].c);
  const [activeZone, setActiveZone] = useState<ZoneId | null>('tiktok');
  const style = SUBTITLE_STYLES[styleIndex];
  const zone = SAFE_ZONES.find((z) => z.id === activeZone) ?? null;

  return (
    <motion.div
      className="mt-24 flex justify-center relative"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.8 }}
    >
      <div className="bg-orb bg-orb-purple w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-glow" />

      {/* ---- Widgets flottants gauche — FONCTIONNELS ---- */}
      <div className="hidden lg:flex flex-col gap-4 mr-8 mt-20 self-start">
        <motion.div
          className="glass rounded-2xl p-4 w-44 animate-float"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Subtitles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Style</span>
            <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Eye className="w-3 h-3" /> live
            </span>
          </div>
          <div className="space-y-2">
            {SUBTITLE_STYLES.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setStyleIndex(i)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                  i === styleIndex
                    ? 'bg-primary/20 border border-primary/50 text-primary'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {s.name}
                {i === styleIndex && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="glass rounded-2xl p-4 w-44 animate-float-delay"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold text-foreground">Fond</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BG_COLORS.map((b) => (
              <button
                key={b.c}
                type="button"
                aria-label={`Fond ${b.label}`}
                onClick={() => setBgColor(b.c)}
                style={{ background: b.c }}
                className={`w-10 h-10 rounded-lg border-2 transition-all cursor-pointer hover:scale-110 ${
                  bgColor === b.c
                    ? 'border-primary scale-105 shadow-lg shadow-primary/30'
                    : 'border-transparent hover:border-white/30'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* ---- Mockup 9:16 central — réactif aux widgets ---- */}
      <div className="relative z-10">
        <div className="relative w-[260px] sm:w-[300px] bg-gradient-to-b from-slate-900 to-slate-950 rounded-[2.5rem] border-4 border-slate-700/60 shadow-2xl shadow-black/60 overflow-hidden animate-float">
          {/* Notch */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-slate-900 rounded-full z-30" />

          <div className="relative" style={{ aspectRatio: '9 / 16' }}>
            {/* Fond vidéo — piloté par le widget « Fond » */}
            <motion.div
              className="absolute inset-0"
              animate={{ backgroundColor: bgColor }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            >
              <div
                className="absolute inset-0 opacity-25 transition-opacity duration-500"
                style={{
                  backgroundImage: `radial-gradient(circle at 30% 40%, ${style.activeColor}44 0%, transparent 50%), radial-gradient(circle at 70% 70%, #ec489944 0%, transparent 50%)`,
                }}
              />
            </motion.div>

            {/* Overlay Safe Zones — piloté par le widget droit */}
            <AnimatePresence>
              {zone && (
                <motion.div
                  key={zone.id}
                  className="absolute inset-0 pointer-events-none z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <motion.div
                    className="absolute left-0 right-0 top-0 border-b-2 flex items-center px-3"
                    style={{
                      height: `${zone.top}%`,
                      borderColor: `${zone.color}55`,
                      background: `${zone.color}0d`,
                    }}
                    initial={{ y: -8 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: `${zone.color}bb` }}
                    >
                      {zone.label} · UI Zone
                    </span>
                  </motion.div>
                  <motion.div
                    className="absolute left-0 right-0 bottom-0 border-t-2 flex items-end px-3 pb-2"
                    style={{
                      height: `${zone.bottom}%`,
                      borderColor: `${zone.color}55`,
                      background: `${zone.color}0d`,
                    }}
                    initial={{ y: 8 }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: `${zone.color}bb` }}
                    >
                      Caption Zone
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Score de viralité */}
            <motion.div
              className="absolute top-6 right-3 z-20 bg-black/70 backdrop-blur border border-yellow-500/30 rounded-xl px-3 py-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.4, duration: 0.5 }}
            >
              <div className="flex items-center gap-1 text-yellow-400">
                <span className="text-lg">⭐</span>
                <motion.span
                  className="font-bold text-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8 }}
                >
                  87
                </motion.span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-tight">Score viral</p>
            </motion.div>

            {/* Bouton play */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <motion.button
                type="button"
                aria-label="Lire l'aperçu"
                className="w-16 h-16 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Play className="w-7 h-7 text-white fill-white ml-1" />
              </motion.button>
            </div>

            {/* Sous-titres — pilotés par le widget « Style » */}
            <motion.div
              className="absolute bottom-[22%] left-0 right-0 px-4 z-20 flex flex-wrap justify-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2, duration: 0.4 }}
            >
              {WORDS.map((word, i) => (
                <motion.span
                  key={`${style.name}-${word}`}
                  className="font-black text-lg uppercase drop-shadow-lg px-1 py-0.5 rounded"
                  initial={{ opacity: 0.4, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2 + i * 0.35, duration: 0.2 }}
                  style={{
                    color: i === 1 ? style.activeColor : style.inactiveColor,
                    background: (i === 1 ? style.bg : 'transparent') ?? 'transparent',
                    WebkitTextStroke:
                      style.stroke !== 'transparent' ? `1.5px ${style.stroke}` : undefined,
                    textShadow:
                      style.glow && i === 1
                        ? '0 0 14px #a855f7, 0 2px 8px #000'
                        : '0 2px 8px #000',
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.div>

            <div className="absolute bottom-3 left-3 z-20">
              <span className="text-[10px] font-bold text-white/60 bg-black/40 rounded px-2 py-0.5">
                1080 × 1920
              </span>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[200px] h-[30px] bg-primary/20 rounded-full blur-xl" />
      </div>

      {/* ---- Widgets flottants droite — FONCTIONNELS ---- */}
      <div className="hidden lg:flex flex-col gap-4 ml-8 mt-12 self-start">
        {/* Widget Safe Zones — cliquer change l'overlay du téléphone */}
        <motion.div
          className="glass rounded-2xl p-4 w-44 animate-float-delay"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.1, duration: 0.6 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold text-foreground">Safe Zones</span>
            <span className="ml-auto text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Eye className="w-3 h-3" /> live
            </span>
          </div>
          <div className="space-y-2">
            {SAFE_ZONES.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                  activeZone === z.id
                    ? 'bg-white/10 font-bold text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: z.color }}
                />
                <span>{z.label}</span>
                <span
                  className={`ml-auto font-bold text-xs transition-colors ${
                    activeZone === z.id ? 'text-emerald-400' : 'text-muted-foreground/50'
                  }`}
                >
                  {activeZone === z.id ? '👁' : '○'}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Widget Stats + progression */}
        <motion.div
          className="glass rounded-2xl p-4 w-44 animate-float"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.3, duration: 0.6 }}
        >
          <p className="text-xs text-muted-foreground mb-3">Rendu estimé</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Transcription</span>
              <span className="text-green-400 font-bold">✓</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Analyse IA</span>
              <span className="text-green-400 font-bold">✓</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rendu Remotion</span>
              <span className="text-primary font-bold">⟳ 45s</span>
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: '72%' }}
              transition={{ delay: 2.2, duration: 1.5, ease: 'easeOut' }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-right">72%</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
