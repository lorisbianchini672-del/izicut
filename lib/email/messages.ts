/** Les emails envoyés par IziCut (contenu en français). */
import { getSiteUrl } from '@/lib/site-url';

import type { EmailContent } from './layout';

const site = () => getSiteUrl().replace(/\/$/, '');

export function welcomeEmail(): { subject: string; content: EmailContent } {
  return {
    subject: 'Bienvenue sur IziCut : votre 1re pub vous attend',
    content: {
      preview: 'Créez une pub en motion design avec vos photos, en quelques minutes.',
      title: 'Bienvenue sur IziCut 👋',
      paragraphs: [
        'Votre compte est prêt. Avec IziCut, vous créez vos pubs, posts et vidéos animées sans agence ni logiciel de montage : l’IA s’occupe du concept, de l’animation, de la musique et du texte de publication.',
        'Pour une pub qui vous ressemble : retrouvez votre entreprise ou votre association dans l’onglet « Marque », ajoutez vos photos ou vidéos, puis demandez à l’IA.',
        'Vous avez 3 pubs gratuites pour essayer. Chaque pub passe un contrôle qualité avant de sortir.'
      ],
      cta: { label: 'Créer ma première pub', href: `${site()}/studio` }
    }
  };
}

export function trialsUsedEmail(limit: number): { subject: string; content: EmailContent } {
  return {
    subject: `Vous avez créé vos ${limit} pubs gratuites`,
    content: {
      preview: 'Continuez à créer en illimité avec l’offre Pro.',
      title: `Vos ${limit} pubs gratuites sont créées 🎬`,
      paragraphs: [
        'Bravo, vous avez utilisé tous vos essais du Studio Motion. Vos pubs restent modifiables à tout moment.',
        'Avec l’offre Pro : pubs illimitées, 3 accroches A/B au choix, script de voix-off, toutes les musiques, textures et transitions, jusqu’à 12 photos et 3 vidéos, sans filigrane.'
      ],
      cta: { label: 'Passer en Pro', href: `${site()}/#pricing` }
    }
  };
}
