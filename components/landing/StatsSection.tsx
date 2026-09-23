'use client';

import { useEffect, useRef } from 'react';
import { motion, useInView, animate } from 'framer-motion';
import { Play, Users, Clock, BarChart3, Zap } from 'lucide-react';

const STATS = [
  {
    icon: <Play className="w-5 h-5" />,
    label: 'Clips générés',
    value: 12547,
    suffix: '+',
    sub: 'ce mois-ci',
    color: 'from-purple-500/20 to-violet-500/20 border-purple-500/30',
    iconColor: 'text-purple-400',
  },
  {
    icon: <Users className="w-5 h-5" />,
    label: 'Créateurs actifs',
    value: 3429,
    suffix: '+',
    sub: 'dans 24 pays',
    color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
    iconColor: 'text-pink-400',
  },
  {
    icon: <Clock className="w-5 h-5" />,
    label: 'Heures traitées',
    value: 1457,
    suffix: ' h',
    sub: 'de vidéo source',
    color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30',
    iconColor: 'text-cyan-400',
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    label: 'Score moyen',
    value: 76,
    suffix: ' / 100',
    sub: 'de viralité IA',
    color: 'from-amber-500/20 to-yellow-500/20 border-amber-500/30',
    iconColor: 'text-amber-400',
  },
];

/** Compteur animé : monte de 0 à la valeur cible quand il entre à l'écran. */
function AnimatedValue({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) {
          ref.current.textContent = Math.round(v).toLocaleString('fr-FR');
        }
      },
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <span className="text-3xl font-black text-foreground mb-1">
      <span ref={ref}>0</span>
      <span className="text-gradient">{suffix}</span>
    </span>
  );
}

export function StatsSection() {
  return (
    <section className="py-20 border-t border-border relative overflow-hidden">
      <div className="bg-orb bg-orb-blue w-[400px] h-[400px] top-0 right-0 opacity-50" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.p
          className="text-center text-sm text-muted-foreground mb-10 font-medium tracking-wider uppercase"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <Zap className="inline w-4 h-4 mr-2 text-primary" />
          Apprécié par des créateurs et marques dans le monde entier
        </motion.p>

        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ staggerChildren: 0.1 }}
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <div
                className={`card-spotlight relative overflow-hidden rounded-2xl border bg-gradient-to-br ${stat.color} p-6 text-center hover:scale-[1.03] transition-transform duration-300 group`}
              >
                <div className={`flex justify-center mb-3 ${stat.iconColor} group-hover:scale-125 transition-transform duration-300`}>
                  {stat.icon}
                </div>
                <AnimatedValue value={stat.value} suffix={stat.suffix} />
                <div className="text-sm font-semibold text-foreground/80">{stat.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.sub}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
