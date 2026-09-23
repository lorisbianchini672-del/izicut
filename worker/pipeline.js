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
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  planChunks,
  mergeChunkWords,
  wordsInRange,
  buildSrt,
} from './timestamps.ts';

// ---------- Configuration (injectée par worker/index.js) ----------
export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  openaiKey: process.env.OPENAI_API_KEY ?? '',
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1',
  analyzeModel: process.env.OPENAI_ANALYZE_MODEL ?? 'gpt-4o-mini',
  ffmpeg: process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg',
  ffprobe: process.env.FFPROBE_PATH ?? '',
  ytdlp: process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp',
};

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

    child.stdout.on('data', (d) => { stdout += d; });
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
export async function runIngest(supabase, job, project) {
  const workdir = await mkdtemp(path.join(tmpdir(), 'izicut-ingest-'));
  const updateProgress = makeProgressUpdater(supabase, job.id);

  try {
    await updateProgress(2);
    const sourcePath = path.join(workdir, 'source.mp4');

    if (project.source_type === 'external_url') {
      // yt-dlp : uniquement des contenus dont l'utilisateur détient
      // les droits (condition des CGU YouTube — risque juridique réel).
      await run(config.ytdlp, [
        '--no-playlist', '--no-warnings',
        '-f', 'bv*+ba/b', '--merge-output-format', 'mp4',
        '-o', sourcePath,
        project.source_url,
      ], { timeoutMs: 30 * 60 * 1000 });
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

    // Extraction audio : WAV 16 kHz mono (32 ko/s → sous la limite
    // des 25 Mo de Whisper jusqu'à ~13 min par tranche).
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

    return { workdir, sourcePath, durationSeconds };
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

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Appel Whisper avec reprise sur 429/5xx (backoff exponentiel). */
async function transcribeChunk(audioBuffer, filename) {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY manquante');

  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** attempt);

    const form = new FormData();
    form.append('file', new Blob([audioBuffer]), filename);
    form.append('model', config.transcribeModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openaiKey}` },
      body: form,
    });

    if (res.ok) {
      const data = await res.json();
      const words = (data.words ?? []).map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end ?? w.start + 0.2,
      }));
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
  const chunks = planChunks(durationSeconds);
  const audioFile = path.join(workdir, 'audio.wav');

  let allWords = [];
  for (const chunk of chunks) {
    const chunkPath = path.join(workdir, `chunk_${String(chunk.index).padStart(3, '0')}.wav`);
    await run(config.ffmpeg, [
      '-y', '-i', audioFile,
      '-ss', String(chunk.start),
      '-t', String(chunk.duration),
      '-c', 'copy',
      chunkPath,
    ]);

    const audio = await readFile(chunkPath);
    const localWords = await transcribeChunk(audio, path.basename(chunkPath));

    // RECALAGE OBLIGATOIRE : décalage de la tranche + collage.
    allWords = mergeChunkWords(allWords, { offset: chunk.start, words: localWords });
    await updateProgress(45 + Math.round(((chunk.index + 1) / chunks.length) * 35));
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
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const ANALYZE_SYSTEM_PROMPT = `Tu es un expert du contenu viral court (TikTok, Reels, Shorts).
À partir d'une transcription horodatée d'une vidéo longue, sélectionne les 2 à 4
moments les plus viraux (15 à 60 secondes) et retourne UNIQUEMENT un JSON valide :
{"clips":[{"title":"titre accrocheur (max 80 car.)","hook_text":"accroche mot-pour-mot (max 200 car.)",
"start_time":12.5,"end_time":42.0,"virality_score":87,"summary":"résumé (max 300 car.)",
"justification":"pourquoi ce clip peut devenir viral (max 300 car.)"}]}
Règles : les bornes sont en secondes absolues de la vidéo source ; end_time > start_time ;
durée entre 15 et 60 s ; le hook DOIT être présent dans les 2 premières secondes ;
virality_score entre 60 et 99 ; commence le clip là où le propos est déjà lancé.
Sans texte avant ou après le JSON.`;

/** Analyse + insertion des clips suggérés (bornes clampées côté code). */
export async function runAnalyze(supabase, job, project, ctx) {
  const { words, durationSeconds, workdir, sourcePath } = ctx;
  const updateProgress = makeProgressUpdater(supabase, job.id);

  if (!config.openaiKey) throw new Error('OPENAI_API_KEY manquante');

  // Version texte compacte avec horodatages toutes les ~30 s.
  const transcriptText = words
    .map((w) => w.word)
    .join(' ')
    .slice(0, 24000);

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.analyzeModel,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Durée totale : ${durationSeconds} s.\nTranscription :\n${transcriptText}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`GPT HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);

  const payload = await res.json();
  let parsed;
  try {
    parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}');
  } catch {
    throw new Error('Réponse GPT non JSON');
  }

  const candidates = Array.isArray(parsed.clips) ? parsed.clips : [];
  if (candidates.length === 0) throw new Error('Aucun clip retourné par le modèle');

  // Validation + rognage défensif des bornes : on ne fait JAMAIS
  // confiance aux nombres renvoyés par un LLM.
  const rows = candidates.slice(0, 4).map((c) => {
    const start = Math.max(0, Math.min(Number(c.start_time) || 0, durationSeconds - 15));
    let end = Math.max(start + 15, Math.min(Number(c.end_time) || start + 30, durationSeconds));
    if (end - start > 90) end = start + 90;
    return {
      project_id: project.id,
      title: String(c.title ?? 'Clip sans titre').slice(0, 80),
      hook_text: String(c.hook_text ?? '').slice(0, 200),
      summary: String(c.summary ?? '').slice(0, 300),
      start_time: Math.round(start * 10) / 10,
      end_time: Math.round(end * 10) / 10,
      virality_score: Math.max(1, Math.min(100, Math.round(Number(c.virality_score) || 70))),
      status: 'suggested',
    };
  });

  const { error: clipsError } = await supabase.from('clips').insert(rows);
  if (clipsError) throw new Error(`Insertion clips : ${clipsError.message}`);

  await supabase
    .from('projects')
    .update({ status: 'completed' })
    .eq('id', project.id);
  await updateProgress(100);
}

