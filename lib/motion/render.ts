/**
 * Studio Motion — moteur de rendu canvas.
 * drawFrame() dessine l'image exacte à l'instant t : le même code sert à
 * l'aperçu en direct et à l'export MP4 (enregistrement du canvas).
 */
import { chipsClickAt, promptTiming } from './cues';
import { drawBackdrop, type Backdrop } from './gl-bg';
import { makeQr } from './qr';
import { EASES, FORMAT_SIZE, TRANSITION, type Keyed, type Layer, type LeafLayerT, type Magic, type MotionProject, type Scene, type TextAnim } from './types';

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
  /** Images libres de droits trouvées sur le web (clé = « search:mots »). */
  web?: Record<string, HTMLImageElement | null>;
};
export type RenderOptions = { fontFamily: string; watermark?: boolean; /** Facteur de résolution (1 = 1080p, 1.333 = 1440p). */ scale?: number };

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
/** Couleur des mots mis en avant, éclaircie si elle se perd sur un fond sombre (bleu marine sur noir…). */
function readableAccent(c: { theme: MotionProject['theme'] }): string {
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
  const p = c.theme.primary;
  if (lum(c.theme.background) < 90 && lum(p) < 140) {
    const n = parseInt(p.slice(1), 16);
    const k = 0.4;
    const m = (v: number) => Math.round(v + (255 - v) * k);
    return '#' + ((1 << 24) | (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1);
  }
  return p;
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
  anim?: TextAnim;
  /** Intensité du flux lumineux de fond (atténué derrière les interfaces et les textes). */
  flowDim?: number;
  /** Facteur de résolution de sortie (1 = 1080p) : définition des fonds GPU. */
  S?: number;
};

/** Couleurs par défaut d'un fond GPU : celles de la marque, du plus sombre au plus clair. */
function backdropColors(theme: MotionProject['theme']): string[] {
  return [mixHex(theme.primary, '#000000', 0.55), theme.primary, theme.accent, mixHex(theme.accent, '#ffffff', 0.35)];
}
/** Fond GPU (WebGL) à pleine qualité ; false si indisponible (repli sur le fond 2D). */
const SHARP_BACKDROPS = new Set(['grain', 'matrix', 'halftone', 'dots', 'hex', 'stripes', 'topo', 'lines', 'paper', 'marble', 'grid', 'warp', 'custom']);
function gpuBackdrop(c: Ctx, b: Backdrop, t: number): boolean {
  // Fonds doux (soie, aurore, mesh…) calculés en demi-définition puis lissés : invisible à l'œil, 4× moins de calcul.
  const k = (c.S ?? 1) * (SHARP_BACKDROPS.has(b.kind) ? 0.9 : 0.5);
  return drawBackdrop(c.ctx, b, t, c.W, c.H, { w: c.W * k, h: c.H * k }, b.colors?.length ? [] : backdropColors(c.theme));
}

function setFont(c: Ctx, weight: number, size: number) {
  // Taille au dixième de pixel : un texte qui grandit ou rétrécit le fait en douceur (pas par à-coups d'1 px).
  c.ctx.font = `${weight} ${Math.round(size * 10) / 10}px ${c.font}`;
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
      const mode = c.anim ?? 'rise';
      // Chaque mode = une courbe différente (jamais linéaire : expo-out, back, spring).
      const t0 = start + w.index * (mode === 'slam' ? stagger * 0.8 : stagger);
      const p = mode === 'mask' ? progress(lt, start + li * 0.12 + w.index * 0.03, 0.55) : mode === 'slam' ? progress(lt, t0, 0.28) : mode === 'type' || mode === 'curve' ? 1 : mode === 'split' ? progress(lt, t0, 0.6) : mode === 'blur' ? progress(lt, t0, 0.7) : progress(lt, t0, 0.42);
      if (mode === 'type' && lt < start + w.index * 0.11) { x += w.width + space; continue; }
      if (p > 0) {
        ctx.save();
        if (mode === 'slam') {
          const e = easeOutCubic(p);
          ctx.globalAlpha *= clamp(p * 2.2);
          ctx.translate(x + w.width / 2, y);
          const sc = 2.6 - 1.6 * e;
          ctx.rotate((1 - e) * 0.08 * (w.index % 2 ? 1 : -1));
          ctx.scale(sc, sc);
        } else if (mode === 'mask') {
          const e = 1 - Math.pow(1 - p, 4);
          ctx.beginPath();
          ctx.rect(x - fs * 0.15, y - lh * 0.56, w.width + fs * 0.3, lh * 1.12);
          ctx.clip();
          ctx.translate(x + w.width / 2, y + (1 - e) * lh);
        } else if (mode === 'split' || mode === 'type' || mode === 'curve') {
          ctx.translate(x + w.width / 2, y);
        } else if (mode === 'blur') {
          // Mise au point : le mot passe du flou au net en se resserrant.
          const e = easeOutCubic(p);
          ctx.globalAlpha *= clamp(p * 1.5);
          ctx.translate(x + w.width / 2, y);
          const sc = 1.25 - 0.25 * e;
          ctx.scale(sc, sc);
          setBlur(ctx, (1 - e) * fs * 0.28);
        } else {
          const e = easeOutBack(p);
          ctx.globalAlpha *= clamp(p * 1.6);
          ctx.translate(x + w.width / 2, y + (1 - e) * fs * 0.45);
          const sc = 0.82 + 0.18 * e;
          ctx.scale(sc, sc);
        }
        if (w.accent) {
          ctx.fillStyle = readableAccent(c);
          if (c.theme.style === 'neon') { ctx.shadowColor = rgba(c.theme.primary, 0.75); ctx.shadowBlur = fs * 0.35; }
          if (c.theme.style === 'bold') {
            // Surlignage « marqueur » derrière le mot.
            const hp = easeOutCubic(progress(lt, t0 + 0.2, 0.35));
            ctx.save();
            ctx.fillStyle = rgba(c.theme.primary, 0.9);
            ctx.fillRect(-w.width / 2 - fs * 0.08, -fs * 0.42, (w.width + fs * 0.16) * hp, fs * 0.84);
            ctx.restore();
            ctx.fillStyle = c.theme.background;
          }
        } else {
          ctx.fillStyle = opts.color ?? c.theme.text;
        }
        if (mode === 'split') {
          // Lettres qui arrivent de directions différentes et se rassemblent (ressort).
          let cx0 = -w.width / 2;
          const chars = Array.from(w.text);
          chars.forEach((ch, k) => {
            const cw = ctx.measureText(ch).width;
            const pk = progress(lt, t0 + k * 0.025, 0.5);
            if (pk > 0) {
              const e = easeOutBack(pk);
              const r1 = rand(w.index * 31 + k * 7);
              const r2 = rand(w.index * 17 + k * 13);
              ctx.save();
              ctx.globalAlpha *= clamp(pk * 2);
              ctx.translate(cx0 + cw / 2 + (1 - e) * (r1 - 0.5) * fs * 3, (1 - e) * (r2 - 0.5) * fs * 3);
              ctx.rotate((1 - e) * (r1 - 0.5) * 2);
              ctx.fillText(ch, -cw / 2, 0);
              ctx.restore();
            }
            cx0 += cw;
          });
        } else if (mode === 'curve') {
          // Ruban : les lettres arrivent en file le long d'une courbe et se posent.
          let cx0 = -w.width / 2;
          const chars = Array.from(w.text);
          const base = start + (w.index * 0.6 + li * 0.4) * stagger * 1.4;
          chars.forEach((ch, k) => {
            const cw = ctx.measureText(ch).width;
            const pk = progress(lt, base + k * 0.03, 0.55);
            if (pk > 0) {
              const e = easeOutCubic(pk);
              const sgo = 1 - e;
              ctx.save();
              ctx.globalAlpha *= clamp(pk * 3);
              ctx.translate(cx0 + cw / 2 + sgo * fs * 1.6, sgo * sgo * fs * 4.2 + sgo * fs * 0.6);
              ctx.rotate(sgo * 1.1);
              ctx.fillText(ch, -cw / 2, 0);
              ctx.restore();
            }
            cx0 += cw;
          });
        } else if (mode === 'type') {
          // Machine à écrire : les lettres apparaissent une à une, curseur clignotant.
          const shown = Math.max(0, Math.floor((lt - (start + w.index * 0.11)) * 30));
          const part = Array.from(w.text).slice(0, shown).join('');
          ctx.fillText(part, -w.width / 2, 0);
          if (shown < w.text.length && Math.floor(lt * 3) % 2 === 0) {
            const pw = ctx.measureText(part).width;
            ctx.fillRect(-w.width / 2 + pw + fs * 0.04, -fs * 0.4, fs * 0.07, fs * 0.8);
          }
        } else {
          ctx.fillText(w.text, -w.width / 2, 0);
        }
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
  // Fond animé haut de gamme choisi par le client ou l'IA : il remplace les halos.
  if (theme.backdrop && gpuBackdrop(c, theme.backdrop as Backdrop, t)) {
    if (theme.motif && theme.motif !== 'none' && theme.motif !== 'particles') drawMotif(c, theme.motif, t, light);
    return;
  }
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
    case 'flow':
      drawFlow(c, t, light);
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
    const pulse = 1;
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
      ctx.rotate(-0.05);
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
      const bounce = Math.sin(lt * 3) * U * 0.008;
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
      const pulse = 1;
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
      const bob = 0;
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
      ctx.rotate((1 - pIn) * 0.8);
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

// ---------- Style « démo produit cinématique » ----------
// Flux lumineux, logo révélé, boutons cliqués par un curseur, demande tapée
// avec caméra qui recule, maquette de site en vraie perspective 3D.

type Off = { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D };
const offscreens = new Map<string, Off>();
/** Canvas de travail réutilisé (pas d'allocation à chaque image). */
function offscreen(key: string, w: number, h: number): Off | null {
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));
  let o = offscreens.get(key);
  if (!o || o.canvas.width !== iw || o.canvas.height !== ih) {
    let cv: HTMLCanvasElement | OffscreenCanvas | null = null;
    if (typeof OffscreenCanvas !== 'undefined') cv = new OffscreenCanvas(iw, ih);
    else if (typeof document !== 'undefined') { cv = document.createElement('canvas'); cv.width = iw; cv.height = ih; }
    if (!cv) return null;
    const cx = cv.getContext('2d') as CanvasRenderingContext2D | null;
    if (!cx) return null;
    o = { canvas: cv, ctx: cx };
    offscreens.set(key, o);
  }
  return o;
}

function mixHex(a: string, b: string, k: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const m = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

function setBlur(ctx: CanvasRenderingContext2D, px: number) {
  // Flou réel quand le navigateur le gère (Chrome, Edge, Safari 18+), ignoré sinon.
  if ('filter' in ctx) ctx.filter = px > 0.4 ? `blur(${px.toFixed(1)}px)` : 'none';
}

/** Rubans de lumière liquide (dessinés en basse définition puis agrandis = lueur douce et fluide). */
function flowLayer(g: CanvasRenderingContext2D, w: number, h: number, t: number, theme: MotionProject['theme'], thin: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const vertical = h > w;
  const ribbons = [
    { col: theme.primary, off: 0, amp: 0.13, th: 0.2, sp: 0.32, a: 0.75 },
    { col: theme.accent, off: 0.22, amp: 0.1, th: 0.12, sp: 0.41, a: 0.8 },
    { col: theme.primary, off: -0.25, amp: 0.16, th: 0.1, sp: 0.27, a: 0.55 },
    { col: mixHex(theme.accent, '#ffffff', 0.45), off: 0.1, amp: 0.08, th: 0.035, sp: 0.5, a: 0.75 }
  ];
  const N = 40;
  for (const [ri, r] of ribbons.entries()) {
    const ph = t * r.sp + ri * 1.9;
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // Diagonale bas-gauche → haut-droit, ondulée.
      const bx = vertical ? -0.25 + 1.5 * u : -0.15 + 1.3 * u;
      const by = vertical ? 1.05 - 1.1 * u : 1.15 - 1.3 * u;
      const wave = Math.sin(u * Math.PI * 2.2 + ph) * r.amp + Math.sin(u * 5.3 - ph * 1.3) * r.amp * 0.35;
      const cx = (bx + r.off * 0.6 + wave * 0.7) * w;
      const cy = (by + r.off + wave) * h;
      const th = r.th * thin * (0.35 + 0.65 * Math.sin(Math.PI * u)) * (0.75 + 0.25 * Math.sin(ph * 1.7 + u * 4)) * Math.min(w, h);
      // Normale approximative à la diagonale.
      const nx = vertical ? 0.6 : 0.7;
      const ny = vertical ? 0.8 : 0.7;
      top.push([cx - nx * th, cy - ny * th]);
      bot.push([cx + nx * th * 0.5, cy + ny * th * 0.5]);
    }
    // Trois passes (large et pâle → fin et éclatant) : dégradé soyeux dans l'épaisseur du ruban.
    const passes = [{ k: 1, a: 0.28, col: r.col }, { k: 0.55, a: 0.42, col: r.col }, { k: 0.2, a: 0.7, col: mixHex(r.col, '#ffffff', 0.5) }];
    for (const ps of passes) {
      const grad = g.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, rgba(ps.col, 0));
      grad.addColorStop(0.35, rgba(ps.col, r.a * ps.a));
      grad.addColorStop(0.7, rgba(ps.col, r.a * ps.a * 0.9));
      grad.addColorStop(1, rgba(ps.col, 0));
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const mx = (top[i][0] + bot[i][0]) / 2, my = (top[i][1] + bot[i][1]) / 2;
        const px = mx + (top[i][0] - mx) * ps.k, py = my + (top[i][1] - my) * ps.k;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      for (let i = N; i >= 0; i--) {
        const mx = (top[i][0] + bot[i][0]) / 2, my = (top[i][1] + bot[i][1]) / 2;
        g.lineTo(mx + (bot[i][0] - mx) * ps.k, my + (bot[i][1] - my) * ps.k);
      }
      g.closePath();
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
}

function drawFlow(c: Ctx, t: number, light: boolean) {
  const { ctx, W, H } = c;
  const glow = offscreen('flow-glow', W / 16, H / 16);
  const body = offscreen('flow-body', W / 7, H / 7);
  if (!glow || !body) return;
  flowLayer(glow.ctx, glow.canvas.width, glow.canvas.height, t, c.theme, 1.5);
  flowLayer(body.ctx, body.canvas.width, body.canvas.height, t, c.theme, 0.8);
  ctx.save();
  ctx.globalCompositeOperation = light ? 'multiply' : 'lighter';
  const k = c.flowDim ?? 1;
  ctx.globalAlpha = (light ? 0.35 : 0.75) * k;
  ctx.drawImage(glow.canvas as CanvasImageSource, 0, 0, W, H);
  ctx.globalAlpha = (light ? 0.3 : 0.9) * k;
  ctx.drawImage(body.canvas as CanvasImageSource, 0, 0, W, H);
  ctx.restore();
  if (!light && k < 0.95) {
    // Centre plongé dans le noir derrière textes et interfaces : la lumière reste sur les bords.
    const sc = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
    sc.addColorStop(0, `rgba(0,0,0,${(0.85 * (1 - k)).toFixed(3)})`);
    sc.addColorStop(0.6, `rgba(0,0,0,${(0.5 * (1 - k)).toFixed(3)})`);
    sc.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sc;
    ctx.fillRect(0, 0, W, H);
  }
}

/** Signe lumineux en étoile (utilisé quand la marque n'a pas fourni de logo). */
function drawBurst(c: Ctx, x: number, y: number, r: number, t: number, p: number, color: string) {
  const { ctx } = c;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.5 + (1 - easeOutCubic(p)) * -1.2);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.17;
  ctx.shadowColor = rgba(color, 1);
  ctx.shadowBlur = r * 0.9;
  const n = 11;
  // Un seul tracé pour toutes les branches : une seule ombre lumineuse à calculer.
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const pk = easeOutBack(clamp(p * 1.6 - i * 0.04));
    if (pk <= 0) continue;
    const len = r * (0.62 + 0.38 * rand(i + 5)) * pk;
    const a = (i / n) * Math.PI * 2 + (rand(i) - 0.5) * 0.25;
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.stroke();
  ctx.restore();
}

function logoReady(c: Ctx): HTMLImageElement | null {
  const l = c.assets.logo;
  return l && l.complete && l.naturalWidth ? l : null;
}

/** Marque : logo ou signe lumineux qui apparaît, puis le nom glisse de derrière, lettre par lettre (flou → net). */
function sceneLogo(c: Ctx, s: Extract<Scene, { type: 'logo' }>, lt: number, t: number) {
  const { ctx, W, H, U } = c;
  const logo = logoReady(c);
  const fs = textFit(c, s.title, 700, U * (c.vertical ? 0.1 : 0.085), W * 0.62);
  setFont(c, 700, fs);
  const tw = ctx.measureText(s.title).width;
  const r = fs * 0.8;
  const gap = fs * 0.6;
  const markW = logo ? Math.min(r * 2.4, (logo.naturalWidth / logo.naturalHeight) * r * 2) : r * 2;
  const slide = easeInOut(progress(lt, 0.45, 0.6));
  const totalW = markW + gap + tw;
  const markX = W / 2 + (-totalW / 2 + markW / 2) * slide;
  const y = H / 2 - (s.subtitle ? fs * 0.3 : 0);
  const pMark = progress(lt, 0.05, 0.7);
  ctx.save();
  ctx.globalAlpha *= clamp(pMark * 2);
  if (logo) {
    const sc = 0.6 + 0.4 * easeOutBack(pMark);
    const lh = markW / (logo.naturalWidth / logo.naturalHeight);
    ctx.shadowColor = rgba(c.theme.primary, 0.8);
    ctx.shadowBlur = r * 0.8;
    ctx.drawImage(logo, markX - (markW * sc) / 2, y - (lh * sc) / 2, markW * sc, lh * sc);
  } else {
    drawBurst(c, markX, y, r, t, pMark, mixHex(c.theme.accent, '#ffffff', 0.25));
  }
  ctx.restore();
  // Le nom sort de derrière le signe.
  const x0 = W / 2 - totalW / 2 + markW + gap;
  ctx.save();
  ctx.beginPath();
  ctx.rect(markX + markW * 0.35, 0, W, H);
  ctx.clip();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = c.theme.text;
  let x = x0;
  Array.from(s.title).forEach((ch, k) => {
    const cw = ctx.measureText(ch).width;
    const pk = progress(lt, 0.55 + k * 0.035, 0.5);
    if (pk > 0) {
      const e = easeOutCubic(pk);
      ctx.save();
      ctx.globalAlpha *= clamp(pk * 1.8);
      setBlur(ctx, (1 - e) * fs * 0.25);
      ctx.fillText(ch, x - (1 - e) * fs * 0.9, y);
      ctx.restore();
    }
    x += cw;
  });
  ctx.restore();
  if (s.subtitle) {
    const p = progress(lt, 1.1, 0.6);
    ctx.save();
    ctx.globalAlpha *= easeOutCubic(p) * 0.8;
    setFont(c, 500, textFit(c, s.subtitle, 500, U * 0.04, W * 0.84));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.theme.text;
    ctx.fillText(s.subtitle, W / 2, y + fs * 1.55 + (1 - easeOutCubic(p)) * U * 0.02);
    ctx.restore();
  }
}

/** Flèche de souris (blanche, contour sombre), pointe en (x, y). */
function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, press: number) {
  ctx.save();
  ctx.translate(x, y);
  const sc = 1 - press * 0.15;
  ctx.scale(sc, sc);
  ctx.beginPath();
  const pts: [number, number][] = [[0, 0], [0, 1], [0.27, 0.76], [0.45, 1.14], [0.6, 1.07], [0.42, 0.7], [0.75, 0.7]];
  ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
  for (const p of pts.slice(1)) ctx.lineTo(p[0] * size, p[1] * size);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = size * 0.25;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = '#111111';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Boutons lumineux qui apparaissent (flou → net) puis un curseur vient cliquer sur l'un d'eux. */
function sceneChips(c: Ctx, s: Extract<Scene, { type: 'chips' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const items = s.items;
  const pick = Math.min(s.pick, items.length - 1);
  let fs = U * (c.vertical ? 0.042 : 0.034);
  // Le bouton le plus long doit tenir en entier (jamais de texte coupé).
  setFont(c, 600, fs);
  const widest = Math.max(...items.map((it) => ctx.measureText(it).width));
  if (widest + fs * 1.9 > W * 0.86) { fs *= (W * 0.86) / (widest + fs * 1.9); setFont(c, 600, fs); }
  const ch = fs * 2.3;
  const padX = fs * 0.95;
  const gap = fs * 0.45;
  const widths = items.map((it) => ctx.measureText(it).width + padX * 2);
  // Répartition sur une ou plusieurs lignes selon la largeur disponible.
  const maxRow = W * 0.9;
  const rows: number[][] = [[]];
  let acc = 0;
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1];
    if (row.length && acc + gap + w > maxRow) { rows.push([i]); acc = w; } else { row.push(i); acc += (row.length > 1 ? gap : 0) + w; }
  });
  const titleH = s.title ? fs * 3.2 : 0;
  const blockH = rows.length * ch + (rows.length - 1) * gap * 1.4 + titleH;
  let y = H / 2 - blockH / 2 + titleH;
  if (s.title) kinetic(c, s.title, W / 2, y - titleH * 0.6, U * 0.06, W * 0.86, lt, { weight: 800 });
  const pos: { x: number; y: number; w: number }[] = [];
  for (const row of rows) {
    const rw = row.reduce((a, i) => a + widths[i], 0) + gap * (row.length - 1);
    let x = W / 2 - rw / 2;
    for (const i of row) { pos[i] = { x, y, w: widths[i] }; x += widths[i] + gap; }
    y += ch + gap * 1.4;
  }
  const tClick = chipsClickAt(s);
  const clicked = clamp((lt - tClick) / 0.25);
  const r = radiusOf(c, ch) * (c.theme.radius === 'square' ? 1 : 0.72);
  items.forEach((it, i) => {
    const p = progress(lt, 0.1 + i * 0.07, 0.55);
    if (p <= 0) return;
    const e = easeOutCubic(p);
    const { x, y: cy, w } = pos[i];
    const on = i === pick ? clicked : 0;
    ctx.save();
    ctx.globalAlpha *= clamp(p * 1.6) * (clicked > 0 && i !== pick ? 1 - 0.35 * clicked : 1);
    ctx.translate(x + w / 2, cy + ch / 2);
    const sc = (1.18 - 0.18 * e) * (i === pick && lt > tClick && lt < tClick + 0.18 ? 0.94 : 1);
    ctx.scale(sc, sc);
    setBlur(ctx, (1 - e) * fs * 0.4);
    roundRect(ctx, -w / 2, -ch / 2, w, ch, r);
    const lightBg = isLight(c.theme.background);
    ctx.fillStyle = on > 0 ? rgba(mixHex(c.theme.accent, '#000000', 0.55), 0.55 + 0.35 * on) : lightBg ? 'rgba(255,255,255,0.7)' : 'rgba(10,10,12,0.42)';
    ctx.shadowColor = lightBg && !on ? 'rgba(0,0,0,0.18)' : rgba(on > 0 ? c.theme.accent : '#ffffff', 0.55 + 0.35 * on);
    ctx.shadowBlur = fs * (0.7 + on * 0.9);
    ctx.fill();
    ctx.shadowBlur = fs * 0.5;
    ctx.lineWidth = Math.max(1.5, fs * 0.075);
    ctx.strokeStyle = lightBg && !on ? 'rgba(0,0,0,0.55)' : rgba('#ffffff', 0.85);
    ctx.stroke();
    ctx.shadowBlur = 0;
    setFont(c, 600, fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lightBg && !on ? '#151515' : '#ffffff';
    ctx.fillText(it, 0, fs * 0.04);
    ctx.restore();
    // Onde de clic.
    if (i === pick && lt > tClick && lt < tClick + 0.6) {
      const k = (lt - tClick) / 0.6;
      ctx.save();
      ctx.globalAlpha *= 1 - k;
      ctx.strokeStyle = rgba(c.theme.accent, 0.9);
      ctx.lineWidth = fs * 0.12 * (1 - k);
      roundRect(ctx, x - k * fs, cy - k * fs, w + k * fs * 2, ch + k * fs * 2, r + k * fs);
      ctx.stroke();
      ctx.restore();
    }
  });
  // Curseur : arrive en courbe depuis le bas, ralentit, clique.
  const target = pos[pick];
  if (!target) return;
  const tx = target.x + target.w * 0.55;
  const ty = target.y + ch * 0.6;
  const mv = easeInOut(progress(lt, 0.55, tClick - 0.6));
  if (mv <= 0) return;
  const sx = W * (c.vertical ? 0.82 : 0.78);
  const sy = H * 0.95;
  const mx = (sx + tx) / 2 + W * 0.12;
  const my = (sy + ty) / 2 + H * 0.05;
  const u = mv;
  const cx = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * mx + u * u * tx;
  const cy = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * my + u * u * ty;
  const press = lt > tClick && lt < tClick + 0.16 ? 1 : 0;
  drawCursor(ctx, cx, cy, fs * 1.25, press);
}

