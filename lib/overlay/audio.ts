/**
 * Prépare la voix d'une vidéo pour la transcription, dans le navigateur :
 * piste audio décodée, passée en mono 16 kHz, découpée en morceaux WAV de
 * 100 s (≈ 3,2 Mo chacun). Seul ce son part pour être transcrit, jamais la vidéo.
 */
const RATE = 16000;
const CHUNK = 100;

function wav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export async function speechChunks(source: Blob | ArrayBuffer, maxSeconds = 600): Promise<{ blob: Blob; offset: number }[]> {
  const data = source instanceof Blob ? await source.arrayBuffer() : source;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(data.slice(0));
  } finally {
    void ac.close();
  }
  const dur = Math.min(decoded.duration, maxSeconds);
  const off = new OfflineAudioContext(1, Math.ceil(dur * RATE), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0, 0, dur);
  const mono = (await off.startRendering()).getChannelData(0);
  // Volume normalisé : une voix faible est mieux comprise.
  let peak = 0;
  for (let i = 0; i < mono.length; i += 7) peak = Math.max(peak, Math.abs(mono[i]));
  const gain = peak > 0.01 ? Math.min(4, 0.9 / peak) : 1;
  const out: { blob: Blob; offset: number }[] = [];
  for (let s = 0; s < mono.length; s += CHUNK * RATE) {
    const part = mono.subarray(s, Math.min(mono.length, s + CHUNK * RATE));
    if (part.length < RATE * 0.5) break;
    const scaled = new Float32Array(part.length);
    for (let i = 0; i < part.length; i++) scaled[i] = part[i] * gain;
    out.push({ blob: wav(scaled), offset: s / RATE });
  }
  return out;
}

export type Word = { word: string; start: number; end: number };

/** Transcrit toute la voix d'une vidéo (morceau par morceau). */
export async function transcribe(source: Blob | ArrayBuffer, onProgress?: (p: number) => void): Promise<Word[]> {
  const chunks = await speechChunks(source);
  const words: Word[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const fd = new FormData();
    fd.append('file', chunks[i].blob, 'audio.wav');
    fd.append('offset', String(chunks[i].offset));
    const res = await fetch('/api/overlay/transcribe', { method: 'POST', body: fd });
    const j = (await res.json().catch(() => ({}))) as { words?: Word[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? 'Transcription impossible.');
    words.push(...(j.words ?? []));
    onProgress?.((i + 1) / chunks.length);
  }
  return words;
}
