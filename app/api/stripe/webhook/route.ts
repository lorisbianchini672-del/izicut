/**
 * ============================================================
 * POST /api/stripe/webhook — Événements Stripe
 * ------------------------------------------------------------
 * LA source de vérité des abonnements et des crédits.
 *
 * Points non négociables (docs/ARCHITECTURE.md §5) :
 *  1. Signature vérifiée sur le CORPS BRUT (texte, jamais parsé) :
 *     un JSON re-sérialisé ne produit plus la même signature.
 *  2. Idempotence : Stripe rejoue les webhooks. La clé primaire de
 *     stripe_events absorbe les rejeux ; grant_credits rejoue la
 *     double protection.
 *  3. Crédits octroyés UNIQUEMENT par la RPC grant_credits
 *     (SECURITY DEFINER) : jamais d'UPDATE direct du solde.
 * ============================================================
 */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, planFromPriceId, planCreditsSeconds } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { tierFromPlanKey } from '@/lib/entitlements';

export const runtime = 'nodejs';

/**
 * Offre de l'utilisateur (`profiles.plan`) : c'est elle que le worker lit
 * pour débloquer les fonctions payantes au rendu (lib/entitlements.ts).
 */
async function setUserPlan(userId: string, plan: 'free' | 'pro' | 'agency'): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ plan }).eq('id', userId);
  if (error) throw new Error(`Mise à jour du plan : ${error.message}`);
}

/** Marque un événement comme traité. Retourne false si déjà vu. */
async function beginEvent(
  eventId: string,
  type: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('stripe_events')
    .insert({ id: eventId, type });

  // Violation de clé primaire = événement déjà traité (rejeu).
  if (error) return false;
  return true;
}

/** Retrouve l'utilisateur interne à partir du customer Stripe. */
async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Octroie les crédits d'une période d'abonnement. */
async function grantForUser(
  userId: string,
  seconds: number,
  reason: string,
  eventId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('grant_credits', {
    p_user_id: userId,
    p_seconds: seconds,
    p_reason: reason,
    p_stripe_event_id: eventId
  });
  if (error) throw new Error(`grant_credits : ${error.message}`);
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 503 });
  }

  // 1. CORPS BRUT : obligatoire pour la vérification de signature.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Signature absente' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      secret
    );
  } catch (err) {
    console.error('[stripe/webhook] signature invalide:', err);
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }

  // 2. Idempotence : rejouer un événement traité est un no-op.
  const isFirstTime = await beginEvent(event.id, event.type);
  if (!isFirstTime) {
    return NextResponse.json({ received: true, replay: true });
  }

  try {
    switch (event.type) {
      // ---- Paiement réussi : renouvellement ou premier paiement ----
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id;
        if (!customerId) break;

        const userId = await userIdFromCustomer(customerId);
        if (!userId) break; // client inconnu (ex : facture à part)

        // Prix payé → plan → minutes du plan.
        const priceId = invoice.lines?.data?.[0]?.price?.id ?? null;
        const planKey = planFromPriceId(priceId);
        if (!planKey) break;

        await setUserPlan(userId, tierFromPlanKey(planKey));
        await grantForUser(
          userId,
          planCreditsSeconds(planKey),
          'subscription_renewal',
          event.id
        );
        break;
      }

      // ---- Premier abonnement (checkout terminé) ----
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;
        if (!userId || !subscriptionId) break;

        const priceId = session.metadata?.price_id ?? null;
        const planKey = planFromPriceId(priceId);

        const admin = createAdminClient();
        await admin
          .from('profiles')
          .update({
            stripe_subscription_id: subscriptionId,
            ...(customerId ? { stripe_customer_id: customerId } : {}),
            subscription_status: 'active',
            ...(planKey ? { plan: tierFromPlanKey(planKey) } : {})
          })
          .eq('id', userId);

        // Les crédits du premier mois arrivent via invoice.paid ;
        // on les octroie ici aussi par sûreté (idempotence garantie
        // par stripe_events : l'un des deux passe, pas les deux).
        if (planKey) {
          await grantForUser(
            userId,
            planCreditsSeconds(planKey),
            'subscription_started',
            event.id
          );
        }
        break;
      }

      // ---- Mise à jour (changement de plan, pause, resume) ----
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const userId = await userIdFromCustomer(customerId);
        if (!userId) break;

        // Changement d'offre (Pro ↔ Agency) : le prix de l'abonnement dit
        // quelle offre est désormais active.
        const planKey = planFromPriceId(subscription.items?.data?.[0]?.price?.id ?? null);

        const admin = createAdminClient();
        await admin
          .from('profiles')
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            ...(planKey ? { plan: tierFromPlanKey(planKey) } : {})
          })
          .eq('id', userId);
        break;
      }

      // ---- Résiliation : l'abonnement s'arrête ----
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const userId = await userIdFromCustomer(customerId);
        if (!userId) break;

        const admin = createAdminClient();
        await admin
          .from('profiles')
          .update({ subscription_status: 'canceled', plan: 'free' })
          .eq('id', userId);
        break;
      }

      default:
        // Événement non géré : OK, on accuse réception.
        break;
    }
  } catch (err) {
    // Erreur de traitement : Stripe rejettera (retry). On retire la
    // ligne d'idempotence pour permettre le rejeu après correction.
    const admin = createAdminClient();
    await admin.from('stripe_events').delete().eq('id', event.id);
    console.error(`[stripe/webhook] ${event.type} :`, err);
    return NextResponse.json({ error: 'Traitement échoué' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
