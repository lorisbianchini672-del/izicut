import { useState, useMemo } from 'react';
import { Grid3X3, List } from 'lucide-react';
import { ClipCard, type ClipCardProps } from './ClipCard';
import { cn } from '@/lib/utils';

export type ClipListItem = {
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
  created_at?: string;
  speaker_detection?: any;
};
export type ClipListSortKey = 'virality_score' | 'created_at' | 'title';
export type ClipListStatusFilter = 'all' | 'ready' | 'rendering' | 'suggested';

export type ClipListProps = {
  clips: ClipListItem[];
  onDelete?: (clipId: string) => void;
  onExport?: (clipId: string) => void;
  onEdit?: (clipId: string) => void;
  onView?: (clipId: string) => void;
  selectedIds?: string[];
  onSelect?: (clipId: string, selected: boolean) => void;
  viewMode?: 'grid' | 'list';
  className?: string;
};

export function ClipList(props: ClipListProps) {
  const { clips, onDelete, onExport, onEdit, onView, selectedIds = [], onSelect, className } = props;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [sortKey, setSortKey] = useState<ClipListSortKey>('virality_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<ClipListStatusFilter>('all');

  const filtered = useMemo(() => {
    let result = [...clips];
    if (statusFilter !== 'all') result = result.filter((c) => c.status === statusFilter);
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'virality_score') cmp = (a.virality_score ?? -1) - (b.virality_score ?? -1);
      else if (sortKey === 'created_at') cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      else cmp = (a.title ?? '').localeCompare(b.title ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [clips, sortKey, sortDir, statusFilter]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Clips</h2>
          <span className="rounded-lg bg-muted px-2 py-0.5 text-xs">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button onClick={() => setViewMode('grid')} className={cn('rounded-md p-1.5', viewMode === 'grid' ? 'bg-background shadow' : 'text-muted-foreground')}>
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('rounded-md p-1.5', viewMode === 'list' ? 'bg-background shadow' : 'text-muted-foreground')}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(['all', 'ready', 'rendering', 'suggested'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn('rounded-lg px-2 py-1 text-xs', statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
            {s === 'all' ? 'Tous' : s}
          </button>
        ))}
        <button onClick={() => setSortKey('virality_score')} className={cn('rounded-lg px-2 py-1 text-xs', sortKey === 'virality_score' ? 'bg-background text-foreground' : 'text-muted-foreground')}>Score</button>
        <button onClick={() => setSortKey('created_at')} className={cn('rounded-lg px-2 py-1 text-xs', sortKey === 'created_at' ? 'bg-background text-foreground' : 'text-muted-foreground')}>Date</button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-muted/50 p-8 text-center text-muted-foreground">Aucun clip.</div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((clip) => (
            <ClipCard key={clip.id} clip={clip} selected={selectedIds.includes(clip.id)} onView={onView} onEdit={onEdit} onExport={onExport} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((clip) => (
            <ClipCard key={clip.id} clip={clip} selected={selectedIds.includes(clip.id)} onView={onView} onEdit={onEdit} onExport={onExport} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}