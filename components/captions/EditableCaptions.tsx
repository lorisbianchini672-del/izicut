import { useCallback, useMemo, useState } from 'react';
import { useCaptionsEditor, type RelativeWord } from '@/lib/hooks/use-captions-editor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EditableCaptionsProps = {
  initialWords: RelativeWord[];
  onExport?: (words: RelativeWord[], hasChanges: boolean) => void;
  fontSize?: number;
  activeColor?: string;
  className?: string;
  readOnly?: boolean;
};

export function EditableCaptions(props: EditableCaptionsProps) {
  const { initialWords, onExport, fontSize = 72, activeColor = '#FFFFFF', className, readOnly = false } = props;

    const editor = useCaptionsEditor({
    initialWords,
    editable: !readOnly,
    autoDetectEmojis: true,
    onDidChange: () => {},
  });

  // Exporter les changements uniquement quand c'est demandé
  const exportChanges = useCallback(() => {
    const { words, hasChanges } = editor.exportWords();
    if (hasChanges) {
      onExport?.(words, hasChanges);
    }
  }, [editor, onExport]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEditing = useCallback((word: typeof editor.words[0]) => {
    if (readOnly) return;
    setEditingId(word.id);
    setEditValue(word.word);
  }, [readOnly]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const saveEditing = useCallback(() => {
    if (!editingId) return;
    if (!editValue.trim()) {
      editor.toggleDeleteWord(editingId);
    } else {
      editor.updateWord(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, editor]);

  const wordLines = useMemo(() => {
    const lines: typeof editor.words[] = [];
    let current: typeof editor.words = [];
    for (const w of editor.words) {
      if (w.isDeleted) continue;
      if (current.length > 0 && /[.!?]/.test(w.word)) {
        current.push(w);
        lines.push(current);
        current = [];
      } else {
        current.push(w);
      }
    }
    if (current.length > 0) lines.push(current);
    return lines;
  }, [editor.words]);

  const renderWord = (word: typeof editor.words[0], isLast: boolean) => {
    const isEditing = editingId === word.id;
    const isDirty = word.isDirty;
    const hasEmoji = word.emojiHighlights?.length;

    if (isEditing) {
      return (
        <span key={word.id}>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEditing();
              if (e.key === 'Escape') cancelEditing();
            }}
            style={{ fontSize, textAlign: 'center' }}
            autoFocus
          />
          <button type="button" onClick={saveEditing}>✓</button>
        </span>
      );
    }

    const content = (
      <span style={{ color: isDirty ? '#FFD700' : activeColor, fontSize }}>
        {word.word}
      </span>
    );

    if (readOnly) {
      return <span key={word.id}>{content}</span>;
    }

    return (
      <span key={word.id} className="inline-block group">
        {content}
        <button
          type="button"
          onClick={() => startEditing(word)}
          className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => editor.toggleDeleteWord(word.id)}
          className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-100"
        >
          ×
        </button>
      </span>
    );
  };

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-black/40 p-6 text-center text-white', className)}>
      {!readOnly && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-black/60 px-3 py-2 text-xs text-muted-foreground">
          <span>Édition sous-titres</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => editor.undo()}>↩</Button>
            <Button size="sm" variant="outline" onClick={() => editor.redo()}>↪</Button>
            <Button size="sm" variant="ghost" onClick={() => { const { words, hasChanges } = editor.exportWords(); onExport?.(words, hasChanges); }}>
              Exporter
            </Button>
          </div>
        </div>
      )}
      <div className="leading-relaxed">
        {wordLines.map((line, i) => (
          <div key={i} className="mb-2 last:mb-0">
            {line.map((word, j) => (
              <span key={word.id} style={{ marginRight: j < line.length - 1 ? '0.25em' : 0 }}>
                {renderWord(word, j === line.length - 1)}
              </span>
            ))}
          </div>
        ))}
      </div>
      {editor.words.length === 0 && !readOnly && <p>Aucun sous-titre.</p>}
    </div>
  );
}