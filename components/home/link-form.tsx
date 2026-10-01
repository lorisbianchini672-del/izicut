'use client';

import { ArrowRight, Link2, Paperclip, X } from 'lucide-react';

import { useHeroForm } from '@/components/upload/use-hero-form';

const ACCEPT = '.mp4,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska';

/**
 * Champ « collez un lien » : branché sur la vraie logique d'import
 * (validation + mémoire partagée avec /upload via useHeroForm).
 */
export function LinkForm() {
  const f = useHeroForm();

  return (
    <form
      onSubmit={f.onSubmit}
      onDragOver={(e) => { e.preventDefault(); f.onDragState(true); }}
      onDragLeave={() => f.onDragState(false)}
      onDrop={(e) => { e.preventDefault(); f.onDragState(false); f.onDropFile(e.dataTransfer.files?.[0]); }}
      className="w-full max-w-xl"
      noValidate
    >
      <div
        className={`group flex items-center gap-2 rounded-2xl border bg-ink-900/80 p-2 shadow-[0_0_0_1px_rgb(255_255_255/0.02)] backdrop-blur transition-colors focus-within:border-neon/60 ${
          f.dragging ? 'border-neon/70 bg-neon/[0.05]' : f.urlError ? 'border-rec/60' : 'border-line-strong'
        }`}
      >
        <Link2 className="ml-2 h-5 w-5 shrink-0 text-fg-subtle" aria-hidden />
        {f.fileLabel ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg">
            <span className="truncate">{f.fileLabel}</span>
            <button type="button" onClick={f.onClearFile} className="izi-focus cursor-pointer rounded p-1 text-fg-subtle hover:text-fg" aria-label="Retirer le fichier">
              <X className="h-4 w-4" />
            </button>
          </span>
        ) : (
          <>
            <label htmlFor="izi-link" className="sr-only">Lien de la vidéo YouTube ou Twitch</label>
            <input
              id="izi-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="Collez un lien YouTube ou Twitch…"
              value={f.draft}
              onChange={(e) => f.onDraftChange(e.target.value)}
              aria-invalid={Boolean(f.urlError)}
              aria-describedby={f.urlError ? 'izi-link-error' : 'izi-link-hint'}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-fg placeholder:text-fg-subtle focus:outline-none"
            />
          </>
        )}
        <button
          type="button"
          onClick={f.onOpenPicker}
          className="izi-focus hidden cursor-pointer rounded-xl p-2.5 text-fg-subtle transition-colors hover:bg-white/5 hover:text-fg sm:block"
          aria-label="Importer un fichier vidéo"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <button
          type="submit"
          className="izi-focus group/btn inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-neon px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_0_32px_-6px_rgb(200_255_61/0.7)] transition-all hover:shadow-[0_0_44px_-4px_rgb(200_255_61/0.9)] active:scale-[0.98]"
        >
          <span className="hidden sm:inline">Générer mes clips</span>
          <span className="sm:hidden">Générer</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden />
        </button>
        <input
          ref={f.inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => { f.onDropFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      {f.urlError ? (
        <p id="izi-link-error" role="alert" className="mt-2 pl-2 text-sm text-rec">{f.urlError}</p>
      ) : (
        <p id="izi-link-hint" className="mt-2 pl-2 text-xs text-fg-subtle">
          Ou glissez un fichier MP4, MOV, WebM ici · 30 minutes offertes, sans carte bancaire
        </p>
      )}
    </form>
  );
}
