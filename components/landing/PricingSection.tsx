'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PLANS, DISPLAY_PLAN_KEYS, formatPrice } from '@/lib/plans';
import Link from 'next/link';

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="py-28 border-t border-border/50 relative overflow-hidden">
      {/* Glow d'arrière-plan */}
      <div className="bg-orb bg-orb-purple w-[600px] h-[600px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Tarifs transparents sans engagement
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4">
            <span className="text-gradient">Choisissez la puissance</span>
            <br />
            <span className="text-foreground">adaptée à votre rythme</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Générez des shorts percutants chaque jour. Économisez 20% avec la facturation annuelle.
          </p>
        </motion.div>

        {/* Toggle mensuel / annuel */}
        <motion.div
          className="flex items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <span className={`text-sm font-semibold transition-colors ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
            Mensuel
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isAnnual}
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
              isAnnual ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                isAnnual ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-semibold transition-colors flex items-center gap-2 ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
            Annuel
            <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
              -20%
            </span>
          </span>
        </motion.div>

        {/* Cartes tarifaires */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
          {DISPLAY_PLAN_KEYS.map((key) => {
            const plan = PLANS[key];
            const isPro = key === 'pro';
            const monthlyPrice = plan.amount;
            const annualPrice = Math.round(plan.amount * 12 * 0.8);
            const displayAmount = isAnnual ? annualPrice : monthlyPrice;
            const period = isAnnual ? 'an' : 'mois';

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="flex"
              >
                <Card
                  className={`animated-border relative w-full flex flex-col rounded-3xl transition-all duration-300 ${
                    isPro
                      ? 'always border-2 border-primary shadow-2xl shadow-primary/25 bg-card/80 backdrop-blur-xl scale-105 z-10'
                      : 'border border-border/60 bg-card/40 backdrop-blur-md hover:border-primary/40 card-spotlight'
                  }`}
                >
                  {isPro && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1 text-xs font-bold text-white bg-gradient-to-r from-primary to-accent border border-white/20 rounded-full shadow-lg">
                        ⭐ LE PLUS POPULAIRE
                      </span>
                    </div>
                  )}

                  <CardHeader className="text-center pt-8 pb-4">
                    <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
                    <CardDescription className="mt-2 text-sm min-h-[40px]">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col px-6 pb-8">
                    {/* Prix — transition animée au basculement */}
                    <div className="mb-6 text-center border-y border-border/30 py-4">
                      <div className="flex items-baseline justify-center">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={`${plan.key}-${displayAmount}`}
                            initial={{ opacity: 0, y: 12, scale: 0.92 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -12, scale: 0.92 }}
                            transition={{ duration: 0.28, ease: 'easeOut' }}
                            className="text-4xl font-black text-gradient inline-block"
                          >
                            {plan.free ? 'Gratuit' : formatPrice(displayAmount)}
                          </motion.span>
                        </AnimatePresence>
                        {!plan.free && (
                          <span className="text-sm text-muted-foreground ml-2">
                            /{period}
                          </span>
                        )}
                      </div>
                      {!plan.free && isAnnual && (
                        <motion.p
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-emerald-400 font-medium mt-1"
                        >
                          Économisez {formatPrice(plan.amount * 12 - annualPrice)} par an
                        </motion.p>
                      )}
                    </div>

                    {/* Fonctionnalités */}
                    <div className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-1" />
                          <span className="text-sm text-muted-foreground leading-tight">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Bouton CTA */}
                    <CheckoutButton planKey={plan.key} isPro={isPro} planName={plan.name} />
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CheckoutButton({
  planKey,
  isPro,
  planName,
}: {
  planKey: string;
  isPro: boolean;
  planName: string;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (planKey === 'free') return;
    setError(null);
    setPending(planKey);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        if (response.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent('/dashboard')}`;
          return;
        }
        throw new Error(payload.error ?? 'Checkout indisponible pour le moment.');
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout indisponible pour le moment.');
    } finally {
      setPending(null);
    }
  }

  if (planKey === 'free') {
    return (
      <>
        <Button
          size="lg"
          className="w-full rounded-xl font-bold text-sm"
          variant={isPro ? 'gradient' : 'default'}
          asChild
        >
          <Link href="/upload">
            <Zap className="w-4 h-4 mr-1" />
            Tester gratuitement
          </Link>
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className={`w-full rounded-xl font-bold text-sm ${isPro ? 'glow-primary' : ''}`}
        variant={isPro ? 'gradient' : 'default'}
        onClick={handleCheckout}
        disabled={pending !== null}
      >
        {pending === planKey ? 'Redirection vers Stripe…' : `Passer au plan ${planName}`}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}