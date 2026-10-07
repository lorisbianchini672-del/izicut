/**
 * Studio Motion — moteur de rendu canvas.
 * drawFrame() dessine l'image exacte à l'instant t : le même code sert à
 * l'aperçu en direct et à l'export MP4 (enregistrement du canvas).
 */
import { makeQr } from './qr';
import { FORMAT_SIZE, TRANSITION, type Magic, type MotionProject, type Scene } from './types';

const qrCache = new Map<string, boolean[][] | null>();
function qrFor(text: string): boolean[][] | null {
  if (!qrCache.has(text)) {
    try { qrCache.set(text, makeQr(text)); } catch { qrCache.set(text, null); }
    if (qrCache.size > 20) qrCache.delete(qrCache.keys().next().value as string);
  }
  return qrCache.get(text) ?? null;
}

export type MotionAssets = {
  logo?: HTMLImageElement | null;
  screenshot?: HTMLImageElement | null;
  videos?: (HTMLVideoElement | null)[];
  /** Photos du client (produits, locaux, équipe…). */
  photos?: (HTMLImageElement | null)[];
};
export type RenderOptions = { fontFamily: string; watermark?: boolean };

// ---------- Courbes d'animation ----------
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInCubic = (x: number) => Math.pow(clamp(x), 3);
const easeInOut = (x: number) => { const c = clamp(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
const easeOutBack = (x: number) => { const c = clamp(x); const k = 1.70158; return 1 + (k + 1) * Math.pow(c - 1, 3) + k * Math.pow(c - 1, 2); };
const progress = (t: number, start: number, len: number) => clamp((t - start) / len);

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
}
/** Pseudo-aléatoire stable (mêmes particules à chaque image). */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- Texte riche (*accent*) ----------
type Word = { text: string; accent: boolean };
export function parseRich(text: string): Word[] {
  const out: Word[] = [];
  let accent = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let w = raw;
    const opens = w.startsWith('*');
    if (opens) { accent = true; w = w.slice(1); }
    const closes = w.endsWith('*') || /\*[.,!?;:…]+$/.test(w);
    w = w.replace(/\*/g, '');
    if (w) out.push({ text: w, accent });
    if (closes) accent = false;
  }
  return out;
}

type Line = { words: (Word & { width: number; index: number })[]; width: number };
function wrap(ctx: CanvasRenderingContext2D, words: Word[], maxWidth: number): Line[] {
  const space = ctx.measureText(' ').width;
  const lines: Line[] = [];
  let cur: Line = { words: [], width: 0 };
  words.forEach((w, index) => {
    const width = ctx.measureText(w.text).width;
    const next = cur.words.length ? cur.width + space + width : width;
    if (cur.words.length && next > maxWidth) {
      lines.push(cur);
      cur = { words: [], width: 0 };
    }
    cur.width = cur.words.length ? cur.width + space + width : width;
    cur.words.push({ ...w, width, index });
  });
  if (cur.words.length) lines.push(cur);
  return lines;
}

type Ctx = {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  U: number;
  vertical: boolean;
  theme: MotionProject['theme'];
  font: string;
  assets: MotionAssets;
  brand: string;
};

function setFont(c: Ctx, weight: number, size: number) {
  c.ctx.font = `${weight} ${Math.round(size)}px ${c.font}`;
}

/**
 * Texte « cinétique » : chaque mot arrive l'un après l'autre (montée +
 * rebond + fondu), les mots *accent* prennent la couleur d'accent.
 * Renvoie la hauteur occupée.
 */
