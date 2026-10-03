/**
 * Détection des temps forts (beats) dans le son d'une vidéo, directement
 * dans le navigateur : énergie par fenêtres → montées brusques → pics.
 * Suffisant pour caler zooms, flashs et glitchs sur une musique.
 */
export async function detectBeats(data: ArrayBuffer, maxSeconds = 240): Promise<number[]> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctx();
  try {
    const audio = await ac.decodeAudioData(data.slice(0));
    const sr = audio.sampleRate;
    const len = Math.min(audio.length, Math.floor(maxSeconds * sr));
    const ch0 = audio.getChannelData(0);
    const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    const hop = 512;
    const energies: number[] = [];
    for (let i = 0; i + hop <= len; i += hop) {
      let e = 0;
      for (let j = i; j < i + hop; j++) {
        const v = ch1 ? (ch0[j] + ch1[j]) / 2 : ch0[j];
        e += v * v;
      }
      energies.push(Math.log10(1e-9 + e / hop));
    }
    // Force d'attaque : hausse d'énergie par rapport à la fenêtre précédente.
    const onset = energies.map((e, i) => (i ? Math.max(0, e - energies[i - 1]) : 0));
    const frameSec = hop / sr;
    const win = Math.round(0.5 / frameSec);
    const minGap = 0.22;
    const beats: number[] = [];
    let last = -1;
    for (let i = 1; i < onset.length - 1; i++) {
      const from = Math.max(0, i - win);
      const to = Math.min(onset.length, i + win);
      let mean = 0;
      for (let k = from; k < to; k++) mean += onset[k];
      mean /= to - from;
      const threshold = mean * 1.6 + 0.02;
      if (onset[i] > threshold && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
        const t = i * frameSec;
        if (t - last >= minGap) { beats.push(Math.round(t * 100) / 100); last = t; }
      }
    }
    return beats;
  } catch {
    return [];
  } finally {
    void ac.close();
  }
}

/** Fichier choisi dans le Studio Motion, transmis à la page « Modifier ma vidéo ». */
let pending: File | null = null;
export function setPendingVideo(file: File | null) { pending = file; }
export function takePendingVideo(): File | null { const f = pending; pending = null; return f; }
