/**
 * ============================================================
 * worker/pipeline.js — Les quatre étapes d'un job vidéo
 * ------------------------------------------------------------
 * JS pur (aucun build) : exécuté par Node directement. Les fonctions
 * PURE de recalage horodatage viennent de ./timestamps.ts (type
 * stripping natif : Node ≥ 22.6 avec --experimental-strip-types).
 *
 * Invariants :
 *  - la source ne quitte JAMAIS Storage en URL publique : URL signée
 *    courte, téléchargée dans un répertoire temporaire ;
 *  - chaque étape met à jour render_jobs.progress : un utilisateur
 *    qui attend sans retour se croit bloqué (ARCHITECTURE.md §7).
 * ============================================================
 */
import { spawn } from 'node:child_process';
import { useLocalAi, transcribeFileLocal, chatJsonLocal, localConfig } from './local-ai.js';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  planChunks,
  mergeChunkWords,
  wordsInRange,
  buildSrt,
} from './timestamps.ts';
import {
  buildSelectExpression,
  buildTimedTranscript,
  computeKeepSegments,
  computeZoomTimes,
  keptDuration,
  remapWords,
  snapClipBounds,
} from './edit-plan.ts';
import {
  ENTITLEMENTS,
  defaultSettingsForTier,
  overlaySignature,
  resolvePlanTier,
  sanitizeRenderSettings,
} from '../lib/entitlements.ts';

// ---------- Configuration (injectée par worker/index.js) ----------
export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  // Groq : API compatible OpenAI, offre gratuite (Whisper + modèles texte).
  groqKey: process.env.GROQ_API_KEY ?? '',
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? '',
  analyzeModel: process.env.OPENAI_ANALYZE_MODEL ?? '',
  ffmpeg: process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg',
  ffprobe: process.env.FFPROBE_PATH ?? '',
  ytdlp: process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp',
  // Serveur 24h/24 : YouTube bloque souvent les IP de datacenter.
  // YTDLP_COOKIES_B64 = fichier cookies.txt (format Netscape) encodé base64,
  // YTDLP_COOKIES_FILE = chemin d'un cookies.txt, YTDLP_PROXY = proxy http(s).
  ytdlpCookiesB64: process.env.YTDLP_COOKIES_B64 ?? '',
  ytdlpCookiesFile: process.env.YTDLP_COOKIES_FILE ?? '',
  ytdlpProxy: process.env.YTDLP_PROXY ?? '',
};

/**
 * Fournisseur d'IA distant : OpenAI (payant) ou Groq (gratuit, limites
 * par minute). AI_PROVIDER=groq force Groq ; en « auto », Groq est pris
 * quand seule GROQ_API_KEY est renseignée.
 */
export function remoteAi() {
  const provider = (process.env.AI_PROVIDER ?? 'auto').toLowerCase();
  const groq = provider === 'groq' || (provider !== 'openai' && !config.openaiKey && !!config.groqKey);
  if (groq) {
    return {
      name: 'groq',
      base: 'https://api.groq.com/openai/v1',
      key: config.groqKey,
      transcribeModel: config.transcribeModel || 'whisper-large-v3-turbo',
      analyzeModel: config.analyzeModel || 'openai/gpt-oss-120b',
      // Offre gratuite : ~8 000 jetons/minute → fenêtres de transcription courtes.
      windowChars: 14000,
    };
  }
  return {
    name: 'openai',
    base: 'https://api.openai.com/v1',
    key: config.openaiKey,
    transcribeModel: config.transcribeModel || 'whisper-1',
    analyzeModel: config.analyzeModel || 'gpt-4o-mini',
    windowChars: 60000,
  };
}

/** Clé de l'IA distante configurée (vide = IA locale). */
function remoteKey() {
  return config.openaiKey || config.groqKey;
}

let cookiesPathPromise = null;
/** Arguments yt-dlp supplémentaires (cookies / proxy), calculés une fois. */
async function ytdlpAuthArgs() {
  const args = [];
  if (config.ytdlpProxy) args.push('--proxy', config.ytdlpProxy);
  if (config.ytdlpCookiesFile) {
    args.push('--cookies', config.ytdlpCookiesFile);
  } else if (config.ytdlpCookiesB64) {
    cookiesPathPromise ??= (async () => {
      const file = path.join(tmpdir(), 'izicut-yt-cookies.txt');
      await writeFile(file, Buffer.from(config.ytdlpCookiesB64, 'base64'), { mode: 0o600 });
      return file;
    })();
    args.push('--cookies', await cookiesPathPromise);
  }
  return args;
}

