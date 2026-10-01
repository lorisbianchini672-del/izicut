/**
 * ============================================================
 * lib/supabase/server.ts — Client Supabase SERVEUR (SSR / API)
 * ------------------------------------------------------------
 * À utiliser dans les Server Components et les Route Handlers
 * (`app/api/**`). Reprend le cookie de session Supabase Auth
 * de la requête : les requêtes partent donc avec l'identité de
 * l'utilisateur, et la RLS s'applique normalement.
 * ============================================================
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabasePublicEnv } from './env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabasePublicEnv().url,
    supabasePublicEnv().key,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Appelé depuis un Server Component : le middleware
            // rafraîchira la session à la requête suivante.
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch {
            // Voir ci-dessus.
          }
        }
      }
    }
  );
}
