import { AudioLines, Clapperboard, Link2, Sparkles } from 'lucide-react';

const STEPS = [
  { icon: Link2, title: 'Vous collez un lien', text: 'YouTube, Twitch ou un fichier. Rien à installer.' },
  { icon: AudioLines, title: 'On transcrit chaque mot', text: 'Horodatage au mot près, même sur 2 h de podcast.' },
  { icon: Sparkles, title: "L'IA choisit les moments", text: 'Accroche forte, idée complète, chute nette. Notés sur 100.' },
  { icon: Clapperboard, title: 'Vos clips sont rendus', text: '9:16, sous-titres animés, prêts à publier.' },
];

/** Bande « timeline » : les 4 étapes réelles du pipeline. */
export function Pipeline() {
  return (
    <section aria-labelledby="izi-how" className="relative border-y border-line bg-ink-900/40">
      <h2 id="izi-how" className="sr-only">Comment ça marche</h2>
      <ol className="mx-auto grid max-w-7xl gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="group relative bg-ink-950 p-6 transition-colors hover:bg-ink-900 lg:p-8">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-line-strong bg-white/[0.03] text-fg transition-colors group-hover:border-neon/50 group-hover:text-neon">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-code text-xs text-fg-subtle" aria-hidden>
                ÉTAPE {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="mt-5 text-base font-semibold text-fg">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
