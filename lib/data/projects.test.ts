/**
 * ============================================================
 * projects.test.ts — Tests de la couche de lecture Supabase
 * ------------------------------------------------------------
 * Exécution : node --test lib/data/projects.test.ts
 * Aucun réseau : le client Supabase est un faux qui enregistre
 * la requête construite et rend la réponse qu'on lui dicte.
 *
 * Ce qui est vérifié ici, c'est la promesse du module : une ligne
 * PostgREST n'est JAMAIS crue sur parole (statut inconnu, colonne
 * absente, JSON de transcription abîmé) et une erreur de requête
 * dégrade l'affichage au lieu de le casser.
 * ============================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DASHBOARD_PROJECT_LIMIT,
  createClipSignedUrl,
  fetchDashboardProjects,
  fetchMonthlyUsage,
  fetchProfileCredits,
  fetchProjectDetail
} from './projects.ts';

/* ------------------------------------------------------------------
 * Faux client Supabase
 * ------------------------------------------------------------------
 * `responses` : une réponse par appel à `.from()`, dans l'ordre.
 * Chaque maillon de la chaîne (`select`, `eq`, `order`, …) se renvoie
 * lui-même et note son nom ; le maillon final est soit `maybeSingle()`,
 * soit la chaîne elle-même, rendue « thenable » pour être awaitée.
 * ------------------------------------------------------------------ */
type Response = { data?: unknown; error?: unknown };

function makeSupabase(responses: Response[]) {
  const calls: { table: string; chain: [string, unknown[]][] }[] = [];
  let index = 0;

  const from = (table: string) => {
    const response = responses[index++] ?? { data: null, error: null };
    const entry: { table: string; chain: [string, unknown[]][] } = { table, chain: [] };
    calls.push(entry);

    const settled = { data: response.data ?? null, error: response.error ?? null };

    const builder: Record<string, unknown> = {
      then: (resolve: (value: typeof settled) => unknown) => Promise.resolve(settled).then(resolve),
      maybeSingle: (...args: unknown[]) => {
        entry.chain.push(['maybeSingle', args]);
        return Promise.resolve(settled);
      }
    };

    for (const method of ['select', 'eq', 'order', 'limit', 'lt', 'gte']) {
      builder[method] = (...args: unknown[]) => {
        entry.chain.push([method, args]);
        return builder;
      };
    }

    return builder;
  };

  const storageCalls: { bucket: string; args: unknown[] }[] = [];
  const storage = {
    from: (bucket: string) => ({
      createSignedUrl: (...args: unknown[]) => {
        storageCalls.push({ bucket, args });
        const response = responses[index++] ?? { data: null, error: null };
        return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
      }
    })
  };

  // Le module ne consomme qu'une poignée de méthodes : le cast évite de
  // réimplémenter toute la surface de SupabaseClient pour trois appels.
  return { client: { from, storage } as never, calls, storageCalls };
}

/** Retrouve les arguments d'un maillon de la chaîne (ex. le `.eq()` posé). */
function argsOf(call: { chain: [string, unknown[]][] }, method: string): unknown[] | null {
  return call.chain.find(([name]) => name === method)?.[1] ?? null;
}

/* ------------------------------------------------------------------
 * fetchProfileCredits
 * ------------------------------------------------------------------ */

test('fetchProfileCredits lit le solde du profil demandé', async () => {
  const { client, calls } = makeSupabase([
    { data: { video_credits_seconds: 1800, subscription_status: 'active' } }
  ]);

  const credits = await fetchProfileCredits(client, 'user-1');

  assert.deepEqual(credits, { balanceSeconds: 1800, subscriptionStatus: 'active' });
  assert.equal(calls[0].table, 'profiles');
  assert.deepEqual(argsOf(calls[0], 'eq'), ['id', 'user-1']);
  assert.ok(argsOf(calls[0], 'maybeSingle'), 'le profil est lu via maybeSingle');
});

