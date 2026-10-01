'use client';

/**
 * ============================================================
 * MediaUploader.tsx — Envoi réel de la source + déclenchement du pipeline
 * ------------------------------------------------------------
 * Contrairement à `HeroGenerator` (qui ne fait que mémoriser le choix de
 * l'utilisateur), ce composant envoie réellement la vidéo dans le
 * compartiment privé `raw-videos`, puis appelle `POST /api/pipeline/process`.
 * Côté serveur, cet appel — en UNE transaction — débite les crédits, crée le
 * projet et met le job `ingest` en file pour le worker.
 *
 * La source vit dans le store `useIntake` : l'accueil et la page d'import
 * partagent donc le même état sans le dupliquer. Après un échec, rien n'est
 * effacé — l'utilisateur peut réessayer tel quel.
 * ============================================================
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIntake } from '@/stores/use-intake';
import { createClient, STORAGE_BUCKETS } from '@/lib/supabase/client';
import { secondsToMinutes } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  formatFileSize,
  validateVideoFile,
  validateVideoUrl,
  estimateDurationFromSize
} from './validate-intake';

export type MediaUploaderProps = {
  /** Source attendue : fichier local ou lien externe (YouTube, Twitch). */
  mode: 'file' | 'url';
  showPreview?: boolean;
  onUploadSuccess?: (projectId: string) => void;
};

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; fileLabel: string }
  | { phase: 'processing'; projectId: string }
  | { phase: 'error'; message: string; canRetry: boolean };

/** Corps envoyé à l'API : les noms suivent le contrat Zod côté serveur. */
type PipelinePayload = {
  source_type: 'upload_gallery' | 'external_url';
  storage_path?: string;
  source_url?: string;
  duration_seconds?: number;
};

