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

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Noms des buckets Storage, partagés front / worker. */
export const STORAGE_BUCKETS = {
  /** Vidéos sources téléversées par l'utilisateur (privé). */
  rawVideos: 'raw-videos',
  /** Rendus finaux produits par le worker (privé). */
  clips: 'clips'
} as const;