export function createSupabase() {
  if (!config.supabaseUrl || !config.serviceKey) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour le worker.'
    );
  }
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------- Utilitaires processus ----------
function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
      : null;

    child.stdout.on('data', (d) => {
      stdout += d;
      if (options.onStdout) options.onStdout(d.toString());
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (options.onStderr) options.onStderr(d.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(cmd)} a échoué (code ${code}) : ${stderr.slice(-500)}`));
    });
  });
}

export function ffmpegPath() { return config.ffmpeg; }
export function ffprobePath() {
  return config.ffprobe || config.ffmpeg.replace(/ffmpeg$/, 'ffprobe');
}

/**
 * Offre EFFECTIVE du propriétaire du projet. Lue au moment du traitement
 * (et non à la création du clip) : un abonné qui résilie repasse en Free
 * pour ses rendus suivants. En cas d'erreur de lecture : Free, jamais plus.
 */
export async function fetchUserTier(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan, subscription_status')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return 'free';
  return resolvePlanTier(data.plan, data.subscription_status);
}

/** Mots valides d'un `transcript_json` (données éditables : non fiables). */
function validWords(value) {
  const list = Array.isArray(value?.words) ? value.words : [];
  return list
    .filter(
      (w) =>
        w &&
        typeof w.word === 'string' &&
        w.word.trim() &&
        Number.isFinite(Number(w.start)) &&
        Number.isFinite(Number(w.end))
    )
    .map((w) => ({ word: w.word.slice(0, 60), start: Number(w.start), end: Number(w.end) }))
    .sort((a, b) => a.start - b.start);
}

/** Progression : maj + limitation de débit (une écriture toutes les 4 s). */
export function makeProgressUpdater(supabase, jobId) {
  let last = 0;
  return async (value) => {
    const now = Date.now();
    if (now - last < 4000 && value < 100) return;
    last = now;
    await supabase
      .from('render_jobs')
      .update({ progress: Math.min(100, Math.max(0, Math.round(value))) })
      .eq('id', jobId);
  };
}

// ============================================================
// ÉTAPE 1 — INGEST : source téléchargée + durée + audio extrait
// ============================================================
/**
 * Ingest : source téléchargée, durée mesurée, audio extrait.
 *
 * `withAudio: false` est utilisé par les jobs `render` : ils n'ont besoin
 * que du fichier source, et ne doivent PAS remettre le projet en
 * « transcription » (il est déjà transcrit et analysé).
 */
export async function runIngest(supabase, job, project, options = {}) {
  // audioOnly : l'analyse n'a besoin que du son → téléchargement 10 à 30×
  // plus léger qu'une vidéo 1080p. section : le rendu d'un clip ne
  // télécharge que l'extrait utile (+ marge), pas toute la vidéo.
  const { withAudio = true, audioOnly = false, section = null } = options;
  const workdir = await mkdtemp(path.join(tmpdir(), 'izicut-ingest-'));
  const updateProgress = makeProgressUpdater(supabase, job.id);

  try {
    await updateProgress(2);
    const sourcePath = path.join(workdir, 'source.mp4');

    if (project.source_type === 'external_url') {
      // yt-dlp : uniquement des contenus dont l'utilisateur détient
      // les droits (condition des CGU YouTube — risque juridique réel).
      const formatArgs = audioOnly
        ? ['-f', 'ba/b', '-o', sourcePath]
        : [
            // 1080p suffit pour un rendu 1080×1920 : téléchargement plus rapide.
            '-f', 'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b', '--merge-output-format', 'mp4',
            '-o', sourcePath,
          ];
      const sectionArgs = section
        ? ['--download-sections', `*${section.start.toFixed(2)}-${section.end.toFixed(2)}`, '--force-keyframes-at-cuts']
        : [];
      // YouTube bloque souvent les IP de serveur (« not a bot ») selon le
      // client imité : on essaie plusieurs clients avant d'abandonner.
      const clients = [null, 'tv_simply', 'tv', 'web_safari', 'mweb', 'android_vr', 'web_embedded'];
      let lastErr = null;
      console.log(`[worker] téléchargement ${audioOnly ? 'audio' : section ? 'extrait' : 'vidéo'}${config.ytdlpProxy ? ' via proxy' : ''}…`);
      const t0 = Date.now();
      for (const client of clients) {
        try {
          await run(config.ytdlp, [
            '--no-playlist', '--newline',
            ...(process.env.YTDLP_VERBOSE === '1' ? ['-v'] : []),
            '--concurrent-fragments', '8',
            '--socket-timeout', '20', '--retries', '3',
            // YouTube exige désormais un moteur JavaScript : Node est présent.
            ...(process.env.YTDLP_JS_RUNTIME !== 'none' ? ['--js-runtimes', process.env.YTDLP_JS_RUNTIME || 'node'] : []),
            ...(await ytdlpAuthArgs()),
            ...(client ? ['--extractor-args', `youtube:player_client=${client}`] : []),
            ...formatArgs,
            ...sectionArgs,
            project.source_url,
          ], {
            timeoutMs: (audioOnly || section ? 8 : 30) * 60 * 1000,
            onStderr: (t) => t.split('\n').filter(Boolean).forEach((l) => console.log(`[yt-dlp] ${l.slice(0, 220)}`)),
            onStdout: (() => { let last = 0; return (t) => { if (Date.now() - last > 5000) { last = Date.now(); const l = t.trim().split('\n').pop(); if (l) console.log(`[yt-dlp] ${l.slice(0, 160)}`); } }; })(),
          });
          if (client) console.log(`[worker] yt-dlp OK avec le client « ${client} »`);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const msg = String(err?.message ?? err);
          // Seules les erreurs de blocage/format justifient d'essayer un autre client.
          if (!/not a bot|sign in|confirm|429|403|format is not available|requested format|po token|HTTP Error/i.test(msg)) break;
          console.warn(`[worker] yt-dlp refusé (client ${client ?? 'défaut'}), essai suivant…`);
        }
      }
      if (lastErr) throw lastErr;
      console.log(`[worker] téléchargé en ${Math.round((Date.now() - t0) / 1000)} s`);
    } else if (project.storage_path) {
      // Bucket privé : URL signée courte (1 h), jamais d'objet public.
      const { data, error } = await supabase.storage
        .from('raw-videos')
        .createSignedUrl(project.storage_path, 3600);
      if (error || !data) {
        throw new Error(`URL signée impossible : ${error?.message ?? 'inconnue'}`);
      }
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error(`Téléchargement source : HTTP ${res.status}`);
      await writeFile(sourcePath, Buffer.from(await res.arrayBuffer()));
    } else {
      throw new Error('Projet sans source_url ni storage_path');
    }
    await updateProgress(25);

    // Durée exacte via ffprobe.
    const probe = await run(ffprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', sourcePath,
    ]);
    const durationSeconds = Math.round(parseFloat(probe.trim()));
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(`Durée invalide : ${probe.trim()}`);
    }

    if (withAudio) {
      // Extraction audio : WAV 16 kHz mono (32 ko/s → sous la limite des
      // 25 Mo de Whisper jusqu'à ~13 min par tranche). On ne la lance que
      // si la suite en a besoin : inutile de décoder 40 min d'audio pour
      // un simple rendu de clip.
      await run(config.ffmpeg, [
        '-y', '-i', sourcePath,
        '-ac', '1', '-ar', '16000', '-vn',
        path.join(workdir, 'audio.wav'),
      ], { timeoutMs: 15 * 60 * 1000 });
      await updateProgress(45);

      await supabase
        .from('projects')
        .update({ duration_seconds: durationSeconds, status: 'transcribing' })
        .eq('id', project.id);
    }

    return { workdir, sourcePath, durationSeconds, sectionOffset: section ? section.start : 0 };
  } catch (err) {
    await rm(workdir, { recursive: true, force: true });
    throw err;
  }
}

// ============================================================
// ÉTAPE 2 — TRANSCRIBE : tranches + Whisper + RECALAGE
// ============================================================
// Le point non négociable du pipeline : chaque tranche produit des
// temps RELATIFS à son début ; mergeChunkWords les recolle en une
// timeline absolue cohérente (sinon sous-titres décalés de 600 s).


async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Appel Whisper avec reprise sur 429/5xx (backoff exponentiel). */
async function transcribeChunk(audioBuffer, filename) {
  const ai = remoteAi();
  if (!ai.key) throw new Error(`Clé ${ai.name === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} manquante`);

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);

    const form = new FormData();
    form.append('file', new Blob([audioBuffer]), filename);
    form.append('model', ai.transcribeModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');

    const res = await fetch(`${ai.base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ai.key}` },
      body: form,
    });

    if (res.ok) {
      const data = await res.json();
      let words = (data.words ?? []).map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end ?? w.start + 0.2,
      }));
      // Repli : certains fournisseurs ne renvoient que des segments.
      // On répartit alors les mots du segment à parts égales.
      if (words.length === 0 && Array.isArray(data.segments)) {
        for (const seg of data.segments) {
          const parts = String(seg.text ?? '').trim().split(/\s+/).filter(Boolean);
          const span = Math.max(0.01, (seg.end - seg.start) / Math.max(1, parts.length));
          parts.forEach((word, i) => words.push({ word, start: seg.start + i * span, end: seg.start + (i + 1) * span }));
        }
      }
      if (words.length === 0) {
        console.warn(`[worker] transcription vide (${filename}) — clés: ${Object.keys(data).join(',')} texte: ${String(data.text ?? '').slice(0, 80)}`);
      }
      return words;
    }

    lastError = new Error(`Whisper HTTP ${res.status}`);
    // Reprise UNIQUEMENT sur quota/surchARGE : une 401 ne se rejoue pas.
    if (res.status !== 429 && res.status < 500) break;
  }
  throw lastError;
}

export async function runTranscribe(supabase, job, project, ctx) {
  const { workdir, durationSeconds } = ctx;
  const updateProgress = makeProgressUpdater(supabase, job.id);

  // Plan de découpage sous la limite de 25 Mo (module pur, testé).
  // Tranches de 5 min max (MP3 48 kb/s ≈ 1,8 Mo) : plus de parallélisme.
  const chunks = planChunks(durationSeconds, { maxDurationSeconds: 300, bytesPerSecond: 6000 });
  const audioFile = path.join(workdir, 'audio.wav');

  let allWords = [];
  if (useLocalAi(remoteKey())) {
    // whisper.cpp gère les fichiers longs : pas de découpage nécessaire,
    // les horodatages sont donc déjà absolus.
    console.log(`[worker] transcription locale (whisper.cpp, ${path.basename(localConfig.whisperModel)})`);
    await updateProgress(50);
    allWords = await transcribeFileLocal(audioFile, durationSeconds);
    await updateProgress(80);
  } else {
    // Tranches compressées (MP3 mono 48 kb/s : ~10× plus léger que le WAV,
    // envoi bien plus rapide) et transcrites EN PARALLÈLE (3 à la fois).
    const results = new Array(chunks.length);
    let done = 0;
    const queue = [...chunks];
    const workerCount = Math.min(3, chunks.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const chunk = queue.shift();
        const chunkPath = path.join(workdir, `chunk_${String(chunk.index).padStart(3, '0')}.mp3`);
        await run(config.ffmpeg, [
          '-y', '-ss', String(chunk.start), '-t', String(chunk.duration),
          '-i', audioFile,
          '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k',
          chunkPath,
        ]);
        const audio = await readFile(chunkPath);
        results[chunk.index] = await transcribeChunk(audio, path.basename(chunkPath));
        done += 1;
        await updateProgress(45 + Math.round((done / chunks.length) * 35));
      }
    }));
    // RECALAGE OBLIGATOIRE : décalage de chaque tranche + collage, dans l'ordre.
    for (const chunk of chunks) {
      allWords = mergeChunkWords(allWords, { offset: chunk.start, words: results[chunk.index] ?? [] });
    }
  }

  if (allWords.length === 0) {
    throw new Error('Transcription vide : la vidéo contient-elle de la parole ?');
  }

  // Persistance : transcript + SRT de secours (repli si le rendu animé
  // échoue ; un clip avec son SRT reste exploitable).
  const srt = buildSrt(allWords);
  const srtPath = `${project.user_id}/${project.id}/transcript.srt`;
  await supabase.storage
    .from('clips')
    .upload(srtPath, Buffer.from(srt, 'utf8'), { upsert: true, contentType: 'text/plain' });

  const { error: insertError } = await supabase
    .from('transcripts')
    .upsert(
      {
        project_id: project.id,
        words: allWords,
        duration_seconds: durationSeconds,
        language: 'fr',
      },
      { onConflict: 'project_id' }
    );
  if (insertError) throw new Error(`Insertion transcript : ${insertError.message}`);

  await supabase
    .from('projects')
    .update({ status: 'analyzing' })
    .eq('id', project.id);
  await updateProgress(85);

  return { words: allWords };
}

// ============================================================
// ÉTAPE 3 — ANALYZE : sélection virale par GPT-4o-mini
// ============================================================
/** Appel chat JSON distant, avec reprise sur limite de débit (429). */
async function chatJsonRemote(system, user) {
  const ai = remoteAi();
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${ai.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ai.analyzeModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (res.ok) {
      const payload = await res.json();
      return payload.choices?.[0]?.message?.content ?? '{}';
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 20 * (attempt + 1)) * 1000);
      continue;
    }
    throw new Error(`IA HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('IA indisponible (limite de débit atteinte), réessayez plus tard');
}

/** Découpe les mots en fenêtres dont la transcription tient dans maxChars. */
function splitWordsByChars(words, maxChars) {
  const windows = [];
  let current = [];
  let size = 0;
  for (const w of words) {
    const add = String(w.word ?? '').length + 1;
    if (size + add > maxChars * 0.8 && current.length > 0) {
      windows.push(current);
      current = [];
      size = 0;
    }
    current.push(w);
    size += add;
  }
  if (current.length) windows.push(current);
  return windows;
}

function parseClipsJson(rawContent) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Réponse du modèle non JSON : ${String(rawContent).slice(0, 120)}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.clips)) return parsed.clips;
  return Object.values(parsed ?? {}).find(Array.isArray) ?? [];
}

