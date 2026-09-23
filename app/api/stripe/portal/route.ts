/**
 * ============================================================
 * POST /api/stripe/portal — Portail client Stripe
 * ------------------------------------------------------------
 * Ouvre la page Stripe où l'utilisateur gère son abonnement :
 * changer de formule, mettre à jour la carte, résilier. Le retour
 * se fait sur /dashboard.
 * ============================================================
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStripe, appBaseUrl } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Aucun abonnement : passez d'abord par le Checkout." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appBaseUrl()}/dashboard`
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[stripe/portal]', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