function kinetic(c: Ctx, text: string, cx: number, cy: number, size: number, maxWidth: number, lt: number, opts: { weight?: number; stagger?: number; color?: string; start?: number; upper?: boolean } = {}): { top: number; bottom: number; lastLineWidth: number } {
  const { ctx } = c;
  const weight = opts.weight ?? 900;
  const stagger = opts.stagger ?? 0.07;
  const start = opts.start ?? 0;
  const words = parseRich(opts.upper ? text.toUpperCase() : text);
  let fs = size;
  setFont(c, weight, fs);
  let lines = wrap(ctx, words, maxWidth);
  // Trop de lignes : on réduit la taille pour que ça tienne.
  while (lines.length > 4 && fs > size * 0.55) {
    fs *= 0.9;
    setFont(c, weight, fs);
    lines = wrap(ctx, words, maxWidth);
  }
  const lh = fs * 1.12;
  const total = lines.length * lh;
  const top = cy - total / 2;
  const space = ctx.measureText(' ').width;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lines.forEach((line, li) => {
    let x = cx - line.width / 2;
    const y = top + li * lh + lh / 2;
    for (const w of line.words) {
      const p = progress(lt, start + w.index * stagger, 0.42);
      if (p > 0) {
        const e = easeOutBack(p);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 1.6);
        ctx.translate(x + w.width / 2, y + (1 - e) * fs * 0.45);
        const s = 0.82 + 0.18 * e;
        ctx.scale(s, s);
        if (w.accent) {
          ctx.fillStyle = c.theme.primary;
          if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.75); ctx.shadowBlur = fs * 0.35; }
          if (c.theme.style === 'bold') {
            // Surlignage « marqueur » derrière le mot.
            const hp = easeOutCubic(progress(lt, start + w.index * stagger + 0.2, 0.35));
            ctx.save();
            ctx.fillStyle = rgba(c.theme.primary, 0.9);
            ctx.fillRect(-w.width / 2 - fs * 0.08, -fs * 0.42, (w.width + fs * 0.16) * hp, fs * 0.84);
            ctx.restore();
            ctx.fillStyle = c.theme.background;
          }
        } else {
          ctx.fillStyle = opts.color ?? c.theme.text;
        }
        ctx.fillText(w.text, -w.width / 2, 0);
        ctx.restore();
      }
      x += w.width + space;
    }
  });
  return { top, bottom: top + total, lastLineWidth: lines[lines.length - 1]?.width ?? 0 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- Fond animé ----------
function background(c: Ctx, t: number) {
  const { ctx, W, H, U, theme } = c;
  const light = isLight(theme.background);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  // Halos colorés qui dérivent lentement.
  const blobs = [
    { color: theme.primary, x: 0.2 + 0.12 * Math.sin(t * 0.5), y: 0.25 + 0.08 * Math.cos(t * 0.4), r: 0.75 },
    { color: theme.accent, x: 0.85 + 0.1 * Math.cos(t * 0.35), y: 0.7 + 0.1 * Math.sin(t * 0.45), r: 0.8 },
    { color: theme.primary, x: 0.5 + 0.2 * Math.sin(t * 0.25 + 2), y: 1.05, r: 0.6 }
  ];
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * U);
    g.addColorStop(0, rgba(b.color, light ? 0.16 : 0.22));
    g.addColorStop(1, rgba(b.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const motif = theme.motif ?? 'particles';
  // Grille en perspective qui défile (styles néon / bold).
  if (theme.style !== 'clean' && (motif === 'particles' || motif === 'lines')) {
    ctx.save();
    ctx.strokeStyle = rgba(light ? '#000000' : '#ffffff', 0.05);
    ctx.lineWidth = Math.max(1, U * 0.0015);
    const step = U * 0.09;
    const off = (t * U * 0.03) % step;
    for (let x = -step + off; x < W + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -step + off; y < H + step; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
  drawMotif(c, motif, t, light);
  // Vignette.
  const v = ctx.createRadialGradient(W / 2, H / 2, U * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, light ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/** Textures « signature » : chaque marque a son univers (bulles d'un soda, farine d'une boulangerie…). */
function drawMotif(c: Ctx, motif: NonNullable<MotionProject['theme']['motif']>, t: number, light: boolean) {
  const { ctx, W, H, U, theme } = c;
  ctx.save();
  switch (motif) {
    case 'particles':
      for (let i = 0; i < 28; i++) {
        const speed = 0.02 + rand(i) * 0.05;
        const x = rand(i + 50) * W + Math.sin(t * 0.6 + i) * U * 0.01;
        const y = H - (((rand(i + 100) + t * speed) % 1) * (H + 40)) + 20;
        const r = U * (0.0015 + rand(i + 7) * 0.0035);
        ctx.fillStyle = rgba(i % 3 ? theme.primary : theme.accent, 0.25 + 0.35 * rand(i + 3));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'bubbles':
      // Bulles qui montent en ondulant (boissons, bain, lessive…).
      for (let i = 0; i < 34; i++) {
        const r = U * (0.006 + rand(i + 9) * 0.03);
        const speed = 0.05 + (1 - r / (U * 0.036)) * 0.09;
        const x = rand(i + 21) * W + Math.sin(t * 2 + i * 1.7) * r * 0.8;
        const y = H + r - (((rand(i + 77) + t * speed) % 1) * (H + r * 4));
        ctx.globalAlpha = 0.18 + 0.3 * rand(i + 4);
        ctx.strokeStyle = i % 4 ? (light ? theme.primary : '#ffffff') : theme.accent;
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'grain': {
      // Grain / farine / papier : poussière douce qui flotte + fin grain qui scintille.
      const frame = Math.floor(t * 12);
      ctx.fillStyle = light ? 'rgba(60,40,20,0.10)' : 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 260; i++) {
        const x = rand(i * 3 + frame) * W;
        const y = rand(i * 7 + frame * 2) * H;
        ctx.fillRect(x, y, U * 0.0025, U * 0.0025);
      }
      for (let i = 0; i < 40; i++) {
        const x = (rand(i + 300) * W + t * U * 0.01 * (rand(i) - 0.5) * 4 + W) % W;
        const y = (rand(i + 400) * H - t * U * 0.008 * (0.5 + rand(i + 1)) + H * 2) % H;
        ctx.fillStyle = rgba(light ? theme.primary : '#ffffff', 0.12 + 0.2 * rand(i + 5));
        ctx.beginPath(); ctx.arc(x, y, U * (0.002 + rand(i + 6) * 0.004), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'waves':
      // Rubans ondulants (eau, mode, bien-être, tech fluide).
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        const baseY = H * (0.62 + k * 0.1);
        const amp = U * (0.03 + k * 0.012);
        for (let x = 0; x <= W; x += W / 60) {
          const y = baseY + Math.sin(x / W * Math.PI * 2 * (1.2 + k * 0.3) + t * (1 + k * 0.35)) * amp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fillStyle = rgba(k % 2 ? theme.accent : theme.primary, light ? 0.08 : 0.1);
        ctx.fill();
      }
      break;
    case 'confetti':
      // Confettis qui tombent en tournoyant (fête, association, promo).
      for (let i = 0; i < 46; i++) {
        const speed = 0.06 + rand(i + 2) * 0.08;
        const x = rand(i + 60) * W + Math.sin(t * 1.5 + i) * U * 0.03;
        const y = ((rand(i + 90) + t * speed) % 1) * (H + 60) - 30;
        const rot = t * (2 + rand(i) * 4) + i;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(1, Math.abs(Math.cos(rot * 1.3)) + 0.15);
        ctx.fillStyle = [theme.primary, theme.accent, theme.text][i % 3];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(-U * 0.008, -U * 0.004, U * 0.016, U * 0.008);
        ctx.restore();
      }
      break;
    case 'sparkles':
      // Éclats qui scintillent (beauté, bijoux, luxe, fêtes).
      for (let i = 0; i < 26; i++) {
        const x = rand(i + 500) * W;
        const y = rand(i + 600) * H;
        const tw = Math.max(0, Math.sin(t * (1.5 + rand(i) * 2) + i * 2.1));
        const r = U * (0.008 + rand(i + 8) * 0.018) * tw;
        if (r < 0.5) continue;
        ctx.fillStyle = rgba(i % 2 ? theme.accent : (light ? theme.primary : '#ffffff'), 0.75 * tw);
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
      }
      break;
    case 'lines':
      // Lignes de vitesse (sport, auto, livraison, tech).
      for (let i = 0; i < 22; i++) {
        const len = U * (0.08 + rand(i) * 0.25);
        const speed = 0.4 + rand(i + 3) * 0.8;
        const y = rand(i + 700) * H;
        const x = ((rand(i + 800) + t * speed) % 1) * (W + len * 2) - len;
        ctx.strokeStyle = rgba(i % 3 ? theme.primary : theme.accent, 0.12 + 0.25 * rand(i + 2));
        ctx.lineWidth = Math.max(1, U * (0.002 + rand(i + 4) * 0.004));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len * 0.18); ctx.stroke();
      }
      break;
    case 'none':
      break;
  }
  ctx.restore();
}

// ---------- Scènes ----------
function sceneTitle(c: Ctx, s: Extract<Scene, { type: 'title' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const size = U * (c.vertical ? 0.115 : 0.1);
  const box = kinetic(c, s.title, W / 2, H * (s.subtitle ? 0.44 : 0.5), size, W * 0.84, lt, { upper: c.theme.style === 'bold' });
  // Trait d'accent qui se dessine sous le titre.
  const p = easeInOut(progress(lt, 0.45, 0.6));
  const bw = Math.min(W * 0.5, box.lastLineWidth * 0.6) * p;
  ctx.save();
  ctx.fillStyle = c.theme.primary;
  if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.8); ctx.shadowBlur = U * 0.03; }
  roundRect(ctx, W / 2 - bw / 2, box.bottom + U * 0.035, bw, U * 0.012, U * 0.006);
  ctx.fill();
  ctx.restore();
  if (s.subtitle) {
    const sp = easeOutCubic(progress(lt, 0.7, 0.5));
    ctx.save();
    ctx.globalAlpha *= sp;
    ctx.translate(0, (1 - sp) * U * 0.03);
    kinetic(c, s.subtitle, W / 2, box.bottom + U * 0.13, U * 0.045, W * 0.8, lt, { weight: 800, start: 0.7, stagger: 0.03, color: rgba(c.theme.text, 0.75) });
    ctx.restore();
  }
}

function drawCheck(c: Ctx, x: number, y: number, r: number, p: number) {
  const { ctx } = c;
  ctx.save();
  ctx.fillStyle = c.theme.primary;
  if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.7); ctx.shadowBlur = r * 0.8; }
  ctx.beginPath(); ctx.arc(x, y, r * easeOutBack(p), 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = c.theme.background;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const q = easeOutCubic(progress(p, 0.4, 0.6));
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y + r * 0.02);
  const mx = x - r * 0.12, my = y + r * 0.32;
  if (q < 0.5) {
    ctx.lineTo(x - r * 0.42 + (mx - (x - r * 0.42)) * (q * 2), y + r * 0.02 + (my - (y + r * 0.02)) * (q * 2));
  } else {
    ctx.lineTo(mx, my);
    ctx.lineTo(mx + (x + r * 0.45 - mx) * ((q - 0.5) * 2), my + (y - r * 0.35 - my) * ((q - 0.5) * 2));
  }
  ctx.stroke();
  ctx.restore();
}

function sceneBullets(c: Ctx, s: Extract<Scene, { type: 'bullets' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const light = isLight(c.theme.background);
  const titleY = c.vertical ? H * 0.27 : H * 0.2;
  kinetic(c, s.title, W / 2, titleY, U * 0.085, W * 0.84, lt);
  const cardW = Math.min(W * 0.84, U * 1.1);
  const cardH = U * 0.125;
  const gap = U * 0.035;
  const totalH = s.items.length * cardH + (s.items.length - 1) * gap;
  const startY = (c.vertical ? H * 0.56 : H * 0.6) - totalH / 2;
  s.items.forEach((item, i) => {
    const p = progress(lt, 0.45 + i * 0.32, 0.55);
    if (p <= 0) return;
    const e = easeOutCubic(p);
    const x = W / 2 - cardW / 2 - (1 - e) * U * 0.25;
    const y = startY + i * (cardH + gap);
    ctx.save();
    ctx.globalAlpha *= clamp(p * 1.5);
    ctx.fillStyle = light ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = rgba(c.theme.primary, 0.35 * e);
    ctx.lineWidth = U * 0.002;
    roundRect(ctx, x, y, cardW, cardH, cardH * 0.28);
    ctx.fill(); ctx.stroke();
    drawCheck(c, x + cardH * 0.52, y + cardH / 2, cardH * 0.24, p);
    setFont(c, 800, U * 0.05);
    ctx.fillStyle = c.theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let label = item.replace(/\*/g, '');
    while (ctx.measureText(label).width > cardW - cardH * 1.2 && label.length > 4) label = label.slice(0, -2) + '…';
    ctx.fillText(label, x + cardH * 1.0, y + cardH / 2);
    ctx.restore();
  });
}

function formatNumber(v: number, target: number): string {
  const decimals = Number.isInteger(target) ? 0 : 1;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function sceneStat(c: Ctx, s: Extract<Scene, { type: 'stat' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const cy = c.vertical ? H * 0.44 : H * 0.42;
  const r = U * (c.vertical ? 0.3 : 0.27);
  const p = easeOutCubic(progress(lt, 0.15, 1.5));
  // Anneau de progression.
  ctx.save();
  ctx.lineWidth = U * 0.02;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(c.theme.text, 0.08);
  ctx.beginPath(); ctx.arc(W / 2, cy, r, 0, Math.PI * 2); ctx.stroke();
  const grad = ctx.createLinearGradient(W / 2 - r, cy - r, W / 2 + r, cy + r);
  grad.addColorStop(0, c.theme.primary);
  grad.addColorStop(1, c.theme.accent);
  ctx.strokeStyle = grad;
  if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.7); ctx.shadowBlur = U * 0.04; }
  ctx.beginPath(); ctx.arc(W / 2, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p * 0.86); ctx.stroke();
  ctx.restore();
  // Chiffre qui défile.
  const value = s.value * p;
  const text = `${s.prefix ?? ''}${formatNumber(value, s.value)}${s.suffix ?? ''}`;
  let fs = U * 0.17;
  setFont(c, 900, fs);
  while (ctx.measureText(text).width > r * 1.7 && fs > U * 0.06) { fs *= 0.92; setFont(c, 900, fs); }
  ctx.save();
  const pop = easeOutBack(progress(lt, 0.05, 0.5));
  ctx.translate(W / 2, cy);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.theme.text;
  if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.5); ctx.shadowBlur = fs * 0.25; }
  ctx.fillText(text, 0, 0);
  ctx.restore();
  kinetic(c, s.label, W / 2, cy + r + U * 0.13, U * 0.058, W * 0.82, lt, { weight: 800, start: 0.6, stagger: 0.05 });
}

function mockInterface(c: Ctx, x: number, y: number, w: number, h: number, lt: number) {
  const { ctx, theme } = c;
  const light = isLight(theme.background);
  const panel = light ? '#ffffff' : '#11131b';
  const line = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';
  ctx.fillStyle = panel;
  ctx.fillRect(x, y, w, h);
  // Barre du haut.
  ctx.fillStyle = line;
  ctx.fillRect(x, y, w, h * 0.09);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + h * 0.05 + i * h * 0.045, y + h * 0.045, h * 0.014, 0, Math.PI * 2); ctx.fill(); });
  // Barre latérale.
  ctx.fillStyle = line;
  ctx.fillRect(x, y + h * 0.09, w * 0.2, h * 0.91);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i === 1 ? rgba(theme.primary, 0.9) : line;
    roundRect(ctx, x + w * 0.025, y + h * (0.15 + i * 0.1), w * 0.15, h * 0.045, h * 0.02); ctx.fill();
  }
  // Cartes de statistiques.
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (0.24 + i * 0.25);
    ctx.fillStyle = line;
    roundRect(ctx, cx, y + h * 0.14, w * 0.22, h * 0.2, h * 0.03); ctx.fill();
    ctx.fillStyle = i === 0 ? theme.primary : rgba(theme.text, 0.5);
    roundRect(ctx, cx + w * 0.02, y + h * 0.2, w * 0.1 * easeOutCubic(progress(lt, 0.5 + i * 0.15, 0.6)), h * 0.04, h * 0.02); ctx.fill();
    ctx.fillStyle = rgba(theme.text, 0.18);
    roundRect(ctx, cx + w * 0.02, y + h * 0.27, w * 0.15, h * 0.025, h * 0.012); ctx.fill();
  }
  // Graphique en barres qui pousse.
  const bars = 9;
  const baseY = y + h * 0.92;
  for (let i = 0; i < bars; i++) {
    const bh = h * (0.18 + 0.32 * rand(i + 20)) * easeOutBack(progress(lt, 0.6 + i * 0.06, 0.55));
    const bx = x + w * (0.25 + i * 0.075);
    const g = ctx.createLinearGradient(0, baseY - bh, 0, baseY);
    g.addColorStop(0, theme.primary);
    g.addColorStop(1, rgba(theme.accent, 0.35));
    ctx.fillStyle = g;
    roundRect(ctx, bx, baseY - bh, w * 0.045, bh, w * 0.012); ctx.fill();
  }
}

