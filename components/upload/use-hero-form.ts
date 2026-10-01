'use client';

/**
 * ============================================================
 * use-hero-form.ts — État et règles d'envoi du bloc d'accueil
 * ------------------------------------------------------------
 * Hook CLIENT : utilise useRouter (navigation) et le store Zustand
 * (mémoire du choix entre les écrans). La présentation visible associée
 * vit dans `HeroGenerator.tsx` et reçoit l'objet renvoyé ici en props :
 * aucune logique métier n'y figure.
 * ============================================================
 */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntake } from '@/stores/use-intake';
import { formatFileSize, validateVideoFile, validateVideoUrl } from './validate-intake';

export type HeroFormApi = {
  draft: string;
  urlError: string | null;
  dragging: boolean;
  fileLabel: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onClearFile: () => void;
  onDropFile: (file: File | undefined | null) => void;
  onDragState: (active: boolean) => void;
  onOpenPicker: () => void;
  onSubmit: (event: React.FormEvent) => void;
};

export function useHeroForm(): HeroFormApi {
  const router = useRouter();
  const { source, fileName, fileSize, setUrl, setFile, reset } = useIntake();
  const [draft, setDraft] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDropFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      const message = validateVideoFile({ name: file.name, size: file.size });
      setUrlError(message);
      if (message) return;
      setFile(file);
    },
    [setFile, setUrlError]
  );

  const onSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = draft.trim();
      if (trimmed) {
        const message = validateVideoUrl(trimmed);
        setUrlError(message);
        if (message) return;
        setUrl(trimmed);
      } else if (source !== 'file') {
        setUrlError('Collez un lien ou déposez un fichier vidéo pour continuer.');
        return;
      }
      router.push('/login?next=%2Fupload');
    },
    [draft, source, setUrl]
  );

  return {
    draft,
    urlError,
    dragging,
    fileLabel:
      source === 'file' && fileName
        ? fileSize !== null
          ? `${fileName} · ${formatFileSize(fileSize)}`
          : fileName
        : null,
    inputRef,
    onDraftChange: value => {
      setDraft(value);
      setUrlError(null);
    },
    onClearFile: reset,
    onDropFile,
    onDragState: setDragging,
    onOpenPicker: () => inputRef.current?.click(),
    onSubmit
  };
}