test('fetchProfileCredits comble un profil incomplet sans planter', async () => {
  const { client } = makeSupabase([{ data: {} }]);

  assert.deepEqual(await fetchProfileCredits(client, 'user-1'), {
    balanceSeconds: 0,
    subscriptionStatus: 'inactive'
  });
});

test('fetchProfileCredits renvoie null quand la requête échoue', async () => {
  const onError = makeSupabase([{ error: { message: 'RLS' } }]);
  assert.equal(await fetchProfileCredits(onError.client, 'user-1'), null);

  const onEmpty = makeSupabase([{ data: null }]);
  assert.equal(await fetchProfileCredits(onEmpty.client, 'user-1'), null);
});

/* ------------------------------------------------------------------
 * fetchDashboardProjects
 * ------------------------------------------------------------------ */

test('fetchDashboardProjects déduit le nombre de clips et le meilleur score', async () => {
  const { client, calls } = makeSupabase([
    {
      data: [
        {
          id: 'p1',
          title: 'Podcast #12',
          source_type: 'external_url',
          source_url: 'https://youtu.be/abc',
          status: 'completed',
          duration_seconds: 2450,
          error_message: '',
          created_at: '2026-09-24T12:00:00.000Z',
          clips: [
            { id: 'c1', virality_score: 71 },
            { id: 'c2', virality_score: 88 },
            { id: 'c3', virality_score: 'illisible' }
          ]
        }
      ]
    }
  ]);

  const [project] = await fetchDashboardProjects(client);

  assert.equal(project.id, 'p1');
  assert.equal(project.sourceType, 'external_url');
  assert.equal(project.sourceUrl, 'https://youtu.be/abc');
  assert.equal(project.status, 'completed');
  assert.equal(project.durationSeconds, 2450);
  assert.equal(project.clipsCount, 3);
  // Le score illisible est écarté du maximum, pas du décompte.
  assert.equal(project.bestScore, 88);
  // Une chaîne vide n'est pas un message d'erreur.
  assert.equal(project.errorMessage, null);

  assert.equal(calls[0].table, 'projects');
  assert.match(String(argsOf(calls[0], 'select')?.[0]), /clips \( id, virality_score \)/);
  assert.deepEqual(argsOf(calls[0], 'order'), ['created_at', { ascending: false }]);
  assert.deepEqual(argsOf(calls[0], 'limit'), [DASHBOARD_PROJECT_LIMIT]);
});

test('fetchDashboardProjects reste affichable sur une ligne dégradée', async () => {
  const { client } = makeSupabase([
    { data: [{ id: 'p2', status: 'statut_inventé', source_type: 'ftp', clips: null }] }
  ]);

  const [project] = await fetchDashboardProjects(client);

  assert.equal(project.title, 'Vidéo sans titre');
  // Un statut inconnu ne doit pas faire disparaître le projet du tableau.
  assert.equal(project.status, 'draft');
  assert.equal(project.sourceType, 'upload_gallery');
  assert.equal(project.clipsCount, 0);
  assert.equal(project.bestScore, null);
  assert.equal(project.durationSeconds, null);
});

test('fetchDashboardProjects rend une liste vide plutôt qu’une erreur', async () => {
  const onError = makeSupabase([{ error: { message: 'timeout' } }]);
  assert.deepEqual(await fetchDashboardProjects(onError.client), []);

  const onNull = makeSupabase([{ data: null }]);
  assert.deepEqual(await fetchDashboardProjects(onNull.client), []);
});

test('fetchDashboardProjects transmet la limite demandée', async () => {
  const { client, calls } = makeSupabase([{ data: [] }]);
  await fetchDashboardProjects(client, 5);
  assert.deepEqual(argsOf(calls[0], 'limit'), [5]);
});

/* ------------------------------------------------------------------
 * fetchProjectDetail
 * ------------------------------------------------------------------ */

