import Link from 'next/link';

import { LogoMark } from '@/components/landing/LogoMark';
import { cn } from '@/lib/utils';

/** Logo IziCut — pictogramme « lecture coupée » + mot-symbole. */
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

const MARK: Record<LogoSize, string> = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10', xl: 'h-14 w-14' };
const TEXT: Record<LogoSize, string> = { sm: 'text-base', md: 'text-[17px]', lg: 'text-xl', xl: 'text-3xl' };

export function Logo({ size = 'md', iconOnly = false, subtitle, href = '/', className }: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn('shrink-0 drop-shadow-[0_0_18px_rgb(60_120_255/0.45)]', MARK[size])} />
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
