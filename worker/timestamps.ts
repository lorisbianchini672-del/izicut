/**
 * ============================================================
 * worker/timestamps.ts — Recalage des horodatages de transcription
 * ------------------------------------------------------------
 * Module PUR : aucune dépendance, aucun accès réseau ni disque. C'est
 * volontaire : c'est la brique la plus fragile du pipeline, et la seule
 * qui doit se tester sans clé API ni ffmpeg.
 *
 * POURQUOI CE MODULE EXISTE
 * L'API de transcription refuse tout fichier de plus de 25 Mo. Une vidéo
 * longue est donc découpée en tranches, transcrites séparément, puis
 * recollée. Chaque tranche produit des temps RELATIFS à son propre début :
 * si l'on concatène naïvement, les sous-titres de la tranche 2 démarrent à
 * 0 s au lieu de 600 s. Tous les clips situés après la première tranche
 * sont alors sous-titrés de travers. C'est LE bug classique de ce type de
 * produit, et il reste invisible tant qu'on teste avec un fichier court.
 * ============================================================
 */

/** Un mot horodaté, en SECONDES relatives au média de référence. */
export type Word = { word: string; start: number; end: number };

/** Tranche planifiée d'un média. */
export type ChunkPlan = { index: number; start: number; duration: number };

/** Résultat brut d'une tranche, avant recalage. */
export type ChunkResult = { offset: number; words: Word[] };

/** Limite d'envoi documentée de l'API de transcription OpenAI. */
export const WHISPER_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Plafond par défaut d'une tranche, en secondes. */
export const DEFAULT_MAX_CHUNK_SECONDS = 600;

/** Débit d'un WAV 16 kHz mono 16 bits : 16000 x 2 octets. */
export const WAV_16K_MONO_BYTES_PER_SECOND = 32000;

/** Plancher : évite une tranche absurdement courte sur un débit élevé. */
const MIN_CHUNK_SECONDS = 30;

/** Chevauchement toléré avant de considérer deux mots superposés. */
const OVERLAP_EPSILON = 0.001;

/** Rayon, autour d'une frontière de tranche, où l'on traque les doublons. */
const BOUNDARY_WINDOW_SECONDS = 0.5;

/** Délai sous lequel un mot identique est une répétition de frontière. */
const DUPLICATE_WINDOW_SECONDS = 0.25;

export type ChunkOptions = {
  maxDurationSeconds?: number;
  bytesPerSecond?: number;
  maxBytes?: number;
};

/** Arrondi au millième de seconde : évite la dérive des flottants. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameWord(left?: string, right?: string): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Durée maximale d'une tranche, bornée à la fois par le temps et par la
 * limite d'octets de l'API.
 *
 * L'audio produit par le worker est un WAV 16 kHz mono (32 ko/s) : 600 s
 * pèsent 19,2 Mo, donc sous la limite des 25 Mo. Le calcul d'octets ne sert
 * qu'au cas où l'audio arriverait dans un format plus lourd.
 */
export function estimateChunkLimit(options: ChunkOptions = {}): number {
  const maxDurationSeconds = options.maxDurationSeconds ?? DEFAULT_MAX_CHUNK_SECONDS;
  const bytesPerSecond = options.bytesPerSecond ?? WAV_16K_MONO_BYTES_PER_SECOND;
  const maxBytes = options.maxBytes ?? WHISPER_MAX_UPLOAD_BYTES;

  if (!(bytesPerSecond > 0)) {
    throw new Error('bytesPerSecond doit être strictement positif.');
  }

  const byteLimit = Math.floor(maxBytes / bytesPerSecond);
  return Math.max(MIN_CHUNK_SECONDS, Math.min(maxDurationSeconds, byteLimit));
}

/**
 * Découpe un média en tranches contiguës qui couvrent exactement sa durée.
 *
 * Les tranches sont réparties ÉGALEMENT plutôt que remplies au maximum :
 * 1 000 s avec un plafond de 600 s donnent deux tranches de 500 s, et non
 * une de 600 s suivie d'une de 400 s. Cela évite une dernière tranche trop
 * courte, qui coûterait un appel d'API entier pour quelques secondes.
 */
