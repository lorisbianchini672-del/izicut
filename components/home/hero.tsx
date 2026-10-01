'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { LinkForm } from './link-form';
import { ProductPreview } from './product-preview';

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <section className="izi-noise relative overflow-hidden pt-28 sm:pt-36">
      <div aria-hidden className="izi-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(61_224_255/0.10),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pb-20 sm:px-6 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:px-8 lg:pb-28">
        <div className="flex flex-col items-start">
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.03] px-3 py-1 font-code text-[11px] uppercase tracking-[0.18em] text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse-rec rounded-full bg-rec" aria-hidden />
            Clipping vidéo par IA
          </motion.p>

          <motion.h1 {...rise(0.06)} className="mt-6 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-[4.4rem]">
            Une vidéo longue.
            <br />
            Des clips qui <span className="izi-neon-text">retiennent.</span>
          </motion.h1>

          <motion.p {...rise(0.12)} className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-fg-muted">
            Collez un lien : IziCut transcrit chaque mot, repère les passages qui accrochent
            et rend des clips 9:16 sous-titrés, prêts pour TikTok, Reels et Shorts.
          </motion.p>

          <motion.div {...rise(0.18)} className="mt-9 w-full">
            <LinkForm />
          </motion.div>

          <motion.dl {...rise(0.24)} className="mt-10 grid w-full max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['Mot à mot', 'sous-titres synchronisés'],
              ['9:16', 'rendu 1080×1920'],
              ['6 styles', 'de sous-titres animés'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-code text-sm font-semibold text-fg">{k}</dt>
                <dd className="mt-1 text-xs leading-snug text-fg-subtle">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={{ perspective: 1200 }}
        >
          <ProductPreview />
        </motion.div>
      </div>
    </section>
  );
}