function sceneScreenshot(c: Ctx, s: Extract<Scene, { type: 'screenshot' }>, lt: number, d: number) {
  const { ctx, W, H, U, assets } = c;
  const capY = c.vertical ? H * 0.17 : H * 0.14;
  kinetic(c, s.caption, W / 2, capY, U * 0.075, W * 0.86, lt);
  const img = assets.screenshot;
  const maxW = c.vertical ? W * 0.86 : W * 0.62;
  const maxH = c.vertical ? H * 0.52 : H * 0.6;
  let fw = maxW, fh = maxW * 0.62;
  if (img && img.width && img.height) {
    const ratio = img.height / img.width;
    fw = Math.min(maxW, maxH / ratio);
    fh = fw * ratio;
  }
  if (fh > maxH) { fh = maxH; fw = fh / 0.62; }
  const cx = W / 2;
  const cy = c.vertical ? H * 0.58 : H * 0.6;
  const enter = easeOutCubic(progress(lt, 0.2, 1.1));
  // Effet 3D : la capture arrive inclinée, se redresse puis flotte doucement.
  const tilt = (1 - enter) * 0.35;
  const float = Math.sin(lt * 1.6) * U * 0.008;
  const zoom = 0.86 + 0.14 * enter + 0.03 * progress(lt, 1.2, d);
  ctx.save();
  ctx.globalAlpha *= clamp(enter * 1.4);
  ctx.translate(cx, cy + float + (1 - enter) * U * 0.12);
  ctx.transform(1, -tilt * 0.25, tilt * 0.35, 1, 0, 0);
  ctx.scale(zoom, zoom);
  // Lueur derrière l'appareil.
  ctx.save();
  ctx.shadowColor = rgba(c.theme.primary, 0.45);
  ctx.shadowBlur = U * 0.09;
  ctx.fillStyle = rgba(c.theme.primary, 0.25);
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.clip();
  if (img) ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
  else mockInterface(c, -fw / 2, -fh / 2, fw, fh, lt);
  // Reflet lumineux qui balaie l'écran.
  const sweep = progress(lt, 0.9, 1.1);
  if (sweep > 0 && sweep < 1) {
    const sx = -fw / 2 - fw * 0.4 + sweep * fw * 1.8;
    const g = ctx.createLinearGradient(sx, 0, sx + fw * 0.3, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
  }
  ctx.restore();
  ctx.strokeStyle = rgba(c.theme.text, 0.15);
  ctx.lineWidth = U * 0.003;
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.stroke();
  ctx.restore();
}

function sceneQuote(c: Ctx, s: Extract<Scene, { type: 'quote' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const p = easeOutBack(progress(lt, 0, 0.6));
  ctx.save();
  setFont(c, 900, U * 0.42);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(c.theme.primary, 0.9);
  if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.6); ctx.shadowBlur = U * 0.05; }
  ctx.translate(W / 2, H * (c.vertical ? 0.3 : 0.24));
  ctx.scale(p, p);
  ctx.fillText('“', 0, U * 0.08);
  ctx.restore();
  const box = kinetic(c, s.text, W / 2, H * 0.5, U * 0.075, W * 0.82, lt, { weight: 800, start: 0.35, stagger: 0.06 });
  if (s.author) {
    const ap = easeOutCubic(progress(lt, 0.9 + parseRich(s.text).length * 0.06, 0.5));
    ctx.save();
    ctx.globalAlpha *= ap;
    ctx.fillStyle = c.theme.primary;
    ctx.fillRect(W / 2 - U * 0.05 * ap, box.bottom + U * 0.06, U * 0.1 * ap, U * 0.006);
    setFont(c, 800, U * 0.042);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(c.theme.text, 0.8);
    ctx.fillText(s.author.replace(/\*/g, ''), W / 2, box.bottom + U * 0.13);
    ctx.restore();
  }
}