export function planChunks(durationSeconds: number, options: ChunkOptions = {}): ChunkPlan[] {
  if (!isFiniteNumber(durationSeconds) || durationSeconds <= 0) return [];

  const limit = estimateChunkLimit(options);
  const count = Math.max(1, Math.ceil(durationSeconds / limit));
  const each = durationSeconds / count;
  const chunks: ChunkPlan[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = round3(index * each);
    const end = index === count - 1 ? round3(durationSeconds) : round3((index + 1) * each);
    chunks.push({ index, start, duration: round3(end - start) });
  }

  return chunks;
}

/**
 * Décale les mots d'une tranche vers le temps du média de référence.
 *
 * Les entrées inexploitables (mot non textuel, temps non numérique, fin
 * avant le début) sont écartées au lieu de faire échouer tout le job : une
 * réponse d'API légèrement bruyante ne doit pas coûter un rendu. Un mot à
 * cheval sur l'origine est rogné à 0 ; un mot entièrement antérieur à
 * l'origine est écarté.
 */
export function rebaseWords(words: Word[] | undefined | null, offsetSeconds: number): Word[] {
  const offset = isFiniteNumber(offsetSeconds) ? offsetSeconds : 0;
  const rebased: Word[] = [];

  for (const word of words ?? []) {
    if (!word || typeof word.word !== 'string') continue;
    if (!isFiniteNumber(word.start) || !isFiniteNumber(word.end)) continue;

    const start = Math.max(0, round3(word.start + offset));
    const end = Math.max(0, round3(word.end + offset));
    if (end <= start) continue;

    rebased.push({ word: word.word, start, end });
  }

  return rebased;
}

/**
 * Recollage des tranches, avec traitement des frontières.
 *
 * Deux corrections distinctes, volontairement limitées :
 *   1. Un mot qui COMMENCE avant la fin du mot déjà conservé est un
 *      chevauchement : il est écarté partout, pour garantir que deux
 *      sous-titres ne se superposent jamais à l'écran.
 *   2. Juste après une frontière de tranche, un mot IDENTIQUE au précédent
 *      et espacé de moins de 250 ms est la répétition que Whisper produit
 *      en recouvrant ses tranches. Il est écarté.
 *
 * La règle 2 est restreinte aux frontières : un « très très » prononcé dans
 * une même tranche est conservé, car il est légitime.
 */
export function mergeChunkWords(results: ChunkResult[] | undefined | null): Word[] {
  const all: Word[] = [];
  const boundaries = new Set<number>();

  for (const result of results ?? []) {
    if (!result) continue;
    const offset = isFiniteNumber(result.offset) ? result.offset : 0;
    if (offset > 0) boundaries.add(round3(offset));
    all.push(...rebaseWords(result.words, offset));
  }

  const boundaryList = [...boundaries];
  all.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const merged: Word[] = [];
  let cursor = 0;
  let started = false;

  for (const word of all) {
    if (word.end <= word.start) continue;

    if (started) {
      if (word.start < cursor - OVERLAP_EPSILON) continue;

      const previous = merged[merged.length - 1];
      const nearBoundary = boundaryList.some(
        boundary => Math.abs(word.start - boundary) <= BOUNDARY_WINDOW_SECONDS
      );
      if (nearBoundary
          && sameWord(previous?.word, word.word)
          && word.start - cursor <= DUPLICATE_WINDOW_SECONDS) {
        continue;
      }
    }

    merged.push({ word: word.word, start: round3(word.start), end: round3(word.end) });
    cursor = word.end;
    started = true;
  }

  return merged;
}

/**
 * Extrait les mots d'un clip et les recale sur ZÉRO.
 *
 * C'est l'étape décisive : la composition Remotion ne connaît que le clip,
 * pas la vidéo d'origine. Un mot à 612 s pour un clip débutant à 600 s doit
 * donc arriver à 12 s. Sans ce recalage local, tous les sous-titres du clip
 * tombent hors du cadre (ou sont ignorés silencieusement).
 *
 * Aucun mot entièrement hors du clip n'est conservé, et aucun ne peut
 * dépasser la durée du clip : un sous-titre ne s'affiche jamais au-delà de
 * la dernière image. Aucune marge n'est appliquée : un mot à cheval sur le
 * début est rogné à 0, ce qui suffit à l'afficher dès la première image.
 */
