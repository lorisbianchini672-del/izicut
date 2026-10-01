import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhisperCppJson, useLocalAi } from './local-ai.js';

test('parseWhisperCppJson : un mot par segment, secondes, jetons spéciaux ignorés', () => {
  const words = parseWhisperCppJson({
    transcription: [
      { offsets: { from: 0, to: 0 }, text: '[_BEG_]' },
      { offsets: { from: 120, to: 480 }, text: ' Bonjour' },
      { offsets: { from: 480, to: 500 }, text: ',' },
      { offsets: { from: 520, to: 900 }, text: ' tout' },
      { offsets: { from: 900, to: 1400 }, text: ' le monde' },
      { offsets: { from: 1400, to: 2000 }, text: ' [Musique]' },
      { offsets: { from: 2000, to: 2000 }, text: ' !' },
    ],
  });
  assert.deepEqual(words.map((w) => w.word), ['Bonjour,', 'tout', 'le monde!']);
  assert.equal(words[0].start, 0.12);
  assert.equal(words[0].end, 0.5);
  assert.ok(words.every((w) => w.end > w.start));
});

test('parseWhisperCppJson : entrée vide ou invalide → aucun mot', () => {
  assert.deepEqual(parseWhisperCppJson({}), []);
  assert.deepEqual(parseWhisperCppJson(null), []);
});

test('useLocalAi : auto = local sans clé, OpenAI avec clé', () => {
  assert.equal(useLocalAi(''), true);
  assert.equal(useLocalAi('sk-test'), false);
});
