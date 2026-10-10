/**
 * Vidéo d'inspiration (navigateur uniquement) : analysée sur l'appareil du
 * client, sans l'envoyer à personne. On mesure le rythme de montage (changements
 * de plan), les couleurs dominantes, la luminosité, et on prépare une planche
 * de 6 images réduites pour que l'IA décrive le style (facultatif).
 */

export type VideoRef = { name: string; text: string; sheet: string | null };

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function load(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error('vidéo illisible'));
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener('seeked', done); resolve(); };
    v.addEventListener('seeked', done);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
    setTimeout(done, 1500);
  });
}

export async function analyzeVideoRef(file: File): Promise<VideoRef> {
  const url = URL.createObjectURL(file);
  try {
    const v = await load(url);
    const duration = Math.min(v.duration || 0, 90);
    if (!duration) throw new Error('durée inconnue');
    const small = document.createElement('canvas');
    small.width = 48; small.height = 27;
    const sctx = small.getContext('2d', { willReadFrequently: true })!;
    const step = duration > 40 ? 0.5 : 0.25;
    let prev: Uint8ClampedArray | null = null;
    let cuts = 0;
    let light = 0;
    let n = 0;
    const buckets = new Map<string, { r: number; g: number; b: number; c: number }>();
    for (let t = 0; t < duration; t += step) {
      await seek(v, t);
      sctx.drawImage(v, 0, 0, small.width, small.height);
      const d = sctx.getImageData(0, 0, small.width, small.height).data;
      let diff = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        light += r * 0.299 + g * 0.587 + b * 0.114;
        if (prev) diff += Math.abs(r - prev[i]) + Math.abs(g - prev[i + 1]) + Math.abs(b - prev[i + 2]);
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const bk = buckets.get(key) ?? { r: 0, g: 0, b: 0, c: 0 };
        bk.r += r; bk.g += g; bk.b += b; bk.c++;
        buckets.set(key, bk);
      }
      if (prev && diff / (d.length * 0.75) > 38) cuts++;
      prev = new Uint8ClampedArray(d);
      n++;
    }
    const avgLight = light / (n * small.width * small.height);
    const palette = [...buckets.values()].sort((a, b) => b.c - a.c).slice(0, 5).map((b) => hex(b.r / b.c, b.g / b.c, b.b / b.c));
    const shot = (cuts + 1) > 0 ? duration / (cuts + 1) : duration;
    const rhythm = shot < 0.8 ? 'très rapide (montage nerveux)' : shot < 1.6 ? 'rapide' : shot < 3 ? 'modéré' : 'lent et posé';
    // Planche de 6 images (320 px) pour la description du style par l'IA.
    const W = 320, H = Math.round((320 * (v.videoHeight || 9)) / (v.videoWidth || 16));
    const sheet = document.createElement('canvas');
    sheet.width = W * 3; sheet.height = H * 2;
    const ctx = sheet.getContext('2d')!;
    for (let k = 0; k < 6; k++) {
      await seek(v, (duration * (k + 0.5)) / 6);
      ctx.drawImage(v, (k % 3) * W, Math.floor(k / 3) * H, W, H);
    }
    const text = `Analyse de la vidéo d'inspiration « ${file.name.slice(0, 60)} » (à imiter dans l'ESPRIT, sans la copier) : durée ${duration.toFixed(0)} s, environ ${cuts + 1} plans, un changement de plan toutes les ${shot.toFixed(1)} s → rythme ${rhythm}. Format ${v.videoWidth >= v.videoHeight ? 'horizontal' : 'vertical'}. Ambiance ${avgLight < 70 ? 'sombre' : avgLight > 170 ? 'très claire' : 'contrastée'}. Couleurs dominantes : ${palette.join(', ')}.`;
    return { name: file.name.slice(0, 80), text, sheet: sheet.toDataURL('image/jpeg', 0.72) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