function sceneCta(c: Ctx, s: Extract<Scene, { type: 'cta' }>, lt: number) {
  const { ctx, W, H, U, assets } = c;
  const logoY = H * (c.vertical ? 0.3 : 0.26);
  const r = U * 0.11;
  // Intégration organique du logo : des particules aux couleurs de la marque
  // convergent vers son emplacement, puis il se matérialise.
  const gather = progress(lt, 0, 0.45);
  if (gather < 1) {
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const a = rand(i + 900) * Math.PI * 2;
      const dist = U * (0.35 + rand(i + 950) * 0.55) * (1 - easeInCubic(gather));
      const px = W / 2 + Math.cos(a) * dist;
      const py = logoY + Math.sin(a) * dist;
      ctx.globalAlpha = 0.25 + 0.6 * gather;
      ctx.fillStyle = i % 3 ? c.theme.primary : c.theme.accent;
      ctx.beginPath(); ctx.arc(px, py, U * (0.004 + rand(i + 990) * 0.006), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const p = easeOutBack(progress(lt, 0.38, 0.55));
  ctx.save();
  ctx.translate(W / 2, logoY);
  ctx.scale(p, p);
  // Onde lumineuse autour du logo.
  const wave = progress(lt, 0.3, 1.2);
  if (wave > 0 && wave < 1) {
    ctx.strokeStyle = rgba(c.theme.primary, 0.6 * (1 - wave));
    ctx.lineWidth = U * 0.006;
    ctx.beginPath(); ctx.arc(0, 0, r * (1 + wave * 1.4), 0, Math.PI * 2); ctx.stroke();
  }
  if (assets.logo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    const img = assets.logo;
    const k = Math.max((2 * r) / img.width, (2 * r) / img.height);
    ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    // Reflet qui balaie le logo.
    const sh = progress(lt, 0.8, 0.6);
    if (sh > 0 && sh < 1) {
      const sx = -r + sh * 4 * r - r;
      const g = ctx.createLinearGradient(sx, -r, sx + r * 0.6, r);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.65)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
    }
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, c.theme.primary);
    g.addColorStop(1, c.theme.accent);
    ctx.fillStyle = g;
    if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.7); ctx.shadowBlur = U * 0.06; }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    setFont(c, 900, r * 1.05);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.theme.background;
    ctx.fillText((c.brand.replace(/[^\p{L}\p{N}]/gu, '')[0] ?? 'I').toUpperCase(), 0, r * 0.06);
  }
  ctx.restore();
  if (c.brand) {
    const bp = easeOutCubic(progress(lt, 0.35, 0.5));
    ctx.save();
    ctx.globalAlpha *= bp;
    setFont(c, 800, U * 0.045);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(c.theme.text, 0.85);
    ctx.fillText(c.brand, W / 2, logoY + r + U * 0.07);
    ctx.restore();
  }
  const box = kinetic(c, s.title, W / 2, H * (c.vertical ? 0.52 : 0.55), U * 0.09, W * 0.84, lt, { start: 0.45 });
  // Bouton qui « pulse ».
  // Un QR code dans la scène remplace le bouton (pas de chevauchement).
  const bp = s.magic?.some((m) => m.kind === 'qr') ? 0 : easeOutBack(progress(lt, 0.9, 0.5));
  if (bp > 0) {
    setFont(c, 900, U * 0.05);
    const label = s.button.replace(/\*/g, '');
    const tw = ctx.measureText(label).width;
    const bw = tw + U * 0.16, bh = U * 0.11;
    const pulse = 1 + 0.035 * Math.sin(Math.max(0, lt - 1.4) * 5);
    ctx.save();
    ctx.translate(W / 2, box.bottom + U * 0.16);
    ctx.scale(bp * pulse, bp * pulse);
    ctx.fillStyle = c.theme.primary;
    if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.8); ctx.shadowBlur = U * 0.05; }
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, radiusOf(c, bh));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isLight(c.theme.primary) ? '#0b0b10' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, U * 0.003);
    ctx.restore();
  }
}

