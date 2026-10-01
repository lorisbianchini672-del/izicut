'use client';

/**
 * ============================================================
 * motion.tsx — Primitives de motion design de la landing
 * ------------------------------------------------------------
 * Toutes respectent prefers-reduced-motion : sans mouvement,
 * le contenu s'affiche directement, sans effet.
 * Courbe maison : expo-out (0.16, 1, 0.3, 1) — rapide puis douce,
 * l'équivalent d'un « ease » de montage vidéo.
 * ============================================================
 */
import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from 'framer-motion';

export const EASE = [0.16, 1, 0.3, 1] as const;

/* ---------- Apparition au scroll ---------- */

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: 'div' | 'li' | 'section' | 'article';
};

/** Fondu + montée + netteté (flou → net), une seule fois à l'entrée. */
export function Reveal({ children, className, delay = 0, y = 28, as = 'div' }: RevealProps) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(10px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.97, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Conteneur dont les enfants <StaggerItem> entrent en cascade. */
export function Stagger({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'ol' }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp className={className} variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -10% 0px' }}>
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'li' }) {
  const Comp = motion[as];
  return (
    <Comp className={className} variants={staggerChild}>
      {children}
    </Comp>
  );
}

/* ---------- Typographie cinétique ---------- */

/**
 * Découpe un texte en mots qui montent depuis un masque, comme un
 * générique. `accentFrom` : index du premier mot accentué (néon).
 */
export function SplitWords({
  text,
  className,
  delay = 0,
  accentFrom,
  accentClassName = 'izi-neon-text',
  onView = false,
}: {
  text: string;
  className?: string;
  delay?: number;
  accentFrom?: number;
  accentClassName?: string;
  onView?: boolean;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => {
        const accent = accentFrom !== undefined && i >= accentFrom;
        const inner = (
          <motion.span
            className={`inline-block will-change-transform ${accent ? accentClassName : ''}`}
            initial={reduce ? false : { y: '110%', rotate: 4, opacity: 0 }}
            {...(onView
              ? { whileInView: { y: '0%', rotate: 0, opacity: 1 }, viewport: { once: true } }
              : { animate: { y: '0%', rotate: 0, opacity: 1 } })}
            transition={{ duration: 0.9, delay: delay + i * 0.06, ease: EASE }}
          >
            {word}
          </motion.span>
        );
        return (
          <span key={`${word}-${i}`} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            {inner}
            {i < words.length - 1 ? ' ' : null}
          </span>
        );
      })}
    </span>
  );
}

/* ---------- Interactions au pointeur ---------- */

/** L'élément est attiré par le curseur (effet « aimant »), retour ressort. */
export function Magnetic({ children, strength = 0.35, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });

  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className ?? ''}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
}

/** Inclinaison 3D qui suit le curseur + reflet lumineux. */
export function Tilt({ children, className, max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 160, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 160, damping: 20 });
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX} ${glareY}, rgb(255 255 255 / 0.07), transparent 60%)`;

  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={`relative ${className ?? ''}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100, transformStyle: 'preserve-3d' }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5); }}
    >
      {children}
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
    </motion.div>
  );
}

/* ---------- Scroll ---------- */

/** Barre de progression néon en haut de page. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-neon shadow-[0_0_12px_#c8ff3d]"
      style={{ scaleX }}
    />
  );
}

/** Décalage vertical lié au scroll de l'élément (parallaxe). */
export function useParallax(range = 80): { ref: React.RefObject<HTMLDivElement | null>; y: MotionValue<number> } {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [range, -range]);
  return { ref, y };
}
