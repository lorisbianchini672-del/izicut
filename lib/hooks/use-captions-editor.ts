/**
 * lib/hooks/use-captions-editor.ts — PILIER 3
 * --------------------------------------------
 * Édition inline des sous-titres sans re-rendu complet.
 *
 * Fonctionnalités :
 *   - Correction d'un mot mal retranscrit (TextInput inline)
 *   - Suppression d'un mot (ex: mot parasites, stutters)
 *   - Persistance locale (framework choisi : localStorage ou API projet)
 *   - Export compatible ViralClipComposition (RelativeWord[])
 *
 * Architecture : ce hook est REUTILISABLE — il ne connait pas Remotion.
 * Le composant EditableCaptions fait le pont entre ce hook et l'UI.
 */

import { useCallback, useState } from 'react';

// ---------- Types ----------

export type EditableWord = {
  id: string;
  word: string;
  start: number;
  end: number;
  isDirty?: boolean;
  isDeleted?: boolean;
  emojiHighlights?: string[];
};

export type CaptionsEditorState = {
  words: EditableWord[];
  lastModified?: string;
  conflict?: { wordId: string; serverVersion: string; localVersion: string } | null;
};

export type CaptionsEditorActions = {
  updateWord: (id: string, newWord: string) => void;
  toggleDeleteWord: (id: string) => void;
  reorderWords: (fromIndex: number, toIndex: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  exportWords: () => { words: RelativeWord[]; hasChanges: boolean };
};

export type RelativeWord = {
  word: string;
  start: number;
  end: number;
  emojiHighlights?: string[];
};

export type UseCaptionsEditorOptions = {
  initialWords: RelativeWord[];
  editable?: boolean;
  autoDetectEmojis?: boolean;
  onDidChange?: (state: CaptionsEditorState) => void;
};

// ---------- Helpers (hors hook pour éviter le hoisting dans useState) ----------

/** Détecte les émoticônes dans un texte. Extrait avant le hook pour être utilisable dans useState initializer. */
const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function detectEmojis(text: string): string[] {
  const matches = text.match(EMOJI_REGEX);
  return matches ?? [];
}

// ---------- Hook ----------

/**
 * useCaptionsEditor — Gestion de l'édition des sous-titres mot-à-mot.
 *
 * PILIER 3 — Correction textuelle rapide sans re-rendu complet.
 */
export function useCaptionsEditor(
  options: UseCaptionsEditorOptions
): CaptionsEditorState & CaptionsEditorActions {
  const { initialWords, editable = true, autoDetectEmojis = true, onDidChange } = options;

  const [words, setWords] = useState<EditableWord[]>(() =>
    initialWords.map((w, i) => ({
      id: `word-${i}-${w.start}-${w.end}`,
      word: w.word,
      start: w.start,
      end: w.end,
      emojiHighlights: autoDetectEmojis ? detectEmojis(w.word) : w.emojiHighlights,
    }))
  );

  const [previousState, setPreviousState] = useState<EditableWord[] | null>(null);
  const [nextState, setNextState] = useState<EditableWord[] | null>(null);

  const detectEmojisCallback = useCallback((text: string): string[] => {
    const matches = text.match(EMOJI_REGEX);
    return matches ?? [];
  }, []);

  const getLatestWords = (): EditableWord[] => words;

  const updateWord = useCallback((id: string, newWord: string) => {
    if (!editable) return;
    setPreviousState([...words]);
    setNextState(null);
    setWords((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              word: newWord,
              isDirty: true,
              emojiHighlights: autoDetectEmojis ? detectEmojis(newWord) : w.emojiHighlights,
            }
          : w
      )
    );
    onDidChange?.({ words: getLatestWords(), lastModified: new Date().toISOString() });
  }, [editable, words, autoDetectEmojis, detectEmojis, onDidChange]);

  const toggleDeleteWord = useCallback((id: string) => {
    if (!editable) return;
    setPreviousState([...words]);
    setNextState(null);
    setWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isDeleted: !w.isDeleted } : w))
    );
    onDidChange?.({ words: getLatestWords(), lastModified: new Date().toISOString() });
  }, [editable, words, onDidChange]);

  const reorderWords = useCallback((fromIndex: number, toIndex: number) => {
    console.warn('[useCaptionsEditor] reorderWords non implémenté (MVP)');
  }, []);

  const undo = useCallback(() => {
    if (previousState) {
      setNextState([...words]);
      setWords(previousState);
      setPreviousState(null);
      onDidChange?.({ words: getLatestWords(), lastModified: new Date().toISOString() });
    }
  }, [previousState, words, onDidChange]);

  const redo = useCallback(() => {
    if (nextState) {
      setPreviousState([...words]);
      setWords(nextState);
      setNextState(null);
      onDidChange?.({ words: getLatestWords(), lastModified: new Date().toISOString() });
    }
  }, [nextState, words, onDidChange]);

  const reset = useCallback(() => {
    const fresh = initialWords.map((w, i) => ({
      id: `word-${i}-${w.start}-${w.end}`,
      word: w.word,
      start: w.start,
      end: w.end,
      emojiHighlights: autoDetectEmojis ? detectEmojis(w.word) : w.emojiHighlights,
    }));
    setWords(fresh);
    setPreviousState(null);
    setNextState(null);
    onDidChange?.({ words: fresh, lastModified: new Date().toISOString() });
  }, [initialWords, autoDetectEmojis, detectEmojis, onDidChange]);

  const exportWords = useCallback((): { words: RelativeWord[]; hasChanges: boolean } => {
    const current = getLatestWords();
    const original = initialWords;
    const hasChanges =
      current.length !== original.length ||
      current.some((c, i) => c.word !== original[i]?.word || c.start !== original[i]?.start || c.end !== original[i]?.end);

    return {
      words: current
        .filter((w) => !w.isDeleted)
        .map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
          emojiHighlights: w.emojiHighlights,
        })),
      hasChanges,
    };
  }, [initialWords]);

  return {
    words,
    lastModified: words.some((w) => w.isDirty) ? new Date().toISOString() : undefined,
    updateWord,
    toggleDeleteWord,
    reorderWords,
    undo,
    redo,
    reset,
    exportWords,
  };
}