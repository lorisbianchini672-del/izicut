/**
 * Tests des décisions de montage (calage, silences, zooms).
 *
 * Exécution : npm test (depuis izicut) ou
 *   node --test worker/edit-plan.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSelectExpression,
  buildTimedTranscript,
  computeKeepSegments,
  computeZoomTimes,
  keptDuration,
  remapWords,
  snapClipBounds
} from './edit-plan.ts';

import type { Word } from './edit-plan.ts';

const w = (word: string, start: number, end: number): Word => ({ word, start, end });

// ---------- Transcription horodatée ----------

test('buildTimedTranscript : une ligne par phrase, préfixée de son début', () => {
  const text = buildTimedTranscript([
    w('Salut', 0, 0.4),
    w('toi.', 0.4, 0.8),
    w('Ça', 1.0, 1.2),
    w('va?', 1.2, 1.5)
  ]);
  assert.equal(text, '[0.0] Salut toi.\n[1.0] Ça va?');
});

test('buildTimedTranscript coupe une parole continue toutes les ~8 s', () => {
  const words = Array.from({ length: 20 }, (_, i) => w('mot', i, i + 1));
  const lines = buildTimedTranscript(words).split('\n');
  assert.ok(lines.length >= 2);
  assert.ok(lines[1].startsWith('[8.0]'));
});

test('buildTimedTranscript échantillonne au lieu de tronquer la fin', () => {
  const words = Array.from({ length: 200 }, (_, i) => w(`phrase${i}.`, i * 2, i * 2 + 1));
  const text = buildTimedTranscript(words, { maxChars: 500 });
  assert.ok(text.length <= 500);
  assert.ok(text.startsWith('[0.0]'));
  // Des lignes de la seconde moitié de la vidéo sont présentes.
  const lastTime = Number(text.split('\n').at(-1)!.match(/^\[(\d+\.\d)\]/)![1]);
  assert.ok(lastTime > 100, `dernière ligne à ${lastTime}s`);
});

// ---------- Calage des bornes ----------

const SPEECH = [
  w('Bonjour', 0, 0.5),
  w('à', 0.5, 0.7),
  w('tous.', 0.7, 1.2),
  w('Le', 10, 10.2),
  w('secret', 10.2, 10.8),
  w('est', 10.8, 11),
  w('simple.', 11, 11.8),
  w('Voici', 30, 30.4),
  w('pourquoi.', 30.4, 31)
];

test('snapClipBounds cale sur un début et une fin de phrase, avec marges', () => {
  assert.deepEqual(snapClipBounds(SPEECH, 10.5, 30.2, { duration: 60 }), { start: 9.85, end: 31.35 });
});

test('snapClipBounds ne coupe jamais un mot entamé', () => {
  const words = [w('a', 0, 1), w('b', 1, 2.5), w('c', 2.5, 4)];
  assert.deepEqual(snapClipBounds(words, 0.2, 2.0, { duration: 10, minSeconds: 1 }), { start: 0, end: 2.85 });
});

test('snapClipBounds impose la durée minimale, même en fin de vidéo', () => {
  assert.deepEqual(snapClipBounds([], 5, 6, { duration: 100 }), { start: 4.85, end: 19.85 });
  assert.deepEqual(snapClipBounds([], 95, 99, { duration: 100 }), { start: 85, end: 100 });
});

test('snapClipBounds impose la durée maximale', () => {
  assert.deepEqual(snapClipBounds([], 0, 200, { duration: 300, maxSeconds: 90 }), { start: 0, end: 90 });
});

test('snapClipBounds résiste à des nombres invalides du LLM', () => {
  const r = snapClipBounds([], Number.NaN, Number.NaN, { duration: 40 });
  assert.ok(r.start >= 0 && r.end <= 40 && r.end > r.start);
});

// ---------- Silences ----------

const CLIP_WORDS = [w('a', 0.5, 1.0), w('b', 1.1, 1.6), w('c', 3.0, 3.5)];

test('computeKeepSegments retire les blancs en gardant de l’air', () => {
  const segs = computeKeepSegments(CLIP_WORDS, 5);
  assert.deepEqual(segs, [
    { start: 0.38, end: 1.72 },
    { start: 2.88, end: 3.62 }
  ]);
  assert.equal(keptDuration(segs), 2.08);
});

test('computeKeepSegments sans mots conserve tout le clip', () => {
  assert.deepEqual(computeKeepSegments([], 12), [{ start: 0, end: 12 }]);
});

test('remapWords recale les sous-titres sur la timeline raccourcie', () => {
  const segs = computeKeepSegments(CLIP_WORDS, 5);
  assert.deepEqual(remapWords(CLIP_WORDS, segs), [
    { word: 'a', start: 0.12, end: 0.62 },
    { word: 'b', start: 0.72, end: 1.22 },
    { word: 'c', start: 1.46, end: 1.96 }
  ]);
});

test('buildSelectExpression produit un filtre ffmpeg, ou null si inutile', () => {
  const segs = computeKeepSegments(CLIP_WORDS, 5);
  assert.equal(
    buildSelectExpression(segs, 5),
    'between(t,0.380,1.720)+between(t,2.880,3.620)'
  );
  assert.equal(buildSelectExpression([{ start: 0, end: 5 }], 5), null);
  assert.equal(buildSelectExpression([], 5), null);
});

// ---------- Zooms ----------

test('computeZoomTimes : débuts de phrase et emphases, espacés', () => {
  const words = [
    w('Hello.', 0, 0.5),
    w('Big', 1.5, 1.8),
    w('news', 1.8, 2),
    w('today.', 2, 2.5),
    w('We', 3, 3.2),
    w('made', 3.2, 3.4),
    w('100', 3.4, 3.8),
    w('sales!', 6, 6.4),
    w('Wow.', 7, 7.3),
    w('End', 9, 9.2)
  ];
  assert.deepEqual(computeZoomTimes(words, 10), [1.5, 6, 9]);
});
