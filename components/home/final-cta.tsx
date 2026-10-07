import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Magnetic, Reveal, SplitWords } from './motion';

export function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="izi-noise relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-line-strong bg-ink-900 px-6 py-16 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="izi-grid pointer-events-none absolute inset-0 opacity-60" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-full h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(169_144_255/0.22),transparent)]" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
            <SplitWords text="Votre prochaine vidéo contient déjà vos meilleurs shorts." accentFrom={5} onView />
          </h2>
          <Reveal delay={0.5}>
          <p className="mx-auto mt-5 max-w-md text-fg-muted">30 minutes offertes pour essayer. Sans carte bancaire.</p>
          <Magnetic className="mt-9">
          <Link
            href="/upload"
            className="izi-focus group inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neon px-6 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_0_40px_-6px_rgb(169_144_255/0.8)] transition-shadow hover:shadow-[0_0_56px_-4px_rgb(169_144_255/0.95)]"
          >
            Créer mes premiers clips
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          </Magnetic>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
