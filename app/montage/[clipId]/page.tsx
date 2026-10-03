import { EffectsStudio } from '@/components/overlay/EffectsStudio';

export default async function MontagePage({ params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  return <EffectsStudio clipId={clipId} />;
}