function sceneVideo(c: Ctx, s: Extract<Scene, { type: 'video' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const video = c.assets.videos?.[s.media] ?? null;
  const ready = Boolean(video && video.readyState >= 2 && video.videoWidth);
  if (s.layout === 'full') {
    if (ready && video) {
      const k = Math.max(W / video.videoWidth, H / video.videoHeight);
      const zoom = 1.04 + 0.04 * Math.min(1, lt / Math.max(1, s.duration)); // léger mouvement « Ken Burns »
      const vw = video.videoWidth * k * zoom;
      const vh = video.videoHeight * k * zoom;
      ctx.drawImage(video, (W - vw) / 2, (H - vh) / 2, vw, vh);
    } else {
      placeholder(c, 0, 0, W, H);
    }
    if (s.caption) captionOverMedia(c, s.caption, lt, s.captionPos ?? 'bottom', ready ? video : null);
    return;
  }
  // Cadre incliné qui flotte (comme la capture produit).
  const capY = c.vertical ? H * 0.17 : H * 0.14;
  if (s.caption) kinetic(c, s.caption, W / 2, capY, U * 0.075, W * 0.86, lt);
  const ratio = ready && video ? video.videoHeight / video.videoWidth : 16 / 9;
  const maxW = c.vertical ? W * 0.8 : W * 0.6;
  const maxH = c.vertical ? H * 0.58 : H * 0.62;
  let fw = maxW;
  let fh = fw * ratio;
  if (fh > maxH) { fh = maxH; fw = fh / ratio; }
  const enter = easeOutCubic(progress(lt, 0.1, 1));
  const tilt = (1 - enter) * 0.3;
  ctx.save();
  ctx.globalAlpha *= clamp(enter * 1.4);
  ctx.translate(W / 2, (c.vertical ? H * 0.58 : H * 0.6) + Math.sin(lt * 1.6) * U * 0.008 + (1 - enter) * U * 0.1);
  ctx.transform(1, -tilt * 0.25, tilt * 0.35, 1, 0, 0);
  ctx.save();
  ctx.shadowColor = rgba(c.theme.primary, 0.45);
  ctx.shadowBlur = U * 0.09;
  ctx.fillStyle = rgba(c.theme.primary, 0.25);
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.clip();
  if (ready && video) ctx.drawImage(video, -fw / 2, -fh / 2, fw, fh);
  else placeholder(c, -fw / 2, -fh / 2, fw, fh);
  ctx.restore();
  ctx.strokeStyle = rgba(c.theme.text, 0.18);
  ctx.lineWidth = U * 0.003;
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.03);
  ctx.stroke();
  ctx.restore();
}

/**
 * Photo du client : en plein écran avec un vrai « Ken Burns » (zoom + panoramique
 * dont le sens change d'une photo à l'autre), ou dans un cadre flottant.
 */
function scenePhoto(c: Ctx, s: Extract<Scene, { type: 'photo' }>, lt: number, sceneIndex: number) {
  const { ctx, W, H, U } = c;
  const img = c.assets.photos?.[s.photo] ?? null;
  const ready = Boolean(img && img.complete && img.naturalWidth);
  const p = clamp(lt / Math.max(1, s.duration));
  if (s.layout === 'full') {
    if (ready && img) {
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const zoomIn = sceneIndex % 2 === 0;
      const zoom = zoomIn ? 1.06 + 0.12 * easeInOut(p) : 1.18 - 0.12 * easeInOut(p);
      const iw = img.naturalWidth * k * zoom;
      const ih = img.naturalHeight * k * zoom;
      const dir = sceneIndex % 4 < 2 ? 1 : -1;
      const panX = (iw - W) / 2 * 0.6 * (p - 0.5) * dir;
      const panY = (ih - H) / 2 * 0.4 * (0.5 - p);
      ctx.drawImage(img, (W - iw) / 2 + panX, (H - ih) / 2 + panY, iw, ih);
    } else {
      placeholder(c, 0, 0, W, H, 'Ajoutez vos photos');
    }
    if (s.caption) captionOverMedia(c, s.caption, lt, s.captionPos ?? 'bottom', ready ? img : null);
    return;
  }
  const capY = c.vertical ? H * 0.17 : H * 0.14;
  if (s.caption) kinetic(c, s.caption, W / 2, capY, U * 0.075, W * 0.86, lt);
  const ratio = ready && img ? img.naturalHeight / img.naturalWidth : 1;
  const maxW = c.vertical ? W * 0.8 : W * 0.55;
  const maxH = c.vertical ? H * 0.58 : H * 0.62;
  let fw = maxW;
  let fh = fw * ratio;
  if (fh > maxH) { fh = maxH; fw = fh / ratio; }
  const enter = easeOutBack(progress(lt, 0.05, 0.8));
  ctx.save();
  ctx.globalAlpha *= clamp(progress(lt, 0.05, 0.4));
  ctx.translate(W / 2, (c.vertical ? H * 0.58 : H * 0.6) + Math.sin(lt * 1.4) * U * 0.008);
  ctx.rotate((sceneIndex % 2 ? 1 : -1) * (0.035 + (1 - enter) * 0.12));
  ctx.scale(0.85 + enter * 0.15, 0.85 + enter * 0.15);
  // Bord blanc façon tirage photo + ombre.
  const pad = U * 0.018;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = U * 0.06;
  ctx.shadowOffsetY = U * 0.02;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -fw / 2 - pad, -fh / 2 - pad, fw + pad * 2, fh + pad * 2, U * 0.02);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, -fw / 2, -fh / 2, fw, fh, U * 0.012);
  ctx.clip();
  if (ready && img) {
    const z = 1.02 + 0.06 * p;
    ctx.drawImage(img, (-fw * z) / 2, (-fh * z) / 2, fw * z, fh * z);
  } else placeholder(c, -fw / 2, -fh / 2, fw, fh, 'Ajoutez vos photos');
  ctx.restore();
  ctx.restore();
}

