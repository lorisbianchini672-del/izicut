/**
 * ============================================================
 * lib/format.ts — Formats d'affichage (français)
 * ------------------------------------------------------------
 * Module PUR : aucun import, aucun accès réseau. Les composants
 * d'interface ne font que l'appeler — c'est ce qui permet de tester
 * les cas limites (valeur absente, date future, quota nul) sans DOM.
 * ============================================================
 */

/** Durée en secondes -> « 40m 50s ». Renvoie « — » si la durée est inconnue. */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest}s`;
  if (minutes < 60) return `${minutes}m ${rest.toString().padStart(2, '0')}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${(minutes % 60).toString().padStart(2, '0')}m`;
}

/** Secondes -> minutes entières, arrondies au supérieur (jamais 0 pour 1 s). */
export function secondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds / 60);
}

/** Minutes -> secondes. */
export function minutesToSeconds(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes * 60);
}

/**
 * Part du quota encore disponible, en pourcentage entier borné à [0, 100].
 * Un quota inconnu (0) renvoie 0 : la jauge reste vide plutôt que pleine.
 */
export function creditUsagePercent(remainingSeconds: number, quotaSeconds: number): number {
  if (!Number.isFinite(quotaSeconds) || quotaSeconds <= 0) return 0;
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((remainingSeconds / quotaSeconds) * 100)));
}

/**
 * Date ISO -> libellé relatif court (« Il y a 2 heures »), puis date
 * française au-delà d'une semaine. `now` est injectable pour les tests.
 */
export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = now.getTime() - date.getTime();
  // Une date dans le futur (horloge décalée) ne doit pas afficher « Il y a -3 min ».
  if (diffMs < 0) return 'À l’instant';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} jour${days > 1 ? 's' : ''}`;

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Tonalité visuelle d'un statut projet : l'interface choisit la couleur,
 * la règle reste ici (et donc testable).
 */
export type StatusTone = 'ready' | 'working' | 'queued' | 'error';

export function projectStatusTone(status: string): StatusTone {
  switch (status) {
    case 'completed':
      return 'ready';
    case 'transcribing':
    case 'analyzing':
      return 'working';
    case 'error':
      return 'error';
    default:
      // draft, uploading, processing_audio : le travail n'a pas commencé.
      return 'queued';
  }
}
