import { VideoEditor } from '@/components/editor/VideoEditor';

export default async function EditorClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;

  return <VideoEditor clipId={clipId} />;
}