test('fetchProjectDetail assemble le projet et ses clips', async () => {
  const { client, calls } = makeSupabase([
    {
      data: {
        id: 'p1',
        title: 'Podcast #12',
        source_type: 'upload_gallery',
        status: 'completed',
        duration_seconds: 2450,
        created_at: '2026-09-24T12:00:00.000Z'
      }
    },
    {
      data: [
        {
          id: 'c1',
          title: 'Le moment fort',
          hook_text: 'Tu ne vas pas le croire',
          summary: 'Résumé',
          start_time: 120.5,
          end_time: 168.2,
          virality_score: 88,
          status: 'ready',
          rendered_storage_path: 'user-1/c1.mp4',
          transcript_json: {
            words: [
              { word: 'Tu', start: 0, end: 0.2 },
              { word: 'ne', start: 0.2, end: 0.4 }
            ]
          }
        }
      ]
    }
  ]);

  const detail = await fetchProjectDetail(client, 'p1');
  assert.ok(detail);

  assert.equal(detail.project.title, 'Podcast #12');
  assert.equal(detail.clips.length, 1);
  assert.equal(detail.clips[0].startTime, 120.5);
  assert.equal(detail.clips[0].renderedStoragePath, 'user-1/c1.mp4');
  assert.deepEqual(detail.clips[0].words, [
    { word: 'Tu', start: 0, end: 0.2 },
    { word: 'ne', start: 0.2, end: 0.4 }
  ]);

  assert.deepEqual(argsOf(calls[0], 'eq'), ['id', 'p1']);
  assert.equal(calls[1].table, 'clips');
  assert.deepEqual(argsOf(calls[1], 'eq'), ['project_id', 'p1']);
  // Le meilleur clip est présenté en premier : le tri vient du serveur.
  assert.deepEqual(argsOf(calls[1], 'order'), ['virality_score', { ascending: false }]);
});

test('fetchProjectDetail écarte les mots de transcription inexploitables', async () => {
  const { client } = makeSupabase([
    { data: { id: 'p1' } },
    {
      data: [
        {
          id: 'c1',
          transcript_json: {
            words: [
              { word: 'ok', start: 1, end: 1.4 },
              { word: '', start: 2, end: 2.4 },
              { word: 'sans-fin', start: 3 },
              { word: 'texte-manquant', start: 'a', end: 4 },
              'pas-un-objet'
            ]
          }
        }
      ]
    }
  ]);

  const detail = await fetchProjectDetail(client, 'p1');
  assert.ok(detail);
  assert.deepEqual(detail.clips[0].words, [{ word: 'ok', start: 1, end: 1.4 }]);
  // Le clip survit à un titre absent.
  assert.equal(detail.clips[0].title, 'Clip sans titre');
  assert.equal(detail.clips[0].status, 'suggested');
});

test('fetchProjectDetail supporte un transcript_json absent ou malformé', async () => {
  for (const transcript of [null, undefined, {}, { words: 'nope' }, 42]) {
    const { client } = makeSupabase([
      { data: { id: 'p1' } },
      { data: [{ id: 'c1', transcript_json: transcript }] }
    ]);

    const detail = await fetchProjectDetail(client, 'p1');
    assert.ok(detail);
    assert.deepEqual(detail.clips[0].words, [], `transcript ${String(transcript)}`);
  }
});

test('fetchProjectDetail renvoie null si le projet est introuvable', async () => {
  const missing = makeSupabase([{ data: null }]);
  assert.equal(await fetchProjectDetail(missing.client, 'p1'), null);

  const denied = makeSupabase([{ error: { message: 'RLS' } }]);
  assert.equal(await fetchProjectDetail(denied.client, 'p1'), null);
});

test('fetchProjectDetail renvoie null si les clips sont illisibles', async () => {
  const { client } = makeSupabase([{ data: { id: 'p1' } }, { error: { message: 'timeout' } }]);
  assert.equal(await fetchProjectDetail(client, 'p1'), null);
});

