'use client';

/**
 * ============================================================
 * HeroGenerator.tsx — Présentation visible du bloc d'accueil
 * ------------------------------------------------------------
 * Zéro logique métier : ce composant reçoit l'objet renvoyé par
 * `useHeroForm()` (dans `use-hero-form.ts`) en props et se contente de le
 * rendre. Voilà pourquoi le hook et la vue sont dans deux fichiers : un
 * composant client qui contient la logique d'envoi ET 150 lignes de JSX
 * dépasse la limite d'écriture atomique de 6 000 caractères.
 * ============================================================
 */
import { AlertCircle, FileVideo, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HeroFormApi } from './use-hero-form';

export function HeroGenerator(props: HeroFormApi) {
  const {
    draft,
    urlError,
    dragging,
    fileLabel,
    inputRef,
    onDraftChange,
    onClearFile,
    onDropFile,
    onDragState,
    onOpenPicker,
    onSubmit
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-7"
    >
      <div>
        <label htmlFor="hero-video-url" className="mb-2 block text-sm font-semibold">
          Collez un lien vidéo
        </label>
        <input
          id="hero-video-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-invalid={urlError ? true : undefined}
          aria-describedby={urlError ? 'hero-video-url-erreur' : undefined}
          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {urlError ? (
          <p
            id="hero-video-url-erreur"
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {urlError}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-xs font-medium tracking-widest text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        OU
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold">Déposez un fichier vidéo</span>
        <div
          role="button"
          tabIndex={0}
          aria-label="Déposer un fichier vidéo ou cliquer pour parcourir"
          onClick={onOpenPicker}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') onOpenPicker();
          }}
          onDragOver={event => {
            event.preventDefault();
            onDragState(true);
          }}
          onDragLeave={() => onDragState(false)}
          onDrop={event => {
            event.preventDefault();
            onDragState(false);
            onDropFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40'
          )}
        >
          <FileVideo className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold text-primary">Cliquez pour parcourir</span>
            {' ou glissez-déposez'}
          </p>
          <p className="text-xs text-muted-foreground">MP4, MOV, WebM, MKV — jusqu’à 800 Mo</p>
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="sr-only"
            tabIndex={-1}
            onChange={event => {
              onDropFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        {fileLabel ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="truncate font-medium">{fileLabel}</span>
            <button
              type="button"
              onClick={onClearFile}
              aria-label="Retirer ce fichier"
              className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="h-14 rounded-xl text-base font-semibold">
        Générer mes clips
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        10 minutes offertes à l’inscription — sans carte bancaire.
      </p>
    </form>
  );
}