/** Clé Storage sûre : ni espace ni accent (le chemin est signé tel quel). */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export function MediaUploader(props: MediaUploaderProps) {
  const { mode, showPreview = false, onUploadSuccess } = props;
  const router = useRouter();
  const { source, url, file, fileName, fileSize, reset } = useIntake();
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });

  // Client navigateur authentifié (session lue dans les cookies Supabase) :
  // l'envoi part avec l'identité de l'utilisateur, la politique RLS du
  // compartiment « premier segment du chemin = auth.uid() » s'applique.
  const supabase = createClient();

  /** Appel unique à l'API ; les messages d'erreur sont déjà rédigés pour l'utilisateur. */
  const dispatchProject = useCallback(
    async (payload: PipelinePayload) => {
      const response = await fetch('/api/pipeline/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string;
        required?: number;
        available?: number;
      };

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error(
            `Crédits insuffisants : ${secondsToMinutes(Number(json.required ?? 0))} min requises, ` +
              `${secondsToMinutes(Number(json.available ?? 0))} min disponibles.`
          );
        }
        throw new Error(json.error ?? 'Le traitement n’a pas pu démarrer.');
      }

      const projectId = String(json.projectId ?? '');
      setUploadState({ phase: 'processing', projectId });
      onUploadSuccess?.(projectId);
      router.push(`/project/${projectId}`);
    },
    [onUploadSuccess, router]
  );

  const startFileUpload = useCallback(async () => {
    if (!file) {
      setUploadState({ phase: 'error', message: 'Aucun fichier sélectionné.', canRetry: false });
      return;
    }

    const message = validateVideoFile({ name: file.name, size: file.size });
    if (message) {
      setUploadState({ phase: 'error', message, canRetry: false });
      return;
    }

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setUploadState({
        phase: 'error',
        message: 'Connectez-vous avant de téléverser une vidéo.',
        canRetry: true
      });
      return;
    }

    // Clé d'objet DANS le compartiment : `raw-videos` est le nom du
    // compartiment, pas un dossier. Le premier segment DOIT être
    // l'identifiant de l'utilisateur (politique RLS du compartiment), et
    // c'est ce chemin exact que le worker signera pour lire la source.
    const objectPath = `${user.id}/${Date.now()}-${sanitizeFileName(file.name)}`;

    setUploadState({
      phase: 'uploading',
      fileLabel: `${file.name} · ${formatFileSize(file.size)}`
    });

    try {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.rawVideos)
        .upload(objectPath, file, { upsert: false, cacheControl: '3600' });

      if (uploadError) throw new Error(uploadError.message);

      await dispatchProject({
        source_type: 'upload_gallery',
        storage_path: objectPath,
        duration_seconds: estimateDurationFromSize(file.size)
      });
    } catch (err) {
      setUploadState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'L’envoi a échoué.',
        canRetry: true
      });
    }
  }, [dispatchProject, file, supabase]);

  const handleUrlSubmit = useCallback(async () => {
    const trimmed = url.trim();

    if (!trimmed) {
      setUploadState({
        phase: 'error',
        message: 'Collez un lien vidéo pour continuer.',
        canRetry: false
      });
      return;
    }

    const message = validateVideoUrl(trimmed);
    if (message) {
      setUploadState({ phase: 'error', message, canRetry: false });
      return;
    }

    setUploadState({ phase: 'uploading', fileLabel: trimmed });

    try {
      await dispatchProject({ source_type: 'external_url', source_url: trimmed });
    } catch (err) {
      setUploadState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Le traitement n’a pas pu démarrer.',
        canRetry: true
      });
    }
  }, [dispatchProject, url]);

  const handleCancel = useCallback(() => {
    setUploadState({ phase: 'idle' });
    reset();
  }, [reset]);

  const preview = showPreview ? (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span className="truncate font-medium">
        {source === 'url'
          ? url || '—'
          : fileName
            ? `${fileName}${fileSize ? ` (${formatFileSize(fileSize)})` : ''}`
            : '—'}
      </span>
      <button
        type="button"
        onClick={handleCancel}
        className="shrink-0 text-muted-foreground underline hover:text-foreground"
      >
        Effacer
      </button>
    </div>
  ) : null;

  const busy = uploadState.phase === 'uploading' || uploadState.phase === 'processing';

  return (
    <div className="flex flex-col gap-4">
      {preview}

      {uploadState.phase === 'uploading' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{uploadState.fileLabel}</span>
            <span className="shrink-0 text-muted-foreground">
              {mode === 'file' ? 'Envoi…' : 'Préparation…'}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <Button size="sm" variant="outline" onClick={handleCancel}>
            Annuler
          </Button>
        </div>
      )}

      {uploadState.phase === 'processing' && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <span className="font-medium">Traitement en cours…</span>
          <Button size="sm" variant="ghost" onClick={() => router.push('/dashboard')}>
            Voir le tableau de bord
          </Button>
        </div>
      )}

      {uploadState.phase === 'error' && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">{uploadState.message}</p>
          <div className="flex gap-2">
            {uploadState.canRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={mode === 'file' ? startFileUpload : handleUrlSubmit}
              >
                Réessayer
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setUploadState({ phase: 'idle' })}>
              Modifier la source
            </Button>
          </div>
        </div>
      )}

      {uploadState.phase === 'idle' && (
        <>
          {mode === 'file' ? (
            <Button
              size="lg"
              className="h-14 rounded-xl text-base font-semibold"
              onClick={startFileUpload}
              disabled={!file}
            >
              Uploader et analyser
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-14 rounded-xl text-base font-semibold"
              onClick={handleUrlSubmit}
              disabled={!url.trim()}
            >
              Analyser ce lien
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Les minutes utilisées sont déduites une seule fois, au lancement du traitement.
          </p>
        </>
      )}

      {busy && (
        <p className="text-center text-xs text-muted-foreground">
          Ne fermez pas cet onglet : vous serez redirigé vers votre projet dès sa création.
        </p>
      )}
    </div>
  );
}
