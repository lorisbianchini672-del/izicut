'use client';

import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { AudioWaveform, Gauge, Type } from 'lucide-react';

import { LinkForm } from './link-form';
import { EASE, SplitWords, Tilt } from './motion';
import { ProductPreview } from './product-preview';

const CHIPS = [
  { icon: Gauge, label: 'Score viral 91', className: '-left-6 top-10 sm:-left-10', delay: 1.1, float: 0 },
  { icon: Type, label: 'Mot à mot', className: '-right-4 top-1/3 sm:-right-8', delay: 1.25, float: 1.2 },
  { icon: AudioWaveform, label: 'Silences coupés', className: 'left-10 -bottom-5', delay: 1.4, float: 2.4 },
];

export function Hero() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // Projecteur qui suit le curseur
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const sx = useSpring(mx, { stiffness: 90, damping: 20 });
  const sy = useSpring(my, { stiffness: 90, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${sx}px ${sy}px, rgb(200 255 61 / 0.09), transparent 65%)`;

  // Sortie de scène : l'aperçu monte, se redresse et recule
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const previewY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, -120]);
  const previewScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 0.92]);
  const textY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 80]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);

  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 18, filter: 'blur(8px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, transition: { duration: 0.9, delay, ease: EASE } };

  return (
    <section
      ref={sectionRef}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      className="izi-noise relative overflow-hidden pt-28 sm:pt-36"
    >
      <div aria-hidden className="izi-grid pointer-events-none absolute inset-0" />
      {!reduce ? <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: spotlight }} /> : null}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(61_224_255/0.12),transparent)]"
        animate={reduce ? undefined : { opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pb-24 sm:px-6 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:px-8 lg:pb-32">
        <motion.div style={{ y: textY, opacity: textOpacity }} className="flex flex-col items-start">
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/[0.03] px-3 py-1 font-code text-[11px] uppercase tracking-[0.18em] text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse-rec rounded-full bg-rec" aria-hidden />
            Le clipping IA pensé pour le français
          </motion.p>

          <h1 className="mt-6 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-[4.4rem]">
            <SplitWords text="Une vidéo longue." delay={0.1} />
            <br />
            <SplitWords text="Des clips qui retiennent." delay={0.35} accentFrom={3} />
          </h1>

          <motion.p {...rise(0.65)} className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-fg-muted">
            Collez un lien ou importez une vidéo : IziCut transcrit chaque mot (accents et
            ponctuation compris), repère les passages qui accrochent et livre des clips 9:16
            sous-titrés, avec la légende et les hashtags prêts à publier.
          </motion.p>

          <motion.div {...rise(0.8)} className="mt-9 w-full">
            <LinkForm />
          </motion.div>

          <motion.dl {...rise(0.95)} className="mt-10 grid w-full max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['100 % FR', 'sous-titres, légendes, support'],
              ['Prêt à poster', 'légende + hashtags par IA'],
              ['7 €/mois', 'offre Pro, sans engagement'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-code text-sm font-semibold text-fg">{k}</dt>
                <dd className="mt-1 text-xs leading-snug text-fg-subtle">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <motion.div
          style={{ y: previewY, scale: previewScale }}
          initial={reduce ? false : { opacity: 0, y: 60, rotateX: 18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          transition={{ duration: 1.3, delay: 0.3, ease: EASE }}
          className="relative [perspective:1400px]"
        >
          <Tilt className="rounded-2xl" max={5}>
            <ProductPreview />
          </Tilt>

          {CHIPS.map(({ icon: Icon, label, className, delay, float }) => (
            <motion.span
              key={label}
              aria-hidden
              className={`absolute z-10 hidden items-center gap-2 rounded-full border border-line-strong bg-ink-900/90 px-3 py-1.5 text-xs font-medium text-fg shadow-[0_20px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur md:inline-flex ${className}`}
              initial={reduce ? false : { opacity: 0, scale: 0.6, y: 10 }}
              animate={reduce ? undefined : { opacity: 1, scale: 1, y: [0, -8, 0] }}
              transition={{
                opacity: { duration: 0.6, delay, ease: EASE },
                scale: { duration: 0.6, delay, ease: EASE },
                y: { duration: 5, delay: delay + float, repeat: Infinity, ease: 'easeInOut' },
              }}
            >
              <Icon className="h-3.5 w-3.5 text-neon" />
              {label}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
