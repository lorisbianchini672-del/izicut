/**
 * Analyse visuelle de la vidéo dans le navigateur : à intervalles réguliers
 * on compare deux images réduites pour mesurer le MOUVEMENT et repérer OÙ il
 * se passe (centre du mouvement ≈ la personne qui bouge). Le moteur de
 * montage s'en sert pour viser les zooms et placer ralentis / effets sur les
 * vrais moments forts.
 */
export type VideoAnalysis = {
  step: number;
  motion: number[]; // 0 → 1, normalisé
  centers: { x: number; y: number }[];
  /** Planche de 9 images (3×3) pour que l'IA « voie » la vidéo. */
  sheet?: { image: string; times: number[] };
};

export async function analyzeVideo(url: string, duration: number, onProgress?: (p: number) => void): Promise<VideoAnalysis> {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('lecture impossible'));
    setTimeout(() => resolve(), 8000);
  });
  const W = 48;
  const H = 86;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const samples = Math.min(180, Math.max(20, Math.round(duration / 0.12)));
  const step = duration / samples;
  const motion: number[] = [];
  const centers: { x: number; y: number }[] = [];
  let prev: Float32Array | null = null;
  // Planche contact 3×3 pour la vision de l'IA.
  const sheetTimes = Array.from({ length: 9 }, (_, i) => Math.round(((i + 0.5) / 9) * duration * 10) / 10);
  const sheet = document.createElement('canvas');
  sheet.width = 540;
  sheet.height = 960;
  const sctx = sheet.getContext('2d')!;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, 540, 960);
  let sheetOk = true;
  let nextSheet = 0;
  for (let i = 0; i < samples; i++) {
    const t = Math.min(duration - 0.05, i * step);
    await new Promise<void>((resolve) => {
      const done = () => { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = t;
      setTimeout(done, 1500);
    });
    const k = Math.max(W / (video.videoWidth || W), H / (video.videoHeight || H));
    const vw = (video.videoWidth || W) * k;
    const vh = (video.videoHeight || H) * k;
    try {
      ctx.drawImage(video, (W - vw) / 2, (H - vh) / 2, vw, vh);
    } catch {
      break;
    }
    while (nextSheet < 9 && t >= sheetTimes[nextSheet] - step / 2) {
      const cw = 180;
      const ch = 320;
      const kk = Math.max(cw / (video.videoWidth || cw), ch / (video.videoHeight || ch));
      const ww = (video.videoWidth || cw) * kk;
      const hh = (video.videoHeight || ch) * kk;
      const x = (nextSheet % 3) * cw;
      const y = Math.floor(nextSheet / 3) * ch;
      sctx.save();
      sctx.beginPath();
      sctx.rect(x, y, cw, ch);
      sctx.clip();
      sctx.drawImage(video, x + (cw - ww) / 2, y + (ch - hh) / 2, ww, hh);
      sctx.restore();
      sctx.fillStyle = 'rgba(0,0,0,0.6)';
      sctx.fillRect(x, y, 46, 22);
      sctx.fillStyle = '#fff';
      sctx.font = 'bold 14px sans-serif';
      sctx.fillText(`${nextSheet + 1}`, x + 6, y + 16);
      nextSheet++;
    }
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, W, H).data;
    } catch {
      break; // vidéo d'un autre site sans autorisation : pas d'analyse visuelle
    }
    const lum = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) lum[p] = (data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114) / 255;
    if (prev) {
      let sum = 0;
      let cx = 0;
      let cy = 0;
      for (let p = 0; p < W * H; p++) {
        const d = Math.abs(lum[p] - prev[p]);
        if (d > 0.04) { sum += d; cx += d * (p % W); cy += d * Math.floor(p / W); }
      }
      motion.push(sum / (W * H));
      centers.push(sum > 0 ? { x: cx / sum / W, y: cy / sum / H } : centers[centers.length - 1] ?? { x: 0.5, y: 0.45 });
    } else {
      motion.push(0);
      centers.push({ x: 0.5, y: 0.45 });
    }
    prev = lum;
    onProgress?.((i + 1) / samples);
  }
  // Normalisation + lissage léger.
  const max = Math.max(1e-6, ...motion);
  const norm = motion.map((m, i) => ((motion[i - 1] ?? m) + 2 * m + (motion[i + 1] ?? m)) / 4 / max);
  // Centres lissés (la caméra virtuelle ne doit pas sauter).
  const smooth = centers.map((c, i) => {
    let x = 0;
    let y = 0;
    let n = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(centers.length - 1, i + 3); j++) { x += centers[j].x; y += centers[j].y; n++; }
    return { x: Math.min(0.8, Math.max(0.2, x / n)), y: Math.min(0.75, Math.max(0.25, y / n)) };
  });
  let sheetData: VideoAnalysis['sheet'];
  try {
    if (sheetOk && nextSheet > 0) sheetData = { image: sheet.toDataURL('image/jpeg', 0.72), times: sheetTimes.slice(0, nextSheet) };
  } catch {
    sheetOk = false;
  }
  video.removeAttribute('src');
  video.load();
  return { step, motion: norm, centers: smooth, sheet: sheetData };
}
