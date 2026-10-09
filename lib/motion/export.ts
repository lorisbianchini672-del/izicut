/**
 * Export vidéo « image par image » (WebCodecs + MP4) : chaque image est calculée
 * à son instant exact puis encodée en H.264, quelle que soit la puissance de
 * l'ordinateur. Résultat : 60 images/s parfaitement régulières, aucune saccade,
 * aucune image perdue (contrairement à un enregistrement d'écran en direct).
 * Le son (musique, bruitages, voix-off, son des vidéos du client) est encodé en
 * AAC (ou Opus si le navigateur n'a pas d'encodeur AAC).
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

type VideoCfg = { codec: string; width: number; height: number; bitrate: number; framerate: number; mux: 'avc' | 'vp9' };

/** Codecs H.264 du plus exigeant au plus compatible (niveau 5.2 → 4.0). */
const AVC = ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D0034', 'avc1.4D002A', 'avc1.42E034', 'avc1.42E02A'];

export function webCodecsAvailable(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;
}

function encoderConfig(c: VideoCfg): VideoEncoderConfig {
  return { codec: c.codec, width: c.width, height: c.height, bitrate: c.bitrate, framerate: c.framerate, latencyMode: 'quality', ...(c.mux === 'avc' ? { avc: { format: 'avc' } } : {}) } as VideoEncoderConfig;
}

async function pickVideoConfig(width: number, height: number, fps: number, bitrate: number): Promise<VideoCfg | null> {
  // H.264 d'abord (lisible partout) ; VP9 en dernier recours (navigateurs sans encodeur H.264).
  for (const codec of [...AVC, 'vp09.00.41.08', 'vp09.00.40.08']) {
    const cfg: VideoCfg = { codec, width, height, bitrate, framerate: fps, mux: codec.startsWith('vp09') ? 'vp9' : 'avc' };
    try {
      const res = await VideoEncoder.isConfigSupported(encoderConfig(cfg));
      if (res.supported) return cfg;
    } catch {
      /* codec suivant */
    }
  }
  return null;
}

async function pickAudioConfig(sampleRate: number, channels: number): Promise<{ codec: 'aac' | 'opus'; cfg: AudioEncoderConfig } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const tries: { codec: 'aac' | 'opus'; cfg: AudioEncoderConfig }[] = [
    { codec: 'aac', cfg: { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 192_000 } },
    { codec: 'opus', cfg: { codec: 'opus', sampleRate, numberOfChannels: channels, bitrate: 160_000 } }
  ];
  for (const t of tries) {
    try {
      if ((await AudioEncoder.isConfigSupported(t.cfg)).supported) return t;
    } catch {
      /* suivant */
    }
  }
  return null;
}

/** Ramène un son à 48 kHz stéréo (ce qu'attendent AAC et Opus). */
async function to48k(buf: AudioBuffer): Promise<AudioBuffer> {
  if (buf.sampleRate === 48000 && buf.numberOfChannels === 2) return buf;
  const off = new OfflineAudioContext(2, Math.ceil(buf.duration * 48000), 48000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

export type ExactExport = {
  canvas: HTMLCanvasElement;
  duration: number;
  fps: number;
  bitrate: number;
  /** Dessine l'image de l'instant t dans `canvas` (peut attendre une vidéo qui se positionne). */
  renderFrame: (t: number) => Promise<void> | void;
  audio?: AudioBuffer | null;
  onProgress?: (ratio: number) => void;
};

/** Renvoie le MP4, ou null si ce navigateur ne sait pas encoder ainsi (on bascule alors sur l'enregistrement direct). */
export async function exportExact(o: ExactExport): Promise<Blob | null> {
  if (!webCodecsAvailable()) return null;
  const { canvas } = o;
  const vcfg = await pickVideoConfig(canvas.width, canvas.height, o.fps, o.bitrate);
  if (!vcfg) return null;
  const audio = o.audio ? await to48k(o.audio).catch(() => null) : null;
  const acfg = audio ? await pickAudioConfig(48000, 2) : null;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: vcfg.mux, width: canvas.width, height: canvas.height, frameRate: o.fps },
    ...(audio && acfg ? { audio: { codec: acfg.codec, numberOfChannels: 2, sampleRate: 48000 } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });
  let failure: unknown = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  venc.configure(encoderConfig(vcfg));

  const frames = Math.max(1, Math.round(o.duration * o.fps));
  const usPerFrame = 1_000_000 / o.fps;
  for (let i = 0; i < frames; i++) {
    if (failure) break;
    await o.renderFrame(i / o.fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * usPerFrame), duration: Math.round(usPerFrame) });
    // Une image clé toutes les 2 s : recherche rapide dans la vidéo, fichier compact.
    venc.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
    frame.close();
    if (venc.encodeQueueSize > 6) await new Promise<void>((r) => venc.addEventListener('dequeue', () => r(), { once: true }));
    if (i % 12 === 0) {
      o.onProgress?.(i / frames);
      // Laisse respirer l'interface (barre de progression, onglet réactif).
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await venc.flush().catch((e) => { failure = e; });
  venc.close();
  if (failure) return null;

  if (audio && acfg) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    aenc.configure(acfg.cfg);
    const total = Math.min(audio.length, Math.ceil(o.duration * 48000));
    const left = audio.getChannelData(0);
    const right = audio.getChannelData(1);
    const STEP = 4096;
    for (let off = 0; off < total; off += STEP) {
      const n = Math.min(STEP, total - off);
      const data = new Float32Array(n * 2);
      data.set(left.subarray(off, off + n), 0);
      data.set(right.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / 48000) * 1_000_000), data });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush().catch(() => undefined);
    aenc.close();
  }
  muxer.finalize();
  o.onProgress?.(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

/**
 * Bande-son finale : musique / bruitages / voix (déjà mixés) + son des vidéos
 * importées par le client, posé exactement sur les scènes qui les utilisent.
 */
export async function mixWithMedia(
  soundtrack: AudioBuffer | null,
  clips: { url: string; start: number; from: number; duration: number }[],
  total: number
): Promise<AudioBuffer | null> {
  if (!clips.length) return soundtrack;
  const sr = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(total * sr), sr);
  if (soundtrack) {
    const s = off.createBufferSource();
    s.buffer = soundtrack;
    s.connect(off.destination);
    s.start(0);
  }
  const cache = new Map<string, AudioBuffer | null>();
  let any = Boolean(soundtrack);
  for (const c of clips) {
    if (!cache.has(c.url)) {
      try {
        const data = await fetch(c.url).then((r) => r.arrayBuffer());
        cache.set(c.url, await off.decodeAudioData(data));
      } catch {
        cache.set(c.url, null);
      }
    }
    const buf = cache.get(c.url);
    if (!buf) continue;
    const s = off.createBufferSource();
    s.buffer = buf;
    s.connect(off.destination);
    s.start(c.start, Math.min(c.from, Math.max(0, buf.duration - 0.05)), c.duration);
    any = true;
  }
  return any ? off.startRendering() : null;
}
