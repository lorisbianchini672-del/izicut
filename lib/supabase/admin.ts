/**
 * ============================================================
 * lib/supabase/admin.ts — Client Supabase SERVICE_ROLE (admin)
 * ------------------------------------------------------------
 * ⚠️  SERVEUR UNIQUEMENT. Cette clé contourne la RLS : elle ne
 * doit JAMAIS être importée dans un composant client ni exposée
 * au navigateur (préfixe sans NEXT_PUBLIC_).
 *
 * Usage : tâches de fond, écritures faites « au nom du système »
 * (webhook Stripe, déblocage de jobs), vérification d'identité
 * avant un débit de crédits.
 * ============================================================
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis pour le client admin.'
    );
  }

  cached = createClient(url, serviceKey, {
    auth: {
      // Le worker et le serveur n'ont pas de session utilisateur :
      // on désactive la persistance du jeton.
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cached;
}
