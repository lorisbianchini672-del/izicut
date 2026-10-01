/**
 * ============================================================
 * format.test.ts — Tests des formats d'affichage
 * ------------------------------------------------------------
 * Exécution : node --test lib/format.test.ts
 * ============================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  creditUsagePercent,
  formatDuration,
  formatRelativeDate,
  minutesToSeconds,
  projectStatusTone,
  secondsToMinutes
} from './format.ts';

test('formatDuration affiche minutes/secondes puis heures/minutes', () => {
  assert.equal(formatDuration(50), '50s');
  assert.equal(formatDuration(2450), '40m 50s');
  assert.equal(formatDuration(3600), '1h 00m');
  assert.equal(formatDuration(7385), '2h 03m');
});

test('formatDuration résiste aux durées absentes ou inexploitables', () => {
  for (const value of [null, undefined, 0, -12, NaN, Infinity]) {
    assert.equal(formatDuration(value), '—', `valeur ${String(value)}`);
  }
});

test('secondsToMinutes et minutesToSeconds sont cohérents', () => {
  assert.equal(secondsToMinutes(0), 0);
  assert.equal(secondsToMinutes(1), 1);
  assert.equal(secondsToMinutes(1800), 30);
  assert.equal(minutesToSeconds(30), 1800);
  assert.equal(minutesToSeconds(0), 0);
});

test('creditUsagePercent borne la jauge entre 0 et 100', () => {
  assert.equal(creditUsagePercent(900, 1800), 50);
  assert.equal(creditUsagePercent(0, 1800), 0);
  assert.equal(creditUsagePercent(5000, 1800), 100);
  // Quota inconnu : jauge vide, jamais pleine.
  assert.equal(creditUsagePercent(600, 0), 0);
});

test('formatRelativeDate produit un libellé français lisible', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  assert.equal(formatRelativeDate('2026-09-24T11:59:30.000Z', now), 'À l’instant');
  assert.equal(formatRelativeDate('2026-09-24T11:45:00.000Z', now), 'Il y a 15 min');
  assert.equal(formatRelativeDate('2026-09-24T11:00:00.000Z', now), 'Il y a 1 heure');
  assert.equal(formatRelativeDate('2026-09-24T09:00:00.000Z', now), 'Il y a 3 heures');
  assert.equal(formatRelativeDate('2026-09-23T12:00:00.000Z', now), 'Il y a 1 jour');
  assert.equal(formatRelativeDate('2026-09-20T12:00:00.000Z', now), 'Il y a 4 jours');
});

test('formatRelativeDate bascule en date courte au-delà d’une semaine', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  const label = formatRelativeDate('2026-09-01T12:00:00.000Z', now);
  assert.match(label, /^01\/09\/2026$/);
  // Une date illisible ou future ne casse pas l'affichage.
  assert.equal(formatRelativeDate('pas-une-date', now), '—');
  assert.equal(formatRelativeDate('2026-09-25T12:00:00.000Z', now), 'À l’instant');
});

test('projectStatusTone classe les statuts par tonalité', () => {
  assert.equal(projectStatusTone('completed'), 'ready');
  assert.equal(projectStatusTone('transcribing'), 'working');
  assert.equal(projectStatusTone('analyzing'), 'working');
  assert.equal(projectStatusTone('error'), 'error');
  for (const status of ['draft', 'uploading', 'processing_audio']) {
    assert.equal(projectStatusTone(status), 'queued', status);
  }
});
