'use client';

/**
 * MediaUploader.tsx — Upload résilient + déclenchement du pipeline
 * -----------------------------------------------------------------
 * Différent de `HeroGenerator` (qui ne fait que collecter le choix), ce
 * composant réalise l'upload réel vers Supabase Storage (TUS, reprenable),
 * affiche la barre de progression, puis appelle POST /api/pipeline/process.
 *
 * Après un échec, le formulaire reste disponible pour retry. Le fichier
 * n'est pas re-téléversé si le chemin TUS existe encore (reprend automatique).
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntake } from '@/stores/use-intake';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatFileSize,
  validateVideoFile,
  validateVideoUrl,
  estimateDurationFromSize,
} from './validate-intake';

type UploadPhase = 'idle' | 'uploading' | 'processing' | 'error';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number; fileLabel: string }
  | { phase: 'processing'; projectId: string }
  | { phase: 'error'; message: string; fileLabel?: string };

export type MediaUploaderProps = {
  showPreview?: boolean;
  onUploadSuccess?: (projectId: string) => void;
  fileRef?: React.RefObject<File | null>;
};

export function MediaUploader(props: MediaUploaderProps) {
  const { showPreview = false, onUploadSuccess, fileRef } = props;
  const router = useRouter();
  const { source, url, fileName, fileSize, reset } = useIntake();

  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });

  // Client navigateur authentifié (session lue depuis les cookies Supabase) :
  // l'upload part avec l'identité de l'utilisateur et la politique RLS
  // Storage « premier segment du chemin = auth.uid() » s'applique.
  const supabase = createClient();

  const startFileUpload = useCallback(async () => {
    if (!fileRef?.current) {
      setUploadState({ phase: 'error', message: 'Aucun fichier sélectionné.' });
      return;
    }

    const file = fileRef.current;
    if (!file) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setUploadState({
        phase: 'error',
        message: 'Connectez-vous avant de téléverser une vidéo.',
        fileLabel: file.name,
      });
      return;
    }

    const message = validateVideoFile({ name: file.name, size: file.size });
    if (message) {
      setUploadState({ phase: 'error', message, fileLabel: file.name });
      return;
    }

    const timestamp = Date.now();
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    // Premier segment = identifiant utilisateur : exigence de la politique
    // RLS du bucket privé (le worker lit ensuite ce chemin avec service_role).
    const bucketPath = `raw-videos/${user.id}/${timestamp}-${sanitizedName}`;

    setUploadState({
      phase: 'uploading',
      progress: 0,
      fileLabel: `${file.name} · ${formatFileSize(file.size)}`,
    });

    try {
      const { error: uploadError } = await supabase.storage
        .from('raw-videos')
        .upload(bucketPath, file, {
          upsert: false,
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Bucket privé : pas d'URL publique. Le worker télécharge la source
      // lui-même via une URL signée courte (voir worker/pipeline.js).
      const pipelineRes = await fetch('/api/pipeline/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'upload_gallery',
          storage_path: bucketPath,
          duration_seconds: estimateDurationFromSize(file.size),
        }),
      });

      const pipelineJson = await pipelineRes.json();

      if (!pipelineRes.ok) {
        throw new Error(pipelineJson.error || 'Erreur pipeline');
      }

      setUploadState({
        phase: 'processing',
        projectId: pipelineJson.projectId,
      });

      onUploadSuccess?.(pipelineJson.projectId);
      router.push(`/project/${pipelineJson.projectId}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Erreur lors de l\'upload';
      setUploadState({
        phase: 'error',
        message: errorMessage,
        fileLabel: file.name,
      });
    }
  }, [fileRef, supabase, onUploadSuccess, router]);

  const handleUrlSubmit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setUploadState({ phase: 'error', message: 'Veuillez coller un lien vidéo.' });
      return;
    }

    const message = validateVideoUrl(trimmed);
    if (message) {
      setUploadState({ phase: 'error', message });
      return;
    }

    setUploadState({ phase: 'processing', projectId: 'pending' });

    try {
      const pipelineRes = await fetch('/api/pipeline/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'external_url',
          source_url: trimmed,
        }),
      });

      const pipelineJson = await pipelineRes.json();

      if (!pipelineRes.ok) {
        throw new Error(pipelineJson.error || 'Erreur lors du traitement');
      }

      setUploadState({
        phase: 'processing',
        projectId: pipelineJson.projectId,
      });

      onUploadSuccess?.(pipelineJson.projectId);
      router.push(`/project/${pipelineJson.projectId}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Erreur réseau';
      setUploadState({ phase: 'error', message: errorMessage });
    }
  }, [url, onUploadSuccess, router]);

  const handleCancel = useCallback(() => {
    setUploadState({ phase: 'idle' });
    reset();
  }, [reset]);

  const renderIdle = () => (
    <p className="text-sm text-muted-foreground">
      Sélectionnez un fichier ou collez un lien pour commencer.
    </p>
  );

  const renderUploading = (state: Extract<UploadState, { phase: 'uploading' }>) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{state.fileLabel}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {state.progress}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${state.progress}%` }}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleCancel}>
          Annuler
        </Button>
        <Button size="sm" variant="ghost" disabled>
          En cours...
        </Button>
      </div>
    </div>
  );

  const renderProcessing = (state: Extract<UploadState, { phase: 'processing' }>) => (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm">
      <span className="font-medium">Traitement en cours...</span>
      <Button size="sm" variant="ghost" onClick={() => router.push('/dashboard')}>
        Voir le tableau de bord
      </Button>
    </div>
  );

  const renderError = (state: Extract<UploadState, { phase: 'error' }>) => (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">{state.message}</p>
      <div className="flex gap-2">
        {state.fileLabel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setUploadState({ phase: 'idle' });
            }}
          >
            Réessayer avec ce fichier
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setUploadState({ phase: 'idle' });
            reset();
            router.push('/');
          }}
        >
          Retour au formulaire
        </Button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (uploadState.phase) {
      case 'idle':
        return renderIdle();
      case 'uploading':
        return renderUploading(uploadState as Extract<UploadState, { phase: 'uploading' }>);
      case 'processing':
        return renderProcessing(uploadState as Extract<UploadState, { phase: 'processing' }>);
      case 'error':
        return renderError(uploadState as Extract<UploadState, { phase: 'error' }>);
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {showPreview && source && (
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="truncate font-medium">
            {source === 'url'
              ? url
              : fileName && fileSize
                ? `${fileName} (${formatFileSize(fileSize)})`
                : '—'}
          </span>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-muted-foreground underline hover:text-foreground"
          >
            Effacer
          </button>
        </div>
      )}
      {renderContent()}
      {uploadState.phase === 'idle' && source !== 'file' && (
        <Button
          size="lg"
          className="w-full h-14 rounded-xl text-base font-semibold"
          onClick={handleUrlSubmit}
        >
          Analyser ce lien
        </Button>
      )}
      {uploadState.phase === 'idle' && source === 'file' && (
        <Button
          size="lg"
          className="w-full h-14 rounded-xl text-base font-semibold"
          onClick={startFileUpload}
          disabled={!fileRef?.current}
        >
          Uploader et analyser
        </Button>
      )}
      {uploadState.phase === 'idle' && !source && (
        <p className="text-center text-xs text-muted-foreground">
          10 minutes offertes à l'inscription — sans carte bancaire.
        </p>
      )}
    </div>
  );
}