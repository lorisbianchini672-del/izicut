'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

import { DISPLAY_PLAN_KEYS, PLANS, formatPrice } from '@/lib/plans';
import { SectionHeading } from './section-heading';
import { useSpotlight } from './use-spotlight';
import { Stagger, StaggerItem } from './motion';

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Tarifs"
          title="Payez au temps de vidéo, pas au clip."
          description="Sans engagement. Les minutes non utilisées d'une vidéo échouée vous sont rendues automatiquement."
        />
        <Stagger className="mt-16 grid gap-4 lg:grid-cols-3">
          {DISPLAY_PLAN_KEYS.map((key) => (
            <StaggerItem key={key} className="flex">
              <PlanCard planKey={key} featured={key === 'pro'} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function PlanCard({ planKey, featured }: { planKey: 'free' | 'pro' | 'agency'; featured: boolean }) {
  const plan = PLANS[planKey];
  const onMove = useSpotlight<HTMLElement>();
  return (
    <article
      onPointerMove={onMove}
      className={`izi-card flex w-full flex-col rounded-3xl p-7 ${featured ? 'border-neon/40 bg-[linear-gradient(180deg,rgb(200_255_61/0.06),rgb(255_255_255/0.01))] lg:-my-3 lg:py-10' : ''}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-fg">{plan.name}</h3>
        {featured ? (
          <span className="rounded-full bg-neon px-2.5 py-0.5 font-code text-[10px] font-semibold uppercase tracking-wider text-ink-950">
            Le plus choisi
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-fg-muted">{plan.description}</p>
      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-fg">{plan.free ? '0 €' : formatPrice(plan.amount)}</span>
        <span className="text-sm text-fg-subtle">/ mois</span>
      </p>
      <p className="mt-1 font-code text-xs text-neon">{plan.minutesPerPeriod} min de vidéo source</p>

      <ul className="mt-7 space-y-3 border-t border-line pt-7">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-3 text-sm leading-snug text-fg-muted">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-neon" aria-hidden />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <PlanCta planKey={planKey} featured={featured} />
      </div>
    </article>
  );
}

function PlanCta({ planKey, featured }: { planKey: 'free' | 'pro' | 'agency'; featured: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = `izi-focus inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.99] ${
    featured
      ? 'bg-neon text-ink-950 shadow-[0_0_32px_-8px_rgb(200_255_61/0.8)] hover:shadow-[0_0_44px_-6px_rgb(200_255_61/0.9)]'
      : 'border border-line-strong bg-white/[0.03] text-fg hover:bg-white/[0.07]'
  }`;

  if (planKey === 'free') {
    return (
      <Link href="/upload" className={cls}>
        Commencer gratuitement <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }

  async function checkout() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });
      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/dashboard')}`;
        return;
      }
      if (!res.ok || !payload.url) throw new Error(payload.error ?? 'Paiement indisponible pour le moment.');
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paiement indisponible pour le moment.');
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={checkout} disabled={pending} className={`${cls} disabled:cursor-wait disabled:opacity-70`}>
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Redirection…</> : <>Passer {PLANS[planKey].name} <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-rec">{error}</p> : null}
    </>
  );
}
