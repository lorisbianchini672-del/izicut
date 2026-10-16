import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page introuvable', robots: { index: false } };

/** Page 404 aux couleurs du site (au lieu de la page grise par défaut). */
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="bg-gradient-to-r from-[#8fa6ff] via-[#f28be0] to-[#ff7a62] bg-clip-text text-7xl font-bold tracking-tighter text-transparent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Cette page n’existe pas (ou plus).</h1>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/studio" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">Créer une vidéo</Link>
        <Link href="/" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">Accueil</Link>
      </div>
    </main>
  );
}
