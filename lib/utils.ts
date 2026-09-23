import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes Tailwind en laissant la dernière gagner.
 * Convention shadcn : sans ce helper, une classe passée en prop ne peut
 * jamais écraser le style par défaut d'un composant.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formate une durée en secondes vers « 1 min 05 s ».
 * Utilisé partout où l'on montre du temps consommé ou de la vidéo.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 s';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return `${minutes} min ${String(rest).padStart(2, '0')} s`;
}

/**
 * Formate des minutes de crédit « 12,5 min » (virgule française).
 * Les crédits sont décimaux : un clip de 45 s consomme 0,75 minute.
 */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '0 min';
  const rounded = Math.round(minutes * 100) / 100;
  return `${rounded.toString().replace('.', ',')} min`;
}

/** Horodatage court pour l'historique : 21/09/2026 à 14:32 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
