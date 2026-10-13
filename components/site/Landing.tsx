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
      <div className="izl-blob absolute -left-[12%] top-[8%] h-[70%] w-[55%] rounded-full bg-[#7aa7ff] opacity-55 blur-[110px]" />
      <div className="izl-blob izl-blob-2 absolute right-[-10%] top-[-5%] h-[65%] w-[50%] rounded-full bg-[#9fe3ff] opacity-60 blur-[120px]" />
      <div className="izl-blob izl-blob-3 absolute bottom-[-20%] left-[25%] h-[60%] w-[55%] rounded-full bg-[#b9c6ff] opacity-55 blur-[120px]" />
    </div>
  );
}

/** Lignes ondulées très légères en fond de panneau. */
function Waves() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]" viewBox="0 0 1200 600" preserveAspectRatio="none">
      {Array.from({ length: 22 }, (_, i) => (
        <path key={i} d={`M -50 ${80 + i * 22} C 300 ${-40 + i * 30}, 700 ${260 + i * 14}, 1250 ${40 + i * 24}`} fill="none" stroke="#0b1020" strokeOpacity="0.07" strokeWidth="1" />
      ))}
    </svg>
  );
}

const TILE_BG = ['#c9d4ff', '#ffe6a6', '#bfe7f5', '#d9cff7', '#c8f0dd', '#ffd3dc'];
const REELS = [
  { biz: 'Boulangerie', line: 'Le vrai pain', accent: 'au levain', emoji: '🥖' },
  { biz: 'Salle de sport', line: '-50 %', accent: 'le 1er mois', emoji: '💪' },
  { biz: 'Restaurant', line: 'Nouvelle', accent: 'carte d’automne', emoji: '🍝' },
  { biz: 'Coiffeur', line: 'Ton style,', accent: 'ta signature', emoji: '✂️' },
  { biz: 'Boutique', line: 'Collection', accent: 'hiver', emoji: '🛍️' },
  { biz: 'Association', line: 'Rejoins', accent: 'l’aventure', emoji: '🤝' }
];

/** Tuile arrondie façon « reel » : un mini motion design qui tourne en boucle. */
function ReelTile({ i, className = '' }: { i: number; className?: string }) {
  const r = REELS[i % REELS.length];
  return (
    <div className={`relative overflow-hidden rounded-[28px] shadow-[0_30px_60px_-35px_rgb(30_58_138/0.45)] ${className}`} style={{ background: TILE_BG[i % TILE_BG.length] }}>
      <div className="absolute inset-[10%] overflow-hidden rounded-[20px] bg-[#0b0f1a]">
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgb(37_99_235/0.55),transparent_60%)]" />
        <span className="izl-pop absolute left-1/2 top-[22%] -translate-x-1/2 text-[2.2em]" style={{ animationDelay: `${i * 0.35}s` }}>{r.emoji}</span>
        <div className="absolute inset-x-[8%] top-[48%] text-center font-display font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-white">
          <span className="izl-rise block text-[1.05em]" style={{ animationDelay: `${i * 0.35 + 0.2}s` }}>{r.line}</span>
          <span className="izl-rise block text-[0.95em] text-[#7cc4ff]" style={{ animationDelay: `${i * 0.35 + 0.45}s` }}>{r.accent}</span>
        </div>
        <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/15 px-2 py-0.5 text-[0.42em] font-semibold text-white/90 backdrop-blur">{r.biz}</span>
        <span className="absolute inset-x-[10%] top-[6%] h-[3px] overflow-hidden rounded-full bg-white/20"><span className="izl-bar block h-full bg-white" style={{ animationDelay: `${i * 0.35}s` }} /></span>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[#0b1020]">{children}</p>;
}

function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`mt-4 text-balance font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-[#0b1020] sm:text-6xl ${className}`}>{children}</h2>;
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-[#4a5470] sm:text-lg">{children}</p>;
}

const btnDark = 'inline-flex items-center justify-center gap-2 rounded-full bg-[#0b0f1a] px-7 py-4 text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgb(11_15_26/0.7)] transition hover:-translate-y-0.5 hover:bg-[#1e293b]';
const btnLight = 'inline-flex items-center justify-center gap-2 rounded-full border border-[#0b1020]/12 bg-white/70 px-7 py-4 text-[15px] font-semibold text-[#0b1020] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white';

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-10 pt-32 sm:pt-40">
      <Blobs />
      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
        <Eyebrow>Pubs & vidéos en motion design · IA</Eyebrow>
        <h1 className="mx-auto mt-6 max-w-5xl text-balance font-display text-[3rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-[#0b1020] sm:text-7xl lg:text-[5.6rem]">
          Des vidéos qui arrêtent le scroll.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[#4a5470]">
          Décrivez votre pub ou déposez votre vidéo : l’IA la monte comme une agence — accroche, sous-titres mot à mot, animations, photos, musique. Prête pour TikTok et Instagram.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/studio" className={btnDark}>Créer ma pub gratuitement <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          <Link href="/#pricing" className={btnLight}>Voir les tarifs</Link>
        </div>
      </div>
      <div className="relative mx-auto mt-16 grid max-w-6xl grid-cols-2 items-end gap-4 px-4 text-[18px] sm:grid-cols-4 sm:gap-6 sm:px-6 sm:text-[22px]">
        <ReelTile i={0} className="aspect-[3/4]" />
        <ReelTile i={1} className="aspect-[3/4] sm:mb-10" />
        <ReelTile i={2} className="hidden aspect-[3/4] sm:block" />
        <ReelTile i={3} className="hidden aspect-[3/4] sm:mb-10 sm:block" />
      </div>
    </section>
  );
}

