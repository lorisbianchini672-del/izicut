/**
 * ============================================================
 * worker/index.js — Boucle principale du worker IziCut
 * ------------------------------------------------------------
 * Service SÉPARÉ de Next.js (voir docs/ARCHITECTURE.md §2) :
 * ffmpeg, yt-dlp et Chromium n'existent pas dans une Vercel
 * Function. Déploiement : image Docker (worker/Dockerfile).
 *
 * Fonctionnement :
 *   1. claim_render_job(worker-name) — RPC SKIP LOCKED : plusieurs
 *      workers peuvent tourner en parallèle sans se voler les jobs.
 *   2. processJob(job) — ingest/transcribe/analyze/render.
 *   3. complete_render_job / fail_render_job — fail gère les
 *      tentatives et le remboursement des crédits.
 *
 * Lancement : npm run worker (continu) ou --once (vide la file puis
 * s'arrête ; utile en cron / CI / debug).
 * ============================================================
 */
import './load-env.js'; // doit rester le premier import (voir load-env.js)
import { friendlyError } from './friendly-error.js';
import { setTimeout as sleep } from 'node:timers/promises';

import { createSupabase, getRemotionBundle, processJob } from './pipeline.js';

const WORKER_NAME =
  process.env.WORKER_NAME ?? `worker-${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2));
const ONCE = process.argv.includes('--once');

// ------------------------------------------------------------
// Pool de traitement : au plus CONCURRENCY jobs simultanés.
// ------------------------------------------------------------
let running = new Set();
let stopping = false;

async function tryClaimAndRun(supabase) {
  if (running.size >= CONCURRENCY || stopping) return false;

  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_render_job',
    { p_worker_name: WORKER_NAME }
  );

  if (claimError) {
    console.error('[worker] claim_render_job :', claimError.message);
    return false;
  }
  // La RPC renvoie un enregistrement composite : quand la file est vide,
  // Postgres rend une ligne dont tous les champs sont NULL (et selon le
  // client, parfois un tableau). Aucun id = aucun job.
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job || !job.id) return false;

  const id = job.id;
  console.log(`[worker] ${WORKER_NAME} ▶ job ${id} (${job.kind}) projet ${job.project_id ?? '—'}`);

  const task = (async () => {
    try {
      const { outputPath } = await processJob(job);
      const { error } = await supabase.rpc('complete_render_job', {
        p_job_id: id,
        p_output_path: outputPath ?? null,
      });
      if (error) throw error;
      console.log(`[worker] ✔ job ${id} terminé${outputPath ? ` → ${outputPath}` : ''}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] ✖ job ${id} : ${message}`);
      const { error: failError } = await supabase.rpc('fail_render_job', {
        p_job_id: id,
        p_error: friendlyError(message),
      });
      if (failError) {
        console.error(`[worker] fail_render_job : ${failError.message}`);
      }
    }
  })().finally(() => {
    running.delete(task);
  });

  running.add(task);
  return true;
}

async function main() {
  console.log(`[worker] ${WORKER_NAME} démarré (concurrence ${CONCURRENCY}, poll ${POLL_MS} ms${ONCE ? ', mode --once' : ''})`);
  const supabase = createSupabase();
  // Pré-compile le moteur de rendu en arrière-plan : le premier clip
  // exporté n'attend plus la compilation.
  if (!ONCE) getRemotionBundle().catch((err) => console.warn(`[worker] pré-compilation du rendu : ${err.message}`));

  let idleLoops = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (stopping) break;

    let claimed = false;
    try {
      // On tente de remplir le pool : plusieurs claims par tour.
      for (let i = running.size; i < CONCURRENCY; i++) {
        if (await tryClaimAndRun(supabase)) claimed = true;
      }
    } catch (err) {
      console.error('[worker] boucle :', err instanceof Error ? err.message : err);
    }

    if (ONCE) {
      if (claimed || running.size > 0) {
        idleLoops = 0;
        // Laisse les tâches courantes progresser avant le prochain tour.
        if (running.size > 0) await Promise.race(running);
        continue;
      }
      // File vide : attente courte puis re-scrutation (un job peut
      // être remis en file par un autre worker en échec).
      idleLoops++;
      if (idleLoops >= 2) {
        console.log('[worker] file vide — arrêt (--once)');
        break;
      }
      await sleep(2000);
      continue;
    }

    if (!claimed && running.size === 0) {
      await sleep(POLL_MS);
    } else if (running.size > 0) {
      // Un job finit avant de re-scanner : limite les claims inutiles.
      await Promise.race(running);
    } else {
      await sleep(250);
    }
  }

  await Promise.allSettled([...running]);
  console.log(`[worker] ${WORKER_NAME} arrêté proprement`);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[worker] ${signal} reçu — arrêt après les jobs en cours…`);
  });
}

main().catch((err) => {
  console.error('[worker] erreur fatale :', err);
  process.exit(1);
});
