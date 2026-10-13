'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Clapperboard, Loader2, MessageSquareText, Minus, Palette, Plus, ShieldCheck, Type, Wand2 } from 'lucide-react';

import { LogoMark, Wordmark } from '@/components/landing/LogoMark';
import { DISPLAY_PLAN_KEYS, PLANS, formatPrice } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Direction artistique : fond noir profond, typographie fine et serrée, */
/* un seul grand dégradé bleu → rose → rouge, filets très discrets.      */
/* ------------------------------------------------------------------ */

const GRAD = 'bg-[linear-gradient(90deg,#6b8cff,#f28be0_50%,#ff6a55)]';
const gradText = `${GRAD} bg-clip-text text-transparent`;

/** Grand dégradé vif qui monte du bas, sur fond presque noir. */
function Glow({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-x-[-25%] bottom-[2%] h-[80%] rounded-[50%] bg-[#3b6cf6] blur-[80px]" />
      <div className="absolute inset-x-[-20%] bottom-[0%] h-[58%] rounded-[50%] bg-[#f28be0] blur-[80px]" />
      <div className="absolute inset-x-[-15%] bottom-[4%] h-[36%] rounded-[50%] bg-[#ff4d3d] blur-[70px]" />
      <div className="absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-[#0a0a0a] to-transparent" />
      {/* Fondu doux vers le noir en bas : le dégradé ne se coupe jamais net. */}
      <div className="absolute inset-x-0 bottom-0 h-[26%] bg-[linear-gradient(to_bottom,transparent,rgb(10_10_10/0.6)_55%,#0a0a0a)]" />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium tracking-[0.02em] text-white/50">{children}</p>;
}

function SectionHead({ eyebrow, title, lead, align = 'center' }: { eyebrow?: string; title: ReactNode; lead?: string; align?: 'center' | 'left' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl text-left'}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl">{title}</h2>
      {lead ? <p className={`mt-5 text-pretty text-[17px] leading-relaxed text-white/55 ${align === 'center' ? 'mx-auto max-w-xl' : ''}`}>{lead}</p> : null}
    </div>
  );
}

const btnDark = 'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-[#0a0a0a] transition hover:bg-white/85';
const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[15px] font-medium text-white transition hover:border-white/35';

/* ------------------------------------------------------------------ */
/* Aperçus de pubs                                                     */
/* ------------------------------------------------------------------ */

function Frame({ biz, children, className = '' }: { biz: string; children: ReactNode; className?: string }) {
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-[18px] border border-white/10 bg-[#111] text-white ${className}`}>
      <span className="absolute inset-x-[9%] top-[5%] h-[2px] overflow-hidden rounded-full bg-white/15"><span className="izl-bar block h-full bg-white/80" /></span>
      <span className="absolute left-[9%] top-[9%] text-[0.48em] font-medium uppercase tracking-[0.16em] text-white/45">{biz}</span>
      <div className="absolute inset-x-[9%] bottom-[9%] top-[17%] flex flex-col">{children}</div>
    </div>
  );
}

function PreviewBakery({ className = '' }: { className?: string }) {
  return (
    <Frame biz="Boulangerie" className={className}>
      <p className="mt-auto text-[1.15em] font-semibold leading-[1.02] tracking-[-0.03em]">Le vrai pain,<br /><span className={gradText}>au levain.</span></p>
      <p className="mt-[0.7em] text-[0.5em] text-white/55">Dès 6 h · 1,20 €</p>
    </Frame>
  );
}

function PreviewGym({ className = '' }: { className?: string }) {
  return (
    <Frame biz="Salle de sport" className={className}>
      <p className={`my-auto text-center text-[2.5em] font-semibold leading-none tracking-[-0.06em] ${gradText}`}>-50%</p>
      <p className="text-center text-[0.5em] uppercase tracking-[0.16em] text-white/60">le premier mois</p>
    </Frame>
  );
}

function PreviewRestaurant({ className = '' }: { className?: string }) {
  return (
    <Frame biz="Restaurant" className={className}>
      <p className="text-[0.95em] font-semibold leading-tight tracking-[-0.02em]">La carte<br />d’automne</p>
      <ul className="mt-[0.9em] divide-y divide-white/10 text-[0.52em] text-white/70">
        {['Velouté de courge', 'Risotto aux cèpes', 'Tarte aux figues'].map((d, k) => (
          <li key={d} className="flex items-baseline gap-[0.7em] py-[0.55em]"><span className="text-white/35">0{k + 1}</span>{d}</li>
        ))}
      </ul>
    </Frame>
  );
}

function PreviewHair({ className = '' }: { className?: string }) {
  return (
    <Frame biz="Face caméra" className={className}>
      <div className="mx-auto mt-[10%] h-[40%] w-[60%] rounded-t-full bg-gradient-to-b from-white/15 to-transparent" />
      <p className="mt-auto text-center text-[0.8em] font-semibold leading-tight tracking-[-0.02em]">
        Ton style, <span className={gradText}>ta signature</span>
      </p>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function HeroPrompt() {
  const [idea, setIdea] = useState('');
  const go = () => {
    const q = idea.trim();
    window.location.href = q ? `/studio?idee=${encodeURIComponent(q)}` : '/studio';
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); go(); }} className="mx-auto mt-10 w-full max-w-2xl rounded-[20px] border border-white/10 bg-[#141414]/90 p-4 text-left shadow-[0_40px_100px_-30px_rgb(0_0_0/0.9)] backdrop-blur">
      <label htmlFor="hero-idea" className="sr-only">Décrivez votre vidéo</label>
      <textarea id="hero-idea" value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }} rows={2} placeholder="Demande à izicut une pub pour ta boulangerie…" className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white outline-none placeholder:text-white/40" />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-white/40">Gratuit · sans carte bancaire</span>
        <button type="submit" aria-label="Créer la vidéo" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white text-[#0a0a0a] transition hover:bg-white/85"><ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </form>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[88svh] items-center overflow-hidden pb-24 pt-32 sm:min-h-[92vh]">
      <Glow />
      <div className="relative mx-auto w-full max-w-6xl px-4 text-center sm:px-6">
        <h1 className="mx-auto max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-[4.6rem]">
          Des vidéos qui arrêtent le scroll.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-white/75">
          Créez vos pubs et montez vos vidéos en discutant avec l’IA.
        </p>
        <HeroPrompt />
      </div>
    </section>
  );
}