const FOR = ['Boulangeries', 'Restaurants', 'Salles de sport', 'Coiffeurs', 'Boutiques', 'Artisans', 'Associations', 'Créateurs', 'Agences'];
function ForStrip() {
  return (
    <section aria-label="Pour qui" className="relative overflow-hidden border-y border-[#0b1020]/[0.06] bg-white/60 py-7">
      <div className="izl-marquee flex w-max gap-14 whitespace-nowrap font-display text-2xl font-bold tracking-[-0.03em] text-[#0b1020]/35">
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
    <section id="features" className="px-3 py-20 sm:px-6 sm:py-28">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-[#f1f4fa] px-5 py-16 sm:px-12 sm:py-24">
        <Waves />
        <div className="relative text-center">
          <Eyebrow>Tout-en-un</Eyebrow>
          <H2>Tout ce qu’il faut pour vos vidéos</H2>
          <Lead>De l’idée à la vidéo prête à publier : création, montage, sous-titres, musique et export HD, au même endroit.</Lead>
        </div>
        <div className="relative mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-[26px] bg-white p-7 shadow-[0_1px_0_rgb(15_23_42/0.04),0_20px_40px_-30px_rgb(30_58_138/0.35)] transition hover:-translate-y-1">
              <Icon className="h-9 w-9 text-[#0b1020]" aria-hidden />
              <h3 className="mt-6 font-display text-2xl font-bold tracking-[-0.03em] text-[#0b1020]">{title}</h3>
              <p className="mt-2 leading-relaxed text-[#4a5470]">{text}</p>
            </article>
          ))}
        </div>
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
    <section id="how" className="px-3 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-7xl text-center">
        <Eyebrow>Comment ça marche</Eyebrow>
        <H2>Simple comme bonjour</H2>
        <Lead>Pas de logiciel à apprendre, pas de timeline : trois étapes et votre vidéo est prête.</Lead>
      </div>
      <div className="mx-auto mt-14 grid max-w-7xl items-center gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="relative overflow-hidden rounded-[36px] p-10 sm:p-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#cfe0ff,#9cc3ff_45%,#c7d2fe)]" />
          <ReelTile i={4} className="relative mx-auto aspect-[3/4] max-w-[340px] text-[26px]" />
        </div>
        <div className="space-y-4">
          {STEPS.map(([n, t, d]) => (
            <article key={n} className="rounded-[28px] border border-[#0b1020]/[0.06] bg-[#f8fafd] p-7 text-left sm:p-8">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0b0f1a] font-display text-base font-bold text-white">{n}</span>
                <h3 className="font-display text-2xl font-bold tracking-[-0.03em] text-[#0b1020]">{t}</h3>
              </div>
              <p className="mt-4 leading-relaxed text-[#4a5470]">{d}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CheckoutButton({ planKey, dark }: { planKey: string; dark: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = `${dark ? btnDark : 'inline-flex items-center justify-center gap-2 rounded-full border border-[#0b1020]/15 bg-white px-7 py-4 text-[15px] font-semibold text-[#0b1020] transition hover:bg-[#f1f4fa]'} w-full`;
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
    <section id="pricing" className="relative overflow-hidden px-3 py-20 sm:px-6 sm:py-28">
      <Blobs className="opacity-70" />
      <div className="relative mx-auto max-w-7xl text-center">
        <Eyebrow>Tarifs</Eyebrow>
        <H2>Commencez gratuitement, passez Pro quand vous voulez</H2>
        <Lead>Sans engagement, résiliable à tout moment. Vos premières vidéos sont offertes.</Lead>
      </div>
      <div className="relative mx-auto mt-14 grid max-w-7xl gap-5 lg:grid-cols-3">
        {DISPLAY_PLAN_KEYS.map((key) => {
          const p = PLANS[key];
          const mid = key === 'pro';
          return (
            <article key={key} className={`rounded-[34px] bg-white p-3 shadow-[0_30px_60px_-40px_rgb(30_58_138/0.45)] ${mid ? 'lg:-translate-y-4' : ''}`}>
              <div className="rounded-[26px] bg-[linear-gradient(135deg,#dbe7ff,#a9c8ff_55%,#c9d3ff)] p-7 text-left">
                <h3 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-[#0b1020]">{p.name}</h3>
                <p className="mt-2 text-[#334064]">{p.description}</p>
                <p className="mt-6 font-display text-5xl font-extrabold tracking-[-0.04em] text-[#0b1020]">{p.free ? '0 €' : formatPrice(p.amount)}<span className="ml-1 text-lg font-medium text-[#334064]">/mois</span></p>
              </div>
              <div className="p-5 pt-6 text-left">
                <CheckoutButton planKey={key} dark={mid} />
                <p className="mt-6 font-semibold text-[#0b1020]">Inclus</p>
                <ul className="mt-3 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3 text-[#334064]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0b0f1a]"><Check className="h-3 w-3 text-white" aria-hidden /></span>{f}</li>
                  ))}
                </ul>
              </div>
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
    <section className="px-3 py-20 sm:px-6 sm:py-28">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-[#f1f4fa] px-5 py-16 sm:px-12 sm:py-24">
        <Waves />
        <div className="relative text-center">
          <Eyebrow>Exemples</Eyebrow>
          <H2>Ce que vous pouvez créer</H2>
          <Lead>Commerçants, artisans, associations, créateurs : une vidéo pro pour chaque occasion.</Lead>
        </div>
        <div className="relative mt-14 grid gap-5 lg:grid-cols-3">
          {USES.map(({ icon: Icon, t, d }, i) => (
            <article key={t} className="rounded-[28px] bg-white p-8 text-left shadow-[0_20px_40px_-30px_rgb(30_58_138/0.35)]">
              <Icon className="h-8 w-8 text-[#2563eb]" aria-hidden />
              <h3 className="mt-6 font-display text-2xl font-bold tracking-[-0.03em] text-[#0b1020]">{t}</h3>
              <p className="mt-3 leading-relaxed text-[#4a5470]">{d}</p>
              <ReelTile i={i + 1} className="mt-7 aspect-[16/10] text-[15px]" />
            </article>
          ))}
        </div>
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
    <section id="faq" className="px-3 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-7xl text-center">
        <H2 className="mt-0">Questions & réponses</H2>
        <Lead>Tout ce qu’il faut savoir pour créer votre première vidéo.</Lead>
      </div>
      <div className="mx-auto mt-14 grid max-w-7xl items-start gap-6 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-[36px] p-14 lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(140deg,#e3ecff,#a9c8ff_50%,#bfe7f5)]" />
          <ReelTile i={5} className="relative mx-auto aspect-[3/4] max-w-[360px] text-[26px]" />
        </div>
        <div className="space-y-4">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="rounded-[26px] border border-[#0b1020]/[0.06] bg-[#f8fafd] px-6 py-5 text-left sm:px-8">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full cursor-pointer items-center justify-between gap-4 text-left">
                <span className="font-display text-lg font-semibold tracking-[-0.02em] text-[#0b1020] sm:text-2xl">{q}</span>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0b0f1a] text-white">{open === i ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</span>
              </button>
              {open === i ? <p className="mt-4 leading-relaxed text-[#4a5470]">{a}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <Waves />
      <div className="relative mx-auto max-w-7xl px-4 text-[13px] sm:text-[16px]">
        <ReelTile i={0} className="absolute left-[3%] top-[-6%] hidden aspect-square w-[15%] lg:block" />
        <ReelTile i={2} className="absolute left-[40%] top-[-14%] hidden aspect-square w-[16%] lg:block" />
        <ReelTile i={4} className="absolute right-[6%] top-[-8%] hidden aspect-square w-[15%] lg:block" />
        <ReelTile i={1} className="absolute bottom-[-12%] left-[6%] hidden aspect-square w-[16%] lg:block" />
        <ReelTile i={3} className="absolute bottom-[-18%] left-[42%] hidden aspect-square w-[13%] lg:block" />
        <ReelTile i={5} className="absolute bottom-[-6%] right-[3%] hidden aspect-square w-[18%] lg:block" />
        <div className="relative mx-auto max-w-3xl py-24 text-center lg:py-40">
          <Eyebrow>Lancez-vous</Eyebrow>
          <H2>Votre première vidéo en 2 minutes</H2>
          <div className="mt-9"><Link href="/studio" className={btnDark}>Créer gratuitement <ArrowRight className="h-4 w-4" aria-hidden /></Link></div>
        </div>
      </div>
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
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[#1e293b]">Le studio de vidéos en motion design pour les commerces, artisans, associations et créateurs. Fait en France.</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <p className="text-[#4a5470]">Pages</p>
          {PAGES.map(([l, h]) => <Link key={h} href={h} className="font-medium text-[#0b1020] hover:underline">{l}</Link>)}
          <Link href="/studio" className={`${btnDark} mt-4`}>Commencer</Link>
        </div>
      </div>
      <p className="relative mx-auto max-w-7xl px-5 text-sm text-[#1e293b] sm:px-8">izicut® · © {new Date().getFullYear()} · Fait en France</p>
      <div aria-hidden className="relative mx-auto mt-6 max-w-[1600px] select-none overflow-hidden px-2">
        <p className="font-display text-[25vw] font-extrabold leading-[0.78] tracking-[-0.07em] text-[#0b1020] [margin-bottom:-0.1em] xl:text-[400px]">izicut<span className="align-top text-[0.2em]">®</span></p>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <main className="izl bg-[#f6f8fc] text-[#0b1020]">
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