/**
 * Consigne de sélection. Le LLM reçoit une transcription HORODATÉE
 * (« [132.4] phrase… ») : sans ces repères, il ne peut qu'inventer les
 * bornes des clips — c'était le cas avant, d'où des clips à côté du sujet.
 */
function analyzeSystemPrompt(maxClips) {
  return `Tu es monteur senior spécialisé TikTok, Reels et Shorts : tu sais ce qui retient un spectateur dans les 2 premières secondes.
On te donne la transcription d'une vidéo longue. Chaque ligne commence par son instant de début en secondes : « [132.4] texte ».
Sélectionne jusqu'à ${maxClips} extraits AUTONOMES (compréhensibles sans le reste de la vidéo), de 20 à 60 secondes, qui ne se chevauchent pas.
Priorités : accroche forte dès la première phrase (affirmation choc, question, chiffre, conflit, révélation), une seule idée complète, une chute nette.
À éviter : introductions, remerciements, appels à s'abonner, phrases coupées, digressions, moments qui supposent d'avoir vu la suite.
Retourne UNIQUEMENT ce JSON, sans texte autour :
{"clips":[{"title":"titre accrocheur prêt à publier (max 60 car.)","hook_text":"première phrase du clip, mot pour mot (max 200 car.)","start_time":132.4,"end_time":171.0,"virality_score":87,"summary":"ce que le spectateur retient (max 300 car.)"}]}
Règles : start_time = instant d'une ligne où commence une phrase ; end_time = fin d'une phrase ; secondes absolues de la vidéo ;
virality_score entre 1 et 99 et honnête (un extrait moyen vaut 60) ; clips triés du meilleur au moins bon ; titre dans la langue de la vidéo.`;
}

