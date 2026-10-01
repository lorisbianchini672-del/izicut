/**
 * ============================================================
 * worker/edit-plan.ts — Décisions de montage (module PUR)
 * ------------------------------------------------------------
 * Aucun import, aucune E/S : exécutable par Node (type stripping)
 * et testé par worker/edit-plan.test.ts, comme timestamps.ts.
 *
 *  - buildTimedTranscript : transcription AVEC horodatages pour le
 *    LLM (sans eux, il invente les bornes des clips) ;
 *  - snapClipBounds       : cale un clip sur des débuts/fins de
 *    phrase, jamais au milieu d'un mot ;
 *  - computeKeepSegments / remapWords / buildSelectExpression :
 *    suppression des silences + recalage des sous-titres ;
 *  - computeZoomTimes     : instants des zooms dynamiques.
 * ============================================================
 */

export type Word = { word: string; start: number; end: number };
export type Segment = { start: number; end: number };

const SENTENCE_END = /[.!?…]["»”)]*$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------- 1. Transcription horodatée pour le LLM ----------

/**
 * Une ligne par phrase (ou toutes les ~8 s de parole continue), préfixée
 * de son instant de début en secondes : « [132.4] Le vrai problème… ».
 * Si le texte dépasse `maxChars`, les lignes sont échantillonnées sur
 * TOUTE la durée plutôt que tronquées : la fin de la vidéo reste visible.
 */
export function buildTimedTranscript(
  words: Word[],
  options: { maxChars?: number; maxLineSeconds?: number } = {}
): string {
  const maxChars = options.maxChars ?? 60000;
  const maxLineSeconds = options.maxLineSeconds ?? 8;
  const lines: string[] = [];

  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((w) => w.word.trim()).filter(Boolean).join(' ');
    if (text) lines.push(`[${current[0].start.toFixed(1)}] ${text}`);
    current = [];
  };

  for (const w of words) {
    current.push(w);
    const tooLong = w.end - current[0].start >= maxLineSeconds;
    if (SENTENCE_END.test(w.word.trim()) || tooLong) flush();
  }
  flush();

  const full = lines.join('\n');
  if (full.length <= maxChars) return full;

  // Échantillonnage régulier : on garde 1 ligne sur k, avec k croissant
  // jusqu'à tenir dans le budget (jamais de ligne coupée en deux).
  for (let ratio = Math.ceil(full.length / maxChars); ratio <= lines.length; ratio++) {
    const sampled = lines.filter((_, i) => i % ratio === 0).join('\n');
    if (sampled.length <= maxChars) return sampled;
  }
  return lines[0].slice(0, maxChars);
}

// ---------- 2. Calage des bornes d'un clip ----------

/**
 * Cale [start, end] sur la parole réelle :
 *  - début : début de phrase le plus proche dans les `lookSeconds`
 *    précédentes, sinon début du premier mot ;
 *  - fin : fin de phrase la plus proche dans les `lookSeconds` suivantes,
 *    sinon fin du dernier mot entamé ;
 *  - marges d'air (pré-roll court, post-roll plus long pour laisser
 *    la phrase respirer), puis respect des durées min/max.
 */
export function snapClipBounds(
  words: Word[],
  start: number,
  end: number,
  options: {
    duration: number;
    minSeconds?: number;
    maxSeconds?: number;
    lookSeconds?: number;
  }
): Segment {
  const duration = Math.max(0, options.duration);
  const minSeconds = options.minSeconds ?? 15;
  const maxSeconds = options.maxSeconds ?? 90;
  const look = options.lookSeconds ?? 3;

  let s = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, duration));
  let e = Math.max(s, Math.min(Number.isFinite(end) ? end : s + 30, duration));

  if (words.length > 0) {
    // Début : un mot qui suit une fin de phrase, dans [s - look, s + 1].
    let snappedStart: number | null = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.start < s - look) continue;
      if (w.start > s + 1) break;
      const startsSentence = i === 0 || SENTENCE_END.test(words[i - 1].word.trim());
      if (startsSentence) snappedStart = w.start;
    }
    if (snappedStart === null) {
      const first = words.find((w) => w.end > s);
      if (first) snappedStart = Math.min(first.start, s);
    }
    if (snappedStart !== null) s = snappedStart;

    // Fin : une fin de phrase dans [e - 1, e + look].
    let snappedEnd: number | null = null;
    for (const w of words) {
      if (w.end < e - 1) continue;
      if (w.end > e + look) break;
      if (SENTENCE_END.test(w.word.trim())) {
        snappedEnd = w.end;
        break;
      }
    }
    if (snappedEnd === null) {
      // Ne jamais couper un mot entamé.
      const cut = words.find((w) => w.start < e && w.end > e);
      snappedEnd = cut ? cut.end : e;
    }
    e = snappedEnd;
  }

  s = Math.max(0, s - 0.15);
  e = Math.min(duration, e + 0.35);

  if (e - s > maxSeconds) e = s + maxSeconds;
  if (e - s < minSeconds) {
    e = Math.min(duration, s + minSeconds);
    if (e - s < minSeconds) s = Math.max(0, e - minSeconds);
  }

  return { start: round2(s), end: round2(e) };
}

