/**
 * components/dashboard/ClipCard.tsx — PILIER 5
 * ---------------------------------------------
 * Carte de clip dans le dashboard style Opus Pro.
 *
 * Affiche :
 *   - Score virality (0-99) avec barre visuelle
 *   - Miniatures / aperçu
 *   - Titre, description, hashtags
 *   - Métadonnées (durée, structure narrative)
 *   - Actions : view, edit, export, delete
 */

import { Download, Edit2, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ClipCardProps = {
  clip: {
    id: string;
    title: string;
    start_time: number;
    end_time: number;
    virality_score: number | null;
    hook_text: string | null;
    summary: string | null;
    hashtags: string[] | null;
    duration_seconds: number | null;
    rendered_storage_path: string | null;
    status: 'suggested' | 'queued' | 'rendering' | 'ready' | 'failed';
    speaker_detection?: any;
  };
  onChange?: (clipId: string, patch: any) => void;
  onDelete?: (clipId: string) => void;
  onExport?: (clipId: string) => void;
  onEdit?: (clipId: string) => void;
  onView?: (clipId: string) => void;
  selected?: boolean;
  className?: string;
};

export function ClipCard(props: ClipCardProps) {
  const {
    clip,
    onChange,
    onDelete,
    onExport,
    onEdit,
    onView,
    selected = false,
    className,
  } = props;

  const { virality_score, title, duration_seconds, status, hashtags } = clip;

  // Barre de progression du score virality
  const scorePercent = virality_score != null ? (virality_score / 99) * 100 : 0;
  const scoreColor =
    virality_score != null && virality_score >= 80
      ? 'bg-emerald-500'
      : virality_score != null && virality_score >= 60
      ? 'bg-amber-500'
      : 'bg-slate-400';

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card p-4 shadow-md transition-all hover:shadow-lg hover:border-primary/50',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className
      )}
    >
      {/* ── Header : score virality ── */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {virality_score != null ? virality_score : '?'}
          </div>
          <div>
            <div className="text-sm font-semibold">{title || 'Sans titre'}</div>
            {duration_seconds != null && (
              <div className="text-xs text-muted-foreground">
                {Math.floor(duration_seconds / 60)}:{(duration_seconds % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        </div>
        <Badge variant={status === 'ready' ? 'default' : status === 'rendering' ? 'secondary' : 'outline'}>
          {status}
        </Badge>
      </div>

      {/* ── Barre de score ── */}
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all duration-500', scoreColor)}
          style={{ width: `${scorePercent}%` }}
        />
      </div>

      {/* ── Contenu ── */}
      <div className="space-y-2 text-sm text-muted-foreground">
        {clip.hook_text && (
          <p className="text-sm font-medium text-foreground line-clamp-2">{clip.hook_text}</p>
        )}
        {clip.summary && (
          <p className="line-clamp-2">{clip.summary}</p>
        )}
        {hashtags && hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onView?.(clip.id)}>
          <Eye className="mr-1 h-4 w-4" />
          Voir
        </Button>
        <Button size="sm" variant="outline" onClick={() => onEdit?.(clip.id)}>
          <Edit2 className="mr-1 h-4 w-4" />
          Éditer
        </Button>
        <Button size="sm" variant="outline" onClick={() => onExport?.(clip.id)}>
          <Download className="mr-1 h-4 w-4" />
          Export
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete?.(clip.id)} className="ml-auto text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}