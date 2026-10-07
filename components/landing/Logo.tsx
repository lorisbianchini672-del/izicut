import Link from 'next/link';

import { cn } from '@/lib/utils';

/** Logo IziCut — charte « studio de nuit » (pastille néon citron + mot-symbole). */
export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps {
  size?: LogoSize;
  /** Masque le texte, ne garde que la pastille. */
  iconOnly?: boolean;
  /** Ligne secondaire sous le nom (ex. « AI Video Studio »). */
  subtitle?: string;
  /** Lien de destination ; `null` pour un logo non cliquable. */
  href?: string | null;
  className?: string;
}

const MARK: Record<LogoSize, string> = {
  sm: 'h-7 w-7 text-[10px] rounded-md',
  md: 'h-8 w-8 text-xs rounded-lg',
  lg: 'h-10 w-10 text-sm rounded-xl',
  xl: 'h-14 w-14 text-lg rounded-2xl',
};
const TEXT: Record<LogoSize, string> = { sm: 'text-base', md: 'text-[17px]', lg: 'text-xl', xl: 'text-3xl' };

export function Logo({ size = 'md', iconOnly = false, subtitle, href = '/', className }: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'grid place-items-center bg-neon font-code font-bold text-ink-950 shadow-[0_0_20px_-4px_rgb(169_144_255/0.7)]',
          MARK[size]
        )}
      >
        IZ
      </span>
      {iconOnly ? (
        <span className="sr-only">IziCut</span>
      ) : (
        <span className="flex flex-col leading-none">
          <span className={cn('font-semibold tracking-tight text-fg', TEXT[size])}>IziCut</span>
          {subtitle ? (
            <span className="mt-1 font-code text-[10px] uppercase tracking-[0.2em] text-fg-subtle">{subtitle}</span>
          ) : null}
        </span>
      )}
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} className="izi-focus rounded-lg" aria-label="IziCut, accueil">
      {content}
    </Link>
  );
}