/** Analyse + insertion des clips suggérés (bornes calées côté code). */
export async function runAnalyze(supabase, job, project, ctx) {
  const { words, durationSeconds } = ctx;
  const updateProgress = makeProgressUpdater(supabase, job.id);

  const local = useLocalAi(remoteKey());

  const tier = await fetchUserTier(supabase, project.user_id);
  const maxClips = ENTITLEMENTS[tier].maxClipsPerVideo;

  // Une ligne horodatée par phrase ; échantillonnée si la vidéo est très
  // longue (la fin reste visible, au lieu d'être tronquée).
  // Modèle local : contexte plus court (16k jetons) → transcription plus compacte.
  let candidatesRaw = [];
  if (local) {
    // Modèle local : contexte plus court (16k jetons) → transcription compacte.
    const transcriptText = buildTimedTranscript(words, { maxChars: 24000 });
    const userPrompt = `Durée totale : ${durationSeconds} s.\nTranscription :\n${transcriptText}`;
    console.log(`[worker] analyse locale (Ollama, ${localConfig.ollamaModel})`);
    await updateProgress(90);
    candidatesRaw = parseClipsJson(await chatJsonLocal(analyzeSystemPrompt(maxClips), userPrompt));
  } else {
    const ai = remoteAi();
    // Vidéo longue + limite par minute (Groq gratuit) : analyse par fenêtres,
    // puis on garde les meilleurs extraits toutes fenêtres confondues.
    const fullText = buildTimedTranscript(words, { maxChars: Number.MAX_SAFE_INTEGER });
    const windows = fullText.length <= ai.windowChars ? [words] : splitWordsByChars(words, ai.windowChars);
    console.log(`[worker] analyse ${ai.name} (${ai.analyzeModel}) — ${windows.length} fenêtre(s)`);
    for (let i = 0; i < windows.length; i++) {
      if (i > 0 && ai.name === 'groq') await sleep(61_000); // respecte ~8k jetons/min
      const text = buildTimedTranscript(windows[i], { maxChars: ai.windowChars });
      const userPrompt = `Durée totale de la vidéo : ${durationSeconds} s. Extrait ${i + 1}/${windows.length}.\nTranscription :\n${text}`;
      const raw = await chatJsonRemote(analyzeSystemPrompt(maxClips), userPrompt);
      candidatesRaw.push(...parseClipsJson(raw));
      await updateProgress(Math.min(95, 85 + Math.round(((i + 1) / windows.length) * 10)));
    }
    candidatesRaw.sort((a, b) => Number(b?.virality_score ?? 0) - Number(a?.virality_score ?? 0));
  }
  const parsed = { clips: candidatesRaw };

  // Reprise (retry) : on repart d'une base propre. Les clips DÉJÀ rendus
  // sont conservés — ils ont consommé du temps de rendu.
  await supabase
    .from('clips')
    .delete()
    .eq('project_id', project.id)
    .neq('status', 'ready');

  // Validation + rognage défensif des bornes : on ne fait JAMAIS
  // confiance aux nombres renvoyés par un LLM.
  const candidates = Array.isArray(parsed.clips) ? parsed.clips : [];
  if (candidates.length === 0) throw new Error('Aucun clip retourné par le modèle');

  // Réglages de départ selon l'offre : un abonné reçoit directement un
  // montage poussé (silences coupés, zooms, titre d'accroche, audio).
  const defaultStyle = defaultSettingsForTier(tier);

  // Bornes calées sur de vraies phrases, puis dédoublonnage : deux clips
  // qui se recouvrent à plus de 50 % n'en font qu'un (le mieux classé).
  const kept = [];
  for (const c of candidates) {
    if (kept.length >= maxClips) break;
    const bounds = snapClipBounds(words, Number(c.start_time), Number(c.end_time), {
      duration: durationSeconds,
      minSeconds: 15,
      maxSeconds: 90,
    });
    const overlaps = kept.some(({ bounds: other }) => {
      const inter = Math.min(other.end, bounds.end) - Math.max(other.start, bounds.start);
      return inter > 0.5 * Math.min(other.end - other.start, bounds.end - bounds.start);
    });
    if (!overlaps) kept.push({ c, bounds });
  }

  const rows = kept.map(({ c, bounds }) => {
    const startTime = bounds.start;
    const endTime = bounds.end;

    return {
      style_config: defaultStyle,
      project_id: project.id,
      title: String(c.title ?? 'Clip sans titre').slice(0, 80),
      hook_text: String(c.hook_text ?? '').slice(0, 200),
      summary: String(c.summary ?? '').slice(0, 300),
      start_time: startTime,
      end_time: endTime,
      virality_score: Math.max(1, Math.min(100, Math.round(Number(c.virality_score) || 70))),
      // Un clip part directement en file de rendu : son statut le dit.
      status: 'queued',
      // Mots du clip, RECALÉS sur zéro par wordsInRange. Ce sont eux qui
      // alimentent les sous-titres animés (studio d'édition et rendu
      // Remotion lisent la même source : aucune divergence possible).
      transcript_json: { words: wordsInRange(words, startTime, endTime) },
    };
  });

  const { data: insertedClips, error: clipsError } = await supabase
    .from('clips')
    .insert(rows)
    .select('id');
  if (clipsError) throw new Error(`Insertion clips : ${clipsError.message}`);

  // Enchaînement : chaque clip part en rendu. `cost_seconds: 0` — les
  // crédits ont été réservés et débités au dépôt (job `ingest`), pas ici.
  const renderJobs = (insertedClips ?? []).map((clip) => ({
    user_id: project.user_id,
    project_id: project.id,
    clip_id: clip.id,
    kind: 'render',
    status: 'queued',
    attempts: 0,
    max_attempts: 2,
    progress: 0,
    cost_seconds: 0,
  }));
  if (renderJobs.length > 0) {
    const { error: jobsError } = await supabase.from('render_jobs').insert(renderJobs);
    if (jobsError) throw new Error(`Mise en file des rendus : ${jobsError.message}`);
  }

  await supabase
    .from('projects')
    .update({ status: 'completed' })
    .eq('id', project.id);
  await updateProgress(100);
}

