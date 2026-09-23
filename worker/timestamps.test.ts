/**
 * Tests du recalage des horodatages.
 *
 * Exécution : npm test (depuis izicut) ou
 *   node --test worker/timestamps.test.ts
 *
 * Aucune dépendance externe et aucun accès réseau : ce fichier doit
 * tourner en quelques millisecondes, car c'est le garde-fou du pipeline.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MAX_CHUNK_SECONDS,
  WHISPER_MAX_UPLOAD_BYTES,
  WAV_16K_MONO_BYTES_PER_SECOND,
  estimateChunkLimit,
  planChunks,
  rebaseWords,
  mergeChunkWords,
  wordsInRange,
  formatSrtTimestamp,
  groupWordsIntoCues,
  buildSrt
} from './timestamps.ts';

import type { Word } from './timestamps.ts';

const word = (text: string, start: number, end: number): Word => ({ word: text, start, end });

// ---------- Découpage ----------

test('estimateChunkLimit applique le plafond de durée par défaut', () => {
  assert.equal(estimateChunkLimit(), DEFAULT_MAX_CHUNK_SECONDS);
});

test('estimateChunkLimit respecte la limite d’octets de l’API', () => {
  const limit = estimateChunkLimit({
    maxDurationSeconds: 10000,
    bytesPerSecond: WAV_16K_MONO_BYTES_PER_SECOND
  });
  assert.equal(limit, Math.floor(WHISPER_MAX_UPLOAD_BYTES / WAV_16K_MONO_BYTES_PER_SECOND));
  assert.ok(limit * WAV_16K_MONO_BYTES_PER_SECOND <= WHISPER_MAX_UPLOAD_BYTES);
});

test('estimateChunkLimit ne descend jamais sous le plancher', () => {
  assert.equal(estimateChunkLimit({ bytesPerSecond: 4 * 1024 * 1024 }), 30);
});

test('estimateChunkLimit refuse un débit nul', () => {
  assert.throws(() => estimateChunkLimit({ bytesPerSecond: 0 }), /strictement positif/);
});

test('planChunks découpe une heure en six tranches de dix minutes', () => {
  const chunks = planChunks(3600);
  assert.equal(chunks.length, 6);
  assert.deepEqual(chunks.map(chunk => chunk.start), [0, 600, 1200, 1800, 2400, 3000]);
  assert.ok(chunks.every(chunk => chunk.duration === 600));
});

test('planChunks répartit également et évite une dernière tranche courte', () => {
  const chunks = planChunks(2700);
  assert.equal(chunks.length, 5);
  assert.ok(chunks.every(chunk => chunk.duration === 540), 'aucune tranche de 300 s en fin de média');
});

test('planChunks couvre exactement la durée, sans trou ni recouvrement', () => {
  const duration = 1234.567;
  const chunks = planChunks(duration);
  assert.equal(chunks[0].start, 0);
  const total = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
  assert.ok(Math.abs(total - duration) < 0.002, `somme ${total} contre ${duration}`);
  for (let index = 1; index < chunks.length; index += 1) {
    const previous = chunks[index - 1];
    assert.equal(chunks[index].start, Number((previous.start + previous.duration).toFixed(3)));
  }
});

test('planChunks traite un média plus court qu’une tranche', () => {
  const chunks = planChunks(250);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], { index: 0, start: 0, duration: 250 });
});

test('planChunks renvoie un tableau vide sur une durée inexploitable', () => {
  for (const invalid of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(planChunks(invalid), [], `durée ${invalid}`);
  }
});

// ---------- Recalage vers le temps du média ----------

test('rebaseWords décale les mots du début de la tranche', () => {
  const rebased = rebaseWords([word('clip', 0.5, 1.5)], 600);
  assert.deepEqual(rebased, [{ word: 'clip', start: 600.5, end: 601.5 }]);
});

test('rebaseWords arrondit au millième de seconde', () => {
  const rebased = rebaseWords([word('x', 1.2345, 2.0004)], 10);
  assert.deepEqual(rebased, [{ word: 'x', start: 11.235, end: 12 }]);
});

test('rebaseWords écarte les entrées inexploitables et rogne l’origine', () => {
  const rebased = rebaseWords([
    word('ok', 1, 2),
    word('avant', -5, -2),
    word('cheval', -1, 1),
    word('inverse', 5, 3),
    { word: 'nan', start: Number.NaN, end: 3 }
  ], 0);
  assert.deepEqual(rebased, [
    { word: 'ok', start: 1, end: 2 },
    { word: 'cheval', start: 0, end: 1 }
  ]);
});

// ---------- Recollage des tranches ----------

test('NON-RÉGRESSION : le recalage empêche le décalage de 600 s de la tranche 2', () => {
  const chunks = planChunks(1200);
  assert.equal(chunks[1].start, 600, 'la frontière de la seconde tranche est bien 600 s');

  // Résultats bruts de l'API : des temps RELATIFS à chaque tranche.
  const merged = mergeChunkWords([
    { offset: chunks[0].start, words: [word('intro', 599.5, 600)] },
    { offset: chunks[1].start, words: [word('clip', 0.2, 0.8), word('ici', 0.8, 1.4)] }
  ]);

  assert.deepEqual(wordsInRange(merged, 600, 660), [
    { word: 'clip', start: 0.2, end: 0.8 },
    { word: 'ici', start: 0.8, end: 1.4 }
  ]);

  // Sans recalage, les mots de la tranche 2 seraient vus à 0 s : ils
  // tomberaient hors du clip et disparaîtraient du sous-titre.
  assert.deepEqual(
    wordsInRange([word('clip', 0.2, 0.8)], 600, 660),
    [],
    'sans recalage le mot est perdu : c’est exactement le bug corrigé'
  );
});

test('mergeChunkWords écarte le mot répété à la frontière de tranche', () => {
  const merged = mergeChunkWords([
    { offset: 0, words: [word('frontière', 599.5, 600)] },
    { offset: 600, words: [word('frontière', 0, 0.4), word('suite', 0.4, 1.2)] }
  ]);
  assert.deepEqual(merged.map(item => item.word), ['frontière', 'suite']);
  assert.deepEqual(merged[0], { word: 'frontière', start: 599.5, end: 600 });
  assert.deepEqual(merged[1], { word: 'suite', start: 600.4, end: 601.2 });
});

test('mergeChunkWords conserve un mot répété légitime dans une même tranche', () => {
  const merged = mergeChunkWords([
    { offset: 0, words: [word('très', 10, 10.4), word('très', 10.4, 10.8)] }
  ]);
  assert.deepEqual(merged.map(item => item.word), ['très', 'très']);
});

test('mergeChunkWords élimine tout chevauchement', () => {
  const merged = mergeChunkWords([
    { offset: 0, words: [word('a', 1, 3), word('b', 2, 4), word('c', 4, 5)] }
  ]);
  assert.deepEqual(merged.map(item => item.word), ['a', 'c']);
  for (let index = 1; index < merged.length; index += 1) {
    assert.ok(merged[index].start >= merged[index - 1].end, 'temps strictement croissants');
  }
});

test('mergeChunkWords trie des tranches arrivées dans le désordre', () => {
  const merged = mergeChunkWords([
    { offset: 600, words: [word('deux', 0, 1)] },
    { offset: 0, words: [word('un', 0, 1)] }
  ]);
  assert.deepEqual(merged.map(item => item.word), ['un', 'deux']);
});

// ---------- Fenêtrage sur un clip ----------

test('wordsInRange recale les mots sur zéro et écarte le hors-champ', () => {
  const words = [word('avant', 599, 599.5), word('a', 610, 611), word('b', 620, 621)];
  assert.deepEqual(wordsInRange(words, 600, 630), [
    { word: 'a', start: 10, end: 11 },
    { word: 'b', start: 20, end: 21 }
  ]);
});

test('wordsInRange rogne les mots à cheval sur les bornes du clip', () => {
  const words = [word('debut', 599.5, 600.5), word('fin', 629.5, 630.5), word('apres', 630, 631)];
  assert.deepEqual(wordsInRange(words, 600, 630), [
    { word: 'debut', start: 0, end: 0.5 },
    { word: 'fin', start: 29.5, end: 30 }
  ]);
});

test('wordsInRange renvoie un tableau vide sur une fenêtre invalide', () => {
  const words = [word('a', 610, 611)];
  assert.deepEqual(wordsInRange(words, 600, 600), []);
  assert.deepEqual(wordsInRange(words, 600, 599), []);
  assert.deepEqual(wordsInRange(words, Number.NaN, 630), []);
});

// ---------- Sous-titres ----------

test('formatSrtTimestamp produit le format SubRip attendu', () => {
  assert.equal(formatSrtTimestamp(0), '00:00:00,000');
  assert.equal(formatSrtTimestamp(3661.5), '01:01:01,500');
  assert.equal(formatSrtTimestamp(-5), '00:00:00,000');
  assert.equal(formatSrtTimestamp(Number.NaN), '00:00:00,000');
});

test('groupWordsIntoCues coupe sur un silence', () => {
  const cues = groupWordsIntoCues([word('a', 0, 0.5), word('b', 0.5, 1), word('c', 3, 3.5)]);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0].words, ['a', 'b']);
  assert.deepEqual(cues[1].words, ['c']);
});

test('groupWordsIntoCues coupe sur une fin de phrase seulement si le sous-titre est assez long', () => {
  const court = groupWordsIntoCues([word('Bonjour.', 0, 0.4), word('suite', 0.4, 0.8)]);
  assert.equal(court.length, 1, 'un sous-titre trop court ne doit pas être isolé');

  const long = groupWordsIntoCues([word('le', 0, 0.5), word('fin.', 0.5, 1), word('suite', 1, 1.5)]);
  assert.equal(long.length, 2);
  assert.deepEqual(long[0].words, ['le', 'fin.']);
});

test('buildSrt numérote les sous-titres et sépare les blocs', () => {
  const srt = buildSrt([word('a', 0, 0.5), word('b', 0.5, 1), word('c', 3, 3.5)]);
  assert.equal(
    srt,
    '1\n00:00:00,000 --> 00:00:01,000\na b\n\n2\n00:00:03,000 --> 00:00:03,500\nc\n'
  );
});