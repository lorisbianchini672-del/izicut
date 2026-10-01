'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Menu, X } from 'lucide-react';

const LINKS = [
  ['Fonctionnalités', '/#features'],
  ['Studio', '/#studio'],
  ['Tarifs', '/#pricing'],
  ['FAQ', '/#faq'],
  ['Docs', '/docs'],
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 font-display transition-all duration-300 ${
        scrolled || open ? 'border-b border-line bg-ink-950/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="izi-focus flex items-center gap-2.5 rounded-lg" aria-label="IziCut, accueil">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-neon font-code text-xs font-bold text-ink-950 shadow-[0_0_20px_-4px_rgb(200_255_61/0.7)]">
            IZ
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-fg">IziCut</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="izi-focus rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg">
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="izi-focus hidden rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg sm:block">
            Connexion
          </Link>
          <Link
            href="/upload"
            className="izi-focus group hidden items-center gap-1.5 rounded-lg bg-fg px-3.5 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-neon sm:inline-flex"
          >
            Essayer gratuitement
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="izi-mobile-menu"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="izi-focus cursor-pointer rounded-lg p-2 text-fg md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div id="izi-mobile-menu" className="border-t border-line px-4 pb-6 pt-2 md:hidden">
          <ul className="space-y-1">
            {LINKS.map(([label, href]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="izi-focus block rounded-lg px-3 py-3 text-base text-fg-muted hover:bg-white/[0.04] hover:text-fg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href="/login" className="izi-focus rounded-xl border border-line-strong px-4 py-3 text-center text-sm text-fg">Connexion</Link>
            <Link href="/upload" className="izi-focus rounded-xl bg-neon px-4 py-3 text-center text-sm font-semibold text-ink-950">Essayer</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
