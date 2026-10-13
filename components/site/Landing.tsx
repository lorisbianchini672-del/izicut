'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Clapperboard, Film, Loader2, MessageSquareText, Minus, Palette, Plus, ShieldCheck, Sparkles, Type, Wand2, Zap } from 'lucide-react';

import { LogoMark, Wordmark } from '@/components/landing/LogoMark';
import { DISPLAY_PLAN_KEYS, PLANS, formatPrice } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Briques visuelles                                                   */
/* ------------------------------------------------------------------ */

/** Grands dégradés bleus très doux (fond « studio » clair). */
function Blobs({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="izl-blob absolute -left-[12%] top-[8%] h-[70%] w-[55%] rounded-full bg-[#f4a6b8] opacity-55 blur-[110px]" />
      <div className="izl-blob izl-blob-2 absolute right-[-10%] top-[-5%] h-[65%] w-[50%] rounded-full bg-[#f9cfa9] opacity-60 blur-[120px]" />
      <div className="izl-blob izl-blob-3 absolute bottom-[-20%] left-[25%] h-[60%] w-[55%] rounded-full bg-[#f7c3cf] opacity-55 blur-[120px]" />
    </div>
  );
}

const REELS = [
  { biz: 'Boulangerie', line: 'Le vrai pain', accent: 'au levain', tone: '#f5b5c3' },
  { biz: 'Salle de sport', line: '-50 %', accent: 'le 1er mois', tone: '#f9cfa9' },
  { biz: 'Restaurant', line: 'Nouvelle', accent: 'carte d’automne', tone: '#f5b5c3' },
  { biz: 'Coiffeur', line: 'Ton style,', accent: 'ta signature', tone: '#f9cfa9' },
  { biz: 'Boutique', line: 'Collection', accent: 'hiver', tone: '#f5b5c3' },
  { biz: 'Association', line: 'Rejoins', accent: 'l’aventure', tone: '#f9cfa9' }
];

