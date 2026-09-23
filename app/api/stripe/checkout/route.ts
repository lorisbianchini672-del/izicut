/**
 * ============================================================
 * POST /api/stripe/checkout — Créer une session d'abonnement
 * ------------------------------------------------------------
 * L'utilisateur authentifié choisit un plan (pro | agency) : la
 * route crée une Session Checkout Stripe et renvoie son URL.
 *
 * Sécurité :
 *  - identité lue depuis la session Supabase (cookie), jamais du
 *    corps de requête ;
 *  - le customer Stripe est réutilisé/créé puis mémorisé dans
 *    profiles.stripe_customer_id (une seule ligne par utilisateur).
 * ============================================================
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStripe, planPriceId, appBaseUrl } from '@/lib/stripe';
import { PLANS, type PlanKey } from '@/lib/plans';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // 1. Identité
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 2. Plan demandé (validation minimale)
    const body = (await request.json().catch(() => ({}))) as { plan?: string };
    const planKey = body.plan as PlanKey;
    const plan = PLANS[planKey];

    if (!plan || plan.free || !plan.priceEnv) {
      return NextResponse.json(
        { error: 'Plan inconnu ou non payant' },
        { status: 400 }
      );
    }

    const priceId = planPriceId(planKey);
    if (!priceId) {
      return NextResponse.json(
        { error: `Prix Stripe non configuré (${plan.priceEnv})` },
        { status: 503 }
      );
    }

    // 3. Customer Stripe (créé une seule fois, mémorisé sur le profil)
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    const stripe = getStripe();
    let customerId = profile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 4. Session Checkout (abonnement récurrent mensuel)
    const origin = appBaseUrl();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan: planKey, price_id: priceId }
      },
      metadata: { supabase_user_id: user.id, plan: planKey, price_id: priceId },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancel`,
      allow_promotion_codes: true
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[stripe/checkout]', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
