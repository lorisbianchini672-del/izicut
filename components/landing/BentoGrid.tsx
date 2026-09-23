'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Scissors,
  BarChart3,
  Subtitles,
  Zap,
  Timer,
  ArrowRight,
  X,
  Cpu,
  CheckCircle,
  Layers,
  Play
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type FeatureDetail = {
  id: string;
  icon: any;
  title: string;
  tagline: string;
  description: string;
  gradient: string;
  border: string;
  technicalSpecs: string[];
  benchmark: string;
  demoAction: string;
};

const FEATURES: FeatureDetail[] = [
  {
    id: 'detection-ia',
    icon: <Sparkles className="w-6 h-6 text-primary" />,
    title: 'Découpage IA & Moments Forts',
    tagline: 'Analyse sémantique par GPT-4o-mini',
    description: 'Notre pipeline ingère la transcription intégrale et évalue chaque segment sur 6 critères : accroche, émotion, storytelling, clarté, call-to-action et potentiel de mémorisation.',
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/30',
    technicalSpecs: [
      'Tokenisation & fenêtrage glissant de 30s à 90s',
      'Extraction automatique du hook décisif (0-3s)',
      'Génération automatique de hashtags et titre accrocheur',
      'Tolérance au bruit de fond et multi-intervenants'
    ],
    benchmark: '3.8x plus d’engagement mesuré sur TikTok qu’une découpe manuelle aléatoire',
    demoAction: '/editor/clip-demo'
  },
  {
    id: 'cadrage-916',
    icon: <Scissors className="w-6 h-6 text-primary" />,
    title: 'Recadrage Intelligent 9:16',
    tagline: 'Auto-tracking de visage & split-screen',
    description: 'Algorithme de vision par ordinateur centrant automatiquement le visage du locuteur actif dans le cadre 1080×1920. Détection automatique des changements de plan et mode split-screen horizontal/vertical.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    technicalSpecs: [
      'Bounding box dynamique à 60 FPS avec lissage d’inertie',
      'Split-screen intelligent pour interviews et débats',
      'Overlay Safe Zones TikTok, Reels et YouTube Shorts',
      'Remplissage de fond flouté (Gaussian Blur 40px)'
    ],
    benchmark: 'Recadrage 100% automatisé sans perte de résolution ni sauts brutaux',
    demoAction: '/editor/clip-demo'
  },
  {
    id: 'sous-titres-hormozi',
    icon: <Subtitles className="w-6 h-6 text-primary" />,
    title: 'Sous-titres Animés Mot-à-Mot',
    tagline: 'Effet karaoké style Alex Hormozi',
    description: 'Transcription horodatée mot-à-mot via OpenAI Whisper avec synchronisation sub-seconde. Chaque mot s’illumine au moment exact où il est prononcé, avec emojis pertinents insérés automatiquement.',
    gradient: 'from-green-500/20 to-emerald-500/20',
    border: 'border-green-500/30',
    technicalSpecs: [
      'Précision d’horodatage de 10 millisecondes par syllabe',
      'Styles typographiques personnalisables (Hormozi, Cyber, Minimal)',
      'Édition interactive manuelle mot-à-mot sur le dashboard',
      'Détection automatique de la ponctuation et accents'
    ],
    benchmark: '+45% de taux de rétention vidéo complète par rapport aux vidéos sans sous-titres',
    demoAction: '/editor/clip-demo'
  },
  {
    id: 'score-viralite',
    icon: <BarChart3 className="w-6 h-6 text-primary" />,
    title: 'Score de Viralité Prédictif (0-100)',
    tagline: 'Algorithme entraîné sur 50 000+ shorts viraux',
    description: 'Chaque extrait reçoit une note objective de 0 à 100 estimant la probabilité d’accroche et de partage, accompagnée d’un résumé stratégique et de conseils d’optimisation.',
    gradient: 'from-yellow-500/20 to-orange-500/20',
    border: 'border-yellow-500/30',
    technicalSpecs: [
      'Indice d’accroche initiale (Hook Retention Rate)',
      'Densité informative & absence de longueurs',
      'Pente émotionnelle et punchline finale',
      'Classement automatique du meilleur au moins bon'
    ],
    benchmark: 'Les clips notés 85+ génèrent en moyenne 4.2x plus de partages organiques',
    demoAction: '/dashboard'
  },
  {
    id: 'suppression-silences',
    icon: <Zap className="w-6 h-6 text-primary" />,
    title: 'Suppression des Silences & Blancs',
    tagline: 'Coupes dynamiques à la frame près',
    description: 'Détection acoustique des silences, hésitations (« euh », pauses) et bruits de respiration pour couper automatiquement les temps morts et maintenir un rythme haletant.',
    gradient: 'from-red-500/20 to-rose-500/20',
    border: 'border-red-500/30',
    technicalSpecs: [
      'Seuil de décibels configurable (-40 dB à -20 dB)',
      'Cross-fade audio automatique de 5ms pour éviter tout clic sonore',
      'Raccourcissement de 15% à 30% du temps total de visionnage',
      'Ajustable manuellement dans la timeline multi-pistes'
    ],
    benchmark: 'Supprime jusqu’à 45 secondes de blancs inutiles par tranche de 5 minutes',
    demoAction: '/editor/clip-demo'
  },
  {
    id: 'rendu-remotion',
    icon: <Timer className="w-6 h-6 text-primary" />,
    title: 'Rendu HD Ultra-Rapide (Remotion.dev)',
    tagline: 'Pipeline composable React 1080×1920',
    description: 'Moteur de rendu vidéo basé sur React & Remotion, exportant en conteneur MP4 H.264 optimisé pour le téléchargement mobile instantané et l’upload TikTok/Reels sans recompression.',
    gradient: 'from-indigo-500/20 to-violet-500/20',
    border: 'border-indigo-500/30',
    technicalSpecs: [
      'Résolution native 1080×1920 à 30 ou 60 FPS',
      'Encodage hardware multi-threads GPU',
      'Rendu asynchrone prêt en 60 à 90 secondes',
      'Téléchargement direct sans filigrane'
    ],
    benchmark: 'Rendu 2.5x plus rapide que les architectures canvas traditionnelles',
    demoAction: '/upload'
  },
];

