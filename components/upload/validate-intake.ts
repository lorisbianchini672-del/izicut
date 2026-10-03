/**
 * ============================================================
 * validate-intake.ts — Règles de validation, sans React ni DOM
 * ------------------------------------------------------------
 * Module PUR : aucune dépendance, aucun accès réseau. C'est volontaire :
 * ces règles servent à la fois au client (retour immédiat) et aux tests
 * (node --test, sans navigateur). Les composants d'interface ne font que
 * les appeler et afficher le résultat.
 * ============================================================
 */

const YOUTUBE_PATTERN =
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/i;

const TWITCH_PATTERN = /^(https?:\/\/)?(www\.)?twitch\.tv\/videos\//i;

export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv'];

/**
 * Plafond actuel : 800 Mo (stockage Supabase gratuit = 1 Go au total, fichiers
 * envoyés en morceaux de 45 Mo car l'offre gratuite refuse tout fichier > 50 Mo).
 */
export const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;

export type VideoFileDescriptor = { name: string; size: number };

/**
 * Contrôle un lien collé par l'utilisateur. Renvoie `null` si le lien est
 * exploitable, sinon le message à afficher, rédigé pour l'utilisateur.
 */
export function validateVideoUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Collez le lien de votre vidéo pour commencer.';
  if (YOUTUBE_PATTERN.test(value) || TWITCH_PATTERN.test(value)) return null;
  return 'Pour l’instant, seuls les liens YouTube et les rediffusions Twitch sont pris en charge.';
}

/**
 * Contrôle un fichier avant tout envoi. La vérification porte sur
 * l'extension ET sur la taille : un MKV de 14 Go doit être refusé ici,
 * pas après vingt minutes d'upload.
 */
export function validateVideoFile(file: VideoFileDescriptor): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_VIDEO_EXTENSIONS.includes(extension)) {
    return 'Format non pris en charge : utilisez MP4, MOV, WebM ou MKV.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'Fichier trop volumineux : 800 Mo maximum pour le moment. Astuce : exportez la vidéo en 720p ou coupez-la en deux.';
  }
  if (file.size === 0) {
    return 'Ce fichier semble vide : vérifiez-le puis réessayez.';
  }
  return null;
}

/** « 1500000000 » -> « 1,4 Go » : affichage français, une décimale. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/** Estimation grossière de la durée (secondes) à partir de la taille d'un fichier,
 *  en supposant un débit moyen de 5 Mbps (typique vidéo 1080p). À titre indicatif
 *  seulement — le vrai débit sera déterminé par ffprobe dans le pipeline. */
export function estimateDurationFromSize(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  const bitsPerSecond = 5_000_000; // 5 Mbps h264 moyen
  return Math.round((bytes * 8) / bitsPerSecond);
}
