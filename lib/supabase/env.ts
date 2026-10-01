/**
 * Configuration publique Supabase, tolérante à l'absence de variables.
 * Sans elles (build Vercel non configuré, démo), on fournit des valeurs
 * factices : la page se construit et s'affiche, et les appels Supabase
 * échouent proprement au lieu de faire planter le rendu.
 */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'missing-supabase-anon-key';

export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url: url || PLACEHOLDER_URL, key: key || PLACEHOLDER_KEY, configured: Boolean(url && key) };
}