// ============================================================
// ÉTAPE 4 — RENDER : bundle Remotion + rendu 1080x1920 + upload
// ============================================================
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;

/** Chaîne audio : volume homogène pour tous, traitement « studio » en Pro. */
function audioFilters(enhance) {
  const loudness = 'loudnorm=I=-14:TP=-1.5:LRA=11';
  if (!enhance) return [loudness];
  return [
    'highpass=f=80', // grondements, clim, bruits de table
    'afftdn=nf=-25', // souffle de fond
    'acompressor=threshold=-20dB:ratio=3:attack=5:release=120', // voix posée et présente
    loudness,
  ];
}

// ---------- Rendu : bundle mis en cache + serveur média local ----------
const MEDIA_DIR = path.join(tmpdir(), 'izicut-media');
let bundlePromise = null;
let mediaServerPromise = null;

export function getRemotionBundle() {
  bundlePromise ??= (async () => {
    const { bundle } = await import('@remotion/bundler');
    const emptyPublic = await mkdtemp(path.join(tmpdir(), 'izicut-public-'));
    const started = Date.now();
    const location = await bundle({
      entryPoint: path.resolve(import.meta.dirname, 'remotion', 'index.ts'),
      publicDir: emptyPublic,
    });
    console.log(`[worker] bundle Remotion prêt (${Math.round((Date.now() - started) / 1000)} s, mis en cache)`);
    return location;
  })().catch((err) => {
    bundlePromise = null;
    throw err;
  });
  return bundlePromise;
}

