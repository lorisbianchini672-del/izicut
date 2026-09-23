'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export interface TocEntry {
  id: string;
  label: string;
}

export interface InfoPageProps {
  /** Petite étiquette au-dessus du titre (ex. « Documentation »). */
  eyebrow: string;
  /** Titre principal ; le dernier mot reçoit le dégradé animé. */
  title: string;
  /** Phrase d'introduction. */
  description: string;
  /** Fil d'Ariane (le dernier élément est la page courante). */
  breadcrumbs: Crumb[];
  /** Sommaire latéral collant (ancres vers les sections). */
  toc?: TocEntry[];
  /** Date de dernière mise à jour affichée dans l'en-tête. */
  updatedAt?: string;
  /** Libellé du CTA final. */
  ctaLabel?: string;
  /** Lien du CTA final. */
  ctaHref?: string;
  children: React.ReactNode;
}

/**
 * Enveloppe commune des pages éditoriales (docs, guide, blog…).
 * Fournit l'ambiance « Dark High-Tech » : orbes aurora, grille, fil
 * d'Ariane, titre en dégradé animé, sommaire collant et CTA final.
 */
export function InfoPage({
  eyebrow,
  title,
  description,
  breadcrumbs,
  toc,
  updatedAt,
  ctaLabel = 'Essayer IziCut gratuitement',
  ctaHref = '/upload',
  children
}: InfoPageProps) {
  const words = title.trim().split(' ');
  const head = words.slice(0, -1).join(' ');
  const tail = words[words.length - 1];

  return (
    <div className="relative min-h-screen overflow-hidden pt-28">
      {/* Ambiance */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-orb bg-orb-purple -top-32 -left-24 h-[420px] w-[420px] opacity-25 animate-aurora" />
        <div className="bg-orb bg-orb-blue top-40 -right-24 h-[380px] w-[380px] opacity-20 animate-aurora" />
        <div className="absolute inset-0 bg-grid opacity-[0.15]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent" />
      </div>

      <div className="container mx-auto max-w-6xl px-4">
        {/* Fil d'Ariane */}
        <motion.nav
          aria-label="Fil d'Ariane"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {crumb.href ? (
                <Link href={crumb.href} className="transition-colors hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground/80">{crumb.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 opacity-50" />}
            </span>
          ))}
        </motion.nav>

        {/* En-tête */}
        <header className="max-w-3xl">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary"
          >
            <Sparkles className="h-3 w-3" />
            {eyebrow}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-4xl font-black tracking-tight sm:text-5xl"
          >
            {head && <span className="text-foreground">{head} </span>}
            <span className="animate-gradient-x bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 bg-[length:200%_auto] bg-clip-text text-transparent">
              {tail}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-5 text-base leading-relaxed text-muted-foreground"
          >
            {description}
          </motion.p>

          {updatedAt && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
              <Clock className="h-3.5 w-3.5" />
              Dernière mise à jour : {updatedAt}
            </p>
          )}
        </header>

        {/* Contenu + sommaire */}
        <div className={cn('mt-14 gap-12 pb-24', toc && toc.length > 0 ? 'lg:grid lg:grid-cols-[1fr_240px]' : '')}>
          <div className="info-prose min-w-0">{children}</div>

          {toc && toc.length > 0 && (
            <aside className="hidden lg:block">
              <nav className="sticky top-28 space-y-3 rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Sur cette page
                </p>
                <ul className="space-y-2">
                  {toc.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className="block text-xs text-muted-foreground transition-colors hover:text-primary"
                      >
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          )}
        </div>

        {/* CTA final */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="animated-border mb-24 rounded-3xl p-[1px]"
        >
          <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-10 text-center backdrop-blur-xl">
            <div className="bg-orb bg-orb-purple -top-24 left-1/2 h-64 w-64 -translate-x-1/2 opacity-30" />
            <div className="relative z-10">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Prêt à transformer vos vidéos longues ?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Déposez un fichier ou collez un lien YouTube / Twitch : l&apos;IA repère les
                meilleurs moments et génère vos clips 9:16 sous-titrés.
              </p>
              <Link
                href={ctaHref}
                className="shine-hover mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition-transform duration-300 hover:scale-[1.03]"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}

/**
 * Section de contenu avec ancre automatique (pour le sommaire collant).
 */
export function InfoSection({
  id,
  title,
  children,
  className
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      className={cn('scroll-mt-28', className)}
    >
      <h2>{title}</h2>
      {children}
    </motion.section>
  );
}

export default InfoPage;
