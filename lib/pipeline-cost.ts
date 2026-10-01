/**
 * ============================================================
 * lib/pipeline-cost.ts — Coût d'un dépôt, en secondes de crédit
 * ------------------------------------------------------------
 * Module PUR : aucun import, aucun accès réseau, exécutable par Node
 * sans résolution d'alias. C'est volontaire — la même règle doit être
 * testable (`node --test`) et le coût ne doit JAMAIS être calculé à
 * partir d'une valeur fournie par le navigateur sans passer par ici.
 *
 * Règle : coût = durée annoncée de la source + marge de 20 %. La marge
 * couvre l'extraction audio, la transcription Whisper et le rendu, qui
 * sont proportionnels à la durée de la source. La durée annoncée n'est
 * qu'une estimation : le worker mesure la vraie durée avec ffprobe.
 * ============================================================
 */

/** D'où vient la vidéo : dépôt d'un fichier, ou lien externe (YouTube, Twitch). */
export type SourceType = 'upload_gallery' | 'external_url';

/**
 * Durée retenue quand le client n'en annonce aucune (métadonnées absentes,
 * valeur inexploitable). Valeurs volontairement prudentes : mieux vaut
 * estimer un peu large que créer un job dont le coût réel dépasse la
 * réservation, car la réservation est le seul mécanisme de facturation.
 */
export const DEFAULT_SOURCE_SECONDS: Record<SourceType, number> = {
  upload_gallery: 300, // 5 min
  external_url: 180 // 3 min
};

/** Marge appliquée à la durée annoncée (20 %). */
export const COST_BUFFER_RATIO = 0.2;

/**
 * Plafond de sécurité (4 h) : la durée annoncée vient du client, donc elle
 * est arbitraire. Sans plafond, un client fautif réserverait le quota d'un
 * plan entier avec un nombre inventé. Une source plus longue est de toute
 * façon refusée par les quotas des offres actuelles (600 min au maximum).
 */
export const MAX_SOURCE_SECONDS = 4 * 60 * 60;

/** Durée exploitable : valeur annoncée si crédible, sinon défaut du type de source. */
export function normalizeSourceSeconds(
  durationSeconds: unknown,
  sourceType: SourceType
): number {
  const value =
    typeof durationSeconds === 'number' ? durationSeconds : Number(durationSeconds);

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SOURCE_SECONDS[sourceType];
  }

  // La durée se stocke en entier (projects.duration_seconds). Un reste
  // inférieur à la seconde est un bruit de mesure, pas une durée : on
  // retombe sur le défaut plutôt que de réserver 0 s.
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return DEFAULT_SOURCE_SECONDS[sourceType];
  }
  return Math.min(rounded, MAX_SOURCE_SECONDS);
}

/**
 * Coût à réserver, en secondes de crédit. Arrondi au SUPÉRIEUR : un coût
 * fractionnaire ne peut pas être facturé, et arrondir vers le bas
 * reviendrait à offrir une seconde à chaque dépôt. Jamais moins de 1 s.
 */
export function estimateCostSeconds(
  durationSeconds: unknown,
  sourceType: SourceType
): number {
  const seconds = normalizeSourceSeconds(durationSeconds, sourceType);
  return Math.max(1, Math.ceil(seconds * (1 + COST_BUFFER_RATIO)));
}