const FOR = ['Boulangeries', 'Restaurants', 'Salles de sport', 'Coiffeurs', 'Boutiques', 'Artisans', 'Créateurs'];
function Showcase() {
  return (
    <section aria-label="Exemples de pubs" className="px-4 py-24 sm:px-6 sm:py-28">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 text-[18px] sm:grid-cols-4 sm:gap-5 sm:text-[20px]">
        <PreviewBakery />
        <PreviewGym />
        <PreviewRestaurant className="hidden sm:block" />
        <PreviewHair className="hidden sm:block" />
      </div>
      <p className="mx-auto mt-12 max-w-3xl text-center text-sm leading-relaxed text-white/40">
        Pensé pour {FOR.join(' · ')}
      </p>
    </section>
  );
}

const FEATURES = [
  { icon: Wand2, title: 'Une phrase suffit', text: '« Pub pour ma boulangerie, -20 % ce week-end » : l’IA écrit, anime et sonorise la vidéo complète.' },
  { icon: Clapperboard, title: 'Montage automatique', text: 'Déposez une vidéo où vous parlez : accroche, sous-titres mot à mot, photos et listes animées.' },
  { icon: Type, title: 'Sous-titres mot à mot', text: 'Chaque mot s’allume au moment exact où il est prononcé, dans les zones lisibles de TikTok.' },
  { icon: Palette, title: 'Vos couleurs, votre style', text: 'Ambiances, fonds animés, couleurs et textes modifiables en direct, la vidéo toujours sous les yeux.' },
  { icon: MessageSquareText, title: 'Retouches en parlant', text: '« Titre en jaune », « plus dynamique », « ajoute nos horaires » : l’IA comprend et applique.' },
  { icon: ShieldCheck, title: 'Vos fichiers protégés', text: 'Documents et vidéos d’inspiration lus sans être enregistrés, données personnelles masquées.' }
];
function Features() {
  return (
    <section id="features" className="border-t border-white/[0.08] px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Fonctionnalités" title="Tout le studio, sans le logiciel." lead="Création, montage, sous-titres, musique et export HD, au même endroit." />
      <div className="mx-auto mt-16 grid max-w-6xl gap-px overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="bg-[#0a0a0a] p-8">
            <Icon className="h-5 w-5 text-white/70" strokeWidth={1.5} aria-hidden />
            <h3 className="mt-6 text-[17px] font-medium tracking-[-0.01em] text-white">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-white/50">{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  ['01', 'Décrivez ou déposez', 'Écrivez votre idée, ajoutez vos photos, votre logo, ou déposez une vidéo où vous parlez.'],
  ['02', 'L’IA monte tout', 'Accroche, animations, sous-titres, photos, musique et bruitages, calés au rythme.'],
  ['03', 'Retouchez et publiez', 'Modifiez en direct ou en parlant à l’IA, puis téléchargez en MP4 HD pour TikTok et Instagram.']
];
function HowItWorks() {
  return (
    <section id="how" className="border-t border-white/[0.08] px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Comment ça marche" title="Trois étapes. C’est tout." />
      <ol className="mx-auto mt-16 grid max-w-6xl gap-x-12 gap-y-12 md:grid-cols-3">
        {STEPS.map(([n, t, d]) => (
          <li key={n} className="border-t border-white/15 pt-6">
            <span className={`text-sm font-medium ${gradText}`}>{n}</span>
            <h3 className="mt-3 text-xl font-medium tracking-[-0.02em] text-white">{t}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-white/50">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CheckoutButton({ planKey, dark }: { planKey: string; dark: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = `${dark ? btnDark : btnGhost} w-full`;
  if (planKey === 'free') return <Link href="/studio" className={cls}>Commencer gratuitement</Link>;
  const go = async () => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: planKey }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 401) { window.location.href = `/login?next=${encodeURIComponent('/#pricing')}`; return; }
      if (!res.ok || !j.url) throw new Error(j.error ?? 'Paiement indisponible pour le moment.');
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paiement indisponible pour le moment.');
      setPending(false);
    }
  };
  return (
    <>
      <button type="button" onClick={go} disabled={pending} className={`${cls} cursor-pointer disabled:opacity-60`}>
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Redirection…</> : <>Passer {PLANS[planKey].name}</>}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-400">{error}</p> : null}
    </>
  );
}


function Pricing() {
  return (
    <section id="pricing" className="border-t border-white/[0.08] px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Tarifs" title="Simple et sans engagement." lead="Commencez gratuitement, passez Pro quand vous voulez. Résiliable à tout moment." />
      <div className="mx-auto mt-16 grid max-w-6xl gap-5 lg:grid-cols-3">
        {DISPLAY_PLAN_KEYS.map((key) => {
          const p = PLANS[key];
          const mid = key === 'pro';
          return (
            <div key={key} className={`rounded-[20px] p-px ${mid ? GRAD : 'bg-white/[0.1]'}`}>
              <article className="flex h-full flex-col rounded-[19px] bg-[#0f0f0f] p-8 text-left">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-medium text-white">{p.name}</h3>
                  {mid ? <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/80">Populaire</span> : null}
                </div>
                <p className="mt-2 text-[15px] text-white/50">{p.description}</p>
                <p className="mt-8 text-5xl font-semibold tracking-[-0.04em] text-white">{p.free ? '0 €' : formatPrice(p.amount)}<span className="ml-1.5 text-base font-normal text-white/45">/mois</span></p>
                <div className="mt-8"><CheckoutButton planKey={key} dark={mid} /></div>
                <ul className="mt-8 space-y-3 border-t border-white/[0.08] pt-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3 text-[15px] text-white/65"><Check className="mt-0.5 h-4 w-4 shrink-0 text-white/80" strokeWidth={1.75} aria-hidden />{f}</li>
                  ))}
                </ul>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const FAQ = [
  ['Faut-il savoir monter des vidéos ?', 'Non. Vous décrivez ce que vous voulez ou vous déposez votre vidéo : l’IA s’occupe du montage. Vous pouvez ensuite tout retoucher en direct ou en lui parlant.'],
  ['Puis-je utiliser mes photos, mon logo et mes vidéos ?', 'Oui. Ajoutez vos photos, votre logo, vos vidéos et même des documents (menu, brochure) : l’IA s’en inspire pour créer une vidéo à votre image.'],
  ['Mes fichiers restent-ils confidentiels ?', 'Oui. Les documents et vidéos d’inspiration sont lus sans être enregistrés, les données personnelles sont masquées et ils ne servent à entraîner aucune IA.'],
  ['Dans quel format sont les vidéos ?', 'En MP4 HD, au format vertical 9:16 pour TikTok, Reels et Shorts, ou en carré et 16:9 si vous préférez.'],
  ['Puis-je résilier à tout moment ?', 'Oui, sans engagement, depuis votre espace abonnement. Vous repassez alors sur l’offre gratuite.']
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="border-t border-white/[0.08] px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.4fr]">
        <SectionHead align="left" eyebrow="FAQ" title="Questions fréquentes" lead="Tout ce qu’il faut savoir avant votre première vidéo." />
        <div className="border-t border-white/[0.08]">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="border-b border-white/[0.08] py-5 text-left">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left">
                <span className="text-[17px] font-medium text-white">{q}</span>
                {open === i ? <Minus className="h-4 w-4 shrink-0 text-white/60" aria-hidden /> : <Plus className="h-4 w-4 shrink-0 text-white/60" aria-hidden />}
              </button>
              {open === i ? <p className="mt-3 pr-8 text-[15px] leading-relaxed text-white/50">{a}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-4 pb-40 pt-32 text-center sm:pb-48">
      <Glow />
      <div className="relative">
        <h2 className="mx-auto max-w-3xl text-balance text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-6xl">Votre première vidéo, en deux minutes.</h2>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/studio" className={btnDark}>Commencer gratuitement <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <Link href="/#pricing" className={btnGhost}>Voir les tarifs</Link>
        </div>
      </div>
    </section>
  );
}

const PAGES: [string, string][] = [['Accueil', '/'], ['Studio', '/studio'], ['Tarifs', '/#pricing'], ['Guide 9:16', '/guide-9-16'], ['Blog', '/blog'], ['Conditions', '/cgu'], ['Confidentialité', '/confidentialite'], ['Mentions légales', '/mentions-legales']];

function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#0a0a0a]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-white" aria-label="izicut, accueil"><LogoMark className="h-7 w-7" /><Wordmark className="text-xl" /></Link>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/45">Le studio de vidéos en motion design pour les commerces, artisans et créateurs. Fait en France.</p>
        </div>
        <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-[15px]">
          {PAGES.map(([l, h]) => <li key={h}><Link href={h} className="text-white/55 transition hover:text-white">{l}</Link></li>)}
        </ul>
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/[0.08] px-5 py-6 text-sm text-white/35 sm:px-6">© {new Date().getFullYear()} izicut · Fait en France</div>
    </footer>
  );
}

export function Landing() {
  return (
    <main className="izl izi-dark-scope bg-[#0a0a0a] font-[family-name:var(--font-geist)] text-white antialiased">
      <Hero />
      <Showcase />
      <Features />
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
