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
  /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?|shorts\/|live\/|embed\/|v\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)/i;

/**
 * Remet un lien vidéo au propre avant de l'envoyer au serveur : ajoute
 * « https:// » s'il manque, et transforme toutes les formes de liens YouTube
 * (Shorts, youtu.be, embed, music, mobile, paramètres de partage « si= »…) en
 * lien standard https://www.youtube.com/watch?v=ID. Les autres liens sont
 * seulement complétés.
 */
export function normalizeVideoUrl(raw: string): string {
  let value = raw.trim().replace(/^<|>$/g, '');
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) value = `https://${value.replace(/^\/+/, '')}`;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/i, '').toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (['shorts', 'live', 'embed', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    }
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
    return u.toString();
  } catch {
    return value;
  }
}

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
  if (YOUTUBE_PATTERN.test(value) || TWITCH_PATTERN.test(value)) {
    if (YOUTUBE_PATTERN.test(value) && !/[?&]v=[\w-]{6,}|\/(shorts|live|embed|v)\/[\w-]{6,}|youtu\.be\/[\w-]{6,}/i.test(value)) return 'Ce lien YouTube est incomplet : ouvrez la vidéo puis copiez son lien (bouton « Partager »).';
    return null;
  }
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
