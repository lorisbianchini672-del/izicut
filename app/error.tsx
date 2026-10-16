'use client';

/**
 * Filet de sécurité : si une page plante, on affiche un écran propre avec
 * « Réessayer » au lieu de l'écran blanc « Application error » de Next.js.
 */
import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[izicut] erreur de page :', error);
  }, [error]);
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Petit souci</p>
      <h1 className="max-w-md text-3xl font-semibold tracking-tight">Cette page a rencontré un problème.</h1>
      <p className="max-w-md text-sm text-muted-foreground">Votre travail enregistré n’est pas perdu. Réessayez : dans la plupart des cas, ça repart tout de suite.</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="cursor-pointer rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">Réessayer</button>
        <Link href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">Retour à l’accueil</Link>
      </div>
      {error.digest ? <p className="text-[11px] text-muted-foreground/70">Référence : {error.digest}</p> : null}
    </main>
  );
}