function placeholder(c: Ctx, x: number, y: number, w: number, h: number, label = 'Ajoutez votre vidéo') {
  const { ctx, U } = c;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(c.theme.primary, 0.5);
  ctx.setLineDash([U * 0.02, U * 0.015]);
  ctx.lineWidth = U * 0.004;
  ctx.strokeRect(x + U * 0.02, y + U * 0.02, w - U * 0.04, h - U * 0.04);
  setFont(c, 800, U * 0.04);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(c.theme.text, 0.8);
  ctx.fillText(label, x + w / 2, y + h / 2 - U * 0.03);
  setFont(c, 800, U * 0.028);
  ctx.fillStyle = rgba(c.theme.text, 0.55);
  ctx.fillText('onglet « Médias »', x + w / 2, y + h / 2 + U * 0.03);
  ctx.restore();
}


// ---------- Texte sur image : zone choisie + calque d'assombrissement calculé ----------
const lumCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const lumCache = new WeakMap<object, { t: number; top: number; bottom: number }>();
/** Luminance moyenne (0-1) du haut et du bas de l'image affichée, mesurée 2 fois par seconde. */
function zoneLuminance(src: CanvasImageSource & object, now: number): { top: number; bottom: number } | null {
  const hit = lumCache.get(src);
  if (hit && Math.abs(now - hit.t) < 0.5) return hit;
  if (!lumCanvas) return null;
  try {
    lumCanvas.width = 8;
    lumCanvas.height = 16;
    const lc = lumCanvas.getContext('2d', { willReadFrequently: true });
    if (!lc) return null;
    lc.drawImage(src, 0, 0, 8, 16);
    const d = lc.getImageData(0, 0, 8, 16).data;
    const avg = (y0: number, y1: number) => {
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        n++;
      }
      return sum / n;
    };
    const res = { t: now, top: avg(2, 7), bottom: avg(10, 15) };
    lumCache.set(src, res);
    return res;
  } catch {
    return null; // image d'un autre domaine : pas de mesure possible
  }
}

