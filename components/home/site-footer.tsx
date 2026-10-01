import Link from 'next/link';

const COLUMNS = [
  { title: 'Produit', links: [['Fonctionnalités', '/#features'], ['Studio', '/#studio'], ['Tarifs', '/#pricing'], ['Importer une vidéo', '/upload']] },
  { title: 'Ressources', links: [['Documentation', '/docs'], ['Guide du format 9:16', '/guide-9-16'], ['Blog', '/blog'], ['FAQ', '/#faq']] },
  { title: 'Légal', links: [['Conditions d’utilisation', '/cgu'], ['Confidentialité', '/confidentialite'], ['Mentions légales', '/mentions-legales']] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.3fr_repeat(3,1fr)] lg:px-8">
        <div>
          <Link href="/" className="izi-focus inline-flex items-center gap-2.5 rounded-lg">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-neon font-code text-xs font-bold text-ink-950" aria-hidden>IZ</span>
            <span className="text-lg font-semibold tracking-tight text-fg">IziCut</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
            De la vidéo longue aux clips verticaux sous-titrés, prêts pour TikTok, Reels et Shorts.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="font-code text-xs uppercase tracking-[0.18em] text-fg-subtle">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="izi-focus rounded text-sm text-fg-muted transition-colors hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} IziCut. Tous droits réservés.</p>
          <p className="font-code">Fait en France · Rendu 1080×1920</p>
        </div>
      </div>
    </footer>
  );
}
