#!/usr/bin/env node
// check-setup.mjs — vérifie que tout est prêt pour IziCut (aucun secret affiché).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
let ok = true;
const out = (good, msg) => { if (!good) ok = false; console.log(`${good ? '✅' : '❌'} ${msg}`); };

for (const bin of [process.env.FFMPEG_PATH || 'ffmpeg', process.env.YTDLP_PATH || 'yt-dlp']) {
  const r = spawnSync(bin, [bin.includes('ffmpeg') ? '-version' : '--version'], { encoding: 'utf8' });
  out(r.status === 0, `${bin} ${r.status === 0 ? r.stdout.split('\n')[0].slice(0, 60) : 'introuvable'}`);
}

const provider = (process.env.AI_PROVIDER || 'auto').toLowerCase();
const groq = provider === 'groq' || (provider !== 'openai' && !process.env.OPENAI_API_KEY && !!process.env.GROQ_API_KEY);
const key = groq ? process.env.GROQ_API_KEY || '' : process.env.OPENAI_API_KEY || '';
const local = provider === 'local' || (provider === 'auto' && !key);
if (!local) {
  const name = groq ? 'Groq' : 'OpenAI';
  const url = groq ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models';
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    out(r.ok, `IA : ${name} — clé ${r.ok ? 'valide' : `refusée (HTTP ${r.status})`}`);
  } catch (e) { out(false, `${name} injoignable : ${e.message}`); }
} else {
  console.log('ℹ️  IA : mode LOCAL (whisper.cpp + Ollama), aucune clé nécessaire');
  const w = spawnSync(process.env.WHISPER_CPP_PATH || 'whisper-cli', ['--help'], { encoding: 'utf8' });
  out(!w.error, `whisper-cli ${w.error ? 'introuvable' : 'présent'}`);
  const model = process.env.WHISPER_MODEL_PATH || `${process.env.HOME}/.izicut/models/ggml-small.bin`;
  out(fs.existsSync(model), `Modèle Whisper ${model.split('/').pop()}${fs.existsSync(model) ? '' : ' absent'}`);
  const om = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  try {
    const r = await fetch(`${process.env.OLLAMA_URL || 'http://127.0.0.1:11434'}/api/tags`);
    const names = ((await r.json()).models || []).map((m) => m.name);
    out(names.includes(om), `Ollama OK, modèle ${om}${names.includes(om) ? ' prêt' : ' absent'}`);
  } catch { out(false, 'Ollama ne répond pas (ouvre l\'app Ollama)'); }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !sk) out(false, 'Variables Supabase manquantes');
else {
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  for (const t of ['profiles', 'projects', 'clips', 'transcripts', 'render_jobs', 'credit_accounts', 'credit_ledger']) {
    const { error } = await sb.from(t).select('*', { head: true, count: 'exact' });
    out(!error, `Table ${t}${error ? ` : ${error.message}` : ''}`);
  }
  const { data: buckets, error } = await sb.storage.listBuckets();
  out(!error, `Buckets Storage : ${error ? error.message : buckets.map((b) => b.id).join(', ') || 'aucun'}`);
}
console.log(ok ? '\n=== SETUP OK ===' : '\n=== SETUP INCOMPLET (voir ❌) ===');
