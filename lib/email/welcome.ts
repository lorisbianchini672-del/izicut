import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';

import { welcomeEmail } from './messages';
import { sendEmail } from './send';

/**
 * Email de bienvenue, une seule fois par compte (drapeau welcome_sent dans
 * app_metadata, modifiable uniquement côté serveur). N'empêche jamais la
 * connexion en cas d'erreur.
 */
export async function maybeSendWelcome(supabase: SupabaseClient): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
    if (meta.welcome_sent) return;
    const { subject, content } = welcomeEmail();
    const res = await sendEmail(user.email, subject, content, { idempotencyKey: `welcome-${user.id}` });
    if (res.ok) await createAdminClient().auth.admin.updateUserById(user.id, { app_metadata: { ...meta, welcome_sent: true } });
  } catch (err) {
    console.error('[email] bienvenue :', err);
  }
}
