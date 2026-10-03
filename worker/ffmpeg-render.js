/**
 * Rendu LÉGER des clips 9:16 avec ffmpeg seul (sous-titres ASS via libass).
 *
 * Pourquoi : le rendu Remotion lance un Chrome complet (~600 Mo) et ne tient
 * pas dans un petit serveur de 1 Go. ffmpeg + libass fait le même travail
 * essentiel (recadrage 9:16, sous-titres mot à mot surlignés, titre
 * d'accroche, filigrane) avec ~150 Mo.
 *
 * RENDER_ENGINE=remotion réactive le rendu Remotion (serveur ≥ 2 Go).
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** #RRGGBB → couleur ASS &H00BBGGRR. */
function assColor(hex, fallback = '#FFFFFF') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')) ?? /^#?([0-9a-f]{6})$/i.exec(fallback);
  const [r, g, b] = [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6)];
  return `&H00${b}${g}${r}`.toUpperCase();
}

function assTime(t) {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
}

const escapeAss = (t) => String(t).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\n/g, ' ');

/** Mots propres : texte non vide, temps valides, triés, sans chevauchement. */
function cleanWords(words) {
  const list = (Array.isArray(words) ? words : [])
    .map((w) => ({ text: String(w?.word ?? '').trim(), start: Number(w?.start), end: Number(w?.end) }))
    .filter((w) => w.text && Number.isFinite(w.start))
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (!Number.isFinite(w.end) || w.end <= w.start) w.end = w.start + 0.3;
    // Whisper renvoie parfois des mots qui se chevauchent : on coupe net.
    if (i < list.length - 1 && w.end > list[i + 1].start) w.end = Math.max(w.start + 0.05, list[i + 1].start);
  }
  return list;
}

/** Regroupe les mots en lignes courtes (lisibles sur mobile), sans dépasser la largeur. */
function groupWords(words, maxWords = 3, maxChars = 18) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= maxWords || len > maxChars || gap > 0.8)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Variantes de style, alignées sur les modèles de l'éditeur.
 * width : largeur moyenne d'un caractère (× taille) pour éviter les débordements.
 */
const TEMPLATES = {
  hormozi:     { words: 3, size: 1,    outline: 6, font: 'Montserrat Black',     width: 0.74, activeTag: (c) => `{\\c${c}\\fscx106\\fscy106}` },
  clean:       { words: 5, size: 0.8,  outline: 3, font: 'Montserrat ExtraBold', width: 0.62, activeTag: (c) => `{\\c${c}}` },
  karaoke_box: { words: 3, size: 0.95, outline: 6, font: 'Montserrat Black',     width: 0.74, activeTag: (c) => `{\\3c${c}\\bord14\\c&H00FFFFFF}` },
  neon:        { words: 3, size: 1,    outline: 3, font: 'Montserrat Black',     width: 0.74, activeTag: (c) => `{\\c${c}\\3c${c}\\bord5\\blur6}` },
  bold_pop:    { words: 1, size: 1.45, outline: 8, font: 'Montserrat Black',     width: 0.76, activeTag: (c) => `{\\c${c}\\fscx110\\fscy110}` },
  minimal:     { words: 6, size: 0.62, outline: 2, font: 'Montserrat ExtraBold', width: 0.6,  activeTag: (c) => `{\\c${c}}` },
};
// \r remet le style de base (couleur, contour) pour les mots suivants.
const RESET = () => '{\\r}';

/**
 * Chronologie des sous-titres : UN SEUL texte à l'écran à la fois.
 * Chaque événement s'arrête exactement quand le suivant commence (plus
 * jamais deux lignes superposées), et les petits silences (< 0,6 s) sont
 * comblés pour éviter le clignotement.
 */
export function captionEvents(words, maxWords, maxChars) {
  const events = [];
  for (const group of groupWords(cleanWords(words), maxWords, maxChars)) {
    group.forEach((w, i) => {
      events.push({ group, index: i, start: w.start, end: i < group.length - 1 ? group[i + 1].start : w.end + 0.6 });
    });
  }
  for (let k = 0; k < events.length; k++) {
    const next = events[k + 1];
    if (next) events[k].end = Math.min(events[k].end, next.start);
    if (events[k].end - events[k].start < 0.04) events[k].end = events[k].start + 0.04;
    if (next && events[k].end > next.start) next.start = events[k].end;
  }
  return events.filter((e) => e.end > e.start);
}

