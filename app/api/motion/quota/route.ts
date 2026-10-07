import { NextResponse } from 'next/server';

import { resolvePlanTier } from '@/lib/entitlements';
import { FREE_MOTION_CREATIONS, type MotionQuota } from '@/lib/motion/plan';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** GET /api/motion/quota — offre et nombre de pubs IA déjà créées. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('plan, subscription_status').eq('id', user.id).maybeSingle();
  const tier = resolvePlanTier(profile?.plan, profile?.subscription_status);
  const used = Number((user.app_metadata as Record<string, unknown> | undefined)?.motion_creations) || 0;
  const quota: MotionQuota = { tier, used, limit: tier === 'free' ? FREE_MOTION_CREATIONS : null };
  return NextResponse.json(quota);
}
