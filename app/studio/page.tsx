import type { Metadata } from 'next';

import { MotionStudio } from '@/components/motion/MotionStudio';

export const metadata: Metadata = {
  title: 'Studio Motion — vidéos animées par IA | IziCut',
  description: 'Créez des vidéos en motion design pour TikTok, Reels et YouTube : décrivez votre idée, l’IA anime, vous modifiez en lui parlant.'
};

export default function StudioPage() {
  return <MotionStudio />;
}
