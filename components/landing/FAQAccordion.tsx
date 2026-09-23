'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const faqs = [
  {
    question: "Comment IziCut détecte-t-il les moments forts ?",
    answer: "Notre pipeline utilise GPT-4o-mini pour analyser la transcription mot-à-mot de votre vidéo. L'IA évalue chaque segment sur 6 critères : accroche, émotion, structure narrative, call-to-action, momentum et pertinence. Les segments avec le score le plus élevé sont extraits automatiquement.",
  },
  {
    question: "Puis-je modifier les sous-titres générés ?",
    answer: "Oui ! Notre éditeur vous permet de corriger n'importe quel mot mal retranscrit. La correction est immédiatement prise en compte dans le rendu Remotion, sans refaire toute la transcription.",
  },
  {
    question: "Quels formats de vidéo sont supportés ?",
    answer: "MP4, MOV, WebM, MKV, M4V — et les liens YouTube, Twitch. Pour les vidéos externes, nous téléchargeons automatiquement l'audio pour la transcription.",
  },
  {
    question: "Combien de temps dure le traitement ?",
    answer: "Notre queue est optimisée pour un débit rapide : transcription Whisper (~1x), analyse IA (~30s), rendu Remotion (~1 min/30s de clip). Un clip de 45 secondes est généralement prêt en 2-3 minutes.",
  },
  {
    question: "Quel est le coût en crédits pour un clip ?",
    answer: "Chaque clip consomme sa durée en secondes plus une marge de 20 secondes pour le rendu. Un clip de 45 secondes coûte donc 65 secondes de crédits. Vos crédits sont débités atomiquement en SQL pour éviter toute double dépense.",
  },
  {
    question: "Puis-je exporter au format TikTok, Reels et Shorts ?",
    answer: "Absolument. Tous nos clips sont rendus en 1080x1920 (9:16) — le format natif pour TikTok, Instagram Reels et YouTube Shorts. Exportez en MP4 haute qualité ou téléchargez les sous-titres en SRT.",
  },
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 border-t border-border/50 relative overflow-hidden">
      <div className="container mx-auto px-4 max-w-3xl">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient">Questions fréquentes</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Tout ce qu'il faut savoir pour démarrer avec IziCut.
          </p>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ staggerChildren: 0.1, delayChildren: 0.1 }}
        >
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <Card className="border border-border bg-card/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                    className="w-full flex items-center justify-between p-6 text-left"
                  >
                    <span className="font-semibold text-lg pr-4">{faq.question}</span>
                    <motion.div
                      animate={{ rotate: openIndex === index ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                  </button>
                  <AnimatePresence initial={false}>
                    {openIndex === index && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6">
                          <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}