/** Sert MEDIA_DIR sur 127.0.0.1 (requêtes Range gérées). */
function getMediaServer() {
  mediaServerPromise ??= (async () => {
    await mkdir(MEDIA_DIR, { recursive: true });
    const http = await import('node:http');
    const { createReadStream, statSync } = await import('node:fs');
    const server = http.createServer((req, res) => {
      const name = path.basename(decodeURIComponent((req.url ?? '/').split('?')[0]));
      const file = path.join(MEDIA_DIR, name);
      let size;
      try { size = statSync(file).size; } catch { res.writeHead(404).end(); return; }
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
      const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, 'Content-Length': size });
        createReadStream(file).pipe(res);
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  })();
  return mediaServerPromise;
}

export async function runRender(supabase, job, project, ctx) {
  const { workdir, sourcePath, sectionOffset = 0 } = ctx;
  const updateProgress = makeProgressUpdater(supabase, job.id);

  if (!job.clip_id) throw new Error('Job de rendu sans clip_id');

  const { data: clip, error: clipError } = await supabase
    .from('clips')
    .select('*')
    .eq('id', job.clip_id)
    .single();
  if (clipError || !clip) throw new Error(`Clip introuvable : ${clipError?.message}`);

  await supabase.from('clips').update({ status: 'rendering' }).eq('id', clip.id);

  // 1. Droits : les réglages stockés sont RABOTÉS selon l'offre effective.
  //    `clips.style_config` est modifiable par l'utilisateur (RLS) : c'est
  //    ici, au rendu, que se joue la vraie protection des fonctions Pro.
  const tier = await fetchUserTier(supabase, project.user_id);
  const entitlements = ENTITLEMENTS[tier];
  const { settings } = sanitizeRenderSettings(clip.style_config, tier);
  const fps = settings.fps;

  // 2. Mots du clip (relatifs au clip) : ceux corrigés dans l'éditeur en
  //    priorité, sinon ceux de la transcription.
  const clipDuration = Math.max(1, clip.end_time - clip.start_time);
  let clipWords = validWords(clip.transcript_json).filter((w) => w.start < clipDuration);
  if (clipWords.length === 0) {
    const { data: transcript } = await supabase
      .from('transcripts')
      .select('words')
      .eq('project_id', project.id)
      .maybeSingle();
    clipWords = wordsInRange(transcript?.words ?? [], clip.start_time, clip.end_time);
  }

  // 3. Suppression des silences (Pro) : segments conservés + sous-titres
  //    recalés sur la timeline raccourcie.
  let selectExpr = null;
  let finalWords = clipWords;
  let finalDuration = clipDuration;
  if (settings.remove_silences) {
    const keep = computeKeepSegments(clipWords, clipDuration);
    selectExpr = buildSelectExpression(keep, clipDuration);
    if (selectExpr) {
      finalWords = remapWords(clipWords, keep);
      finalDuration = Math.max(1, keptDuration(keep));
    }
  }

  // 4. Pré-découpe ffmpeg : seul l'extrait utile part au rendu. Remotion
  //    lit un petit fichier local à cadence fixe, au lieu d'une URL signée
  //    de plusieurs Go qui pouvait expirer en cours de rendu — et les
  //    sources YouTube (sans storage_path) deviennent rendables.
  await updateProgress(5);
  const publicDir = path.join(workdir, 'public');
  await mkdir(publicDir, { recursive: true });
  const cutPath = path.join(publicDir, 'clip.mp4');

  const videoFilters = [`scale='min(1920,iw)':-2`, `fps=${fps}`];
  const audioChain = audioFilters(settings.enhance_audio);
  if (selectExpr) {
    videoFilters.push(`select='${selectExpr}'`, 'setpts=N/FRAME_RATE/TB');
    audioChain.unshift(`aselect='${selectExpr}'`, 'asetpts=N/SR/TB');
  }

  await run(config.ffmpeg, [
    '-y',
    '-ss', String(Math.max(0, clip.start_time - sectionOffset)),
    '-t', String(clipDuration),
    '-i', sourcePath,
    '-vf', videoFilters.join(','),
    '-af', audioChain.join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart',
    cutPath,
  ], { timeoutMs: 15 * 60 * 1000 });
  await updateProgress(15);

  // 5. Habillage selon l'offre.
  const zoomTimes = settings.auto_zoom ? computeZoomTimes(finalWords, finalDuration) : [];
  const hookTitle = settings.hook_title
    ? String(settings.hook_title_text || clip.title || '').slice(0, 80)
    : '';
  const signature = overlaySignature(settings, tier);

  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  // Bundle Remotion compilé UNE fois par processus (avant : ~20-40 s à
  // chaque clip). L'extrait est servi par un petit serveur HTTP local.
  const bundleLocation = await getRemotionBundle();
  const mediaBase = await getMediaServer();
  const mediaName = `${clip.id}-${Date.now()}.mp4`;
  const mediaPath = path.join(MEDIA_DIR, mediaName);
  await writeFile(mediaPath, await readFile(cutPath));
  await updateProgress(25);

  const inputProps = {
    videoSrc: `${mediaBase}/${mediaName}`,
    words: finalWords,
    style: settings,
    zoomTimes,
    hookTitle,
    signature,
  };

  // selectComposition est ASYNCHRONE : sans await, on modifiait une
  // Promise et le rendu partait avec une durée d'une seule image.
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'ClipVertical',
    inputProps,
  });
  composition.durationInFrames = Math.max(1, Math.ceil(finalDuration * fps));
  composition.fps = fps;
  composition.width = RENDER_WIDTH;
  composition.height = RENDER_HEIGHT;

  const outputPath = path.join(workdir, `${clip.id}.mp4`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    crf: entitlements.crf,
    outputLocation: outputPath,
    inputProps,
    imageFormat: 'jpeg',
    jpegQuality: 92,
    chromiumOptions: { gl: 'angle' },
    onProgress: ({ progress }) => void updateProgress(25 + progress * 60),
  });
  await updateProgress(88);
  await rm(mediaPath, { force: true });

  // Upload du rendu dans le bucket privé. Le premier segment du chemin est
  // l'identifiant de l'utilisateur — même convention que le SRT et que la
  // politique RLS de lecture (`(storage.foldername(name))[1] = auth.uid()`).
  // Ne JAMAIS préfixer par `clips/` : ce serait le nom du bucket, pas un
  // dossier, et l'utilisateur ne pourrait plus lire son propre rendu.
  const storagePath = `${project.user_id}/${clip.id}.mp4`;
  const videoBuffer = await readFile(outputPath);
  const { error: uploadError } = await supabase.storage
    .from('clips')
    .upload(storagePath, videoBuffer, {
      upsert: true,
      contentType: 'video/mp4',
    });
  if (uploadError) throw new Error(`Upload rendu : ${uploadError.message}`);

  await supabase
    .from('clips')
    .update({ status: 'ready', rendered_storage_path: storagePath })
    .eq('id', clip.id);
  await updateProgress(100);

  return { outputPath: storagePath };
}