export function buildAss({ words, settings, width, height, duration, hookTitle, signature }) {
  const scale = width / 1080;
  const tpl = TEMPLATES[settings.template] ?? TEMPLATES.hormozi;
  const upper = settings.uppercase !== false && settings.template !== 'clean' && settings.template !== 'minimal';
  const fontSize = Math.round((Number(settings.font_size) || 84) * tpl.size * scale);
  const active = assColor(settings.active_color, '#FFD400');
  const base = assColor(settings.text_color, '#FFFFFF');
  // Zone sûre TikTok/Reels : ni sous l'interface du bas, ni collé en haut.
  const posRatio = Math.min(0.8, Math.max(0.14, Number(settings.position) || 0.7));
  const y = Math.round(height * posRatio);
  const x = Math.round(width / 2);
  const outline = Math.max(2, Math.round(tpl.outline * scale));
  // Nombre de caractères qui tiennent sur UNE ligne (88 % de la largeur).
  const usable = width * 0.88;
  const fitChars = Math.max(6, Math.floor(usable / (fontSize * tpl.width)));
  const maxChars = Math.min(fitChars, tpl.words === 1 ? 40 : 18 + (tpl.words - 3) * 6);
  // Titre d'accroche : en haut, sauf si les sous-titres sont déjà en haut.
  const hookAtBottom = posRatio < 0.35;

  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${tpl.font},${fontSize},${base},${base},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(3 * scale)},5,40,40,40,1`,
    `Style: Hook,Montserrat ExtraBold,${Math.round(56 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,3,${Math.round(16 * scale)},0,${hookAtBottom ? 2 : 8},70,70,${Math.round((hookAtBottom ? 330 : 170) * scale)},1`,
    `Style: Mark,Montserrat ExtraBold,${Math.round(26 * scale)},&H50FFFFFF,&H50FFFFFF,&H90000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(1, Math.round(2 * scale))},0,9,40,40,${Math.round(40 * scale)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  for (const ev of captionEvents(words, tpl.words, maxChars)) {
    const plain = ev.group.map((g) => g.text).join(' ');
    // Mot unique trop long (ex. « anticonstitutionnellement ») : on réduit
    // la police de ce sous-titre au lieu de déborder de l'écran.
    const shrink = plain.length > fitChars ? Math.max(55, Math.floor((fitChars / plain.length) * 100)) : 100;
    const text = ev.group
      .map((g, j) => {
        const t = escapeAss(upper ? g.text.toUpperCase() : g.text);
        return j === ev.index ? `${tpl.activeTag(active)}${t}${RESET(base)}` : t;
      })
      .join(' ');
    const sizeTag = shrink < 100 ? `\\fscx${shrink}\\fscy${shrink}` : '';
    lines.push(`Dialogue: 1,${assTime(ev.start)},${assTime(ev.end)},Cap,,0,0,0,,{\\pos(${x},${y})${sizeTag}}${text}`);
  }

  if (hookTitle) {
    lines.push(`Dialogue: 2,${assTime(0)},${assTime(Math.min(3.5, duration))},Hook,,0,0,0,,{\\fad(150,250)}${escapeAss(hookTitle)}`);
  }
  if (signature) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(duration + 1)},Mark,,0,0,0,,${escapeAss(signature)}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Détecte les bandes noires de la source (vidéo « letterbox ») pour les
 * retirer avant le recadrage 9:16. Renvoie « w:h:x:y » ou null.
 */
async function detectBlackBars(ffmpegBin, input) {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-hide_banner', '-ss', '1', '-i', input, '-t', '6', '-vf', 'fps=2,cropdetect=24:2:0', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); if (err.length > 200000) err = err.slice(-100000); });
    const timer = setTimeout(() => proc.kill('SIGKILL'), 30000);
    proc.on('close', () => {
      clearTimeout(timer);
      const all = [...err.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
      const size = /Stream.*Video.* (\d{2,5})x(\d{2,5})/.exec(err);
      if (!all.length || !size) return resolve(null);
      const [, w, h, cx, cy] = all[all.length - 1].map(Number);
      const [iw, ih] = [Number(size[1]), Number(size[2])];
      // On ne coupe que de vraies bandes (> 4 %) et jamais plus de 40 %.
      const cutsW = 1 - w / iw, cutsH = 1 - h / ih;
      if ((cutsW < 0.04 && cutsH < 0.04) || cutsW > 0.4 || cutsH > 0.4 || w < 100 || h < 100) return resolve(null);
      resolve(`${w}:${h}:${cx}:${cy}`);
    });
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

/** Arguments ffmpeg du rendu final. */
export async function ffmpegRenderArgs({ cutPath, workdir, outputPath, settings, words, duration, hookTitle, signature, width, height, crf, ffmpegBin = 'ffmpeg' }) {
  const assPath = path.join(workdir, 'subs.ass');
  await writeFile(assPath, buildAss({ words, settings, width, height, duration, hookTitle, signature }), 'utf8');
  const focus = Math.min(1, Math.max(0, Number(settings.focus_x ?? 0.5)));
  const subs = `subtitles='${assPath.replace(/'/g, "\\'")}'`;
  const bars = await detectBlackBars(ffmpegBin, cutPath).catch(() => null);
  const pre = bars ? `crop=${bars},` : '';

  const filter = settings.layout === 'blur_fit'
    ? `[0:v]${pre}split[a][b];[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:2,eq=brightness=-0.15[bg];[b]scale=${width}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${subs}[v]`
    : `[0:v]${pre}crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))*${focus}':0,scale=${width}:${height},${subs}[v]`;

  return [
    '-y', '-i', cutPath,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf ?? 20), '-threads', '2', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    outputPath,
  ];
}
