import { Plus } from 'lucide-react';

import { SectionHeading } from './section-heading';
import { Stagger, StaggerItem } from './motion';

const QUESTIONS = [
  {
    q: 'Comment IziCut choisit-il les moments forts ?',
    a: "La vidéo est transcrite mot à mot avec l'instant exact de chaque mot. L'IA lit cette transcription horodatée et retient les extraits de 20 à 60 secondes compréhensibles seuls : accroche dès la première phrase, une idée complète, une chute nette. Les bornes sont ensuite recalées sur le début et la fin de vraies phrases.",
  },
  {
    q: 'Quelles sources puis-je importer ?',
    a: "Un lien YouTube ou Twitch, ou un fichier MP4, MOV, WebM ou MKV. N'importez que des contenus dont vous détenez les droits.",
  },
  {
    q: 'Puis-je corriger un clip ?',
    a: "Oui. Le studio d'édition permet d'ajuster l'entrée et la sortie, de corriger le texte des sous-titres et de changer de style, avec les zones réservées à l'interface TikTok affichées.",
  },
  {
    q: 'Combien de temps prend le traitement ?',
    a: 'Cela dépend surtout de la durée de la vidéo source : quelques minutes pour un épisode classique. Vous suivez la progression depuis votre tableau de bord.',
  },
  {
    q: 'Que se passe-t-il si un traitement échoue ?',
    a: 'Les minutes réservées pour cette vidéo sont recréditées automatiquement sur votre solde.',
  },
  {
    q: 'Puis-je résilier à tout moment ?',
    a: "Oui, sans engagement, depuis l'espace de facturation. Vous repassez alors sur l'offre Free pour vos rendus suivants.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-line py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
        <SectionHeading align="left" eyebrow="Questions" title="Les réponses, sans détour." />
        <Stagger className="divide-y divide-line border-y border-line">
          {QUESTIONS.map(({ q, a }) => (
            <StaggerItem key={q}>
            <details className="group">
              <summary className="izi-focus flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium text-fg transition-colors hover:text-neon [&::-webkit-details-marker]:hidden">
                {q}
                <Plus className="h-5 w-5 shrink-0 text-fg-subtle transition-transform duration-300 group-open:rotate-45 group-open:text-neon" aria-hidden />
              </summary>
              <p className="pb-6 pr-10 text-sm leading-relaxed text-fg-muted">{a}</p>
            </details>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
