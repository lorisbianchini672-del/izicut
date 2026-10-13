import type { Metadata } from 'next';

import { EffectsStudio } from '@/components/overlay/EffectsStudio';

export const metadata: Metadata = { title: 'Montage IA de vos vidéos' };

export default function MontageLocalPage() {
  return <EffectsStudio clipId={null} />;
}