function captionOverMedia(c: Ctx, text: string, lt: number, pos: 'top' | 'bottom', src: (CanvasImageSource & object) | null) {
  const { ctx, W, H, U } = c;
  const lum = src ? zoneLuminance(src, lt) : null;
  const zone = lum ? (pos === 'top' ? lum.top : lum.bottom) : 0.5;
  // Plus la zone est claire, plus le calque est dense (le texte reste blanc et lisible).
  const strength = Math.min(0.9, 0.45 + zone * 0.6);
  const top = pos === 'top';
  const y0 = top ? 0 : H * 0.52;
  const y1 = top ? H * 0.48 : H;
  const g = ctx.createLinearGradient(0, top ? y0 : y0, 0, top ? y1 : y1);
  g.addColorStop(top ? 0 : 1, `rgba(0,0,0,${strength})`);
  g.addColorStop(top ? 1 : 0, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
  ctx.restore();
  const ty = top ? (c.vertical ? H * 0.24 : H * 0.2) : c.vertical ? H * 0.72 : H * 0.8;
  kinetic(c, text, W / 2, ty, U * 0.075, W * 0.86, lt, { start: 0.2, color: '#ffffff' });
}

/** Rayon des boutons et cartes selon la charte du client (carré, arrondi, pilule). */
function radiusOf(c: Ctx, h: number): number {
  const r = c.theme.radius ?? 'pill';
  return r === 'square' ? Math.min(h * 0.12, c.U * 0.008) : r === 'rounded' ? h * 0.28 : h / 2;
}

// ---------- Apparitions magiques ----------
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Hauteur de référence selon la position, dans la zone sûre (15 % haut / 20 % bas). */
function magicY(c: Ctx, m: Magic, k: number): number {
  const pos = m.pos ?? (m.kind === 'notification' || m.kind === 'emoji' ? 'top' : 'bottom');
  const H = c.H;
  if (pos === 'top') return H * (m.kind === 'emoji' ? (c.vertical ? 0.27 : 0.26) : c.vertical ? 0.19 : 0.2) + k * c.U * 0.02;
  if (pos === 'bottom') return H * (m.kind === 'qr' ? (c.vertical ? 0.64 : 0.62) : c.vertical ? 0.72 : 0.74);
  return H * 0.5;
}

function textFit(c: Ctx, text: string, weight: number, size: number, max: number): number {
  let fs = size;
  setFont(c, weight, fs);
  while (c.ctx.measureText(text).width > max && fs > size * 0.5) { fs *= 0.92; setFont(c, weight, fs); }
  return fs;
}

/**
 * Éléments qui « surgissent » par-dessus la scène : notification façon
 * smartphone, sticker « lien en bio », badge tampon, bouton qui se fait
 * cliquer, objet / emoji en 3D, avis client.
 */
function drawMagic(c: Ctx, m: Magic, lt: number, d: number, k: number) {
  const { ctx, W, U, theme } = c;
  const t = lt - m.at;
  if (t < 0) return;
  const pIn = easeOutBack(clamp(t / 0.45));
  const out = clamp((lt - (d - 0.25)) / 0.25);
  const alpha = clamp(t / 0.2) * (1 - out);
  if (alpha <= 0) return;
  const y = magicY(c, m, k);
  ctx.save();
  ctx.globalAlpha *= alpha;
  switch (m.kind) {
    case 'notification': {
      const w = Math.min(W * 0.86, U * 0.9);
      const h = U * 0.15;
      const x = (W - w) / 2;
      const yy = y - h / 2 - (1 - pIn) * U * 0.25;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = U * 0.05;
      ctx.shadowOffsetY = U * 0.015;
      ctx.fillStyle = 'rgba(250,250,255,0.94)';
      roundRect(ctx, x, yy, w, h, U * 0.04);
      ctx.fill();
      ctx.restore();
      // Icône d'appli aux couleurs de la marque.
      const ic = h * 0.6;
      ctx.fillStyle = theme.primary;
      roundRect(ctx, x + h * 0.2, yy + (h - ic) / 2, ic, ic, ic * 0.24);
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      if (m.emoji) { ctx.font = `${Math.round(ic * 0.6)}px ${EMOJI_FONT}`; ctx.fillText(m.emoji, x + h * 0.2 + ic / 2, yy + h / 2 + ic * 0.04); }
      else { setFont(c, 900, ic * 0.5); ctx.fillStyle = isLight(theme.primary) ? '#111' : '#fff'; ctx.fillText((c.brand || 'I').slice(0, 1).toUpperCase(), x + h * 0.2 + ic / 2, yy + h / 2); }
      ctx.textAlign = 'left';
      const tx = x + h * 0.2 + ic + U * 0.03;
      const maxW = w - (tx - x) - U * 0.13;
      ctx.fillStyle = '#111225';
      textFit(c, m.text, 800, U * 0.036, maxW);
      ctx.fillText(m.text, tx, yy + h * (m.sub ? 0.36 : 0.5));
      if (m.sub) { ctx.fillStyle = '#4b4d63'; textFit(c, m.sub, 800, U * 0.03, maxW); ctx.fillText(m.sub, tx, yy + h * 0.66); }
      setFont(c, 800, U * 0.022);
      ctx.fillStyle = '#8a8ca3';
      ctx.textAlign = 'right';
      ctx.fillText('maintenant', x + w - U * 0.03, yy + h * 0.3);
      break;
    }
    case 'sticker': {
      // Sticker blanc légèrement penché qui gigote + flèche qui pointe vers le bas.
      const fs = textFit(c, m.text, 900, U * 0.055, W * 0.7);
      const tw = ctx.measureText(m.text).width;
      const w = tw + U * 0.09 + (m.emoji ? fs * 1.2 : 0);
      const h = fs * 1.9;
      ctx.translate(W / 2, y);
      ctx.rotate(-0.06 + Math.sin(lt * 5) * 0.025);
      ctx.scale(pIn, pIn);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = U * 0.03;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.28);
      ctx.fill();
      ctx.restore();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0b0b14';
      setFont(c, 900, fs);
      const sx = -w / 2 + U * 0.045;
      ctx.fillText(m.text, sx, U * 0.003);
      if (m.emoji) { ctx.font = `${Math.round(fs)}px ${EMOJI_FONT}`; ctx.fillText(m.emoji, sx + tw + fs * 0.25, U * 0.003); }
      // Flèche animée.
      const bounce = Math.sin(lt * 7) * U * 0.012;
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = U * 0.012;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.75 + bounce);
      ctx.lineTo(0, h * 1.35 + bounce);
      ctx.moveTo(-U * 0.03, h * 1.1 + bounce);
      ctx.lineTo(0, h * 1.35 + bounce);
      ctx.lineTo(U * 0.03, h * 1.1 + bounce);
      ctx.stroke();
      break;
    }
    case 'badge': {
      // Tampon étoilé qui tourne doucement.
      const r = U * 0.13;
      const bx = W * 0.75;
      const by = y;
      ctx.translate(bx, by);
      ctx.rotate(lt * 0.6 - 0.3);
      ctx.scale(pIn, pIn);
      ctx.beginPath();
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const rr = i % 2 ? r * 0.86 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = theme.accent;
      ctx.shadowColor = rgba(theme.accent, 0.6);
      ctx.shadowBlur = U * 0.04;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.rotate(-(lt * 0.6 - 0.3));
      ctx.fillStyle = isLight(theme.accent) ? '#111' : '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = m.text.toUpperCase().split(/\s+/).slice(0, 3);
      const fs = textFit(c, words.reduce((a, b) => (a.length > b.length ? a : b), ''), 900, U * 0.04, r * 1.4);
      words.forEach((wd, i) => ctx.fillText(wd, 0, (i - (words.length - 1) / 2) * fs * 1.05));
      break;
    }
    case 'button': {
      // Bouton d'action qui pulse, puis un doigt / curseur vient cliquer.
      const fs = textFit(c, m.text, 900, U * 0.05, W * 0.62);
      const tw = ctx.measureText(m.text).width;
      const w = tw + U * 0.14;
      const h = fs * 2.2;
      const click = clamp((t - 0.9) / 0.25);
      const press = click > 0 && click < 1 ? 0.94 : 1;
      const pulse = 1 + Math.sin(lt * 6) * 0.025;
      ctx.translate(W / 2, y);
      ctx.scale(pIn * press * pulse, pIn * press * pulse);
      ctx.save();
      ctx.shadowColor = rgba(theme.primary, 0.7);
      ctx.shadowBlur = U * 0.06;
      ctx.fillStyle = theme.primary;
      roundRect(ctx, -w / 2, -h / 2, w, h, radiusOf(c, h));
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = isLight(theme.primary) ? '#0b0b14' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      setFont(c, 900, fs);
      ctx.fillText(m.text, 0, U * 0.003);
      if (m.sub) { setFont(c, 800, U * 0.026); ctx.fillStyle = rgba(theme.text, 0.75); ctx.fillText(m.sub, 0, h * 0.95); }
      // Curseur qui arrive et clique (onde).
      const cur = easeOutCubic(clamp((t - 0.35) / 0.55));
      if (cur > 0) {
        const cx = w * 0.32 + (1 - cur) * U * 0.25;
        const cy = h * 0.25 + (1 - cur) * U * 0.2;
        if (click > 0) {
          ctx.strokeStyle = rgba('#ffffff', 0.7 * (1 - click));
          ctx.lineWidth = U * 0.006;
          ctx.beginPath(); ctx.arc(cx, cy, U * 0.02 + click * U * 0.08, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.font = `${Math.round(U * 0.07)}px ${EMOJI_FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('👆', cx - U * 0.02, cy - U * 0.01);
      }
      break;
    }
    case 'emoji': {
      // Objet qui surgit en « 3D » : rebond, rotation, ombre portée, halo.
      const size = U * 0.26;
      const bob = Math.sin(lt * 2.4) * U * 0.015;
      const ex = W / 2 + (k % 2 ? 1 : 0) * W * 0.24;
      const ey = y + bob + (1 - pIn) * U * 0.4;
      ctx.save();
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, size * 0.9);
      g.addColorStop(0, rgba(theme.primary, 0.45));
      g.addColorStop(1, rgba(theme.primary, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ex - size, ey - size, size * 2, size * 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(ex, ey + size * 0.55, size * 0.35 * pIn, size * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(ex, ey);
      ctx.rotate(Math.sin(lt * 1.8) * 0.12 + (1 - pIn) * 0.8);
      ctx.scale(pIn, pIn);
      ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = U * 0.03;
      ctx.shadowOffsetY = U * 0.02;
      ctx.fillText(m.emoji || '✨', 0, 0);
      ctx.shadowBlur = 0;
      if (m.text) {
        setFont(c, 900, U * 0.04);
        ctx.fillStyle = theme.text;
        ctx.fillText(m.text, 0, size * 0.75);
      }
      break;
    }
    case 'qr': {
      // QR code qui se « construit » module par module, sur carte blanche, avec un balayage lumineux.
      const link = (m.sub || m.text).trim();
      const mat = qrFor(/^https?:\/\//i.test(link) || !/\./.test(link) ? link : `https://${link}`);
      if (!mat) break;
      const n = mat.length;
      const side = U * 0.34;
      const cell = side / (n + 2);
      ctx.translate(W / 2, y);
      ctx.scale(0.85 + 0.15 * pIn, 0.85 + 0.15 * pIn);
      ctx.save();
      ctx.shadowColor = rgba(theme.primary, 0.55);
      ctx.shadowBlur = U * 0.06;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -side / 2 - U * 0.02, -side / 2 - U * 0.02, side + U * 0.04, side + U * 0.04 + U * 0.07, U * 0.03);
      ctx.fill();
      ctx.restore();
      const build = clamp((t - 0.05) / 0.6);
      ctx.fillStyle = '#0b0b14';
      for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
        if (!mat[yy][xx]) continue;
        // Apparition en diagonale (motion design) ; les repères d'angle d'abord.
        const corner = (xx < 8 && yy < 8) || (xx >= n - 8 && yy < 8) || (xx < 8 && yy >= n - 8);
        if (!corner && (xx + yy) / (2 * n) > build) continue;
        ctx.fillRect(-side / 2 + cell * (xx + 1), -side / 2 + cell * (yy + 1), cell + 0.5, cell + 0.5);
      }
      if (build >= 1 && t < 1.6) {
        const sy = -side / 2 + side * clamp((t - 0.65) / 0.8);
        const g = ctx.createLinearGradient(0, sy - U * 0.03, 0, sy + U * 0.03);
        g.addColorStop(0, rgba(theme.primary, 0));
        g.addColorStop(0.5, rgba(theme.primary, 0.55));
        g.addColorStop(1, rgba(theme.primary, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-side / 2, sy - U * 0.03, side, U * 0.06);
      }
      setFont(c, 900, U * 0.034);
      ctx.fillStyle = '#0b0b14';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.text.slice(0, 28), 0, side / 2 + U * 0.04);
      break;
    }
    case 'review': {
      // Carte d'avis (uniquement des avis fournis par le client).
      const w = Math.min(W * 0.84, U * 0.86);
      const fs = U * 0.036;
      setFont(c, 800, fs);
      const lines = wrap(ctx, parseRich(`« ${m.text} »`), w - U * 0.1).slice(0, 3);
      const h = U * 0.12 + lines.length * fs * 1.3 + (m.sub ? U * 0.05 : 0);
      ctx.translate(W / 2, y);
      ctx.scale(0.9 + 0.1 * pIn, 0.9 + 0.1 * pIn);
      ctx.translate(0, (1 - pIn) * U * 0.1);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = U * 0.05;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, -w / 2, -h / 2, w, h, U * 0.035);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const x0 = -w / 2 + U * 0.05;
      // Étoiles qui s'allument une à une.
      for (let i = 0; i < 5; i++) {
        const on = clamp((t - 0.25 - i * 0.08) / 0.12);
        ctx.fillStyle = on > 0 ? '#ffb400' : '#e3e3ea';
        drawStar(ctx, x0 + i * U * 0.05 + U * 0.02, -h / 2 + U * 0.06, U * 0.022 * (0.6 + 0.4 * easeOutBack(on || 0.001)));
      }
      ctx.fillStyle = '#16172a';
      setFont(c, 800, fs);
      lines.forEach((ln, i) => ctx.fillText(ln.words.map((w2) => w2.text).join(' '), x0, -h / 2 + U * 0.12 + i * fs * 1.3));
      if (m.sub) { setFont(c, 800, U * 0.026); ctx.fillStyle = '#6b6d84'; ctx.fillText(m.sub, x0, h / 2 - U * 0.04); }
      break;
    }
  }
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Position dans le projet : scène courante + temps local. */
export function locate(project: MotionProject, t: number): { index: number; lt: number; start: number } {
  let start = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const d = project.scenes[i].duration;
    if (t < start + d || i === project.scenes.length - 1) return { index: i, lt: Math.max(0, t - start), start };
    start += d;
  }
  return { index: 0, lt: 0, start: 0 };
}