export function wordsInRange(
  words: Word[] | undefined | null,
  startSeconds: number,
  endSeconds: number
): Word[] {
  if (!isFiniteNumber(startSeconds) || !isFiniteNumber(endSeconds)) return [];

  const limit = round3(endSeconds - startSeconds);
  if (limit <= 0) return [];

  const selected: Word[] = [];

  for (const word of words ?? []) {
    if (!word || !isFiniteNumber(word.start) || !isFiniteNumber(word.end)) continue;

    const localStart = word.start - startSeconds;
    const localEnd = word.end - startSeconds;

    if (localEnd <= 0) continue;        // entièrement avant le clip
    if (localStart >= limit) continue;  // entièrement après le clip

    const start = round3(Math.min(Math.max(localStart, 0), limit));
    const end = round3(Math.min(Math.max(localEnd, start), limit));
    if (end <= start) continue;

    selected.push({ word: word.word, start, end });
  }

  return selected;
}

/** Horodatage SubRip : 00:01:02,345 */
export function formatSrtTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round((isFiniteNumber(seconds) ? seconds : 0) * 1000));
  const ms = total % 1000;
  const sec = Math.floor(total / 1000) % 60;
  const min = Math.floor(total / 60000) % 60;
  const hour = Math.floor(total / 3600000);
  const pad = (value: number, size: number) => String(value).padStart(size, '0');
  return `${pad(hour, 2)}:${pad(min, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
}

export type CueOptions = {
  /** Longueur maximale d'un sous-titre (deux lignes de 42 caractères). */
  maxCharsPerCue?: number;
  maxCueSeconds?: number;
  maxGapSeconds?: number;
  minCueSeconds?: number;
};

export type Cue = {
  start: number;
  end: number;
  words: string[];
};

const SENTENCE_END = /[.!?…]$/;

/**
 * Regroupe les mots en sous-titres lisibles.
 *
 * Une coupure survient sur : un silence (maxGapSeconds), une longueur
 * excessive, une durée excessive, ou une fin de phrase — mais seulement si
 * le sous-titre en cours est déjà assez long, sinon « Bonjour. » se
 * retrouverait seul à l'écran.
 */
export function groupWordsIntoCues(words: Word[] | undefined | null, options: CueOptions = {}): Cue[] {
  const maxChars = options.maxCharsPerCue ?? 84;
  const maxCue = options.maxCueSeconds ?? 5;
  const maxGap = options.maxGapSeconds ?? 0.6;
  const minCue = options.minCueSeconds ?? 0.8;

  const ordered = [...(words ?? [])]
    .filter(word => word && isFiniteNumber(word.start) && isFiniteNumber(word.end) && word.end > word.start)
    .sort((a, b) => a.start - b.start);

  const cues: Cue[] = [];
  let current: Cue | null = null;

  for (const word of ordered) {
    const text = String(word.word).trim();
    if (!text) continue;

    if (current) {
      const previous = current.words[current.words.length - 1];
      const gap = word.start - current.end;
      const length = current.words.join(' ').length + 1 + text.length;
      const duration = word.end - current.start;
      const endsSentence = SENTENCE_END.test(previous) && current.end - current.start >= minCue;

      if (gap > maxGap || length > maxChars || duration > maxCue || endsSentence) {
        cues.push(current);
        current = null;
      }
    }

    if (!current) {
      current = { start: word.start, end: word.end, words: [text] };
    } else {
      current.words.push(text);
      current.end = Math.max(current.end, word.end);
    }
  }

  if (current) cues.push(current);
  return cues;
}

/**
 * Sérialise des mots horodatés au format SubRip.
 *
 * Sert à la fois de fichier annexe téléchargeable (subtitle_path) et de
 * repli si le rendu des sous-titres animés échoue : un clip accompagné de
 * son SRT reste exploitable par l'utilisateur.
 */
export function buildSrt(words: Word[] | undefined | null, options: CueOptions = {}): string {
  return groupWordsIntoCues(words, options)
    .map((cue, index) => {
      const text = cue.words.join(' ');
      return `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${text}\n`;
    })
    .join('\n');
}