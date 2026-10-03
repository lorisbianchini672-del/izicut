/**
 * Studio Motion — moteur de rendu canvas.
 * drawFrame() dessine l'image exacte à l'instant t : le même code sert à
 * l'aperçu en direct et à l'export MP4 (enregistrement du canvas).
 */
import { FORMAT_SIZE, TRANSITION, type MotionProject, type Scene } from './types';

export type MotionAssets = { logo?: HTMLImageElement | null; screenshot?: HTMLImageElement | null };
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
  // Grille en perspective qui défile (styles néon / bold).
  if (theme.style !== 'clean') {
    ctx.save();
    ctx.strokeStyle = rgba(light ? '#000000' : '#ffffff', 0.05);
    ctx.lineWidth = Math.max(1, U * 0.0015);
    const step = U * 0.09;
    const off = (t * U * 0.03) % step;
    for (let x = -step + off; x < W + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -step + off; y < H + step; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
  // Particules lumineuses qui montent.
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const speed = 0.02 + rand(i) * 0.05;
    const x = rand(i + 50) * W + Math.sin(t * 0.6 + i) * U * 0.01;
    const y = H - (((rand(i + 100) + t * speed) % 1) * (H + 40)) + 20;
    const r = U * (0.0015 + rand(i + 7) * 0.0035);
    ctx.fillStyle = rgba(i % 3 ? theme.primary : theme.accent, 0.25 + 0.35 * rand(i + 3));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Vignette.
  const v = ctx.createRadialGradient(W / 2, H / 2, U * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, light ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
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
  const p = easeOutBack(progress(lt, 0.05, 0.6));
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
  const bp = easeOutBack(progress(lt, 0.9, 0.5));
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
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isLight(c.theme.primary) ? '#0b0b10' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, U * 0.003);
    ctx.restore();
  }
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
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  background(c, t);

  const { index, lt } = locate(project, t);
  const scene = project.scenes[index];
  const d = scene.duration;
  const isLast = index === project.scenes.length - 1;
  // Entrée / sortie de scène : fondu + glissement + léger zoom.
  const enter = index === 0 ? 1 : easeOutCubic(lt / 0.5);
  const exit = isLast ? 0 : easeInCubic((lt - (d - TRANSITION)) / TRANSITION);
  ctx.save();
  ctx.globalAlpha = clamp(enter) * (1 - exit);
  ctx.translate(W / 2, H / 2);
  const zoom = 1 + exit * 0.08 - (1 - enter) * 0.04;
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2 + (1 - enter) * c.U * 0.05 - exit * c.U * 0.06);
  switch (scene.type) {
    case 'title': sceneTitle(c, scene, lt); break;
    case 'bullets': sceneBullets(c, scene, lt); break;
    case 'stat': sceneStat(c, scene, lt); break;
    case 'screenshot': sceneScreenshot(c, scene, lt, d); break;
    case 'quote': sceneQuote(c, scene, lt); break;
    case 'cta': sceneCta(c, scene, lt); break;
  }
  ctx.restore();

  // Éclair de transition entre deux scènes.
  if (index > 0 && lt < 0.3) {
    ctx.save();
    ctx.globalAlpha = (1 - lt / 0.3) * 0.18;
    ctx.fillStyle = project.theme.primary;
    ctx.fillRect(0, 0, W, H);
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
