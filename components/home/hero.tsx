'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Scissors } from 'lucide-react';

import { GlassRing } from './glass-ring';
import { LiveMotionDemo } from './live-motion-demo';
import { EASE, Magnetic, SplitWords } from './motion';

export function Hero() {
  const reduceMotion = useReducedMotion();
  // Sur mobile (colonnes empilées), pas de parallaxe : le texte et la démo se chevaucheraient.
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setStacked(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const reduce = reduceMotion;
  const still = reduceMotion || stacked;
  const sectionRef = useRef<HTMLElement>(null);

  // Projecteur qui suit le curseur
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const sx = useSpring(mx, { stiffness: 90, damping: 20 });
  const sy = useSpring(my, { stiffness: 90, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${sx}px ${sy}px, rgb(169 144 255 / 0.09), transparent 65%)`;

  // Sortie de scène : l'aperçu monte, se redresse et recule
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const previewY = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, -120]);
  const previewScale = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 0.92]);
  const textY = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, 80]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.7], [1, still ? 1 : 0]);

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
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_190_118/0.12),transparent)]"
        animate={reduce ? undefined : { opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 pb-24 sm:px-6 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:px-8 lg:pb-32">
        <motion.div style={{ y: textY, opacity: textOpacity }} className="flex flex-col items-start">
          <motion.p {...rise(0)} className="izi-glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse-rec rounded-full bg-rec" aria-hidden />
            Le 1er studio de pub en motion design · 100 % français
          </motion.p>

          <h1 className="mt-6 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-[4.4rem]">
            <SplitWords text="Votre pub en motion design." delay={0.1} accentFrom={2} />
            <br />
            <SplitWords text="Sans agence." delay={0.4} />
          </h1>
          <motion.p {...rise(0.55)} className="mt-3 text-xl font-medium tracking-tight text-fg-muted sm:text-2xl">
            Sans community manager. Avec l’IA.
          </motion.p>

          <motion.p {...rise(0.65)} className="mt-6 max-w-lg text-pretty text-lg leading-relaxed text-fg-muted">
            Commerçants, artisans, PME, associations : créez vos pubs, posts et vidéos animées
            avec vos photos, vos vidéos et votre logo. L’IA connaît votre activité et monte tout.
            Ensuite, vous modifiez à volonté : textes, couleurs, rythme, effets.
          </motion.p>

          <motion.div {...rise(0.8)} className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <Magnetic>
              <Link href="/studio" className="izi-cta inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-bold transition hover:brightness-110 sm:w-auto">
                Créer ma pub gratuitement <ArrowRight className="h-4 w-4" />
              </Link>
            </Magnetic>
            <Link href="/upload" className="izi-glass-pill inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-medium text-fg-muted transition hover:text-fg">
              <Scissors className="h-4 w-4" /> Découper une vidéo longue en clips
            </Link>
          </motion.div>

          <motion.dl {...rise(0.95)} className="mt-10 grid w-full max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['Toute la France', 'entreprises et associations'],
              ['100 % modifiable', 'textes, couleurs, rythme'],
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
          <GlassRing className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-[38%] -translate-y-1/2 opacity-90 sm:h-[640px] sm:w-[640px]" />
          <div aria-hidden className="pointer-events-none absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_190_118/0.28),transparent)] blur-2xl" />
          <div className="relative z-10">
            <LiveMotionDemo />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
