/**
 * scripts/smoke-worker.mjs — Vérifie que le worker se charge :
 * syntaxe, import ESM de pipeline.js et du module TS timestamps.ts.
 * Aucun accès réseau, aucune clé requise.
 * Résultat écrit dans scripts/smoke-worker.out.txt (journal).
 */
import { appendFileSync, writeFileSync } from 'node:fs';

const out = [];
try {
  const pipeline = await import('../worker/pipeline.js');
  const { default: assert } = await import('node:assert');

  for (const name of ['processJob', 'runIngest', 'runTranscribe', 'runAnalyze', 'runRender', 'createSupabase']) {
    assert.equal(typeof pipeline[name], 'function', `${name} manquant`);
  }

  // Import indirect : prouve que timestamps.ts se charge (type stripping).
  const timestamps = await import('../worker/timestamps.ts');
  assert.equal(typeof timestamps.buildSrt, 'function', 'buildSrt manquant');

  const cue = timestamps.buildSrt([{ word: 'bonjour', start: 0, end: 0.4 }]);
  assert.ok(cue.includes('00:00:00,000 --> 00:00:00,400'), 'SRT invalide');

  out.push('✅ worker/pipeline.js + worker/timestamps.ts se chargent');
  out.push('Exports : ' + Object.keys(pipeline).join(', '));
  writeFileSync(new URL('./smoke-worker.out.txt', import.meta.url), out.join('\n') + '\n');
  console.log(out.join('\n'));
} catch (err) {
  out.push('❌ ÉCHEC : ' + (err instanceof Error ? err.stack : String(err)));
  writeFileSync(new URL('./smoke-worker.out.txt', import.meta.url), out.join('\n') + '\n');
  console.error(out[0]);
  process.exit(1);
}
