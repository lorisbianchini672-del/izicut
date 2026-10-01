/**
 * ============================================================
 * worker/local-ai.js — IA 100 % locale, gratuite, sans clé API
 * ------------------------------------------------------------
 * - Transcription : whisper.cpp (`whisper-cli`, brew install whisper-cpp)
 *   avec horodatage au mot (-ml 1 -sow → un segment JSON par mot).
 * - Sélection des moments forts : Ollama (http://127.0.0.1:11434),
 *   sortie JSON forcée (`format: 'json'`).
 *
 * Choix du fournisseur (AI_PROVIDER) :
 *   'local'  → toujours local
 *   'openai' → toujours OpenAI (clé obligatoire)
 *   'auto'   → OpenAI si OPENAI_API_KEY est renseignée, sinon local (défaut)
 * ============================================================
 */
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const localConfig = {
  provider: (process.env.AI_PROVIDER ?? 'auto').toLowerCase(),
  whisperBin: process.env.WHISPER_CPP_PATH || 'whisper-cli',
  whisperModel:
    process.env.WHISPER_MODEL_PATH ||
    path.join(os.homedir(), '.izicut', 'models', 'ggml-small.bin'),
  whisperLanguage: process.env.WHISPER_LANGUAGE || 'auto',
  whisperThreads: String(Math.max(2, Math.min(8, os.cpus().length - 1))),
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
};

/** true si l'étape doit utiliser l'IA locale. */
export function useLocalAi(openaiKey) {
  if (localConfig.provider === 'local') return true;
  if (localConfig.provider === 'openai') return false;
  return !openaiKey;
}

function runCapture(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-10000); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT'
        ? new Error(`${cmd} introuvable : lance « brew install whisper-cpp » (ou relance « Lancer IziCut.command »)`)
        : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} a échoué (code ${code}) : ${stderr.slice(-400)}`));
    });
  });
}

/**
 * Convertit la sortie JSON de whisper.cpp (-ml 1 -sow) en mots
 * { word, start, end } exprimés en secondes RELATIVES au fichier.
 * Exporté pour les tests.
 */
export function parseWhisperCppJson(data) {
  const segments = Array.isArray(data?.transcription) ? data.transcription : [];
  const words = [];
  for (const seg of segments) {
    const text = String(seg.text ?? '').trim();
    // Jetons spéciaux ([_BEG_], [Musique], (rires)…) : pas des mots prononcés.
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue;
    const from = Number(seg.offsets?.from);
    const to = Number(seg.offsets?.to);
    if (!Number.isFinite(from)) continue;
    const start = from / 1000;
    const end = Number.isFinite(to) && to > from ? to / 1000 : start + 0.2;
    // Ponctuation isolée : on la recolle au mot précédent.
    if (/^[.,!?;:…»)]+$/.test(text) && words.length > 0) {
      words[words.length - 1].word += text;
      words[words.length - 1].end = Math.max(words[words.length - 1].end, end);
      continue;
    }
    words.push({ word: text, start, end });
  }
  return words;
}

/** Transcrit un WAV 16 kHz mono avec whisper.cpp. */
export async function transcribeFileLocal(wavPath, durationSeconds = 600) {
  const outBase = wavPath.replace(/\.wav$/i, '') + '.whisper';
  const args = [
    '-m', localConfig.whisperModel,
    '-f', wavPath,
    '-l', localConfig.whisperLanguage,
    '-t', localConfig.whisperThreads,
    '-ml', '1', '-sow',
    '-oj', '-of', outBase,
    '-np',
  ];
  // Garde-fou large : ~3x la durée audio, 10 min minimum.
  await runCapture(localConfig.whisperBin, args, Math.max(600, durationSeconds * 3) * 1000);
  const json = JSON.parse(await readFile(`${outBase}.json`, 'utf8'));
  await rm(`${outBase}.json`, { force: true });
  return parseWhisperCppJson(json);
}

/** Appel Ollama en mode JSON ; renvoie le contenu texte du message. */
export async function chatJsonLocal(systemPrompt, userPrompt) {
  let res;
  try {
    res = await fetch(`${localConfig.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localConfig.ollamaModel,
        stream: false,
        format: 'json',
        options: { temperature: 0.3, num_ctx: 16384 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
  } catch (err) {
    throw new Error(`Ollama injoignable (${localConfig.ollamaUrl}) : ouvre l'application Ollama. ${err.message}`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 404) {
      throw new Error(`Modèle Ollama « ${localConfig.ollamaModel} » absent : ollama pull ${localConfig.ollamaModel}`);
    }
    throw new Error(`Ollama HTTP ${res.status} : ${body}`);
  }
  const data = await res.json();
  return data?.message?.content ?? '{}';
}
