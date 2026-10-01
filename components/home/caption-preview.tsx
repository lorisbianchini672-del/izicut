'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import type { CaptionTemplate } from '@/lib/entitlements';

export const DEMO_LINES: string[][] = [
  ['Personne', 'ne', 'te', 'dit', 'ça', 'sur', 'TikTok'],
  ['Les', '3', 'premières', 'secondes', 'décident', 'de', 'tout'],
  ['Coupe', 'les', 'silences.', 'Garde', "l'énergie."],
];

/** Fait avancer le « mot prononcé », ligne après ligne. */
export function useKaraoke(lines: string[][] = DEMO_LINES, stepMs = 360) {
  const reduce = useReducedMotion();
  const [pos, setPos] = useState({ line: 0, word: 0 });

  useEffect(() => {
    if (reduce) return;
    setPos({ line: 0, word: 0 }); // nouvelles lignes : on repart du début
    const id = window.setInterval(() => {
      setPos(({ line, word }) => {
        const current = lines[line % lines.length];
        if (word + 1 < current.length) return { line, word: word + 1 };
        return { line: (line + 1) % lines.length, word: 0 };
      });
    }, stepMs);
    return () => window.clearInterval(id);
  }, [lines, reduce, stepMs]);

  const words = lines[pos.line % lines.length];
  return { words, active: reduce ? -1 : Math.min(pos.word, words.length - 1) };
}

type CaptionProps = {
  template: CaptionTemplate;
  words: string[];
  active: number;
  color?: string;
};

/**
 * Rendu HTML fidèle aux 6 styles du moteur Remotion (lib/entitlements.ts).
 * Sert d'aperçu : le rendu final est produit côté worker.
 */
export function CaptionLine({ template, words, active, color = '#c8ff3d' }: CaptionProps) {
  if (template === 'bold_pop') {
    const word = words[Math.max(0, active)] ?? words[0];
    return (
      <p key={word + active} className="animate-[izi-pop_.25s_ease-out] text-center text-[2.1em] font-black uppercase leading-none tracking-tight"
        style={{ color, WebkitTextStroke: '0.06em #000', paintOrder: 'stroke fill' }}>
        {word}
      </p>
    );
  }

  const base = {
    hormozi: 'text-[1.35em] font-black uppercase tracking-tight leading-[1.05]',
    clean: 'text-[1.05em] font-semibold leading-snug',
    karaoke_box: 'text-[1.15em] font-extrabold leading-snug',
    neon: 'text-[1.2em] font-bold leading-snug',
    minimal: 'text-[0.8em] font-medium leading-snug',
  }[template];

  return (
    <p className={`flex flex-wrap justify-center gap-x-[0.28em] gap-y-[0.1em] text-center ${base}`}>
      {words.map((word, i) => {
        const on = i === active;
        const past = active >= 0 && i < active;
        let style: React.CSSProperties = {};
        let cls = 'transition-all duration-150';
        switch (template) {
          case 'hormozi':
            style = { color: on ? color : '#fff', WebkitTextStroke: '0.07em #000', paintOrder: 'stroke fill' };
            cls += on ? ' scale-110' : '';
            break;
          case 'clean':
            style = { color: on || past ? '#fff' : 'rgb(255 255 255 / 0.55)', textShadow: '0 2px 12px rgb(0 0 0 / 0.6)' };
            break;
          case 'karaoke_box':
            style = on
              ? { background: color, color: '#05060a', borderRadius: '0.25em', padding: '0 0.18em' }
              : { color: '#fff', padding: '0 0.18em', textShadow: '0 2px 10px rgb(0 0 0 / 0.7)' };
            break;
          case 'neon':
            style = on
              ? { color, textShadow: `0 0 0.35em ${color}, 0 0 0.9em ${color}` }
              : { color: 'rgb(255 255 255 / 0.85)' };
            break;
          case 'minimal':
            style = { color: on ? '#fff' : 'rgb(255 255 255 / 0.6)' };
            break;
        }
        return (
          <span key={`${word}-${i}`} className={`inline-block ${cls}`} style={style}>
            {word}
          </span>
        );
      })}
    </p>
  );
}