// ============================================================
// ÉTAPE 4 — RENDER : bundle Remotion + rendu 1080x1920 + upload
// ============================================================
const RENDER_FPS = 30;
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;

export async function runRender(supabase, job, project, ctx) {
  const { workdir, sourcePath } = ctx;
  const updateProgress = makeProgressUpdater(supabase, job.id);

  if (!job.clip_id) throw new Error('Job de rendu sans clip_id');

  const { data: clip, error: clipError } = await supabase
    .from('clips')
    .select('*')
    .eq('id', job.clip_id)
    .single();
  if (clipError || !clip) throw new Error(`Clip introuvable : ${clipError?.message}`);

  await supabase.from('clips').update({ status: 'rendering' }).eq('id', clip.id);

  // Transcription du clip : horodatages recalés sur zéro (début du clip).
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('words')
    .eq('project_id', project.id)
    .maybeSingle();

  const clipWords = wordsInRange(transcript?.words ?? [], clip.start_time, clip.end_time);
  const style = clip.style_config ?? {
    font_size: 92,
    active_color: '#FFD400',
    inactive_color: '#FFFFFF',
    karaoke: true,
    position: 0.8,
    animation: 'pop',
  };

  // URL signée de la source : jamais d'URL publique passée au rendu.
  const { data: signed, error: signedError } = await supabase.storage
    .from('raw-videos')
    .createSignedUrl(project.storage_path ?? '', 3600);
  if (signedError || !signed) {
    throw new Error(`URL signée source impossible : ${signedError?.message ?? 'inconnue'}`);
  }

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  await updateProgress(10);
  const bundleLocation = await bundle({
    entryPoint: path.resolve(import.meta.dirname, 'remotion', 'index.ts'),
    onProgress: (p) => void updateProgress(10 + (p / 100) * 15),
  });

  const inputProps = {
    videoSrc: signed.signedUrl,
    startTime: clip.start_time,
    endTime: clip.end_time,
    words: clipWords,
    style,
  };

  const durationSeconds = Math.max(1, clip.end_time - clip.start_time);
  const composition = selectComposition({
    serveUrl: bundleLocation,
    id: 'ClipVertical',
    inputProps,
  });
  composition.durationInFrames = Math.ceil(durationSeconds * RENDER_FPS);
  composition.fps = RENDER_FPS;
  composition.width = RENDER_WIDTH;
  composition.height = RENDER_HEIGHT;

  const outputPath = path.join(workdir, `${clip.id}.mp4`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    imageFormat: 'jpeg',
    jpegQuality: 90,
    chromiumOptions: { gl: 'angle' },
    onProgress: ({ progress }) => void updateProgress(25 + progress * 60),
  });
  await updateProgress(88);

  // Upload du rendu dans le bucket privé (chemin : user d'abord).
  const storagePath = `clips/${project.user_id}/${clip.id}.mp4`;
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
  try {
    let ctx = { workdir, words: null };

    // ingest → transcribe → analyze s'enchaînent sur le même job
    // « racine » : chaque étape met le projet au statut suivant.
    if (job.kind === 'ingest') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project)) };
      ctx.words = (await runTranscribe(supabase, job, project, ctx)).words;
      await runAnalyze(supabase, job, project, ctx);
    } else if (job.kind === 'transcribe') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project)) };
      ctx.words = (await runTranscribe(supabase, job, project, ctx)).words;
    } else if (job.kind === 'analyze') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project)) };
      const { data: transcript } = await supabase
        .from('transcripts')
        .select('words')
        .eq('project_id', project.id)
        .maybeSingle();
      ctx.words = transcript?.words ?? [];
      ctx.durationSeconds = project.duration_seconds ?? 0;
      await runAnalyze(supabase, job, project, ctx);
    } else if (job.kind === 'render') {
      ctx = { ...ctx, ...(await runIngest(supabase, job, project)) };
      return await runRender(supabase, job, project, ctx);
    }

    return { outputPath: null };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
