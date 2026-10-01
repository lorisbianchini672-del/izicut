/**
 * ============================================================
 * pipeline-cost.test.ts — Tests du coût de dépôt
 * ------------------------------------------------------------
 * Exécution : node --test lib/pipeline-cost.test.ts
 * Zéro dépendance, zéro réseau, quelques millisecondes.
 * ============================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SOURCE_SECONDS,
  MAX_SOURCE_SECONDS,
  estimateCostSeconds,
  normalizeSourceSeconds
} from './pipeline-cost.ts';

test('normalizeSourceSeconds retient une durée annoncée crédible', () => {
  assert.equal(normalizeSourceSeconds(642, 'upload_gallery'), 642);
  assert.equal(normalizeSourceSeconds(642.4, 'upload_gallery'), 642);
});

test('normalizeSourceSeconds retombe sur le défaut quand la durée est inexploitable', () => {
  for (const value of [undefined, null, 0, 0.4, -30, NaN, Infinity, 'abc', {}]) {
    assert.equal(
      normalizeSourceSeconds(value, 'upload_gallery'),
      DEFAULT_SOURCE_SECONDS.upload_gallery,
      `valeur ${String(value)}`
    );
    assert.equal(
      normalizeSourceSeconds(value, 'external_url'),
      DEFAULT_SOURCE_SECONDS.external_url,
      `valeur ${String(value)}`
    );
  }
});

test('normalizeSourceSeconds plafonne une durée aberrante à 4 h', () => {
  assert.equal(normalizeSourceSeconds(48 * 3600, 'external_url'), MAX_SOURCE_SECONDS);
});

test('estimateCostSeconds applique la marge de 20 % à la durée annoncée', () => {
  assert.equal(estimateCostSeconds(300, 'upload_gallery'), 360);
  assert.equal(estimateCostSeconds(600, 'external_url'), 720);
});

test('estimateCostSeconds arrondit au supérieur, jamais en dessous', () => {
  // 10,5 s sont d’abord arrondis à 11 s (la durée est un entier en base),
  // puis majorés de 20 % : 13,2 s → 14 s réservées.
  assert.equal(estimateCostSeconds(10.5, 'upload_gallery'), 14);
  assert.equal(estimateCostSeconds(10.4, 'upload_gallery'), 12);
});

test('estimateCostSeconds ne réserve jamais 0 s, même sur une source minuscule', () => {
  // 0,1 s est un bruit de mesure : on retombe sur la durée par défaut.
  assert.equal(estimateCostSeconds(0.1, 'upload_gallery'), 360);
  assert.ok(estimateCostSeconds(0, 'external_url') >= 1);
});

test('estimateCostSeconds reste dans les clous des offres', () => {
  // Une source de 20 min sur Free (1800 s offertes) doit passer.
  assert.ok(estimateCostSeconds(20 * 60, 'upload_gallery') <= 1800);
  // Une source de 4 h dépasse Free, mais reste dans l'offre Agency (36 000 s).
  assert.ok(estimateCostSeconds(MAX_SOURCE_SECONDS, 'external_url') <= 36_000);
});
