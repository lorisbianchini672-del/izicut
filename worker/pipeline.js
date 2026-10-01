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
  const { withAudio = true } = options;
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
  if (useLocalAi(config.openaiKey)) {
    // whisper.cpp gère les fichiers longs : pas de découpage nécessaire,
    // les horodatages sont donc déjà absolus.
    console.log(`[worker] transcription locale (whisper.cpp, ${path.basename(localConfig.whisperModel)})`);
    await updateProgress(50);
    allWords = await transcribeFileLocal(audioFile, durationSeconds);
    await updateProgress(80);
  } else for (const chunk of chunks) {
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

  const local = useLocalAi(config.openaiKey);

  const tier = await fetchUserTier(supabase, project.user_id);
  const maxClips = ENTITLEMENTS[tier].maxClipsPerVideo;

  // Une ligne horodatée par phrase ; échantillonnée si la vidéo est très
  // longue (la fin reste visible, au lieu d'être tronquée).
  // Modèle local : contexte plus court (16k jetons) → transcription plus compacte.
  const transcriptText = buildTimedTranscript(words, { maxChars: local ? 24000 : 60000 });
  const userPrompt = `Durée totale : ${durationSeconds} s.\nTranscription :\n${transcriptText}`;

  let rawContent;
  if (local) {
    console.log(`[worker] analyse locale (Ollama, ${localConfig.ollamaModel})`);
    await updateProgress(90);
    rawContent = await chatJsonLocal(analyzeSystemPrompt(maxClips), userPrompt);
  } else {
    const res = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.analyzeModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: analyzeSystemPrompt(maxClips) },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`GPT HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);

    const payload = await res.json();
    rawContent = payload.choices?.[0]?.message?.content ?? '{}';
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Réponse du modèle non JSON : ${String(rawContent).slice(0, 120)}`);
  }
  // Certains modèles locaux renvoient directement le tableau, ou une autre clé.
  if (Array.isArray(parsed)) parsed = { clips: parsed };
  else if (!Array.isArray(parsed?.clips)) {
    const firstArray = Object.values(parsed ?? {}).find(Array.isArray);
    if (firstArray) parsed = { clips: firstArray };
  }

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
    '-ss', String(clip.start_time),
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

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const bundleLocation = await bundle({
    entryPoint: path.resolve(import.meta.dirname, 'remotion', 'index.ts'),
    publicDir,
    onProgress: (p) => void updateProgress(15 + (p / 100) * 10),
  });

  const inputProps = {
    videoSrc: 'clip.mp4',
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
      ctx = { ...ctx, ...(await runIngest(supabase, job, project, { withAudio: false })) };
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
