'use client';

/**
 * « Tout-en-un, certifié » : on repart avec une pub prête à publier, sans
 * jongler entre plusieurs outils d'IA. Badge de certification animé.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Check, X } from 'lucide-react';

import { EASE, Reveal, Stagger, StaggerItem } from './motion';
import { SectionHeading } from './section-heading';

const WITHOUT = [
  'Un outil d’IA pour trouver l’idée et écrire les textes',
  'Un autre pour créer les visuels',
  'Un logiciel de montage à apprendre',
  'Une banque de musiques et de bruitages',
  'Encore une IA pour la légende et les hashtags',
  'Aucune garantie que la pub soit efficace'
];
const WITH = [
  'L’IA connaît votre entreprise ou association',
  'Vos photos, vidéos et logo, animés en motion design',
  'Musique et bruitages créés pour votre pub',
  'Contrôle qualité d’agence, corrigé en 1 clic',
  'Légende, hashtags et 1er commentaire prêts',
  'Label « Certifiée IziCut » : prête à publier'
];

function CertBadge() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const reduce = useReducedMotion();
  const [score, setScore] = useState(reduce ? 96 : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1600);
      setScore(Math.round(96 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce]);
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div ref={ref} className="izi-glow-frame mx-auto w-full max-w-xs p-[2px]">
      <div className="flex flex-col items-center gap-3 bg-ink-900/95 px-6 py-7 text-center">
        <div className="relative h-32 w-32">
          <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="9" />
            <circle cx="60" cy="60" r={R} fill="none" stroke="url(#izi-cert)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
            <defs>
              <linearGradient id="izi-cert" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a990ff" />
                <stop offset="1" stopColor="#ffcf86" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 grid place-items-center font-display text-4xl font-bold text-fg">{score}</span>
        </div>
        <motion.p
          initial={reduce ? false : { opacity: 0, scale: 0.8 }}
          animate={inView ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.6, delay: 1.5, ease: EASE }}
          className="izi-glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-fg"
        >
          <BadgeCheck className="h-4 w-4 text-neon" /> Certifiée IziCut
        </motion.p>
        <p className="text-xs text-fg-muted">Accroche, rythme, lisibilité, appel à l’action, son : chaque pub est contrôlée avant de sortir.</p>
      </div>
    </div>
  );
}

export function AllInOne() {
  return (
    <section aria-labelledby="izi-all-in-one" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Tout-en-un · garanti"
        title={<span id="izi-all-in-one">Vous repartez avec une pub <span className="izi-neon-text">prête à publier.</span></span>}
        description="Plus besoin de jongler entre cinq sites d’IA et un logiciel de montage. Avec IziCut, tout se fait au même endroit, et chaque pub passe un contrôle qualité d’agence avant de sortir."
      />
      <div className="mt-14 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <Reveal className="izi-card rounded-3xl p-6">
          <p className="mb-4 text-sm font-semibold text-fg-muted">Sans IziCut · 5 outils, des heures</p>
          <Stagger as="ul" className="space-y-2.5">
            {WITHOUT.map((t) => (
              <StaggerItem as="li" key={t} className="flex items-start gap-2 text-sm text-fg-subtle">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-rec/80" /> {t}
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
        <Reveal delay={0.15}>
          <CertBadge />
        </Reveal>
        <Reveal delay={0.3} className="izi-card rounded-3xl p-6">
          <p className="mb-4 text-sm font-semibold text-neon">Avec IziCut · 1 outil, quelques minutes</p>
          <Stagger as="ul" className="space-y-2.5">
            {WITH.map((t) => (
              <StaggerItem as="li" key={t} className="flex items-start gap-2 text-sm text-fg">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-neon" /> {t}
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      </div>
    </section>
  );
}