export function drawFrame(ctx: CanvasRenderingContext2D, project: MotionProject, t: number, assets: MotionAssets, opts: RenderOptions) {
  const { width: W, height: H } = FORMAT_SIZE[project.format];
  const c: Ctx = { ctx, W, H, U: Math.min(W, H), vertical: H > W, theme: project.theme, font: opts.fontFamily, assets, brand: project.brand };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  background(c, t);

  const { index, lt } = locate(project, t);
  const scene = project.scenes[index];
  const d = scene.duration;
  const isLast = index === project.scenes.length - 1;
  // Entrée / sortie de scène selon la transition choisie.
  const tr = project.transition ?? 'flash';
  const enter = index === 0 ? 1 : easeOutCubic(lt / 0.5);
  const exit = isLast ? 0 : easeInCubic((lt - (d - TRANSITION)) / TRANSITION);
  ctx.save();
  ctx.globalAlpha = tr === 'slide' || tr === 'wipe' ? 1 : clamp(enter) * (1 - exit);
  ctx.translate(W / 2, H / 2);
  if (tr === 'zoom') {
    const z = (1 + exit * 0.9) * (index === 0 ? 1 : 0.6 + 0.4 * clamp(enter));
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);
  } else if (tr === 'slide') {
    ctx.translate(-W / 2 + (1 - clamp(enter)) * W - exit * W, -H / 2);
  } else {
    const zoom = 1 + exit * 0.08 - (1 - enter) * 0.04;
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2 + (1 - enter) * c.U * 0.05 - exit * c.U * 0.06);
  }
  switch (scene.type) {
    case 'title': sceneTitle(c, scene, lt); break;
    case 'bullets': sceneBullets(c, scene, lt); break;
    case 'stat': sceneStat(c, scene, lt); break;
    case 'screenshot': sceneScreenshot(c, scene, lt, d); break;
    case 'quote': sceneQuote(c, scene, lt); break;
    case 'cta': sceneCta(c, scene, lt); break;
    case 'video': sceneVideo(c, scene, lt); break;
    case 'photo': scenePhoto(c, scene, lt, index); break;
  }
  if (scene.magic?.length) for (const [k, m] of scene.magic.entries()) drawMagic(c, m, lt, d, k);
  ctx.restore();

  // Effet de coupe entre deux scènes.
  if (tr === 'flash' && index > 0 && lt < 0.3) {
    ctx.save();
    ctx.globalAlpha = (1 - lt / 0.3) * 0.18;
    ctx.fillStyle = project.theme.primary;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (tr === 'wipe') {
    // Volet de couleur qui balaie l'écran : il couvre la fin d'une scène et découvre la suivante.
    const out = isLast ? 0 : clamp((lt - (d - 0.35)) / 0.35);
    const inn = index === 0 ? 1 : clamp(lt / 0.35);
    ctx.save();
    ctx.fillStyle = project.theme.primary;
    if (out > 0) ctx.fillRect(0, 0, W * easeInCubic(out), H);
    if (inn < 1) ctx.fillRect(W * easeOutCubic(inn), 0, W * (1 - easeOutCubic(inn)), H);
    ctx.fillStyle = project.theme.accent;
    if (out > 0.2) ctx.fillRect(0, 0, W * easeInCubic(out - 0.2), H * 0.02);
    ctx.restore();
  }
  if (tr === 'glitch' && ((index > 0 && lt < 0.25) || (!isLast && lt > d - 0.12))) {
    // Tranches décalées + séparation RVB sur la coupe.
    const k = index > 0 && lt < 0.25 ? 1 - lt / 0.25 : 1;
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const y = rand(i + Math.floor(t * 30)) * H;
      const h = H * (0.02 + rand(i + 3) * 0.06);
      const dx = (rand(i + 9 + Math.floor(t * 30)) - 0.5) * W * 0.12 * k;
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = project.theme.accent;
    ctx.fillRect(0, rand(Math.floor(t * 30)) * H, W, H * 0.015);
    ctx.restore();
  }

  if (opts.watermark) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    setFont(c, 800, c.U * 0.026);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = isLight(project.theme.background) ? '#000000' : '#ffffff';
    ctx.fillText('Réalisé avec IziCut', W / 2, H - c.U * 0.04);
    ctx.restore();
  }
  ctx.restore();
}
