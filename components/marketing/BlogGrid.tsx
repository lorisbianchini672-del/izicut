'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Post {
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  accent: string;
}

const POSTS: Post[] = [
  {
    title: 'Le hook parfait tient en 7 mots',
    excerpt:
      'Analyse de 400 clips à plus d’un million de vues : structure syntaxique, tension et promesse des deux premières secondes.',
    category: 'Viralité',
    readTime: '6 min',
    date: '18 sept. 2026',
    accent: 'from-cyan-400 to-blue-500'
  },
  {
    title: 'Sous-titres mot-à-mot : le guide technique',
    excerpt:
      'Pourquoi les groupes de 2 à 4 mots battent les phrases complètes, avec les réglages de taille, contour et position.',
    category: 'Sous-titres',
    readTime: '8 min',
    date: '12 sept. 2026',
    accent: 'from-fuchsia-400 to-purple-500'
  },
  {
    title: 'YouTube → Shorts sans perdre la qualité',
    excerpt:
      'Le bon pipeline d’extraction, de rééchantillonnage audio et d’encodage pour éviter la bouillie de pixels.',
    category: 'Workflow',
    readTime: '5 min',
    date: '5 sept. 2026',
    accent: 'from-rose-400 to-pink-500'
  },
  {
    title: 'Safe Zones : l’erreur qui tue la rétention',
    excerpt:
      'Les pourcentages exacts masqués par TikTok, Reels et Shorts — et comment vérifier votre cadrage en 10 secondes.',
    category: 'Cadrage',
    readTime: '4 min',
    date: '29 août 2026',
    accent: 'from-amber-400 to-orange-500'
  },
  {
    title: 'Podcasts : le split-screen qui garde l’attention',
    excerpt:
      'Comment alterner entre les intervenants sans casser la dynamique, et quand le suivi de visage suffit.',
    category: 'Cadrage',
    readTime: '7 min',
    date: '21 août 2026',
    accent: 'from-emerald-400 to-teal-500'
  },
  {
    title: 'Facturer ses clips : tarifs et positionnement',
    excerpt:
      'Grille de prix pour un monteur IA freelance, de la prestation à l’acte au forfait mensuel, avec marge cible.',
    category: 'Business',
    readTime: '9 min',
    date: '14 août 2026',
    accent: 'from-violet-400 to-indigo-500'
  }
];

const CATEGORIES = ['Tous', ...Array.from(new Set(POSTS.map((p) => p.category)))];

/**
 * Grille d'articles filtrable avec transitions animées (page /blog).
 */
export function BlogGrid() {
  const [category, setCategory] = useState('Tous');

  const filtered = useMemo(
    () => (category === 'Tous' ? POSTS : POSTS.filter((p) => p.category === category)),
    [category]
  );

  return (
    <div className="space-y-10">
      {/* Filtres par rubrique */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              'relative rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors',
              category === cat
                ? 'border-primary/60 text-white'
                : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {category === cat && (
              <motion.span
                layoutId="blog-pill"
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-primary to-accent"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            {cat}
          </button>
        ))}
      </div>

      {/* Articles */}
      <motion.div layout className="grid gap-6 sm:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((post) => (
            <motion.article
              key={post.title}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="card-spotlight group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl transition-colors hover:border-primary/40"
              onMouseMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
                e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    'rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white',
                    post.accent
                  )}
                >
                  {post.category}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {post.readTime}
                </span>
              </div>

              <h3 className="mt-4 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                {post.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>

              <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-4 text-xs">
                <span className="text-muted-foreground/70">{post.date}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Lire l’article
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun article dans cette catégorie.</p>
      )}
    </div>
  );
}

export default BlogGrid;