// ============================================================
// DISPATCH : choix de l'étape selon le kind du job
// ============================================================
export async function processJob(job) {
  const supabase = createSupabase();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', job.project_id)
    .single();
  if (projectError || !project) {
    throw new Error(`Projet introuvable pour le job ${job.id}`);
  }

  const workdir = await mkdtemp(path.join(tmpdir(), 'izicut-job-'));
  let ctx = { workdir, words: null };
  try {

    // ingest → transcribe → analyze s'enchaînent sur le même job
    // « racine » : chaque étape met le projet au statut suivant.
    if (job.kind === 'ingest') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project, { audioOnly: true })) };
      ctx.words = (await runTranscribe(supabase, job, project, ctx)).words;
      await runAnalyze(supabase, job, project, ctx);
    } else if (job.kind === 'transcribe') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project, { audioOnly: true })) };
      ctx.words = (await runTranscribe(supabase, job, project, ctx)).words;
    } else if (job.kind === 'analyze') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project, { audioOnly: true, withAudio: false })) };
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('words')
        .eq('project_id', project.id)
        .maybeSingle();
      ctx.words = transcript?.words ?? [];
      ctx.durationSeconds = project.duration_seconds ?? 0;
      await runAnalyze(supabase, job, project, ctx);
    } else if (job.kind === 'render') {
      // Source en ligne : on ne télécharge que l'extrait du clip (± 2 s).
      let section = null;
      if (project.source_type === 'external_url' && job.clip_id) {
        const { data: c } = await supabase.from('clips').select('start_time, end_time').eq('id', job.clip_id).maybeSingle();
        if (c) section = { start: Math.max(0, Number(c.start_time) - 2), end: Number(c.end_time) + 2 };
      }
      ctx = { ...ctx, ...(await runIngest(supabase, job, project, { withAudio: false, section })) };
      return await runRender(supabase, job, project, ctx);
    }

    return { outputPath: null };
  } finally {
    await rm(workdir, { recursive: true, force: true });
    // runIngest crée SON propre répertoire (source complète, audio) et le
    // substitue à ctx.workdir : sans ce second rm, chaque job laissait la
    // vidéo source sur le disque du worker jusqu'à saturation.
    if (ctx.workdir && ctx.workdir !== workdir) {
      await rm(ctx.workdir, { recursive: true, force: true });
    }
  }
}
