import { ClipStudio } from '@/components/editor/ClipStudio';

export default async function EditorClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;

  return <ClipStudio clipId={clipId} />;
}