/** Aperçu vertical d'une vidéo : une seule carte sombre, sans cadre autour. */
function VideoCard({ i, className = '' }: { i: number; className?: string }) {
  const r = REELS[i % REELS.length];
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-[22px] bg-[#0b0b14] ${className}`}>
      <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(90% 55% at 50% 100%, ${r.tone}55, transparent 70%)` }} />
      <span className="absolute inset-x-[9%] top-[5%] h-[3px] overflow-hidden rounded-full bg-white/20"><span className="izl-bar block h-full bg-white" style={{ animationDelay: `${i * 0.35}s` }} /></span>
      <span className="absolute left-[9%] top-[9%] text-[0.5em] font-semibold uppercase tracking-[0.14em] text-white/60">{r.biz}</span>
      <div className="absolute inset-x-[9%] top-1/2 -translate-y-1/2 font-display font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-white">
        <span className="izl-rise block text-[1.05em]" style={{ animationDelay: `${i * 0.35}s` }}>{r.line}</span>
        <span className="izl-rise block text-[0.95em]" style={{ animationDelay: `${i * 0.35 + 0.25}s`, color: r.tone }}>{r.accent}</span>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[#0b0b14]">{children}</p>;
}

function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`mt-4 text-balance font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-[#0b0b14] sm:text-6xl ${className}`}>{children}</h2>;
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-[#55525f] sm:text-lg">{children}</p>;
}

function SectionHead({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <H2>{title}</H2>
      {lead ? <Lead>{lead}</Lead> : null}
    </div>
  );
}

const btnDark = 'inline-flex items-center justify-center gap-2 rounded-full bg-[#0b0b14] px-7 py-4 text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgb(11_11_20/0.7)] transition hover:-translate-y-0.5 hover:bg-[#26232e]';
const btnLight = 'inline-flex items-center justify-center gap-2 rounded-full border border-[#0b0b14]/12 bg-white/70 px-7 py-4 text-[15px] font-semibold text-[#0b0b14] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white';

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-10 pt-32 sm:pt-40">
      <Blobs />
      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
        <Eyebrow>Pubs & vidéos en motion design · IA</Eyebrow>
        <h1 className="mx-auto mt-6 max-w-5xl text-balance font-display text-[3rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-[#0b0b14] sm:text-7xl lg:text-[5.6rem]">
          Des vidéos qui arrêtent le scroll.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[#55525f]">
          Décrivez votre pub ou déposez votre vidéo : l’IA la monte comme une agence — accroche, sous-titres mot à mot, animations, photos, musique. Prête pour TikTok et Instagram.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/studio" className={btnDark}>Créer ma pub gratuitement <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <Link href="/#pricing" className={btnLight}>Voir les tarifs</Link>
        </div>
      </div>
      <div className="relative mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-4 px-4 text-[18px] sm:grid-cols-4 sm:gap-5 sm:px-6 sm:text-[20px]">
        <VideoCard i={0} />
        <VideoCard i={1} />
        <VideoCard i={2} className="hidden sm:block" />
        <VideoCard i={3} className="hidden sm:block" />
      </div>
    </section>
  );
}

const FOR = ['Boulangeries', 'Restaurants', 'Salles de sport', 'Coiffeurs', 'Boutiques', 'Artisans', 'Associations', 'Créateurs', 'Agences'];
function ForStrip() {
  return (
    <section aria-label="Pour qui" className="relative overflow-hidden border-y border-[#0b0b14]/[0.06] bg-white/60 py-7">
      <div className="izl-marquee flex w-max gap-14 whitespace-nowrap font-display text-2xl font-bold tracking-[-0.03em] text-[#0b0b14]/35">
        {[...FOR, ...FOR].map((f, i) => (
          <span key={i} className="flex items-center gap-3"><Sparkles className="h-5 w-5" aria-hidden />{f}</span>
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Wand2, title: 'Une phrase suffit', text: '« Pub pour ma boulangerie, -20 % ce week-end » : l’IA écrit, anime et sonorise la vidéo complète.' },
  { icon: Clapperboard, title: 'Montage façon After Effects', text: 'Déposez une vidéo où vous parlez : accroche brillante, sous-titres mot à mot, photos et listes animées.' },
  { icon: Type, title: 'Sous-titres mot à mot', text: 'Chaque mot s’allume au moment exact où il est prononcé, dans les zones lisibles de TikTok.' },
  { icon: Palette, title: 'Vos couleurs, votre style', text: 'Ambiances, fonds animés, couleurs et textes modifiables en direct, la vidéo toujours sous les yeux.' },
  { icon: MessageSquareText, title: 'Retouches en parlant', text: '« Titre en jaune », « plus dynamique », « ajoute nos horaires » : l’IA comprend et applique.' },
  { icon: ShieldCheck, title: 'Vos fichiers protégés', text: 'Documents et vidéos d’inspiration lus sans être enregistrés, données personnelles masquées.' }
];
function Features() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Tout-en-un" title="Tout ce qu’il faut pour vos vidéos" lead="De l’idée à la vidéo prête à publier : création, montage, sous-titres, musique et export HD, au même endroit." />
      <div className="mx-auto mt-16 grid max-w-6xl gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="border-t border-[#0b0b14]/10 pt-6">
            <Icon className="h-7 w-7 text-[#0b0b14]" aria-hidden />
            <h3 className="mt-5 font-display text-xl font-bold tracking-[-0.02em] text-[#0b0b14]">{title}</h3>
            <p className="mt-2 leading-relaxed text-[#55525f]">{text}</p>
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
    <section id="how" className="bg-white px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Comment ça marche" title="Simple comme bonjour" lead="Pas de logiciel à apprendre, pas de timeline : trois étapes et votre vidéo est prête." />
      <ol className="mx-auto mt-16 grid max-w-6xl gap-x-10 gap-y-12 md:grid-cols-3">
        {STEPS.map(([n, t, d]) => (
          <li key={n} className="border-t-2 border-[#0b0b14] pt-6">
            <span className="font-display text-sm font-bold tracking-[0.1em] text-[#0b0b14]/50">{n}</span>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-[-0.03em] text-[#0b0b14]">{t}</h3>
            <p className="mt-3 leading-relaxed text-[#55525f]">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CheckoutButton({ planKey, dark }: { planKey: string; dark: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = `${dark ? btnDark : 'inline-flex items-center justify-center gap-2 rounded-full border border-[#0b0b14]/15 bg-white px-7 py-4 text-[15px] font-semibold text-[#0b0b14] transition hover:bg-[#f3f2ef]'} w-full`;
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
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Tarifs" title="Commencez gratuitement, passez Pro quand vous voulez" lead="Sans engagement, résiliable à tout moment. Vos premières vidéos sont offertes." />
      <div className="mx-auto mt-16 grid max-w-6xl gap-5 lg:grid-cols-3">
        {DISPLAY_PLAN_KEYS.map((key) => {
          const p = PLANS[key];
          const mid = key === 'pro';
          return (
            <article key={key} className={`flex flex-col rounded-[24px] border bg-white p-8 text-left ${mid ? 'border-[#0b0b14] border-2' : 'border-[#0b0b14]/10'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-[#0b0b14]">{p.name}</h3>
                {mid ? <span className="rounded-full bg-[#0b0b14] px-3 py-1 text-xs font-semibold text-white">Populaire</span> : null}
              </div>
              <p className="mt-2 text-[#55525f]">{p.description}</p>
              <p className="mt-6 font-display text-5xl font-extrabold tracking-[-0.04em] text-[#0b0b14]">{p.free ? '0 €' : formatPrice(p.amount)}<span className="ml-1 text-lg font-medium text-[#55525f]">/mois</span></p>
              <div className="mt-6"><CheckoutButton planKey={key} dark={mid} /></div>
              <ul className="mt-8 space-y-3 border-t border-[#0b0b14]/10 pt-6">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[#3d3a48]"><Check className="mt-0.5 h-5 w-5 shrink-0 text-[#0b0b14]" aria-hidden />{f}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const USES = [
  { icon: Zap, t: 'Une promo flash', d: '« -30 % ce week-end » en 15 secondes animées, avec votre logo et vos couleurs.' },
  { icon: Film, t: 'Votre vidéo face caméra', d: 'Vous parlez, izicut ajoute l’accroche, les sous-titres, les photos et les listes animées.' },
  { icon: Sparkles, t: 'Un lancement produit', d: 'Vos photos qui surgissent, des cartes en verre, un compte à rebours et un appel à l’action.' }
];
function UseCases() {
  return (
    <section className="bg-white px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead eyebrow="Exemples" title="Ce que vous pouvez créer" lead="Commerçants, artisans, associations, créateurs : une vidéo pro pour chaque occasion." />
      <div className="mx-auto mt-16 grid max-w-5xl gap-10 sm:grid-cols-3">
        {USES.map(({ t, d }, i) => (
          <article key={t} className="text-left">
            <VideoCard i={i + 1} className="mx-auto w-full max-w-[190px] text-[18px] sm:max-w-[260px] sm:text-[22px]" />
            <h3 className="mt-6 font-display text-xl font-bold tracking-[-0.02em] text-[#0b0b14]">{t}</h3>
            <p className="mt-2 leading-relaxed text-[#55525f]">{d}</p>
          </article>
        ))}
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
    <section id="faq" className="px-4 py-24 sm:px-6 sm:py-32">
      <SectionHead title="Questions & réponses" lead="Tout ce qu’il faut savoir pour créer votre première vidéo." />
      <div className="mx-auto mt-14 max-w-3xl border-t border-[#0b0b14]/10">
        {FAQ.map(([q, a], i) => (
          <div key={q} className="border-b border-[#0b0b14]/10 py-5 text-left">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left">
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-[#0b0b14] sm:text-xl">{q}</span>
              {open === i ? <Minus className="h-5 w-5 shrink-0 text-[#0b0b14]" aria-hidden /> : <Plus className="h-5 w-5 shrink-0 text-[#0b0b14]" aria-hidden />}
            </button>
            {open === i ? <p className="mt-3 pr-8 leading-relaxed text-[#55525f]">{a}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-[#0b0b14]/10 px-4 py-24 text-center sm:py-32">
      <SectionHead eyebrow="Lancez-vous" title="Votre première vidéo en 2 minutes" />
      <div className="mt-9"><Link href="/studio" className={btnDark}>Créer gratuitement <ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
    </section>
  );
}

const PAGES: [string, string][] = [['Accueil', '/'], ['Studio', '/studio'], ['Tarifs', '/#pricing'], ['Guide 9:16', '/guide-9-16'], ['Blog', '/blog'], ['Conditions', '/cgu'], ['Confidentialité', '/confidentialite'], ['Mentions légales', '/mentions-legales']];
function Footer() {
  return (
    <footer className="relative overflow-hidden">
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-10 pt-20 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="izicut, accueil"><LogoMark className="h-10 w-10" /><Wordmark className="text-3xl" /></Link>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[#26232e]">Le studio de vidéos en motion design pour les commerces, artisans, associations et créateurs. Fait en France.</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <p className="text-[#55525f]">Pages</p>
          {PAGES.map(([l, h]) => <Link key={h} href={h} className="font-medium text-[#0b0b14] hover:underline">{l}</Link>)}
          <Link href="/studio" className={`${btnDark} mt-4`}>Commencer</Link>
        </div>
      </div>
      <p className="relative mx-auto max-w-7xl px-5 text-sm text-[#26232e] sm:px-8">izicut® · © {new Date().getFullYear()} · Fait en France</p>
      <div aria-hidden className="relative mx-auto mt-6 max-w-[1600px] select-none overflow-hidden px-2">
        <p className="font-display text-[25vw] font-extrabold leading-[0.78] tracking-[-0.07em] text-[#0b0b14] [margin-bottom:-0.1em] xl:text-[400px]">izicut<span className="align-top text-[0.2em]">®</span></p>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <main className="izl bg-[#f7f6f4] text-[#0b0b14]">
      <Hero />
      <ForStrip />
      <Features />
      <HowItWorks />
      <UseCases />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