/** Barre de saisie façon assistant : la demande se tape, la caméra part du texte et recule pour révéler l'interface. */
function scenePrompt(c: Ctx, s: Extract<Scene, { type: 'prompt' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const pt = promptTiming(s);
  const bw = c.vertical ? W * 0.88 : W * 0.62;
  const fs = U * (c.vertical ? 0.046 : 0.038);
  const pad = fs * 1.1;
  setFont(c, 500, fs);
  // Retour à la ligne du texte complet (pour que la mise en page ne bouge pas pendant la frappe).
  const words = s.text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > bw - pad * 2 && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  const lh = fs * 1.35;
  const bh = pad * 2 + lines.length * lh + fs * 2.6;
  const bx = W / 2 - bw / 2;
  const by = H / 2 - bh / 2;
  const typed = Math.max(0, Math.min(Array.from(s.text).length, Math.floor((lt - pt.start) * pt.cps)));
  // Position du curseur de frappe (pour le cadrage caméra).
  let remain = typed;
  let caretX = bx + pad;
  let caretY = by + pad + lh / 2;
  lines.forEach((ln, li) => {
    const n = Array.from(ln).length + 1;
    if (remain >= 0) {
      const part = Array.from(ln).slice(0, Math.max(0, Math.min(n - 1, remain))).join('');
      caretX = bx + pad + ctx.measureText(part).width;
      caretY = by + pad + li * lh + lh / 2;
    }
    remain -= n;
  });
  // Caméra : très près du texte au début, puis recul en douceur.
  const pull = easeInOut(progress(lt, Math.max(0.6, (pt.end - pt.start) * 0.45), Math.max(0.9, (pt.end - pt.start) * 0.6)));
  const z = 2.1 - 1.1 * pull;
  const fx = caretX * (1 - pull) + (W / 2) * pull - (1 - pull) * fs * 3;
  const fy = caretY * (1 - pull) + (H / 2) * pull;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-fx, -fy);
  // Boîte vitrée.
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, fs * 1.1);
  ctx.shadowColor = rgba(c.theme.primary, 0.35);
  ctx.shadowBlur = fs * 3;
  ctx.shadowOffsetY = fs * 0.6;
  ctx.fillStyle = 'rgba(14,14,16,0.88)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1, fs * 0.04);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.stroke();
  ctx.restore();
  // Texte tapé : les dernières lettres frappées brillent en couleur d'accent.
  setFont(c, 500, fs);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let idx = 0;
  lines.forEach((ln, li) => {
    let x = bx + pad;
    const yy = by + pad + li * lh + lh / 2;
    for (const chr of Array.from(ln + ' ')) {
      if (idx >= typed) break;
      const age = typed - idx;
      ctx.fillStyle = age <= 7 ? mixHex(c.theme.accent, '#ffffff', clamp((age - 1) / 7)) : '#ffffff';
      ctx.fillText(chr, x, yy);
      x += ctx.measureText(chr).width;
      idx++;
    }
    idx += 0;
  });
  if (lt < pt.end + 0.25 || Math.floor(lt * 2.5) % 2 === 0) {
    ctx.fillStyle = c.theme.accent;
    ctx.fillRect(caretX + fs * 0.06, caretY - fs * 0.55, fs * 0.08, fs * 1.1);
  }
  // Barre d'outils : « + », libellé, micro, envoyer.
  ctx.save();
  ctx.globalAlpha *= clamp(pull * 1.4);
  const ty = by + bh - pad - fs * 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = fs * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + pad, ty); ctx.lineTo(bx + pad + fs * 0.8, ty);
  ctx.moveTo(bx + pad + fs * 0.4, ty - fs * 0.4); ctx.lineTo(bx + pad + fs * 0.4, ty + fs * 0.4);
  ctx.stroke();
  const sendS = fs * 1.15;
  const sendX = bx + bw - pad - sendS;
  const press = lt > pt.send && lt < pt.send + 0.15 ? 0.88 : 1;
  const sent = clamp((lt - pt.send) / 0.3);
  ctx.save();
  ctx.translate(sendX + sendS / 2, ty);
  ctx.scale(press, press);
  roundRect(ctx, -sendS / 2, -sendS / 2, sendS, sendS, sendS * 0.25);
  ctx.fillStyle = c.theme.accent;
  ctx.shadowColor = rgba(c.theme.accent, 0.4 + 0.6 * sent);
  ctx.shadowBlur = fs * (0.5 + sent * 1.5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isLight(c.theme.accent) ? '#111111' : '#ffffff';
  ctx.lineWidth = fs * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, sendS * 0.25); ctx.lineTo(0, -sendS * 0.25);
  ctx.moveTo(-sendS * 0.2, -sendS * 0.05); ctx.lineTo(0, -sendS * 0.25); ctx.lineTo(sendS * 0.2, -sendS * 0.05);
  ctx.stroke();
  ctx.restore();
  // Micro + onde.
  const micX = sendX - fs * 2.6;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, micX - fs * 0.16, ty - fs * 0.42, fs * 0.32, fs * 0.55, fs * 0.16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(micX, ty + fs * 0.2); ctx.lineTo(micX, ty + fs * 0.42); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const hh = fs * (0.18 + 0.32 * Math.abs(Math.sin(lt * 9 + i * 1.3))) * (lt < pt.end ? 1 : 0.4);
    ctx.fillRect(micX + fs * 0.75 + i * fs * 0.2, ty - hh / 2, fs * 0.09, hh);
  }
  const label = s.label || c.brand;
  if (label) {
    setFont(c, 500, fs * 0.72);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(label, micX - fs * 0.8, ty);
  }
  ctx.restore();
  ctx.restore();
}

