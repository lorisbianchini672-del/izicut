'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps {
  /** Taille de l'icône ; le mot-symbole suit proportionnellement. */
  size?: LogoSize;
  /** Active le halo pulsant, le badge « IA » et les micro-animations. */
  animated?: boolean;
  /** Affiche le mot-symbole « IziCut ». */
  withText?: boolean;
  /** Sous-titre optionnel sous le mot-symbole (ex. « AI Video Studio »). */
  subtitle?: string;
  /** Rend le logo cliquable. `null` = statique (utile dans un <Link> existant). */
  href?: string | null;
  className?: string;
}

const ICON_SIZES: Record<LogoSize, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
  xl: 'w-14 h-14'
};

const TEXT_SIZES: Record<LogoSize, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl'
};

const MONOGRAM_SIZES: Record<LogoSize, string> = {
  sm: 'text-[8px]',
  md: 'text-[10px]',
  lg: 'text-xs',
  xl: 'text-sm'
};

/**
 * Logo IziCut — écran 9:16 aux bords dégradés avec trait de coupe et lame
 * laser au survol, badge « IA » pulsant, mot-symbole cyan → fuchsia → rose.
 */
export function Logo({
  size = 'md',
  animated = true,
  withText = true,
  subtitle,
  href = '/',
  className
}: LogoProps) {
  const inner = (
    <span className={cn('group/logo inline-flex items-center gap-2.5', className)}>
      {/* Icône */}
      <span className="relative inline-flex flex-shrink-0">
        {/* Halo lumineux */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-500/30 via-fuchsia-500/30 to-rose-500/30 blur-xl"
          animate={animated ? { opacity: [0.3, 0.75, 0.3], scale: [1, 1.12, 1] } : undefined}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.span
          className={cn(
            ICON_SIZES[size],
            'relative flex items-center justify-center overflow-hidden rounded-xl p-[1.5px]',
            'bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-rose-500',
            'shadow-lg shadow-fuchsia-500/25 transition-shadow duration-300',
            'group-hover/logo:shadow-xl group-hover/logo:shadow-fuchsia-500/50'
          )}
          whileHover={animated ? { scale: 1.06, rotate: -4 } : undefined}
          transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        >
          <span className="relative flex h-full w-full items-center justify-center rounded-[10px] bg-[#0a0a12]">
            <span className={cn('font-black tracking-tight text-white', MONOGRAM_SIZES[size])}>
              IZI
            </span>

            {/* Trait de coupe */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-px w-3/4 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            />

            {/* Lame laser au survol */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent opacity-0 transition-all duration-500 group-hover/logo:left-full group-hover/logo:opacity-100"
            />
          </span>
        </motion.span>

        {/* Badge IA */}
        {animated && (
          <motion.span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 ring-2 ring-background"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 18 }}
          >
            <motion.span
              className="text-[6px] font-bold leading-none text-white"
              animate={animated ? { opacity: [1, 0.3, 1] } : undefined}
              transition={{ duration: 2, repeat: Infinity }}
            >
              IA
            </motion.span>
          </motion.span>
        )}
      </span>

      {/* Mot-symbole */}
      {withText && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn('font-black tracking-tight', TEXT_SIZES[size])}>
            <span className="text-foreground">Izi</span>
            <span className="bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
              Cut
            </span>
          </span>
          {subtitle && (
            <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (!href) return inner;

  return (
    <Link href={href} aria-label="IziCut — retour à l'accueil" className="inline-flex">
      {inner}
    </Link>
  );
}

export default Logo;
