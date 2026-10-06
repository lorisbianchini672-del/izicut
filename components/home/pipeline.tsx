'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { Building2, ImagePlus, Sparkles, Wand2 } from 'lucide-react';

import { EASE } from './motion';

const STEPS = [
  { icon: Building2, title: 'Vous trouvez votre structure', text: 'Entreprise ou association : l’IA connaît votre activité grâce au registre officiel.' },
  { icon: ImagePlus, title: 'Vous ajoutez vos images', text: 'Photos, vidéos, logo. Vos vraies images font la pub.' },
  { icon: Sparkles, title: 'L’IA monte la pub', text: 'Accroche, textes animés, rythme, appel à l’action. En quelques secondes.' },
  { icon: Wand2, title: 'Vous modifiez à volonté', text: 'Dites-lui « plus rapide », « en bleu »… ou changez tout à la main.' },
];

/** Bande « timeline » : la ligne néon se remplit avec le scroll, chaque étape s'allume à son tour. */
export function Pipeline() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 45%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 22 });

  return (
    <section ref={ref} aria-labelledby="izi-how" className="relative border-y border-line bg-ink-900/40">
      <h2 id="izi-how" className="sr-only">Comment ça marche</h2>
      {/* Piste + remplissage */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-line" />
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] origin-left bg-gradient-to-r from-cyan via-neon to-neon shadow-[0_0_14px_rgb(200_255_61/0.6)]"
        style={{ scaleX: reduce ? 1 : progress }}
      />
      <ol className="mx-auto grid max-w-7xl gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <Step key={step.title} index={i} progress={progress} reduce={Boolean(reduce)} {...step} />
        ))}
      </ol>
    </section>
  );
}

function Step({
  icon: Icon,
  title,
  text,
  index,
  progress,
  reduce,
}: (typeof STEPS)[number] & { index: number; progress: MotionValue<number>; reduce: boolean }) {
  const start = index / STEPS.length;
  const on = useTransform(progress, [start, start + 0.18], [0, 1]);
  const iconColor = useTransform(on, [0, 1], ['rgb(238 240 245)', 'rgb(200 255 61)']);
  const iconBorder = useTransform(on, [0, 1], ['rgba(255,255,255,0.14)', 'rgba(200,255,61,0.55)']);
  const glow = useTransform(on, [0, 1], ['0 0 0 0 rgba(200,255,61,0)', '0 0 28px -4px rgba(200,255,61,0.55)']);

  return (
    <motion.li
      className="group relative bg-ink-950 p-6 transition-colors hover:bg-ink-900 lg:p-8"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, delay: index * 0.1, ease: EASE }}
    >
      <div className="flex items-center justify-between">
        <motion.span
          className="grid h-10 w-10 place-items-center rounded-xl border bg-white/[0.03]"
          style={reduce ? undefined : { color: iconColor, borderColor: iconBorder, boxShadow: glow }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </motion.span>
        <span className="font-code text-xs text-fg-subtle" aria-hidden>
          ÉTAPE {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <h3 className="mt-5 text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{text}</p>
    </motion.li>
  );
}