/** Contenu de la maquette (une page d'accueil), dessiné à plat avant la mise en perspective. */
function paintMockup(c: Ctx, g: CanvasRenderingContext2D, w: number, h: number, s: Extract<Scene, { type: 'mockup' }>, color: string, lt: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  const u = Math.min(w, h);
  const vertical = h > w;
  const rr = u * 0.05;
  roundRect(g, 0, 0, w, h, rr);
  g.save();
  g.clip();
  const img = s.photo !== undefined ? c.assets.photos?.[s.photo] ?? null : null;
  if (img && img.complete && img.naturalWidth) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (1.04 + 0.05 * clamp(lt / 4));
    g.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    const ov = g.createLinearGradient(0, 0, w, h);
    ov.addColorStop(0, 'rgba(0,0,0,0.7)');
    ov.addColorStop(1, rgba(color, 0.45));
    g.fillStyle = ov;
    g.fillRect(0, 0, w, h);
  } else {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, mixHex(color, '#000000', 0.82));
    gr.addColorStop(0.55, mixHex(color, '#000000', 0.45));
    gr.addColorStop(1, color);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const hl = g.createRadialGradient(w * 0.9, h * 0.95, 0, w * 0.9, h * 0.95, u * 0.9);
    hl.addColorStop(0, rgba(mixHex(color, '#ffffff', 0.35), 0.55));
    hl.addColorStop(1, rgba(color, 0));
    g.fillStyle = hl;
    g.fillRect(0, 0, w, h);
  }
  // Barre de navigation.
  const ny = u * 0.09;
  const logo = logoReady(c);
  const ls = u * 0.085;
  if (logo) {
    const lw = Math.min(ls * 2.5, (logo.naturalWidth / logo.naturalHeight) * ls);
    g.drawImage(logo, u * 0.06, ny - (lw / (logo.naturalWidth / logo.naturalHeight)) / 2, lw, lw / (logo.naturalWidth / logo.naturalHeight));
  } else {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(u * 0.06 + ls / 2, ny, ls / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = color;
    g.font = `800 ${Math.round(ls * 0.5)}px ${c.font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((c.brand || 'M').slice(0, 1).toUpperCase(), u * 0.06 + ls / 2, ny + ls * 0.03);
  }
  const nav = s.nav?.length ? s.nav : [];
  g.font = `500 ${Math.round(u * (vertical ? 0.042 : 0.04))}px ${c.font}`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.88)';
  let nx = u * 0.06 + ls * (logo ? 2.6 : 1) + u * 0.05;
  for (const it of nav) {
    if (nx + g.measureText(it).width > w - u * 0.05) break;
    g.fillText(it, nx, ny);
    nx += g.measureText(it).width + u * 0.05;
  }
  // Titre.
  const words = parseRich(s.title);
  let tf = u * (vertical ? 0.12 : 0.13);
  const maxW = w * (vertical ? 0.84 : 0.72);
  let lines: Line[] = [];
  for (let k = 0; k < 8; k++) {
    g.font = `700 ${Math.round(tf)}px ${c.font}`;
    lines = wrap(g, words, maxW);
    if (lines.length <= 3) break;
    tf *= 0.9;
  }
  const tx = u * 0.08;
  let ty = h * (vertical ? 0.36 : 0.33);
  const space = g.measureText(' ').width;
  for (const ln of lines) {
    let x = tx;
    for (const wd of ln.words) {
      g.fillStyle = wd.accent ? mixHex(c.theme.accent, '#ffffff', 0.15) : '#ffffff';
      g.fillText(wd.text, x, ty);
      x += wd.width + space;
    }
    ty += tf * 1.12;
  }
  if (s.button) {
    g.font = `600 ${Math.round(u * 0.045)}px ${c.font}`;
    const bwid = g.measureText(s.button).width + u * 0.1;
    const bh = u * 0.095;
    const by = ty + u * 0.02;
    roundRect(g, tx, by, bwid, bh, c.theme.radius === 'square' ? bh * 0.12 : c.theme.radius === 'rounded' ? bh * 0.3 : bh / 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.fillStyle = '#111111';
    g.textAlign = 'center';
    g.fillText(s.button, tx + bwid / 2, by + bh / 2 + u * 0.002);
  }
  g.restore();
  // Liseré lumineux.
  roundRect(g, 1, 1, w - 2, h - 2, rr);
  g.lineWidth = Math.max(2, u * 0.006);
  g.strokeStyle = rgba(mixHex(color, '#ffffff', 0.55), 0.85);
  g.stroke();
}

/** Projette un point de la carte (repère centré) après rotation Y puis X, perspective simple. */
function project3d(x: number, y: number, ay: number, ax: number, dist: number): [number, number] {
  const x1 = x * Math.cos(ay);
  let z = x * Math.sin(ay);
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  z = y * Math.sin(ax) + z * Math.cos(ax);
  const f = dist / (dist + z);
  return [x1 * f, y1 * f];
}

/** Dessine une image plane en perspective par bandes verticales (chaque bande = transformation affine). */
function drawPerspective(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, cx: number, cy: number, scale: number, ay: number, ax: number) {
  // Autant de bandes que nécessaire : 1 seule quand la carte est presque à plat, 36 quand elle pivote fort.
  const N = Math.abs(ay) + Math.abs(ax) < 0.09 ? 1 : 36;
  const dist = Math.max(w, h) * 1.6;
  for (let i = 0; i < N; i++) {
    const sx = (i / N) * w;
    const sw = w / N;
    const p0 = project3d(sx - w / 2, -h / 2, ay, ax, dist);
    const p1 = project3d(sx + sw - w / 2, -h / 2, ay, ax, dist);
    const p2 = project3d(sx - w / 2, h / 2, ay, ax, dist);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const a = (p1[0] - p0[0]) / sw;
    const b = (p1[1] - p0[1]) / sw;
    const cc = (p2[0] - p0[0]) / h;
    const d = (p2[1] - p0[1]) / h;
    ctx.transform(a, b, cc, d, p0[0] - a * sx, p0[1] - b * sx);
    // +1 px de recouvrement pour éviter les fines lignes entre les bandes.
    ctx.drawImage(src, sx, 0, Math.min(sw + 1, w - sx), h, sx, 0, Math.min(sw + 1, w - sx), h);
    ctx.restore();
  }
}

/** Maquette du site qui arrive en pivotant (vraie perspective), se pose, puis change de couleur si demandé. */
function sceneMockup(c: Ctx, s: Extract<Scene, { type: 'mockup' }>, lt: number) {
  const { ctx, W, H } = c;
  const cw = c.vertical ? W * 0.84 : W * 0.6;
  const chh = c.vertical ? cw * 1.3 : cw * 0.6;
  const off = offscreen('mockup', cw, chh);
  if (!off) return;
  const rc = s.recolor ? easeInOut(progress(lt, s.duration * 0.42, 0.55)) : 0;
  const color = s.recolor ? mixHex(c.theme.primary, s.recolor, rc) : c.theme.primary;
  paintMockup(c, off.ctx, off.canvas.width, off.canvas.height, s, color, lt);
  const pose = (tt: number) => {
    const p = easeOutCubic(progress(tt, 0, 1.15));
    return {
      ay: (1 - p) * 0.95 + Math.sin(tt * 0.9) * 0.035 * p,
      ax: (1 - p) * -0.35,
      x: W / 2 + (1 - p) * W * 0.32,
      y: H / 2 + (1 - p) * H * 0.12,
      sc: 0.62 + 0.38 * p + 0.035 * clamp((tt - 1.15) / 3)
    };
  };
  // Flou de mouvement : copies fantômes tant que la carte bouge vite.
  const fast = 1 - clamp(lt / 0.75);
  const ghosts = fast > 0.05 ? 3 : 0;
  for (let gk = ghosts; gk >= 0; gk--) {
    const q = pose(Math.max(0, lt - gk * 0.035));
    ctx.save();
    ctx.globalAlpha *= gk === 0 ? 1 : 0.22 * fast;
    if (gk === 0) {
      // Halo coloré derrière la carte : dessiné en petit puis agrandi (flou gratuit, pas d'ombre coûteuse).
      const halo = offscreen('mockup-halo', W / 30, H / 30);
      if (halo) {
        const hg = halo.ctx;
        const hw = halo.canvas.width;
        const hh = halo.canvas.height;
        hg.setTransform(1, 0, 0, 1, 0, 0);
        hg.clearRect(0, 0, hw, hh);
        hg.setTransform(hw / W, 0, 0, hh / H, 0, 0);
        hg.translate(q.x, q.y);
        hg.scale(q.sc, q.sc);
        const dist = Math.max(cw, chh) * 1.6;
        const corners = [project3d(-cw / 2, -chh / 2, q.ay, q.ax, dist), project3d(cw / 2, -chh / 2, q.ay, q.ax, dist), project3d(cw / 2, chh / 2, q.ay, q.ax, dist), project3d(-cw / 2, chh / 2, q.ay, q.ax, dist)];
        hg.beginPath();
        corners.forEach(([px, py], ci) => (ci ? hg.lineTo(px, py) : hg.moveTo(px, py)));
        hg.closePath();
        hg.fillStyle = rgba(color, 0.8);
        hg.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.6;
        ctx.drawImage(halo.canvas as CanvasImageSource, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
        ctx.restore();
      }
    }
    drawPerspective(ctx, off.canvas as CanvasImageSource, off.canvas.width, off.canvas.height, q.x, q.y, q.sc, q.ay, q.ax);
    ctx.restore();
  }
  // Éclair lumineux qui balaie la carte au changement de couleur.
  if (s.recolor && rc > 0 && rc < 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= Math.sin(rc * Math.PI) * 0.5;
    const gx = W * (rc * 1.4 - 0.2);
    const gr = ctx.createLinearGradient(gx - W * 0.15, 0, gx + W * 0.15, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, rgba(s.recolor, 0.9));
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// ---------- Scène libre : calques + images clés (le « After Effects » de l'IA) ----------
// Toutes les tailles sont en px sur un écran dont le petit côté fait 1080 ;
// x / y sont des fractions de l'écran (0,5 = centre), ce qui rend chaque
// création valable en 9:16, 16:9 et 1:1.

type EaseName = (typeof EASES)[number];
const EASE_FN: Record<EaseName, (x: number) => number> = {
  linear: (x) => clamp(x),
  in: easeInCubic,
  out: easeOutCubic,
  inOut: easeInOut,
  back: easeOutBack,
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x))),
  elastic: (x) => { const c = clamp(x); return c === 0 || c === 1 ? c : Math.pow(2, -10 * c) * Math.sin((c * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; },
  bounce: (x) => {
    let c = clamp(x);
    const n = 7.5625, d = 2.75;
    if (c < 1 / d) return n * c * c;
    if (c < 2 / d) { c -= 1.5 / d; return n * c * c + 0.75; }
    if (c < 2.5 / d) { c -= 2.25 / d; return n * c * c + 0.9375; }
    c -= 2.625 / d; return n * c * c + 0.984375;
  }
};

/** Valeur d'une propriété animée à l'instant t (nombre ou couleur). */
function kv(k: Keyed<number> | undefined, t: number, def: number): number;
function kv(k: Keyed<string> | undefined, t: number, def: string): string;
function kv(k: Keyed<number> | Keyed<string> | undefined, t: number, def: number | string): number | string {
  if (k === undefined || k === null) return def;
  if (!Array.isArray(k)) return k;
  const keys = k as { t: number; v: number | string; e?: EaseName }[];
  if (!keys.length) return def;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) {
      const a = keys[i - 1];
      const p = EASE_FN[b.e ?? 'inOut']((t - a.t) / Math.max(1e-6, b.t - a.t));
      if (typeof a.v === 'number' && typeof b.v === 'number') return a.v + (b.v - a.v) * p;
      if (typeof a.v === 'string' && typeof b.v === 'string') return mixHex(a.v, b.v, clamp(p));
      return p < 0.5 ? a.v : b.v;
    }
  }
  return last.v;
}

type Paint = string | { from: string; to: string; angle?: number; radial?: boolean };
function paintStyle(ctx: CanvasRenderingContext2D, p: Paint, w: number, h: number): string | CanvasGradient {
  if (typeof p === 'string') return p;
  if (p.radial) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, p.from);
    g.addColorStop(1, p.to);
    return g;
  }
  const a = ((p.angle ?? 90) * Math.PI) / 180;
  const dx = (Math.cos(a) * w) / 2, dy = (Math.sin(a) * h) / 2;
  const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
  g.addColorStop(0, p.from);
  g.addColorStop(1, p.to);
  return g;
}

// Longueur approximative d'un tracé SVG (pour l'effet « le trait se dessine »).
const pathLenCache = new Map<string, number>();
function svgLength(d: string): number {
  const hit = pathLenCache.get(d);
  if (hit !== undefined) return hit;
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, cmd = 'M', x = 0, y = 0, sx = 0, sy = 0, len = 0, lcx = 0, lcy = 0;
  const n = () => Number(tok[i++] ?? 0);
  const seg = (pts: [number, number][]) => {
    // Longueur d'une courbe de Bézier (échantillonnée).
    let px = pts[0][0], py = pts[0][1];
    for (let s = 1; s <= 16; s++) {
      const u = s / 16;
      let qx: number, qy: number;
      if (pts.length === 4) {
        const m = 1 - u;
        qx = m * m * m * pts[0][0] + 3 * m * m * u * pts[1][0] + 3 * m * u * u * pts[2][0] + u * u * u * pts[3][0];
        qy = m * m * m * pts[0][1] + 3 * m * m * u * pts[1][1] + 3 * m * u * u * pts[2][1] + u * u * u * pts[3][1];
      } else {
        const m = 1 - u;
        qx = m * m * pts[0][0] + 2 * m * u * pts[1][0] + u * u * pts[2][0];
        qy = m * m * pts[0][1] + 2 * m * u * pts[1][1] + u * u * pts[2][1];
      }
      len += Math.hypot(qx - px, qy - py);
      px = qx; py = qy;
    }
  };
  let guard = 0;
  while (i < tok.length && guard++ < 4000) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { len += Math.hypot(sx - x, sy - y); x = sx; y = sy; continue; }
    if (C === 'M') { x = ox + n(); y = oy + n(); sx = x; sy = y; cmd = rel ? 'l' : 'L'; continue; }
    if (C === 'L' || C === 'T') { const nx = ox + n(), ny = oy + n(); len += Math.hypot(nx - x, ny - y); x = nx; y = ny; continue; }
    if (C === 'H') { const nx = ox + n(); len += Math.abs(nx - x); x = nx; continue; }
    if (C === 'V') { const ny = oy + n(); len += Math.abs(ny - y); y = ny; continue; }
    if (C === 'C') { const a1 = ox + n(), b1 = oy + n(), a2 = ox + n(), b2 = oy + n(), nx = ox + n(), ny = oy + n(); seg([[x, y], [a1, b1], [a2, b2], [nx, ny]]); lcx = a2; lcy = b2; x = nx; y = ny; continue; }
    if (C === 'S') { const a2 = ox + n(), b2 = oy + n(), nx = ox + n(), ny = oy + n(); seg([[x, y], [2 * x - lcx, 2 * y - lcy], [a2, b2], [nx, ny]]); lcx = a2; lcy = b2; x = nx; y = ny; continue; }
    if (C === 'Q') { const a1 = ox + n(), b1 = oy + n(), nx = ox + n(), ny = oy + n(); seg([[x, y], [a1, b1], [nx, ny]]); x = nx; y = ny; continue; }
    if (C === 'A') { n(); n(); n(); n(); n(); const nx = ox + n(), ny = oy + n(); len += Math.hypot(nx - x, ny - y) * 1.3; x = nx; y = ny; continue; }
    i++;
  }
  pathLenCache.set(d, len || 1000);
  if (pathLenCache.size > 200) pathLenCache.delete(pathLenCache.keys().next().value as string);
  return len || 1000;
}

const path2dCache = new Map<string, Path2D | null>();
function path2d(d: string): Path2D | null {
  if (!path2dCache.has(d)) {
    let p: Path2D | null = null;
    try { p = typeof Path2D !== 'undefined' ? new Path2D(d) : null; } catch { p = null; }
    path2dCache.set(d, p);
    if (path2dCache.size > 200) path2dCache.delete(path2dCache.keys().next().value as string);
  }
  return path2dCache.get(d) ?? null;
}

function imageOf(c: Ctx, src: string): HTMLImageElement | null {
  const img = src === 'logo' ? c.assets.logo : src.startsWith('search:') ? c.assets.web?.[src] : c.assets.photos?.[Number(src.slice(6))];
  return img && img.complete && img.naturalWidth ? img : null;
}

/** Texte libre : retour à la ligne, *accents*, dégradé, contour, révélation lettre / mot / ligne. */
function drawFreeText(c: Ctx, L: Extract<LeafLayerT, { kind: 'text' }>, lt: number) {
  const { ctx, W } = c;
  const size = L.size ?? 80;
  const weight = L.weight ?? 800;
  const family = L.serif ? 'Georgia, "Times New Roman", serif' : c.font;
  ctx.font = `${L.italic ? 'italic ' : ''}${weight} ${Math.round(size * 10) / 10}px ${family}`;
  const words = parseRich(L.upper ? L.text.toUpperCase() : L.text);
  const lines = wrap(ctx, words, (L.maxWidth ?? 0.9) * W);
  const track = (L.tracking ?? 0) * size;
  const lh = size * 1.12;
  const align = L.align ?? 'center';
  const space = ctx.measureText(' ').width + track;
  // Mise en page caractère par caractère (pour l'espacement et les révélations).
  type U = { ch: string; x: number; y: number; w: number; accent: boolean; word: number; line: number; idx: number };
  const units: U[] = [];
  let maxW = 0;
  const widths = lines.map((ln) => {
    let w = 0;
    ln.words.forEach((wd, k) => { for (const ch of Array.from(wd.text)) w += ctx.measureText(ch).width + track; if (k < ln.words.length - 1) w += space; });
    maxW = Math.max(maxW, w);
    return w;
  });
  const totalH = lines.length * lh;
  let idx = 0;
  lines.forEach((ln, li) => {
    let x = align === 'left' ? 0 : align === 'right' ? -widths[li] : -widths[li] / 2;
    const y = -totalH / 2 + li * lh + lh / 2;
    ln.words.forEach((wd, k) => {
      for (const ch of Array.from(wd.text)) {
        const w = ctx.measureText(ch).width;
        units.push({ ch, x, y, w, accent: wd.accent, word: wd.index, line: li, idx: idx++ });
        x += w + track;
      }
      if (k < ln.words.length - 1) x += space;
    });
  });
  const mode = L.reveal ?? 'none';
  const by = L.revealBy ?? (mode === 'type' || mode === 'split' || mode === 'curve' || mode === 'wave' ? 'char' : 'word');
  const groups = by === 'char' ? units.length : by === 'word' ? new Set(units.map((u) => u.word)).size : lines.length;
  const at = L.revealAt ?? 0;
  const dur = L.revealDur ?? Math.min(1.6, 0.25 + groups * (by === 'char' ? 0.035 : 0.12));
  const step = groups > 1 ? dur / groups : 0;
  const unitDur = Math.max(0.25, Math.min(0.7, dur * 0.6));
  const fillBase = L.fill ? paintStyle(ctx, L.fill as Paint, maxW, totalH) : kv(L.color as Keyed<string> | undefined, lt, c.theme.text);
  const accent = readableAccent(c);
  const wordOrder = [...new Set(units.map((u) => u.word))];
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const u of units) {
    const g = by === 'char' ? u.idx : by === 'word' ? wordOrder.indexOf(u.word) : u.line;
    const t0 = at + g * step;
    let p = mode === 'none' ? 1 : progress(lt, t0, mode === 'type' ? 0.001 : unitDur);
    if (p <= 0) continue;
    const e = easeOutCubic(p);
    ctx.save();
    let tx = u.x, ty = u.y, sc = 1, rot = 0, alpha = 1, bl = 0;
    switch (mode) {
      case 'rise': ty += (1 - easeOutBack(p)) * size * 0.6; alpha = clamp(p * 1.6); break;
      case 'blur': bl = (1 - e) * size * 0.3; sc = 1.25 - 0.25 * e; alpha = clamp(p * 1.5); break;
      case 'scale': sc = easeOutBack(p); alpha = clamp(p * 2); break;
      case 'split': { const r1 = rand(u.idx * 31 + 3), r2 = rand(u.idx * 17 + 5); const k = 1 - easeOutBack(p); tx += k * (r1 - 0.5) * size * 3; ty += k * (r2 - 0.5) * size * 3; rot = k * (r1 - 0.5) * 2; alpha = clamp(p * 2); break; }
      case 'curve': { const k = 1 - e; tx += k * size * 1.6; ty += k * k * size * 4.2 + k * size * 0.6; rot = k * 1.1; alpha = clamp(p * 3); break; }
      case 'wave': ty += (1 - easeOutBack(p)) * size * 0.5 ; alpha = clamp(p * 1.6); break;
      case 'mask': {
        ctx.beginPath();
        ctx.rect(u.x - size * 0.1, u.y - lh * 0.56, u.w + size * 0.2 + track, lh * 1.12);
        ctx.clip();
        ty += (1 - (1 - Math.pow(1 - p, 4))) * lh;
        break;
      }
      case 'type': p = 1; break;
    }
    ctx.globalAlpha *= alpha;
    if (bl > 0.4) setBlur(ctx, bl);
    ctx.translate(tx + u.w / 2, ty);
    if (rot) ctx.rotate(rot);
    if (sc !== 1) ctx.scale(sc, sc);
    ctx.fillStyle = u.accent ? accent : fillBase;
    if (L.stroke) {
      ctx.lineWidth = L.stroke.width;
      ctx.strokeStyle = L.stroke.color;
      ctx.lineJoin = 'round';
      ctx.strokeText(u.ch, -u.w / 2, 0);
      if (L.fill || L.color) ctx.fillText(u.ch, -u.w / 2, 0);
    } else ctx.fillText(u.ch, -u.w / 2, 0);
    ctx.restore();
  }
  // Curseur de machine à écrire.
  if (mode === 'type') {
    const shown = units.filter((u) => lt >= at + (by === 'char' ? u.idx : u.word) * step).length;
    if (shown < units.length || Math.floor(lt * 2.5) % 2 === 0) {
      const lastU = units[Math.max(0, shown - 1)];
      if (lastU) { ctx.fillStyle = accent; ctx.fillRect(lastU.x + (shown ? lastU.w : 0) + size * 0.05, lastU.y - size * 0.45, size * 0.07, size * 0.9); }
    }
  }
}

function drawParticles(c: Ctx, L: Extract<LeafLayerT, { kind: 'particles' }>, lt: number) {
  const { ctx, W, H, U } = c;
  const n = L.count;
  const size = L.size ?? 6;
  const spread = (L.spread ?? 0.5) * U;
  const speed = L.speed ?? 1;
  const at = L.at ?? 0;
  for (let i = 0; i < n; i++) {
    const r1 = rand(i * 7 + 1), r2 = rand(i * 13 + 2), r3 = rand(i * 19 + 3);
    let px = 0, py = 0, a = 1, sz = size * (0.4 + r3 * 0.9);
    const col = L.color2 && i % 2 ? L.color2 : L.color;
    switch (L.mode) {
      case 'float': px = (r1 - 0.5) * spread * 2 + Math.sin(lt * 0.7 * speed + i) * U * 0.01; py = (((r2 - lt * 0.03 * speed * (0.5 + r3)) % 1) + 1) % 1 * spread * 2 - spread; a = 0.35 + 0.65 * Math.abs(Math.sin(lt * 1.5 + i)); break;
      case 'burst': { const k = lt - at; if (k < 0) continue; const ang = r1 * Math.PI * 2; const dist = spread * (0.3 + 0.7 * r2) * easeOutCubic(k * speed / 1.1); px = Math.cos(ang) * dist; py = Math.sin(ang) * dist + k * k * U * 0.05; a = clamp(1 - k / 1.4); break; }
      case 'rain': px = (r1 - 0.5) * W * 1.1; py = ((((r2 + lt * 0.35 * speed * (0.6 + r3)) % 1) + 1) % 1) * H * 1.2 - H * 0.6; a = 0.6; break;
      case 'orbit': { const ang = r1 * Math.PI * 2 + lt * speed * (0.4 + r3 * 0.6) * (i % 2 ? 1 : -1); const rr = spread * (0.35 + 0.65 * r2); px = Math.cos(ang) * rr; py = Math.sin(ang) * rr * 0.55; a = 0.5 + 0.5 * Math.sin(ang); break; }
      case 'sparkle': px = (r1 - 0.5) * spread * 2; py = (r2 - 0.5) * spread * 2; a = Math.max(0, Math.sin(lt * 3 * speed + i * 2.1)); sz *= 1.6; break;
      case 'converge': { const k = easeInOut(clamp((lt - at) * speed / 1.2)); const ang = r1 * Math.PI * 2; const far = spread * (1 + r2); px = Math.cos(ang) * far * (1 - k); py = Math.sin(ang) * far * (1 - k); a = 0.3 + 0.7 * k; if (k >= 1) a = Math.max(0, 1 - (lt - at - 1.2 / speed) * 2); break; }
    }
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    if (L.mode === 'rain') {
      ctx.fillRect(px, py, Math.max(1, sz * 0.3), sz * 6);
    } else if (L.mode === 'sparkle') {
      ctx.beginPath();
      ctx.moveTo(px, py - sz); ctx.quadraticCurveTo(px, py, px + sz, py); ctx.quadraticCurveTo(px, py, px, py + sz); ctx.quadraticCurveTo(px, py, px - sz, py); ctx.quadraticCurveTo(px, py, px, py - sz);
      ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(px, py, sz / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Verre dépoli : floute ce qui est déjà dessiné derrière la forme (cartes d'interface haut de gamme). */
function glassBehind(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, blurPx: number) {
  const m = ctx.getTransform();
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const pad = blurPx * scale * 2;
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
  const cw = ctx.canvas.width, chh = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - pad));
  const x1 = Math.min(cw, Math.ceil(Math.max(...pts.map((p) => p[0])) + pad));
  const y1 = Math.min(chh, Math.ceil(Math.max(...pts.map((p) => p[1])) + pad));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 4 || bh < 4) return;
  // Travail à demi-définition : flou identique, 4× moins coûteux.
  const off = offscreen('glass', bw / 2, bh / 2);
  if (!off) return;
  const g = off.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, off.canvas.width, off.canvas.height);
  setBlur(g, (blurPx * scale) / 2);
  g.drawImage(ctx.canvas as CanvasImageSource, x0, y0, bw, bh, 0, 0, off.canvas.width, off.canvas.height);
  setBlur(g, 0);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(off.canvas as CanvasImageSource, x0, y0, bw, bh);
  ctx.restore();
}

/** Carte image (photo + étiquette + numéro), utilisée par les galeries. */
function drawGalleryCard(c: Ctx, img: HTMLImageElement | null, w: number, h: number, r: number, item: { label?: string; sub?: string }, badge: number | null, accent: string) {
  const { ctx } = c;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = '#15151a';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  if (img) {
    const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    ctx.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
  } else {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, rgba(c.theme.primary, 0.5));
    g.addColorStop(1, rgba(c.theme.accent, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
  if (badge !== null) {
    const bs = Math.max(26, w * 0.16);
    ctx.save();
    ctx.translate(w / 2 - bs * 0.75, h / 2 - bs * 0.62);
    roundRect(ctx, -bs * 0.6, -bs * 0.4, bs * 1.2, bs * 0.8, bs * 0.18);
    ctx.fillStyle = accent;
    ctx.fill();
    setFont(c, 800, bs * 0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isLight(accent) ? '#0d0d10' : '#ffffff';
    ctx.fillText(String(badge).padStart(2, '0'), 0, bs * 0.02);
    ctx.restore();
  }
  if (item.label) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const fs = Math.max(18, Math.min(34, w * 0.1));
    setFont(c, 700, fs);
    ctx.fillStyle = c.theme.text;
    ctx.fillText(item.label, -w / 2, h / 2 + fs * 0.5, w);
    if (item.sub) { setFont(c, 500, fs * 0.72); ctx.fillStyle = rgba(c.theme.text, 0.6); ctx.fillText(item.sub, -w / 2, h / 2 + fs * 1.75, w); }
    ctx.restore();
  }
}

function drawGallery(c: Ctx, L: Extract<LeafLayerT, { kind: 'gallery' }>, lt: number) {
  const { ctx, W, H } = c;
  const items = L.items;
  const n = items.length;
  const at = L.at ?? 0;
  const k = lt - at;
  if (k < 0) return;
  const accent = L.color ?? readableAccent(c);
  const layout = L.layout;
  const cw = L.cardW ?? (layout === 'wall' ? 260 : layout === 'stack' ? 620 : layout === 'grid' ? 300 : 300);
  const ch = L.cardH ?? (layout === 'wall' ? 340 : layout === 'stack' ? 780 : cw);
  const r = L.radius ?? (layout === 'wall' ? 18 : 26);
  const gap = L.gap ?? (layout === 'wall' ? 22 : 30);
  const speed = L.speed ?? (layout === 'wall' ? 140 : 70);
  const imgs = items.map((it) => imageOf(c, it.src));
  if (layout === 'row') {
    // Carrousel : les cartes glissent depuis la droite en décalé, puis défilent doucement.
    const total = n * cw + (n - 1) * gap;
    const scroll = -Math.max(0, k - 0.9) * speed;
    for (let i = 0; i < n; i++) {
      const p = progress(k, i * 0.07, 0.65);
      if (p <= 0) continue;
      const e = easeOutCubic(p);
      const x = -total / 2 + cw / 2 + i * (cw + gap) + scroll + (1 - e) * W * 0.7;
      if (x < -W || x > W) continue;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.8);
      ctx.translate(x, 0);
      if (p < 1) setBlur(ctx, (1 - e) * 14);
      drawGalleryCard(c, imgs[i], cw, ch, r, items[i], L.badges ? i + 1 : null, accent);
      ctx.restore();
    }
    return;
  }
  if (layout === 'wall') {
    // Mur d'images incliné : colonnes qui défilent en sens alterné.
    const diag = Math.hypot(W, H);
    const cols = Math.ceil(diag / (cw + gap)) + 2;
    const rows = Math.ceil(diag / (ch + gap)) + 3;
    const span = rows * (ch + gap);
    const ein = easeOutCubic(clamp(k / 0.9));
    ctx.save();
    ctx.globalAlpha *= clamp(k / 0.4);
    ctx.rotate(((L.angle ?? -24) * Math.PI) / 180);
    ctx.scale(1.25 - 0.25 * ein, 1.25 - 0.25 * ein);
    for (let col = 0; col < cols; col++) {
      const dir = col % 2 ? 1 : -1;
      const x = (col - (cols - 1) / 2) * (cw + gap);
      const off = (((k * speed * dir) % span) + span) % span;
      for (let row = 0; row < rows; row++) {
        let y = (row - rows / 2) * (ch + gap) + off;
        if (y > span / 2) y -= span;
        if (Math.abs(y) > diag / 2 + ch) continue;
        const idx = (col * 5 + row * 3) % n;
        ctx.save();
        ctx.translate(x, y);
        drawGalleryCard(c, imgs[idx], cw, ch, r, {}, null, accent);
        ctx.restore();
      }
    }
    ctx.restore();
    return;
  }
  if (layout === 'stack') {
    // Pile de cartes : la carte de devant s'envole, la suivante avance (rythme d'une seconde environ).
    const T = 1.15;
    const cyc = Math.max(0, k - 0.6) / T;
    const step = Math.floor(cyc);
    const f = cyc - step;
    const leave = easeInCubic(clamp((f - 0.6) / 0.4));
    const enterAll = easeOutBack(clamp(k / 0.6));
    const depth = Math.min(4, n);
    for (let d = depth - 1; d >= 0; d--) {
      const idx = (step + d) % n;
      const dd = d - leave;
      ctx.save();
      if (d === 0) {
        ctx.translate(-leave * W * 0.9, -leave * 60);
        ctx.rotate(-leave * 0.35);
      } else {
        ctx.translate(0, Math.max(0, dd) * 34);
        ctx.rotate(((d % 2 ? 1 : -1) * Math.max(0, dd) * 2.5 * Math.PI) / 180);
      }
      const sc = (1 - Math.max(0, dd) * 0.07) * (0.7 + 0.3 * enterAll);
      ctx.scale(sc, sc);
      ctx.globalAlpha *= clamp(1 - Math.max(0, dd) * 0.22) * clamp(k / 0.3);
      drawGalleryCard(c, imgs[idx], cw, ch, r, d === 0 ? items[idx] : {}, L.badges ? idx + 1 : null, accent);
      ctx.restore();
    }
    return;
  }
  // Grille : les cases apparaissent en vague.
  const cols = L.cols ?? (c.vertical ? 2 : 3);
  const rowsN = Math.ceil(n / cols);
  const tw = cols * cw + (cols - 1) * gap;
  const th = rowsN * ch + (rowsN - 1) * gap;
  for (let i = 0; i < n; i++) {
    const cx = -tw / 2 + cw / 2 + (i % cols) * (cw + gap);
    const cy = -th / 2 + ch / 2 + Math.floor(i / cols) * (ch + gap);
    const p = progress(k, (i % cols) * 0.08 + Math.floor(i / cols) * 0.12, 0.6);
    if (p <= 0) continue;
    ctx.save();
    ctx.translate(cx, cy + (1 - easeOutCubic(p)) * 60);
    const sc = 0.85 + 0.15 * easeOutBack(p);
    ctx.scale(sc, sc);
    ctx.globalAlpha *= clamp(p * 1.6);
    drawGalleryCard(c, imgs[i], cw, ch, r, items[i], L.badges ? i + 1 : null, accent);
    ctx.restore();
  }
}

/** Liste défilante : la ligne active est nette et blanche, les autres s'estompent (paroles, étapes, menu…). */
function drawList(c: Ctx, L: Extract<LeafLayerT, { kind: 'list' }>, lt: number) {
  const { ctx } = c;
  const size = L.size ?? 54;
  const lh = size * 1.45;
  const a = kv(L.active, lt, 0);
  const vis = L.visible ?? 5;
  const width = L.width ?? 860;
  const left = (L.align ?? 'left') === 'left';
  ctx.textAlign = left ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  L.lines.forEach((line, i) => {
    const d = i - a;
    if (Math.abs(d) > vis / 2 + 0.6) return;
    const near = clamp(1 - Math.abs(d));
    ctx.save();
    ctx.globalAlpha *= clamp(1 - Math.abs(d) / (vis / 2 + 0.6)) * (0.28 + 0.72 * near);
    ctx.translate(left ? -width / 2 : 0, d * lh);
    const sc = 1 + 0.06 * near;
    ctx.scale(sc, sc);
    setFont(c, L.weight ?? 800, size);
    ctx.fillStyle = near > 0.5 ? (L.color ?? c.theme.text) : rgba(L.color ?? c.theme.text, 0.75);
    ctx.fillText(line, 0, 0, width / sc);
    ctx.restore();
  });
}

function drawFreeLeaf(c: Ctx, L: LeafLayerT, lt: number) {
  const { ctx, W, H } = c;
  switch (L.kind) {
    case 'text': drawFreeText(c, L, lt); return;
    case 'rect':
    case 'ellipse': {
      const w = kv(L.w, lt, 200);
      const h = kv(L.kind === 'rect' ? L.h : L.h ?? L.w, lt, w);
      const prog = L.progress === undefined ? 1 : clamp(kv(L.progress, lt, 1));
      if (L.kind === 'rect' && L.glass) glassBehind(ctx, -w / 2, -h / 2, w, h, Math.max(0, Math.min(kv(L.radius, lt, 0), Math.min(w, h) / 2)), 26);
      ctx.beginPath();
      if (L.kind === 'rect') roundRect(ctx, -w / 2, -h / 2, w, h, Math.max(0, Math.min(kv(L.radius, lt, 0), Math.min(w, h) / 2)));
      else ctx.ellipse(0, 0, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
      const glass = L.kind === 'rect' && L.glass;
      const fill = L.fill ?? (L.color !== undefined ? kv(L.color as Keyed<string>, lt, '#ffffff') : L.stroke || glass ? undefined : '#ffffff');
      if (glass) {
        // Teinte du verre (la couleur choisie, très transparente) + reflet en haut + liseré fin.
        ctx.save();
        ctx.globalAlpha *= fill ? 0.38 : 1;
        ctx.fillStyle = fill ? paintStyle(ctx, fill as Paint, w, h) : 'rgba(18,18,24,0.42)';
        ctx.fill();
        ctx.restore();
        const hl = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        hl.addColorStop(0, 'rgba(255,255,255,0.14)');
        hl.addColorStop(0.4, 'rgba(255,255,255,0.03)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.fill();
        if (!L.stroke) { ctx.save(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke(); ctx.restore(); }
      } else if (fill) { ctx.fillStyle = paintStyle(ctx, fill as Paint, w, h); ctx.fill(); }
      if (L.stroke && prog > 0) {
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = L.stroke.width;
        ctx.strokeStyle = L.stroke.color;
        if (prog < 1) { const per = L.kind === 'rect' ? 2 * (w + h) : Math.PI * (w + h) / 2; ctx.setLineDash([per * prog, per]); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }
    case 'path': {
      const p = path2d(L.d);
      if (!p) return;
      const k = kv(L.w, lt, 600) / 1000;
      const prog = L.progress === undefined ? 1 : clamp(kv(L.progress, lt, 1));
      ctx.scale(k, k);
      ctx.translate(-500, -500);
      if (L.fill) { ctx.fillStyle = paintStyle(ctx, L.fill as Paint, 1000, 1000); ctx.fill(p); }
      if (prog > 0.001 && (L.color !== undefined || !L.fill)) {
        ctx.lineWidth = (L.width ?? 8) / k;
        ctx.lineCap = L.cap ?? 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = kv(L.color as Keyed<string> | undefined, lt, '#ffffff');
        const st = L.start === undefined ? 0 : clamp(kv(L.start, lt, 0));
        if (st >= prog) { ctx.setLineDash([]); return; }
        if (prog < 1 || st > 0) { const len = svgLength(L.d); ctx.setLineDash([len * (prog - st), len * 2 + 10]); ctx.lineDashOffset = -len * st; }
        ctx.stroke(p);
        ctx.setLineDash([]);
      }
      return;
    }
    case 'image': {
      const img = imageOf(c, L.src);
      const w = kv(L.w, lt, 600);
      const ratio = img ? img.naturalHeight / img.naturalWidth : 1;
      const h = L.h !== undefined ? kv(L.h, lt, w) : w * ratio;
      // Apparition (volet, iris, stores, partage, montée).
      const rv = L.reveal ?? 'none';
      const rp = rv === 'none' ? 1 : easeInOut(progress(lt, L.revealAt ?? 0, L.revealDur ?? 0.7));
      if (rp <= 0) return;
      ctx.save();
      if (rv !== 'none' && rp < 1) {
        ctx.beginPath();
        if (rv === 'wipe') ctx.rect(-w / 2, -h / 2, w * rp, h);
        else if (rv === 'iris') ctx.arc(0, 0, (Math.hypot(w, h) / 2) * rp, 0, Math.PI * 2);
        else if (rv === 'blinds') { const n = 7; for (let i = 0; i < n; i++) { const k = clamp(rp * 1.6 - i * 0.09); ctx.rect(-w / 2 + (w / n) * i, -h / 2, (w / n) * k + 0.5, h); } }
        else if (rv === 'split') { ctx.rect(-w / 2, -h / 2, w, (h / 2) * rp); ctx.rect(-w / 2, h / 2 - (h / 2) * rp, w, (h / 2) * rp); }
        else if (rv === 'rise') { ctx.rect(-w / 2, h / 2 - h * rp, w, h * rp); }
        ctx.clip();
        if (rv === 'rise') ctx.translate(0, (1 - rp) * h * 0.25);
      }
      ctx.save();
      if (L.radius) { roundRect(ctx, -w / 2, -h / 2, w, h, L.radius); ctx.clip(); }
      if (img) {
        const fit = L.fit ?? (L.src === 'logo' ? 'contain' : 'cover');
        const z = Math.max(1, kv(L.zoom, lt, 1));
        const k = (fit === 'cover' ? Math.max(w / img.naturalWidth, h / img.naturalHeight) : Math.min(w / img.naturalWidth, h / img.naturalHeight)) * z;
        const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
        // Point de l'image à mettre au centre du cadre (gros plan sur un détail), sans jamais sortir de l'image.
        const fxp = clamp(kv(L.fx, lt, 0.5)), fyp = clamp(kv(L.fy, lt, 0.5));
        let ox = -iw / 2 + (0.5 - fxp) * iw, oy = -ih / 2 + (0.5 - fyp) * ih;
        if (fit === 'cover' || z > 1) {
          ox = Math.min(-w / 2, Math.max(w / 2 - iw, ox));
          oy = Math.min(-h / 2, Math.max(h / 2 - ih, oy));
          if (iw < w) ox = -iw / 2;
          if (ih < h) oy = -ih / 2;
          ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
        }
        ctx.drawImage(img, ox, oy, iw, ih);
      } else if (L.src !== 'logo') {
        ctx.fillStyle = rgba(c.theme.primary, 0.25);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
      if (L.stroke) {
        ctx.shadowColor = 'transparent';
        roundRect(ctx, -w / 2, -h / 2, w, h, L.radius ?? 0);
        ctx.lineWidth = L.stroke.width;
        ctx.strokeStyle = L.stroke.color;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case 'callout': {
      // Annotation : point qui pulse → trait qui se dessine → étiquette qui apparaît.
      const { W: SW, H: SH } = c;
      const at = L.at ?? 0;
      const k = lt - at;
      if (k < 0) return;
      const col = L.color ?? readableAccent(c);
      const size = L.size ?? 46;
      // Coordonnées d'écran (le calque est déjà centré sur x, y).
      const dx = (L.tx - kv(L.x, lt, 0.5)) * SW;
      const dy = (L.ty - kv(L.y, lt, 0.5)) * SH;
      const pIn = easeOutBack(clamp(k / 0.35));
      ctx.save();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, size * 0.22 * pIn, 0, Math.PI * 2); ctx.fill();
      const pulse = (k % 1.4) / 1.4;
      ctx.globalAlpha *= (1 - pulse) * clamp(k / 0.3);
      ctx.strokeStyle = col;
      ctx.lineWidth = size * 0.07;
      ctx.beginPath(); ctx.arc(0, 0, size * (0.3 + pulse * 0.9), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // Trait coudé jusqu'à l'étiquette.
      const pl = easeInOut(clamp((k - 0.2) / 0.5));
      if (pl > 0) {
        const mx = dx * 0.55, my = dy;
        const seg1 = Math.hypot(mx, my), seg2 = Math.abs(dx - mx), tot = seg1 + seg2;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const d1 = Math.min(1, (pl * tot) / Math.max(1, seg1));
        ctx.lineTo(mx * d1, my * d1);
        if (pl * tot > seg1) ctx.lineTo(mx + (dx - mx) * Math.min(1, (pl * tot - seg1) / Math.max(1, seg2)), my);
        ctx.stroke();
        ctx.restore();
      }
      // Étiquette en verre sombre.
      const pt = easeOutCubic(clamp((k - 0.6) / 0.4));
      if (pt > 0) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.globalAlpha *= pt;
        setFont(c, 700, size);
        const tw = ctx.measureText(L.text).width;
        setFont(c, 500, size * 0.62);
        const sw = L.sub ? ctx.measureText(L.sub).width : 0;
        const bw = Math.max(tw, sw) + size * 0.9;
        const bh = size * (L.sub ? 2.15 : 1.5);
        const left = dx >= 0;
        const bx = left ? 0 : -bw;
        ctx.translate((1 - pt) * (left ? -size * 0.4 : size * 0.4), 0);
        roundRect(ctx, bx, -bh / 2, bw, bh, size * 0.35);
        ctx.fillStyle = 'rgba(10,10,14,0.78)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(col, 0.9);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        setFont(c, 700, size);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(L.text, bx + size * 0.45, L.sub ? -bh * 0.18 : 0);
        if (L.sub) { setFont(c, 500, size * 0.62); ctx.fillStyle = rgba('#ffffff', 0.72); ctx.fillText(L.sub, bx + size * 0.45, bh * 0.24); }
        ctx.restore();
      }
      return;
    }
    case 'gallery': drawGallery(c, L, lt); return;
    case 'list': drawList(c, L, lt); return;
    case 'particles': drawParticles(c, L, lt); return;
    case 'glow': {
      const r = Math.max(1, kv(L.size, lt, 400));
      const col = kv(L.color as Keyed<string>, lt, c.theme.primary);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(col, 0.9));
      g.addColorStop(0.35, rgba(col, 0.35));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      return;
    }
    case 'flow': {
      // Rubans de lumière plein écran, aux couleurs choisies.
      ctx.translate(-W / 2, -H / 2);
      const cols = L.colors;
      drawFlow({ ...c, theme: { ...c.theme, primary: cols[0], accent: cols[1] ?? cols[0] }, flowDim: L.intensity ?? 1 }, lt + 3, false);
      return;
    }
  }
}

const BLENDS: Record<string, GlobalCompositeOperation> = { add: 'lighter', screen: 'screen', multiply: 'multiply', overlay: 'overlay', normal: 'source-over' };

function drawFreeLayer(c: Ctx, L: Layer, lt: number, ghost = false) {
  const { ctx, W, H } = c;
  if (L.from !== undefined && lt < L.from) return;
  if (L.to !== undefined && lt > L.to) return;
  const op = kv(L.opacity, lt, 1);
  if (op <= 0.002) return;
  // Flou de mouvement : copies fantômes là où le calque était quelques millisecondes avant.
  if (L.motionBlur && !ghost) {
    const dx = (kv(L.x, lt, 0.5) - kv(L.x, lt - 0.04, 0.5)) * W;
    const dy = (kv(L.y, lt, 0.5) - kv(L.y, lt - 0.04, 0.5)) * H;
    const ds = Math.abs(kv(L.scale, lt, 1) - kv(L.scale, lt - 0.04, 1));
    if (Math.hypot(dx, dy) > 6 || ds > 0.03) {
      for (let g = 5; g >= 1; g--) { ctx.save(); ctx.globalAlpha *= 0.13; drawFreeLayer(c, L, lt - g * 0.011, true); ctx.restore(); }
    }
  }
  ctx.save();
  ctx.globalAlpha *= clamp(op);
  if (L.blend && L.blend !== 'normal') ctx.globalCompositeOperation = BLENDS[L.blend];
  const x = kv(L.x, lt, 0.5) * W;
  const y = kv(L.y, lt, 0.5) * H;
  ctx.translate(x, y);
  const rot = kv(L.rotate, lt, 0);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  const s = kv(L.scale, lt, 1);
  const ry = (clamp(kv(L.ry, lt, 0), -85, 85) * Math.PI) / 180;
  const rx = (clamp(kv(L.rx, lt, 0), -85, 85) * Math.PI) / 180;
  const sx = s * kv(L.sx, lt, 1) * Math.cos(ry);
  const sy = s * kv(L.sy, lt, 1) * Math.cos(rx);
  // Bascules 3D simulées : écrasement + léger cisaillement (perspective).
  if (ry) ctx.transform(1, Math.sin(ry) * 0.12, 0, 1, 0, 0);
  if (rx) ctx.transform(1, 0, Math.sin(rx) * 0.12, 1, 0, 0);
  if (sx !== 1 || sy !== 1) ctx.scale(sx || 0.0001, sy || 0.0001);
  const bl = kv(L.blur, lt, 0);
  if (bl > 0.4) setBlur(ctx, bl);
  if (L.glow) { ctx.shadowColor = rgba(L.glow.color, 0.95); ctx.shadowBlur = L.glow.size; }
  else if (L.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; }
  if (L.kind === 'group') {
    ctx.translate(-W / 2, -H / 2);
    for (const ch of L.children) drawFreeLayer(c, ch, lt);
  } else drawFreeLeaf(c, L, lt);
  ctx.restore();
}

function sceneFree(c: Ctx, s: Extract<Scene, { type: 'free' }>, lt: number) {
  const { ctx, W, H, U } = c;
  if (s.bg && typeof s.bg === 'object' && 'kind' in s.bg) {
    // Fond GPU propre à la scène (repli : dégradé de ses couleurs).
    if (!gpuBackdrop(c, s.bg as Backdrop, lt + 4)) {
      const cols = (s.bg.colors?.length ? s.bg.colors : backdropColors(c.theme));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.fillStyle = paintStyle(ctx, { from: cols[0], to: cols[cols.length - 1], angle: 110 }, W, H);
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.restore();
    }
  } else if (s.bg && s.bg !== 'theme') {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = paintStyle(ctx, s.bg as Paint, W, H);
    ctx.fillRect(-W / 2, -H / 2, W, H);
    ctx.restore();
  }
  ctx.save();
  const cam = s.camera;
  if (cam) {
    const z = kv(cam.zoom, lt, 1);
    const cx = kv(cam.x, lt, 0) * W;
    const cy = kv(cam.y, lt, 0) * H;
    const r = (kv(cam.rotate, lt, 0) * Math.PI) / 180;
    ctx.translate(W / 2, H / 2);
    if (r) ctx.rotate(r);
    ctx.scale(z, z);
    ctx.translate(-W / 2 - cx, -H / 2 - cy);
  }
  for (const L of s.layers) drawFreeLayer(c, L, lt);
  ctx.restore();
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
  const S = opts.scale ?? 1;
  const c: Ctx = { ctx, W, H, U: Math.min(W, H), vertical: H > W, theme: project.theme, font: opts.fontFamily, assets, brand: project.brand, S };
  ctx.save();
  // Le dessin est calculé en 1080p puis mis à l'échelle (1440p) : netteté maximale à l'export.
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  const { index, lt } = locate(project, t);
  const scene = project.scenes[index];
  {
    // Le flux lumineux s'efface derrière les interfaces pour garder la lisibilité, et suit le changement de couleur.
    const dimOf = (s: Scene) => (s.type === 'logo' ? 1 : s.type === 'prompt' || s.type === 'chips' || s.type === 'mockup' ? 0.45 : s.type === 'photo' || s.type === 'video' ? 1 : 0.6);
    const next = project.scenes[index + 1];
    const blend = next ? clamp((lt - (scene.duration - 0.4)) / 0.4) : 0;
    c.flowDim = dimOf(scene) * (1 - blend) + (next ? dimOf(next) : 0) * blend;
    let bgTheme = project.theme;
    const recolorOf = (s: Scene | undefined, l: number) => (s?.type === 'mockup' && s.recolor ? { col: s.recolor, k: easeInOut(progress(l, s.duration * 0.42, 0.55)) } : null);
    const rc = recolorOf(scene, lt);
    if (rc && rc.k > 0) bgTheme = { ...bgTheme, primary: mixHex(bgTheme.primary, rc.col, rc.k), accent: mixHex(bgTheme.accent, mixHex(rc.col, '#ffffff', 0.35), rc.k) };
    background({ ...c, theme: bgTheme }, t);
  }
  const d = scene.duration;
  const isLast = index === project.scenes.length - 1;
  c.anim = scene.anim ?? project.theme.anim ?? 'rise';
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
  } else if (tr === 'blur') {
    // Mouvement de caméra rapide (la scène file vers le haut), traîné de flou ajouté plus bas.
    const z = 1 + exit * 0.22 + (1 - clamp(enter)) * 0.1;
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2 - exit * H * 0.28 + (1 - clamp(enter)) * H * 0.28);
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
    case 'logo': sceneLogo(c, scene, lt, t); break;
    case 'chips': sceneChips(c, scene, lt); break;
    case 'prompt': scenePrompt(c, scene, lt); break;
    case 'mockup': sceneMockup(c, scene, lt); break;
    case 'free': sceneFree(c, scene, lt); break;
  }
  if (scene.magic?.length) for (const [k, m] of scene.magic.entries()) drawMagic(c, m, lt, d, k);
  ctx.restore();

  if (tr === 'blur') {
    // Flou de mouvement vertical pendant les mouvements de caméra.
    const k = Math.max(index > 0 ? 1 - clamp(lt / 0.4) : 0, exit);
    if (k > 0.03) {
      ctx.save();
      for (let j = 1; j <= 4; j++) {
        ctx.globalAlpha = 0.2 * k;
        ctx.drawImage(ctx.canvas, 0, 0, W * S, H * S, 0, j * k * c.U * 0.035, W, H);
      }
      ctx.restore();
    }
  }
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
      ctx.drawImage(ctx.canvas, 0, y * S, W * S, h * S, dx, y, W, h);
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

/**
 * Motion design par-dessus une vidéo (Montage IA des clips 9:16) : dessine une
 * scène libre à l'instant lt, sans fond (sauf si demandé), à l'échelle du canvas.
 */
export function drawMotionOverlay(
  ctx: CanvasRenderingContext2D,
  scene: Pick<Extract<Scene, { type: 'free' }>, 'layers' | 'camera' | 'bg'>,
  lt: number,
  opts: { fontFamily: string; theme?: Partial<MotionProject['theme']>; assets?: MotionAssets }
) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const S = Math.min(cw, ch) / 1080;
  const W = cw / S;
  const H = ch / S;
  const theme: MotionProject['theme'] = { background: '#000000', primary: '#c8ff3d', accent: '#ffffff', text: '#ffffff', style: 'neon', ...opts.theme };
  const c: Ctx = { ctx, W, H, U: Math.min(W, H), vertical: H > W, theme, font: opts.fontFamily, assets: opts.assets ?? {}, brand: '', S };
  ctx.save();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  sceneFree(c, { type: 'free', duration: 15, bg: scene.bg ?? undefined, camera: scene.camera, layers: scene.layers }, lt);
  ctx.restore();
}
