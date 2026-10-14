/**
 * Export MP4 du moteur pro : le serveur photographie la composition image par
 * image (rendu identique à l'aperçu), le navigateur assemble les images avec
 * la musique et les bruitages grâce à l'encodeur H.264 existant.
 */
import { exportExact } from '../motion/export';
import { renderSoundtrack } from '../motion/sound';
import type { MotionProject } from '../motion/types';
import { COMP_SIZE, type Comp } from './types';

const FPS = 30;
const CHUNK = 12;
const PARALLEL = 10;

/** Projet « son seul » : la musique et les bruitages de la composition passent par le moteur audio existant. */
export function soundProject(comp: Comp): MotionProject {
  return {
    format: comp.format,
    brand: comp.brand ?? '',
    theme: { background: '#000000', primary: '#ffffff', accent: '#ffffff', text: '#ffffff', style: 'clean', motif: 'none' },
    transition: 'flash',
    sound: comp.sound ? { music: comp.sound.music, bpm: comp.sound.bpm, volume: 0.75 } : undefined,
    scenes: [{ type: 'free', duration: comp.duration, bg: 'theme', layers: [{ kind: 'text', text: ' ', opacity: 0 }], cues: (comp.sound?.cues ?? []).filter((q) => q.at < comp.duration) } as MotionProject['scenes'][number]]
  } as MotionProject;
}

async function fetchChunk(comp: Comp, assets: Record<string, string>, from: number, tries = 3): Promise<ImageBitmap[]> {
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch('/api/motion2/frames', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comp, assets, from, count: CHUNK, fps: FPS }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(j.frames)) throw new Error(j.error ?? 'rendu impossible');
      return await Promise.all((j.frames as string[]).map(async (b64) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())));
    } catch (e) {
      if (k === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (k + 1)));
    }
  }
  return [];
}

export async function exportComp(comp: Comp, assets: Record<string, string>, onProgress: (ratio: number) => void): Promise<Blob | null> {
  const { w, h } = COMP_SIZE[comp.format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const total = Math.ceil(comp.duration * FPS);
  const chunks = new Map<number, Promise<ImageBitmap[]>>();
  const want = (c: number) => {
    if (c * CHUNK >= total || chunks.has(c)) return;
    chunks.set(c, fetchChunk(comp, assets, c * CHUNK));
  };
  for (let c = 0; c < PARALLEL; c++) want(c);
  const audio = await renderSoundtrack(soundProject(comp)).catch(() => null);
  return exportExact({
    canvas,
    duration: comp.duration,
    fps: FPS,
    bitrate: 16_000_000,
    audio,
    onProgress,
    renderFrame: async (t: number) => {
      const i = Math.min(total - 1, Math.round(t * FPS));
      const c = Math.floor(i / CHUNK);
      for (let k = 0; k < PARALLEL; k++) want(c + k);
      const list = await chunks.get(c)!;
      const bmp = list[i - c * CHUNK] ?? list[list.length - 1];
      if (bmp) ctx.drawImage(bmp, 0, 0, w, h);
      // Tranche terminée : on libère la mémoire.
      if (i === c * CHUNK + list.length - 1) { list.forEach((b) => b.close()); chunks.delete(c); chunks.set(c, Promise.resolve([])); }
    }
  });
}
