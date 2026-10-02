/**
 * GET /api/system/youtube-status — état des téléchargements YouTube.
 * Réservé aux administrateurs (ADMIN_EMAILS, séparés par des virgules) :
 * le tableau de bord affiche un bandeau quand les cookies sont à refaire.
 */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) {
    return NextResponse.json({ admin: false });
  }

  const { data } = await createAdminClient().storage.from('clips').download('system/youtube-status.json');
  if (!data) return NextResponse.json({ admin: true, ok: true, at: null });
  try {
    const status = JSON.parse(await data.text()) as { ok: boolean; at: string; message?: string };
    return NextResponse.json({ admin: true, ...status });
  } catch {
    return NextResponse.json({ admin: true, ok: true, at: null });
  }
}
