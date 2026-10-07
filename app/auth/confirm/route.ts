import { type NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { maybeSendWelcome } from '@/lib/email/welcome';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * ============================================================
 * GET /auth/confirm — retour des emails Supabase Auth
 * ------------------------------------------------------------
 * Deux flux possibles selon le modèle d'email utilisé :
 *  - `?code=…`                → flux PKCE (lien magique, OAuth)
 *  - `?token_hash=…&type=…`   → flux OTP (email personnalisé)
 * En cas de succès, la session est posée en cookies puis on
 * redirige vers `next` (interne uniquement : pas de redirection
 * ouverte).
 * ============================================================
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // N'accepte qu'un chemin interne : `//evil.com` est rejeté.
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(`${origin}/login?error=supabase_non_configure`);
  }

  const supabase = await createServerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await maybeSendWelcome(supabase);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash
    });
    if (!error) {
      if (type !== 'recovery') await maybeSendWelcome(supabase);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=lien_invalide`);
}
