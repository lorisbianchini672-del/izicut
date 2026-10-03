'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, CreditCard, LayoutGrid, LogOut, Menu, Plus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const LINKS = [
  ['Fonctionnalités', '/#features'],
  ['Studio', '/#studio'],
  ['Tarifs', '/#pricing'],
  ['FAQ', '/#faq'],
  ['Studio Motion', '/studio'],
  ['Guide 9:16', '/guide-9-16'],
] as const;

/** Liens affichés quand le visiteur est connecté. */
const APP_LINKS = [
  ['Mes projets', '/dashboard'],
  ['Tarifs', '/#pricing'],
  ['Studio Motion', '/studio'],
  ['Guide 9:16', '/guide-9-16'],
] as const;

/** Email de l'utilisateur connecté (null = visiteur), suivi en direct. */
function useSessionEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user.email ?? null)
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return email;
}

async function openBillingPortal() {
  const res = await fetch('/api/stripe/portal', { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  window.location.href = body.url ?? '/#pricing';
}

function AccountMenu({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    await createClient().auth.signOut();
    setOpen(false);
    router.push('/');
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Mon compte"
        className="izi-focus grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-line-strong bg-white/[0.04] font-code text-sm font-semibold uppercase text-neon transition-colors hover:border-neon/60"
      >
        {email.charAt(0)}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-line-strong bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <p className="truncate px-3 py-2.5 text-xs text-fg-subtle">{email}</p>
          <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className="izi-focus flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-fg hover:bg-white/[0.05]">
            <LayoutGrid className="h-4 w-4 text-fg-muted" /> Mes projets
          </Link>
          <button role="menuitem" type="button" onClick={openBillingPortal} className="izi-focus flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-fg hover:bg-white/[0.05]">
            <CreditCard className="h-4 w-4 text-fg-muted" /> Abonnement & factures
          </button>
          <button role="menuitem" type="button" onClick={signOut} className="izi-focus flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rec hover:bg-rec/10">
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SiteNav() {
  const email = useSessionEmail();
  const links = email ? APP_LINKS : LINKS;
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 font-display transition-all duration-300 ${
        scrolled || open ? 'border-b border-line bg-ink-950/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="izi-focus flex items-center gap-2.5 rounded-lg" aria-label="IziCut, accueil">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-neon font-code text-xs font-bold text-ink-950 shadow-[0_0_20px_-4px_rgb(200_255_61/0.7)]">
            IZ
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-fg">IziCut</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="izi-focus rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-white/[0.04] hover:text-fg">
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          {email ? (
            <>
              <Link
                href="/upload"
                className="izi-focus hidden items-center gap-1.5 rounded-lg bg-neon px-3.5 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-fg sm:inline-flex"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nouvelle vidéo
              </Link>
              <AccountMenu email={email} />
            </>
          ) : (
            <>
              <Link href="/login" className="izi-focus hidden rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg sm:block">
                Connexion
              </Link>
              <Link
                href="/upload"
                className="izi-focus group hidden items-center gap-1.5 rounded-lg bg-fg px-3.5 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-neon sm:inline-flex"
              >
                Essayer gratuitement
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="izi-mobile-menu"
            aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="izi-focus cursor-pointer rounded-lg p-2 text-fg md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div id="izi-mobile-menu" className="border-t border-line px-4 pb-6 pt-2 md:hidden">
          <ul className="space-y-1">
            {links.map(([label, href]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="izi-focus block rounded-lg px-3 py-3 text-base text-fg-muted hover:bg-white/[0.04] hover:text-fg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          {email ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={openBillingPortal} className="izi-focus cursor-pointer rounded-xl border border-line-strong px-4 py-3 text-center text-sm text-fg">Abonnement</button>
              <button
                type="button"
                onClick={async () => {
                  await createClient().auth.signOut();
                  window.location.href = '/';
                }}
                className="izi-focus cursor-pointer rounded-xl border border-rec/40 px-4 py-3 text-center text-sm text-rec"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/login" className="izi-focus rounded-xl border border-line-strong px-4 py-3 text-center text-sm text-fg">Connexion</Link>
              <Link href="/upload" className="izi-focus rounded-xl bg-neon px-4 py-3 text-center text-sm font-semibold text-ink-950">Essayer</Link>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
