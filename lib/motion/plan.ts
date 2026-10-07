/**
 * Offre Free du Studio Motion : 3 pubs créées par l'IA pour essayer, avec une
 * partie des fonctions. Le compteur est tenu côté serveur (app_metadata du
 * compte, modifiable uniquement avec la clé service) : impossible de le
 * remettre à zéro depuis le navigateur.
 */
import type { MotionProject, Motif, Music, Transition } from './types';

export const FREE_MOTION_CREATIONS = 3;

export const FREE_LIMITS = {
  photos: 4,
  videos: 1,
  music: ['pop', 'chill', 'none'] as Music[],
  transitions: ['flash', 'slide'] as Transition[],
  motifs: ['particles', 'bubbles', 'confetti', 'none'] as Motif[]
};

/** Fonctions réservées aux offres payantes (affichées avec un cadenas). */
export const PRO_ONLY = [
  'Pubs illimitées',
  '3 accroches A/B au choix',
  'Script de voix-off + bruitages',
  'Toutes les musiques, textures et transitions',
  'Jusqu’à 12 photos et 3 vidéos',
  'Sans filigrane'
];

export type MotionQuota = { tier: 'free' | 'pro' | 'agency'; used: number; limit: number | null };

/** Ramène un projet aux options de l'offre Free. */
export function clampToFree(p: MotionProject): MotionProject {
  const theme = { ...p.theme };
  if (theme.motif && !FREE_LIMITS.motifs.includes(theme.motif)) theme.motif = 'particles';
  const sound = p.sound && !FREE_LIMITS.music.includes(p.sound.music) ? { ...p.sound, music: 'pop' as Music } : p.sound;
  const transition = p.transition && !FREE_LIMITS.transitions.includes(p.transition) ? 'flash' : p.transition;
  return { ...p, theme, sound, transition };
}

/** Les administrateurs du site (ADMIN_EMAILS) ont toutes les fonctions, sans limite. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = `${process.env.ADMIN_EMAILS ?? ''},${process.env.ADMIN_EMAILS_EXTRA ?? ''}`.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}