// ---------- 3. Suppression des silences ----------

/**
 * Intervalles à CONSERVER dans un clip de `clipDuration` secondes, à partir
 * des mots RELATIFS au clip. Tout blanc de plus de `minGap` secondes est
 * retiré, en laissant `padding` secondes d'air de chaque côté (sinon les
 * attaques et fins de mots sont avalées).
 */
export function computeKeepSegments(
  words: Word[],
  clipDuration: number,
  options: { minGap?: number; padding?: number } = {}
): Segment[] {
  const minGap = options.minGap ?? 0.45;
  const padding = options.padding ?? 0.12;
  const total = Math.max(0, clipDuration);
  if (words.length === 0 || total === 0) return [{ start: 0, end: total }];

  const sorted = [...words]
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > 0 && w.start < total)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [{ start: 0, end: total }];

  // Blocs de parole continue (écart entre mots < minGap).
  const blocks: Segment[] = [];
  for (const w of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && w.start - last.end < minGap) {
      last.end = Math.max(last.end, w.end);
    } else {
      blocks.push({ start: w.start, end: w.end });
    }
  }

  // Air autour des blocs, puis fusion des chevauchements.
  const padded = blocks.map((b) => ({
    start: Math.max(0, b.start - padding),
    end: Math.min(total, b.end + padding)
  }));
  const merged: Segment[] = [];
  for (const seg of padded) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end) last.end = Math.max(last.end, seg.end);
    else merged.push({ ...seg });
  }

  return merged
    .filter((seg) => seg.end - seg.start > 0.05)
    .map((seg) => ({ start: round2(seg.start), end: round2(seg.end) }));
}

export function keptDuration(segments: Segment[]): number {
  return round2(segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0));
}

/**
 * Recale les mots sur la timeline APRÈS suppression des silences.
 * Un mot hors de tout segment conservé est retiré ; un mot à cheval est
 * borné au segment qui contient son début.
 */
export function remapWords(words: Word[], segments: Segment[]): Word[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const seg of segments) {
    offsets.push(acc);
    acc += seg.end - seg.start;
  }

  const out: Word[] = [];
  for (const w of words) {
    const idx = segments.findIndex((seg) => w.start >= seg.start - 0.001 && w.start < seg.end);
    if (idx === -1) continue;
    const seg = segments[idx];
    const start = offsets[idx] + (w.start - seg.start);
    const end = offsets[idx] + (Math.min(w.end, seg.end) - seg.start);
    out.push({ word: w.word, start: round2(start), end: round2(Math.max(end, start + 0.05)) });
  }
  return out;
}

/**
 * Expression ffmpeg `between(t,a,b)+…` pour les filtres select/aselect.
 * Renvoie null si la suppression n'apporte rien (un seul segment couvrant
 * presque tout) ou si l'expression deviendrait déraisonnable.
 */
export function buildSelectExpression(
  segments: Segment[],
  clipDuration: number,
  options: { maxSegments?: number; minSavedSeconds?: number } = {}
): string | null {
  const maxSegments = options.maxSegments ?? 150;
  const minSaved = options.minSavedSeconds ?? 0.4;
  if (segments.length === 0 || segments.length > maxSegments) return null;
  if (clipDuration - keptDuration(segments) < minSaved) return null;
  return segments.map((seg) => `between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})`).join('+');
}

// ---------- 4. Zooms dynamiques ----------

/**
 * Instants (secondes relatives au clip) où déclencher un « punch-in » :
 * débuts de phrase, mots d'emphase (chiffres, « ! », « ? ») — avec un
 * écart minimal pour ne pas donner le mal de mer.
 */
export function computeZoomTimes(
  words: Word[],
  duration: number,
  options: { minSpacing?: number; maxCount?: number } = {}
): number[] {
  const minSpacing = options.minSpacing ?? 3;
  const maxCount = options.maxCount ?? Math.max(1, Math.floor(duration / 3));
  const times: number[] = [];

  words.forEach((w, i) => {
    const text = w.word.trim();
    const startsSentence = i > 0 && SENTENCE_END.test(words[i - 1].word.trim());
    const emphatic = /[!?]$/.test(text) || /\d/.test(text);
    if (!startsSentence && !emphatic) return;
    const t = w.start;
    if (t < 1 || t > duration - 1) return;
    if (times.length > 0 && t - times[times.length - 1] < minSpacing) return;
    times.push(round2(t));
  });

  return times.slice(0, maxCount);
}
