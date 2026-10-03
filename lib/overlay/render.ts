/**
 * Studio d'effets — moteur de rendu canvas : la vidéo du client + calques.
 * Même fonction pour l'aperçu et pour l'export (enregistrement du canvas).
 */
import { parseRich } from '@/lib/motion/render';
import type { Layer } from './types';

export type Box = { x: number; y: number; w: number; h: number };
export type CompositeOptions = {
  fontFamily: string;
  watermark?: boolean;
  duration: number;
  boxes?: Map<string, Box>;
  /** Temps forts de la musique (secondes), pour les effets « au rythme ». */
  beats?: number[];
  /** Horloge murale (s) : anime le grain / glitch même pendant un arrêt sur image. */
  clock?: number;
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => { const c = clamp(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
const easeOutBack = (x: number) => { const c = clamp(x); const k = 1.70158; return 1 + (k + 1) * Math.pow(c - 1, 3) + k * Math.pow(c - 1, 2); };
const easeOutElastic = (x: number) => { const c = clamp(x); return c === 0 || c === 1 ? c : Math.pow(2, -10 * c) * Math.sin((c * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; };

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Entrée (0→1) et sortie (1→0) d'un calque. */
function life(layer: Layer, t: number, inLen = 0.35, outLen = 0.25) {
  const lt = t - layer.start;
  const d = layer.end - layer.start;
  return { lt, d, p: clamp(lt / inLen), out: clamp((layer.end - t) / Math.min(outLen, d / 2)) };
}

// ---------- Vidéo de fond (zooms + filtres) ----------
function zoomState(layers: Layer[], t: number, W: number, H: number) {
  let scale = 1;
  let fx = 0.5;
  let fy = 0.5;
  let dx = 0;
  let dy = 0;
  for (const l of layers) {
    if (l.type !== 'zoom' || t < l.start || t > l.end) continue;
    const { lt, d } = life(l, t);
    let k: number;
    if (l.ease === 'punch') k = easeOutBack(lt / 0.18) * clamp((l.end - t) / 0.12);
    else k = easeInOut(lt / Math.min(0.6, d / 2)) * easeInOut((l.end - t) / Math.min(0.6, d / 2));
    const s = 1 + (l.scale - 1) * k;
    if (s > scale) { scale = s; fx = l.x; fy = l.y; }
    if (l.ease === 'shake') {
      const amp = 0.012 * Math.min(W, H) * (l.scale - 0.9) * k;
      dx += Math.sin(t * 61) * amp;
      dy += Math.cos(t * 47) * amp;
    }
  }
  return { scale, fx, fy, dx, dy };
}

type Fx = Extract<Layer, { type: 'effect' }>;

/** 0→1 : force de l'effet à l'instant t (pic sur chaque temps fort si « beat »). */
function fxStrength(l: Fx, t: number, beats: number[] | undefined, clock: number): number {
  const edge = Math.min(clamp((t - l.start) / 0.15), clamp((l.end - t) / 0.15));
  if (l.beat) {
    let last = -Infinity;
    if (beats && beats.length) {
      for (const b of beats) { if (b <= t) last = b; else break; }
    } else {
      last = Math.floor(t * 2) / 2; // 120 BPM par défaut
    }
    return l.intensity * Math.exp(-(t - last) * 7) * (edge > 0 ? 1 : 0);
  }
  return l.intensity * edge * (0.85 + 0.15 * Math.sin(clock * 9));
}

function activeFx(layers: Layer[], t: number): Fx[] {
  return layers.filter((l): l is Fx => l.type === 'effect' && t >= l.start && t <= l.end);
}

const caches = new WeakMap<HTMLCanvasElement, { base: HTMLCanvasElement; tmp: HTMLCanvasElement; small: HTMLCanvasElement; noise: HTMLCanvasElement }>();
function buffers(canvas: HTMLCanvasElement) {
  let c = caches.get(canvas);
  if (!c || c.base.width !== canvas.width || c.base.height !== canvas.height) {
    const mk = (w: number, h: number) => { const e = document.createElement('canvas'); e.width = w; e.height = h; return e; };
    const noise = mk(256, 256);
    const nctx = noise.getContext('2d')!;
    const img = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    c = { base: mk(canvas.width, canvas.height), tmp: mk(canvas.width, canvas.height), small: mk(Math.ceil(canvas.width / 10), Math.ceil(canvas.height / 10)), noise };
    caches.set(canvas, c);
  }
  return c;
}

/** Image « cover » de la vidéo dans un rectangle. */
function coverDraw(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / video.videoWidth, h / video.videoHeight);
  const vw = video.videoWidth * k;
  const vh = video.videoHeight * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, x + (w - vw) / 2, y + (h - vh) / 2, vw, vh);
  ctx.restore();
}

function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement | null, W: number, H: number, layers: Layer[], t: number, fx: Fx[], beats: number[] | undefined, clock: number) {
  if (!video || video.readyState < 2 || !video.videoWidth) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const z = zoomState(layers, t, W, H);
  let scale = z.scale;
  let dx = z.dx;
  let dy = z.dy;
  let rot = 0;
  for (const f of fx) {
    const k = fxStrength(f, t, beats, clock);
    if (f.effect === 'pulse') scale *= 1 + 0.14 * k;
    if (f.effect === 'zoomin') scale *= 1 + 0.35 * f.intensity * clamp((t - f.start) / Math.max(0.1, f.end - f.start));
    if (f.effect === 'shake') { const a = Math.min(W, H) * 0.03 * k; dx += Math.sin(clock * 71) * a; dy += Math.cos(clock * 53) * a; }
    if (f.effect === 'spin') rot += f.beat ? Math.sin(clock * 20) * 0.08 * k : (t - f.start) * f.intensity * 2;
  }
  const echo = fx.find((f) => f.effect === 'echo');
  ctx.save();
  if (echo) ctx.globalAlpha = 1 - 0.8 * echo.intensity; // l'image précédente reste visible → traînée
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.translate(z.fx * W + dx, z.fy * H + dy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-z.fx * W, -z.fy * H);
  if (fx.some((f) => f.effect === 'split')) {
    for (let i = 0; i < 3; i++) coverDraw(ctx, video, 0, (H / 3) * i, W, H / 3);
  } else {
    coverDraw(ctx, video, 0, 0, W, H);
  }
  ctx.restore();
  if (fx.some((f) => f.effect === 'mirror')) {
    // Moitié gauche reflétée à droite (effet kaléidoscope symétrique).
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(ctx.canvas, 0, 0, W / 2, H, 0, 0, W / 2, H);
    ctx.restore();
  }
}

/** Retouches de l'image : RVB, glitch, VHS, négatif, flou, grain. */
function postFx(ctx: CanvasRenderingContext2D, bufs: ReturnType<typeof buffers>, W: number, H: number, fx: Fx[], t: number, beats: number[] | undefined, clock: number) {
  for (const f of fx) {
    const k = fxStrength(f, t, beats, clock);
    if (k <= 0.01) continue;
    if (f.effect === 'rgb' || f.effect === 'glitch' || f.effect === 'vhs') {
      const d = (f.effect === 'vhs' ? 6 : 26) * k * (W / 1080) * (f.effect === 'glitch' ? 0.5 + Math.random() : 1);
      const tctx = bufs.tmp.getContext('2d')!;
      // Canal rouge décalé à droite, cyan à gauche (somme additive).
      tctx.globalCompositeOperation = 'source-over';
      tctx.drawImage(ctx.canvas, 0, 0);
      tctx.globalCompositeOperation = 'multiply';
      tctx.fillStyle = '#ff0000';
      tctx.fillRect(0, 0, W, H);
      const red = bufs.tmp;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(0, 0, W, H); // ne garde que vert + bleu
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(red, d, 0);
      ctx.restore();
      if (f.effect === 'glitch' && k > 0.25) {
        const slices = 3 + Math.floor(k * 6);
        for (let i = 0; i < slices; i++) {
          const y = Math.random() * H;
          const h = (0.01 + Math.random() * 0.06) * H;
          const off = (Math.random() - 0.5) * W * 0.12 * k;
          ctx.drawImage(ctx.canvas, 0, y, W, h, off, y, W, h);
        }
      }
      if (f.effect === 'vhs') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = 'rgba(255,120,60,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    if (f.effect === 'invert') {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = `rgba(255,255,255,${k})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (f.effect === 'blur') {
      const sctx = bufs.small.getContext('2d')!;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(ctx.canvas, 0, 0, bufs.small.width, bufs.small.height);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bufs.small, 0, 0, W, H);
      ctx.restore();
    }
    if (f.effect === 'grain' || f.effect === 'vhs') {
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.25 * k;
      ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(bufs.noise, 'repeat');
      if (pat) {
        ctx.translate((clock * 997) % 256, (clock * 613) % 256);
        ctx.fillStyle = pat;
        ctx.fillRect(-256, -256, W + 512, H + 512);
      }
      ctx.restore();
    }
    if (f.effect === 'strobe') {
      ctx.save();
      ctx.globalAlpha = 0.75 * k;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

/** Filtres couleur par modes de fusion (fonctionne sur tous les navigateurs). */
function drawFilters(ctx: CanvasRenderingContext2D, W: number, H: number, layers: Layer[], t: number) {
  for (const l of layers) {
    if (l.type !== 'filter' || t < l.start || t > l.end) continue;
    const { p, out } = life(l, t, 0.4, 0.4);
    const a = l.intensity * Math.min(p, out);
    if (a <= 0) continue;
    ctx.save();
    switch (l.filter) {
      case 'bw':
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = `rgba(128,128,128,${a})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'warm':
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(255,140,40,${0.55 * a})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'cool':
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(40,120,255,${0.55 * a})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'vibrant':
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(255,255,255,${0.12 * a})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = `rgba(255,0,0,${0.18 * a})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'vintage':
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(200,150,90,${0.6 * a})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(30,20,10,${0.15 * a})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'dark': {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      case 'cinema': {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = `rgba(0,90,120,${0.35 * a})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        const bar = H * 0.11 * a;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, bar);
        ctx.fillRect(0, H - bar, W, bar);
        break;
      }
    }
    ctx.restore();
  }
}

// ---------- Texte ----------
type Word = { text: string; accent: boolean };
type LineW = { words: (Word & { w: number; i: number })[]; width: number };
function wrap(ctx: CanvasRenderingContext2D, words: Word[], max: number): LineW[] {
  const space = ctx.measureText(' ').width;
  const lines: LineW[] = [];
  let cur: LineW = { words: [], width: 0 };
  words.forEach((wd, i) => {
    const w = ctx.measureText(wd.text).width;
    if (cur.words.length && cur.width + space + w > max) { lines.push(cur); cur = { words: [], width: 0 }; }
    cur.width = cur.words.length ? cur.width + space + w : w;
    cur.words.push({ ...wd, w, i });
  });
  if (cur.words.length) lines.push(cur);
  return lines;
}

function drawText(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'text' }>, t: number, W: number, H: number, font: string, boxes?: Map<string, Box>) {
  const { lt, p, out } = life(l, t);
  const scaleW = W / 1080;
  let size = l.size * scaleW;
  const raw = l.uppercase ? l.text.toUpperCase() : l.text;
  let words = parseRich(raw);
  if (!words.length) return;
  ctx.font = `900 ${size}px ${font}`;
  let lines = wrap(ctx, words, W * 0.86);
  while (lines.length > 4 && size > 24) { size *= 0.9; ctx.font = `900 ${size}px ${font}`; lines = wrap(ctx, words, W * 0.86); }
  const lh = size * 1.15;
  const totalH = lines.length * lh;
  const maxW = Math.max(...lines.map((ln) => ln.width));
  const cx = l.x * W;
  const cy = l.y * H;
  const pad = size * 0.28;
  boxes?.set(l.id, { x: cx - maxW / 2 - pad, y: cy - totalH / 2 - pad, w: maxW + pad * 2, h: totalH + pad * 2 });

  // Animation globale d'entrée / sortie.
  let alpha = Math.min(1, out);
  let sc = 1;
  let oy = 0;
  switch (l.anim) {
    case 'pop': sc = 0.5 + 0.5 * easeOutBack(lt / 0.35); alpha *= clamp(lt / 0.15); break;
    case 'fade': alpha *= clamp(lt / 0.4); break;
    case 'slide': oy = (1 - easeOutCubic(lt / 0.45)) * size * 1.2; alpha *= clamp(lt / 0.3); break;
    case 'bounce': sc = easeOutElastic(lt / 0.8); break;
    case 'zoom': sc = 1.8 - 0.8 * easeOutCubic(lt / 0.4); alpha *= clamp(lt / 0.25); break;
    default: break;
  }
  if (alpha <= 0.001 || sc <= 0.01) return;
  const accent = l.accent ?? '#c8ff3d';
  const boxColor = l.boxColor ?? '#000000';
  const totalChars = raw.replace(/\*/g, '').length;
  const shownChars = l.anim === 'typewriter' ? Math.floor(clamp(lt / Math.max(0.6, totalChars * 0.045)) * totalChars) : Infinity;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy + oy);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -cy);

  if (l.box === 'box' || l.box === 'pill') {
    ctx.fillStyle = rgba(boxColor, 0.85);
    roundRect(ctx, cx - maxW / 2 - pad, cy - totalH / 2 - pad * 0.6, maxW + pad * 2, totalH + pad * 1.2, l.box === 'pill' ? (totalH + pad * 1.2) / 2 : size * 0.18);
    ctx.fill();
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  let charCount = 0;
  lines.forEach((line, li) => {
    let x = cx - line.width / 2;
    const y = cy - totalH / 2 + li * lh + lh / 2;
    for (const w of line.words) {
      let text = w.text;
      if (shownChars !== Infinity) {
        const remain = shownChars - charCount;
        charCount += text.length + 1;
        if (remain <= 0) { x += w.w + space; continue; }
        text = text.slice(0, remain);
      }
      let wa = 1;
      let wy = 0;
      if (l.anim === 'words') {
        const wp = clamp((lt - w.i * 0.12) / 0.3);
        wa = wp;
        wy = (1 - easeOutBack(wp)) * size * 0.4;
      }
      if (wa <= 0) { x += w.w + space; continue; }
      ctx.save();
      ctx.globalAlpha *= wa;
      const color = w.accent ? accent : l.color;
      if (l.box === 'highlight' && w.accent) {
        ctx.fillStyle = accent;
        ctx.fillRect(x - size * 0.06, y - size * 0.48 + wy, w.w + size * 0.12, size * 0.92);
      }
      ctx.font = `900 ${size}px ${font}`;
      if (l.box === 'none' || l.box === 'highlight') {
        ctx.lineJoin = 'round';
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(text, x, y + wy);
      }
      if (l.box === 'outline') {
        ctx.shadowColor = color;
        ctx.shadowBlur = size * 0.45;
      }
      ctx.fillStyle = l.box === 'highlight' && w.accent ? (isLight(accent) ? '#000000' : '#ffffff') : color;
      ctx.fillText(text, x, y + wy);
      ctx.restore();
      x += w.w + space;
    }
  });
  ctx.restore();
}

function drawEmoji(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'emoji' }>, t: number, W: number, H: number, boxes?: Map<string, Box>) {
  const { lt, out } = life(l, t);
  const size = l.size * (W / 1080);
  const cx = l.x * W;
  const cy = l.y * H;
  boxes?.set(l.id, { x: cx - size / 2, y: cy - size / 2, w: size, h: size });
  let sc = 1;
  let rot = 0;
  let oy = 0;
  let ox = 0;
  switch (l.anim) {
    case 'pop': sc = easeOutBack(lt / 0.35); break;
    case 'bounce': sc = easeOutElastic(lt / 0.9); oy = -Math.abs(Math.sin(lt * 6)) * size * 0.12; break;
    case 'float': sc = easeOutCubic(lt / 0.3); oy = Math.sin(lt * 3) * size * 0.1; break;
    case 'spin': sc = easeOutBack(lt / 0.4); rot = (1 - easeOutCubic(lt / 0.6)) * Math.PI * 2; break;
    case 'shake': sc = easeOutBack(lt / 0.3); ox = Math.sin(lt * 40) * size * 0.05 * clamp(1 - lt / 1.2); rot = Math.sin(lt * 30) * 0.1; break;
  }
  sc *= 0.6 + 0.4 * out;
  ctx.save();
  ctx.globalAlpha = out;
  ctx.translate(cx + ox, cy + oy);
  ctx.rotate(rot);
  ctx.scale(sc, sc);
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(l.emoji, 0, size * 0.05);
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'shape' }>, t: number, W: number, H: number, boxes?: Map<string, Box>) {
  const { lt, out } = life(l, t);
  const p = easeOutCubic(lt / 0.5);
  const w = l.w * W;
  const h = l.h * H;
  const cx = l.x * W;
  const cy = l.y * H;
  boxes?.set(l.id, { x: cx - w / 2, y: cy - h / 2, w, h });
  const lw = Math.max(4, W * 0.012);
  ctx.save();
  ctx.globalAlpha = out;
  ctx.translate(cx, cy);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.strokeStyle = l.color;
  ctx.fillStyle = l.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = rgba(l.color, 0.6);
  ctx.shadowBlur = lw * 1.5;
  switch (l.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
      break;
    case 'underline': {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, h * 0.4, -w / 2 + w * p, 0);
      ctx.stroke();
      break;
    }
    case 'box':
      ctx.globalAlpha *= p;
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
      ctx.stroke();
      break;
    case 'arrow': {
      const len = w * p;
      const sx = -w / 2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + len, 0);
      ctx.stroke();
      if (p > 0.6) {
        const head = Math.min(w, H * 0.05) * 0.35;
        ctx.beginPath();
        ctx.moveTo(sx + len, 0);
        ctx.lineTo(sx + len - head, -head * 0.7);
        ctx.lineTo(sx + len - head, head * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function kineticTitle(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, maxW: number, lt: number, font: string, color: string, accent: string): number {
  const words = parseRich(text);
  ctx.font = `900 ${size}px ${font}`;
  let lines = wrap(ctx, words, maxW);
  let fs = size;
  while (lines.length > 4 && fs > size * 0.55) { fs *= 0.9; ctx.font = `900 ${fs}px ${font}`; lines = wrap(ctx, words, maxW); }
  const lh = fs * 1.12;
  const top = cy - (lines.length * lh) / 2;
  const space = ctx.measureText(' ').width;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((ln, li) => {
    let x = cx - ln.width / 2;
    const y = top + li * lh + lh / 2;
    for (const w of ln.words) {
      const p = clamp((lt - w.i * 0.08) / 0.42);
      if (p > 0) {
        const e = easeOutBack(p);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 1.6);
        ctx.translate(x + w.w / 2, y + (1 - e) * fs * 0.45);
        ctx.scale(0.82 + 0.18 * e, 0.82 + 0.18 * e);
        ctx.fillStyle = w.accent ? accent : color;
        if (w.accent) { ctx.shadowColor = rgba(accent, 0.7); ctx.shadowBlur = fs * 0.3; }
        ctx.fillText(w.text, -w.w / 2, 0);
        ctx.restore();
      }
      x += w.w + space;
    }
  });
  return top + lines.length * lh;
}

function drawIntro(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'intro' }>, t: number, W: number, H: number, font: string) {
  const { lt, out } = life(l, t, 0.3, 0.4);
  const U = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = out;
  if (l.backdrop === 'color') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, rgba(l.color, 0.92));
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = l.backdrop === 'blur' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.65)';
  }
  ctx.fillRect(0, 0, W, H);
  const textColor = l.backdrop === 'color' && isLight(l.color) ? '#0b0b10' : '#ffffff';
  const accent = l.backdrop === 'color' ? textColor : l.color;
  const bottom = kineticTitle(ctx, l.title, W / 2, H * 0.45, U * 0.11, W * 0.84, lt, font, textColor, accent);
  const bp = easeInOut((lt - 0.4) / 0.5);
  ctx.fillStyle = accent;
  roundRect(ctx, W / 2 - (W * 0.22 * bp), bottom + U * 0.03, W * 0.44 * bp, U * 0.012, U * 0.006);
  ctx.fill();
  if (l.subtitle) {
    ctx.globalAlpha = out * clamp((lt - 0.6) / 0.4);
    ctx.font = `800 ${U * 0.045}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(textColor === '#ffffff' ? '#ffffff' : '#000000', 0.85);
    ctx.fillText(l.subtitle.replace(/\*/g, ''), W / 2, bottom + U * 0.12);
  }
  ctx.restore();
}

function drawEndcard(ctx: CanvasRenderingContext2D, l: Extract<Layer, { type: 'endcard' }>, t: number, W: number, H: number, font: string) {
  const { lt } = life(l, t);
  const U = Math.min(W, H);
  const enter = easeOutCubic(lt / 0.5);
  ctx.save();
  ctx.globalAlpha = enter;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // Logo / initiale de la marque.
  const r = U * 0.1;
  const lp = easeOutBack((lt - 0.1) / 0.5);
  if (lp > 0) {
    ctx.save();
    ctx.translate(W / 2, H * 0.32);
    ctx.scale(lp, lp);
    ctx.fillStyle = l.color;
    ctx.shadowColor = rgba(l.color, 0.7);
    ctx.shadowBlur = U * 0.06;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `900 ${r}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight(l.color) ? '#0b0b10' : '#ffffff';
    const initial = ((l.brand || l.title).replace(/[^\p{L}\p{N}]/gu, '')[0] ?? '★').toUpperCase();
    ctx.fillText(initial, 0, r * 0.06);
    ctx.restore();
  }
  if (l.brand) {
    ctx.globalAlpha = clamp((lt - 0.3) / 0.4);
    ctx.font = `800 ${U * 0.045}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(l.brand, W / 2, H * 0.32 + r + U * 0.07);
    ctx.globalAlpha = 1;
  }
  const bottom = kineticTitle(ctx, l.title, W / 2, H * 0.52, U * 0.09, W * 0.84, lt - 0.3, font, '#ffffff', l.color);
  if (l.button) {
    const bp = easeOutBack((lt - 0.8) / 0.45);
    if (bp > 0) {
      ctx.font = `900 ${U * 0.05}px ${font}`;
      const tw = ctx.measureText(l.button).width;
      const bw = tw + U * 0.16;
      const bh = U * 0.11;
      const pulse = 1 + 0.04 * Math.sin(Math.max(0, lt - 1.2) * 5);
      ctx.save();
      ctx.translate(W / 2, bottom + U * 0.16);
      ctx.scale(bp * pulse, bp * pulse);
      ctx.fillStyle = l.color;
      ctx.shadowColor = rgba(l.color, 0.7);
      ctx.shadowBlur = U * 0.05;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isLight(l.color) ? '#0b0b10' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.button, 0, U * 0.003);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Dessine l'image complète (vidéo + calques) à l'instant t. */
export function drawComposite(ctx: CanvasRenderingContext2D, video: HTMLVideoElement | null, layers: Layer[], t: number, opts: CompositeOptions) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  const clock = opts.clock ?? t;
  const fx = activeFx(layers, t);
  // La vidéo est dessinée dans un tampon (permet la traînée « écho »
  // sans que les textes laissent des traces), puis retouchée.
  const bufs = buffers(ctx.canvas);
  const bctx = bufs.base.getContext('2d')!;
  bctx.save();
  bctx.globalAlpha = 1;
  bctx.globalCompositeOperation = 'source-over';
  drawVideo(bctx, video, W, H, layers, t, fx, opts.beats, clock);
  bctx.restore();
  ctx.drawImage(bufs.base, 0, 0);
  postFx(ctx, bufs, W, H, fx, t, opts.beats, clock);
  drawFilters(ctx, W, H, layers, t);
  opts.boxes?.clear();
  for (const l of layers) {
    if (t < l.start || t > l.end) continue;
    ctx.save();
    switch (l.type) {
      case 'text': drawText(ctx, l, t, W, H, opts.fontFamily, opts.boxes); break;
      case 'emoji': drawEmoji(ctx, l, t, W, H, opts.boxes); break;
      case 'shape': drawShape(ctx, l, t, W, H, opts.boxes); break;
      case 'progress': {
        const thick = Math.max(6, H * 0.006);
        const p = clamp(t / opts.duration);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        const y = l.position === 'top' ? 0 : H - thick;
        ctx.fillRect(0, y, W, thick);
        ctx.fillStyle = l.color;
        ctx.shadowColor = rgba(l.color, 0.8);
        ctx.shadowBlur = thick * 2;
        ctx.fillRect(0, y, W * p, thick);
        break;
      }
      case 'intro': drawIntro(ctx, l, t, W, H, opts.fontFamily); break;
      case 'endcard': drawEndcard(ctx, l, t, W, H, opts.fontFamily); break;
      case 'flash': {
        const p = clamp((t - l.start) / Math.max(0.05, l.end - l.start));
        ctx.globalAlpha = (1 - p) * 0.85;
        ctx.fillStyle = l.color;
        ctx.fillRect(0, 0, W, H);
        break;
      }
      default: break;
    }
    ctx.restore();
  }
  if (opts.watermark) {
    ctx.globalAlpha = 0.6;
    ctx.font = `800 ${W * 0.026}px ${opts.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Réalisé avec IziCut', W - W * 0.04, H * 0.025);
  }
  ctx.restore();
}
