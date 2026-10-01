/**
 * ============================================================
 * lib/supabase/client.ts — Client Supabase NAVIGATEUR
 * ------------------------------------------------------------
 * À utiliser dans les composants « use client ».
 * La clé anon est publique : la sécurité est garantie par la
 * RLS (l'utilisateur ne voit que ses propres lignes).
 * ============================================================
 */
'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicEnv } from './env';

export function createClient() {
  return createBrowserClient(
    supabasePublicEnv().url,
    supabasePublicEnv().key
  );
}

/** Noms des buckets Storage, partagés front / worker. */
export const STORAGE_BUCKETS = {
  /** Vidéos sources téléversées par l'utilisateur (privé). */
  rawVideos: 'raw-videos',
  /** Rendus finaux produits par le worker (privé). */
  clips: 'clips'
} as const;
