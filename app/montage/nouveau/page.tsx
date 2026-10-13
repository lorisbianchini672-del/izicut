import type { Metadata } from 'next';

import { EffectsStudio } from '@/components/overlay/EffectsStudio';

export const metadata: Metadata = { title: 'Modifier ma vidéo — Montage IA | izicut' };

export default function MontageLocalPage() {
  return <EffectsStudio clipId={null} />;
}