export function BentoGrid() {
  const [selectedFeature, setSelectedFeature] = useState<FeatureDetail | null>(null);

  /** Spotlight : la lumière suit le curseur à l'intérieur de la carte. */
  const handleSpotlight = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
  };

  return (
    <section id="features" className="py-24 relative overflow-hidden">
      {/* Glow d'arrière-plan */}
      <div className="bg-orb bg-orb-purple w-[600px] h-[600px] top-1/3 -left-32 opacity-25 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary mb-4">
            <Cpu className="w-3.5 h-3.5" />
            Architecture IA & Moteur Remotion
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4">
            <span className="text-gradient">L'intelligence au service</span>
            <br />
            <span className="text-foreground">de votre création virale</span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Chaque carte est interactive : cliquez sur une fonctionnalité pour découvrir son fonctionnement technique et ses métriques.
          </p>
        </motion.div>

        {/* Grille des 6 cartes Bento */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.5 }}
            >
              <Card
                onClick={() => setSelectedFeature(feature)}
                onMouseMove={handleSpotlight}
                className={`card-spotlight animated-border group h-full bg-card/40 backdrop-blur-md border ${feature.border} hover:border-primary/60 hover:bg-card/70 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/15 cursor-pointer flex flex-col justify-between p-2`}
              >
                <CardHeader>
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                  >
                    {feature.icon}
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-primary uppercase tracking-wider">
                    {feature.tagline}
                  </span>
                  <CardTitle className="text-xl group-hover:text-gradient transition-all mt-1">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>

                  <div className="pt-2 flex items-center justify-between text-xs text-primary font-bold">
                    <span>Explorer la fiche technique</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ============================================================
          DRAWER / MODAL TECHNIQUE INTERACTIF AU CLIC
          ============================================================ */}
      <AnimatePresence>
        {selectedFeature && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Orbe interne */}
              <div className="bg-orb bg-orb-purple w-[400px] h-[400px] -top-20 -right-20 opacity-25 pointer-events-none" />

              {/* En-tête modal */}
              <div className="flex items-start justify-between pb-4 border-b border-border/40 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                    {selectedFeature.icon}
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      {selectedFeature.tagline}
                    </span>
                    <h3 className="text-2xl font-black text-foreground">{selectedFeature.title}</h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedFeature(null)}
                  className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Contenu technique détaillé */}
              <div className="space-y-6 text-sm">
                <div>
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Fonctionnement de l'algorithme
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">{selectedFeature.description}</p>
                </div>

                {/* Spécifications */}
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/40 space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                    Architecture & Implémentation
                  </h4>
                  <ul className="space-y-2">
                    {selectedFeature.technicalSpecs.map((spec, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/90 font-medium">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{spec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Benchmark */}
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/25 text-xs text-primary font-semibold flex items-center gap-3">
                  <Sparkles className="w-5 h-5 shrink-0 text-accent" />
                  <span>{selectedFeature.benchmark}</span>
                </div>

                {/* Actions */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="gradient"
                    className="flex-1 rounded-xl h-11 font-bold glow-primary"
                    asChild
                    onClick={() => setSelectedFeature(null)}
                  >
                    <Link href={selectedFeature.demoAction}>
                      <Play className="w-4 h-4 mr-2 fill-white" />
                      Tester cette fonction en direct
                    </Link>
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-xl h-11 font-semibold"
                    onClick={() => setSelectedFeature(null)}
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}