test('fetchProjectDetail accepte un projet encore sans clip', async () => {
  const { client } = makeSupabase([{ data: { id: 'p1' } }, { data: null }]);

  const detail = await fetchProjectDetail(client, 'p1');
  assert.ok(detail);
  assert.deepEqual(detail.clips, []);
});

/* ------------------------------------------------------------------
 * fetchMonthlyUsage
 * ------------------------------------------------------------------ */

test('fetchMonthlyUsage additionne les débits en valeur absolue', async () => {
  const { client, calls } = makeSupabase([
    { data: [{ delta_seconds: -600 }, { delta_seconds: -1200 }, { delta_seconds: 'abc' }] }
  ]);

  assert.equal(await fetchMonthlyUsage(client, 'user-1'), 1800);
  assert.equal(calls[0].table, 'credit_ledger');
  assert.deepEqual(argsOf(calls[0], 'eq'), ['user_id', 'user-1']);
  // Seuls les débits comptent : un crédit offert n'est pas de la consommation.
  assert.deepEqual(argsOf(calls[0], 'lt'), ['delta_seconds', 0]);
});

test('fetchMonthlyUsage borne la fenêtre sur le nombre de jours demandé', async () => {
  const { client, calls } = makeSupabase([{ data: [] }]);

  const before = Date.now();
  await fetchMonthlyUsage(client, 'user-1', 7);
  const after = Date.now();

  const [column, since] = argsOf(calls[0], 'gte') as [string, string];
  assert.equal(column, 'created_at');
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const parsed = Date.parse(since);
  assert.ok(parsed >= before - sevenDays && parsed <= after - sevenDays, `borne ${since}`);
});

test('fetchMonthlyUsage renvoie 0 quand le journal est illisible', async () => {
  const onError = makeSupabase([{ error: { message: 'RLS' } }]);
  assert.equal(await fetchMonthlyUsage(onError.client, 'user-1'), 0);

  const onEmpty = makeSupabase([{ data: [] }]);
  assert.equal(await fetchMonthlyUsage(onEmpty.client, 'user-1'), 0);
});

/* ------------------------------------------------------------------
 * createClipSignedUrl
 * ------------------------------------------------------------------ */

test('createClipSignedUrl signe le rendu dans le bucket privé', async () => {
  const { client, storageCalls } = makeSupabase([
    { data: { signedUrl: 'https://storage/clip.mp4?token=x' } }
  ]);

  const url = await createClipSignedUrl(client, 'user-1/c1.mp4');

  assert.equal(url, 'https://storage/clip.mp4?token=x');
  assert.equal(storageCalls[0].bucket, 'clips');
  assert.deepEqual(storageCalls[0].args, ['user-1/c1.mp4', 3600]);
});

test('createClipSignedUrl transmet la durée de validité demandée', async () => {
  const { client, storageCalls } = makeSupabase([{ data: { signedUrl: 'https://storage/x' } }]);
  await createClipSignedUrl(client, 'user-1/c1.mp4', 60);
  assert.deepEqual(storageCalls[0].args, ['user-1/c1.mp4', 60]);
});

test('createClipSignedUrl ne sollicite pas le stockage sans chemin', async () => {
  const { client, storageCalls } = makeSupabase([]);
  assert.equal(await createClipSignedUrl(client, ''), null);
  assert.equal(storageCalls.length, 0);
});

test('createClipSignedUrl renvoie null si la signature échoue', async () => {
  const onError = makeSupabase([{ error: { message: 'not found' } }]);
  assert.equal(await createClipSignedUrl(onError.client, 'user-1/c1.mp4'), null);

  const onEmpty = makeSupabase([{ data: {} }]);
  assert.equal(await createClipSignedUrl(onEmpty.client, 'user-1/c1.mp4'), null);
});
