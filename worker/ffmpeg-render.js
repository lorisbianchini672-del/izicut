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

/** Regroupe les mots en lignes courtes (lisibles sur mobile). */
function groupWords(words, maxWords = 3, maxChars = 18) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    const text = String(w.word ?? '').trim();
    if (!text) continue;
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + text.length;
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= maxWords || len > maxChars || gap > 0.8)) {
      groups.push(cur);
      cur = [];
    }
    cur.push({ text, start: w.start, end: w.end });
    if (/[.!?…]$/.test(text)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** Variantes de style, alignées sur les modèles de l'éditeur. */
const TEMPLATES = {
  hormozi:     { words: 3, size: 1,    outline: 6, activeTag: (c) => `{\\c${c}\\fscx108\\fscy108}` },
  clean:       { words: 6, size: 0.8,  outline: 3, activeTag: (c) => `{\\c${c}}` },
  karaoke_box: { words: 4, size: 0.95, outline: 6, activeTag: (c) => `{\\3c${c}\\bord14\\c&H00FFFFFF}` },
  neon:        { words: 3, size: 1,    outline: 3, activeTag: (c) => `{\\c${c}\\3c${c}\\bord5\\blur6}` },
  bold_pop:    { words: 1, size: 1.55, outline: 8, activeTag: (c) => `{\\c${c}\\fscx112\\fscy112}` },
  minimal:     { words: 7, size: 0.6,  outline: 2, activeTag: (c) => `{\\c${c}}` },
};
// \r remet le style de base (couleur, contour) pour les mots suivants.
const RESET = () => '{\\r}';

export function buildAss({ words, settings, width, height, duration, hookTitle, signature }) {
  const scale = width / 1080;
  const tpl = TEMPLATES[settings.template] ?? TEMPLATES.hormozi;
  const upper = settings.uppercase !== false && settings.template !== 'clean' && settings.template !== 'minimal';
  const fontSize = Math.round((Number(settings.font_size) || 84) * tpl.size * scale);
  const active = assColor(settings.active_color, '#FFD400');
  const base = assColor(settings.text_color, '#FFFFFF');
  const y = Math.round(height * Math.min(0.92, Math.max(0.1, Number(settings.position) || 0.72)));
  const x = Math.round(width / 2);
  const outline = Math.max(2, Math.round(tpl.outline * scale));

  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,DejaVu Sans,${fontSize},${base},${base},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(2 * scale)},5,40,40,40,1`,
    `Style: Hook,DejaVu Sans,${Math.round(58 * scale)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,3,${Math.round(14 * scale)},0,8,60,60,${Math.round(150 * scale)},1`,
    `Style: Mark,DejaVu Sans,${Math.round(30 * scale)},&H40FFFFFF,&H40FFFFFF,&H80000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(1, Math.round(2 * scale))},0,2,40,40,${Math.round(60 * scale)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  for (const group of groupWords(words, tpl.words, tpl.words === 1 ? 40 : 18 + (tpl.words - 3) * 6)) {
    group.forEach((w, i) => {
      const start = w.start;
      const end = i < group.length - 1 ? group[i + 1].start : Math.max(w.end, start + 0.25);
      const text = group
        .map((g, j) => {
          const t = escapeAss(upper ? g.text.toUpperCase() : g.text);
          return j === i ? `${tpl.activeTag(active)}${t}${RESET(base)}` : t;
        })
        .join(' ');
      lines.push(`Dialogue: 1,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\pos(${x},${y})}${text}`);
    });
  }

  if (hookTitle) {
    lines.push(`Dialogue: 2,${assTime(0)},${assTime(Math.min(3.5, duration))},Hook,,0,0,0,,{\\fad(150,250)}${escapeAss(hookTitle)}`);
  }
  if (signature) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(duration + 1)},Mark,,0,0,0,,${escapeAss(signature)}`);
  }
  return lines.join('\n') + '\n';
}

/** Arguments ffmpeg du rendu final. */
export async function ffmpegRenderArgs({ cutPath, workdir, outputPath, settings, words, duration, hookTitle, signature, width, height, crf }) {
  const assPath = path.join(workdir, 'subs.ass');
  await writeFile(assPath, buildAss({ words, settings, width, height, duration, hookTitle, signature }), 'utf8');
  const focus = Math.min(1, Math.max(0, Number(settings.focus_x ?? 0.5)));
  const subs = `subtitles='${assPath.replace(/'/g, "\\'")}'`;

  const filter = settings.layout === 'blur_fit'
    ? `[0:v]split[a][b];[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:2,eq=brightness=-0.15[bg];[b]scale=${width}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${subs}[v]`
    : `[0:v]crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))*${focus}':0,scale=${width}:${height},${subs}[v]`;

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
