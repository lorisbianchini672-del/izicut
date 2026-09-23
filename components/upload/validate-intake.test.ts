/**
 * ============================================================
 * validate-intake.test.ts — Tests des règles de prise en charge
 * ------------------------------------------------------------
 * Exécution : node --test components/upload/validate-intake.test.ts
 * Zéro dépendance, zéro réseau, quelques millisecondes.
 * ============================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_UPLOAD_BYTES,
  formatFileSize,
  validateVideoFile,
  validateVideoUrl
} from './validate-intake.ts';

test('validateVideoUrl accepte YouTube et les rediffusions Twitch', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'http://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/abcdef',
    'https://www.youtube.com/live/abcdef?si=x',
    'https://www.twitch.tv/videos/123456789'
  ]) {
    assert.equal(validateVideoUrl(url), null, url);
  }
});

test('validateVideoUrl refuse le vide et les plateformes inconnues', () => {
  assert.match(validateVideoUrl('   ') ?? '', /Collez le lien/);
  assert.match(validateVideoUrl('https://vimeo.com/123') ?? '', /YouTube/);
  assert.match(validateVideoUrl('https://www.twitch.tv/chaine-en-direct') ?? '', /YouTube/);
});

test('validateVideoFile accepte les formats annoncés jusqu’à 10 Go', () => {
  for (const name of ['video.mp4', 'VIDEO.MOV', 'clip.webm', 'film.mkv']) {
    assert.equal(
      validateVideoFile({ name, size: MAX_UPLOAD_BYTES }),
      null,
      `${name} à la limite doit passer`
    );
  }
});

test('validateVideoFile refuse extension, poids ou fichier vide', () => {
  assert.match(validateVideoFile({ name: 'video.avi', size: 100 }) ?? '', /MP4/);
  assert.match(
    validateVideoFile({ name: 'video.mp4', size: MAX_UPLOAD_BYTES + 1 }) ?? '',
    /10 Go/
  );
  assert.match(validateVideoFile({ name: 'video.mp4', size: 0 }) ?? '', /vide/);
});

test('formatFileSize affiche en français', () => {
  assert.equal(formatFileSize(0), '0 o');
  assert.equal(formatFileSize(512), '512 o');
  assert.equal(formatFileSize(1536), '1,5 Ko');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5 Mo');
});
