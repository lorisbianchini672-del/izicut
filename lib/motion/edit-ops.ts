/**
 * Retouches par « opérations » : au lieu de demander à l'IA de réécrire tout
 * le projet (énorme JSON → refusé par les IA gratuites, trop long, souvent
 * coupé), on lui envoie un résumé court de la pub et elle répond par une
 * petite liste de changements précis. Réponse courte = rapide et fiable.
 */
import { BACKDROPS } from './gl-bg';
import { BlockSchema, BLOCKS_DOC, blockScene } from './compose';
import { MAX_SCENES, MUSIC, MotionProjectSchema, type MotionProject, type Scene } from './types';

const TEXT_KEYS = new Set(['title', 'subtitle', 'text', 'label', 'sub', 'button', 'caption', 'author', 'value', 'prefix', 'suffix', 'emoji', 'link', 'toast']);
const HEX = /^#[0-9a-fA-F]{6}$/;

type Entry = { id: string; value: string; extra?: string };

/** Tous les textes et emojis visibles de la pub, chacun avec un identifiant (chemin dans le projet). */
export function textEntries(p: MotionProject): Entry[] {
  const out: Entry[] = [];
  const walk = (v: unknown, path: string[], parent?: Record<string, unknown>) => {
    if (out.length > 160) return;
    if (typeof v === 'string') {
      const key = path[path.length - 1];
      const inList = /^\d+$/.test(key) && ['items', 'lines'].includes(path[path.length - 2] ?? '');
      if ((TEXT_KEYS.has(key) || inList) && v.trim() && !/^(#|photo:|search:|logo$|https?:)/.test(v)) {
        const extra = parent && parent.kind === 'text' ? [parent.size ? `taille ${parent.size}` : '', typeof parent.color === 'string' ? `couleur ${parent.color}` : ''].filter(Boolean).join(', ') : '';
        out.push({ id: path.join('/'), value: v.slice(0, 90), extra: extra || undefined });
      }
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, String(i)], parent));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const [k, x] of Object.entries(o)) if (!['cues', 'glsl', 'd', 'fill', 'camera'].includes(k)) walk(x, [...path, k], o);
    }
  };
  p.scenes.forEach((s, i) => walk(s, ['scenes', String(i)]));
  return out;
}

/** Résumé compact envoyé à l'IA (quelques centaines de mots au lieu de tout le projet). */
export function summarize(p: MotionProject): string {
  const entries = textEntries(p);
  const lines = [
    `Format ${p.format} · marque « ${p.brand} » · couleurs : fond ${p.theme.background}, principale ${p.theme.primary}, accent ${p.theme.accent}, texte ${p.theme.text}${p.theme.backdrop ? ` · fond animé ${p.theme.backdrop.kind}` : ''} · musique ${p.sound?.music ?? 'aucune'}${p.sound ? ` ${p.sound.bpm} bpm` : ''}`
  ];
  p.scenes.forEach((s, i) => {
    lines.push(`Scène ${i} (${s.type}${'name' in s && s.name ? ` « ${s.name} »` : ''}, ${s.duration} s) :`);
    for (const e of entries.filter((x) => x.id.startsWith(`scenes/${i}/`))) lines.push(`  [${e.id}] "${e.value}"${e.extra ? ` (${e.extra})` : ''}`);
  });
  return lines.join('\n');
}

export const EDIT_OPS_DOC = `Tu es l'assistant de retouche d'IziCut (pubs en motion design). Le client demande une modification de sa pub : comprends exactement ce qu'il veut (même formulé vaguement, avec des fautes ou à l'oral) et traduis-le en opérations précises. Ne refuse jamais : trouve toujours la meilleure façon de réaliser la demande.
Tu reçois le résumé de la pub : chaque texte ou emoji visible a un identifiant entre crochets [scenes/N/...].
Réponds UNIQUEMENT par un objet JSON COMPACT :
{"message":"1 à 3 phrases : ce que tu as compris et changé (tutoie si le client tutoie)","ops":[ … ]}
OPÉRATIONS POSSIBLES :
- {"op":"text","id":"scenes/0/title","value":"nouveau texte"} — remplace un texte ou un emoji précis (mets *mot* pour colorer un mot avec la couleur d'accent).
- {"op":"replace","find":"ancien","value":"nouveau"} — remplace partout dans la pub (mot, phrase, emoji ; "value":"" pour supprimer).
- {"op":"style","id":"scenes/2/layers/1/text","color":"#RRGGBB","size":1.3} — couleur et/ou taille (multiplicateur) d'un texte précis.
- {"op":"theme","primary":"#RRGGBB","accent":"#RRGGBB","background":"#RRGGBB","text":"#RRGGBB"} — couleurs générales (mets seulement celles à changer).
- {"op":"backdrop","kind":un fond parmi ${BACKDROPS.filter((b) => b !== 'custom').join(', ')} ou "none","colors":["#RRGGBB",…4 du plus sombre au plus clair]} — fond animé.
- {"op":"duration","scene":N,"value":secondes} · {"op":"speed","factor":0.8} (0.8 = plus rapide, 1.2 = plus lent)
- {"op":"delete","scene":N} · {"op":"move","scene":N,"to":M}
- {"op":"add","at":N,"block":{BLOC}} — ajoute une nouvelle scène à la position N · {"op":"redo","scene":N,"block":{BLOC}} — refait entièrement une scène.
- {"op":"sticker","scene":N,"text":"Lien en bio","emoji":"👇","kind":"sticker"|"badge"|"notification"|"emoji"} — ajoute un sticker / badge / notification / emoji animé sur une scène.
- {"op":"music","music":"pop"|"electro"|"chill"|"epic"|"acoustic"|"hiphop"|"none","bpm":60-170}
- {"op":"format","value":"9:16"|"16:9"|"1:1"}
- {"op":"recreate"} — UNIQUEMENT si le client veut une pub totalement nouvelle (autre sujet ou autre marque).
Utilise exactement les identifiants donnés. Plusieurs opérations si besoin. Ne change rien que le client n'a pas demandé. Tout en français.
${BLOCKS_DOC}`;

function getParent(root: unknown, id: string): { obj: Record<string, unknown> | unknown[]; key: string } | null {
  const parts = id.split('/').filter(Boolean);
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (!cur || typeof cur !== 'object') return null;
  return { obj: cur as Record<string, unknown>, key: parts[parts.length - 1] };
}

const clampN = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

/** Applique une opération ; renvoie le nouveau projet, ou null si l'opération est impossible. */
function applyOne(p: MotionProject, op: Record<string, unknown>, o: { hasLogo: boolean; photos: number }): MotionProject | null | 'recreate' {
  const next = JSON.parse(JSON.stringify(p)) as MotionProject;
  const sceneIdx = (k: string) => (typeof op[k] === 'number' ? Math.round(op[k] as number) : -1);
  switch (op.op) {
    case 'recreate':
      return 'recreate';
    case 'text': {
      if (typeof op.id !== 'string' || typeof op.value !== 'string') return null;
      const at = getParent(next, op.id);
      if (!at || typeof (at.obj as Record<string, unknown>)[at.key] !== 'string') return null;
      (at.obj as Record<string, unknown>)[at.key] = op.value;
      return next;
    }
    case 'replace': {
      if (typeof op.find !== 'string' || !op.find || typeof op.value !== 'string') return null;
      const find = op.find;
      let hit = false;
      const fix = (s: string) => {
        if (!s.toLowerCase().includes(find.toLowerCase())) return s;
        hit = true;
        return s.split(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(op.value as string).replace(/\s{2,}/g, ' ').trim();
      };
      for (const e of textEntries(next)) {
        const at = getParent(next, e.id);
        if (!at) continue;
        const cur = (at.obj as Record<string, unknown>)[at.key];
        if (typeof cur === 'string') (at.obj as Record<string, unknown>)[at.key] = fix(cur);
      }
      if (typeof next.brand === 'string') next.brand = fix(next.brand);
      return hit ? next : null;
    }
    case 'style': {
      if (typeof op.id !== 'string') return null;
      const at = getParent(next, op.id);
      if (!at) return null;
      const holder = at.obj as Record<string, unknown>;
      const color = typeof op.color === 'string' && HEX.test(op.color) ? op.color : undefined;
      const factor = clampN(op.size, 0.3, 3, 1);
      if (holder.kind === 'text' || holder.kind === 'list' || holder.kind === 'callout') {
        if (color) holder.color = color;
        if (factor !== 1) holder.size = Math.round(clampN(holder.size, 8, 400, holder.kind === 'callout' ? 46 : 64) * factor);
        return next;
      }
      // Scène classique : le texte passe en couleur d'accent (et l'accent prend la couleur voulue).
      if (color && typeof holder[at.key] === 'string') {
        const s = (holder[at.key] as string).replace(/\*/g, '');
        holder[at.key] = `*${s}*`;
        next.theme = { ...next.theme, accent: color };
        return next;
      }
      return null;
    }
    case 'theme': {
      const th = { ...next.theme };
      let any = false;
      for (const k of ['primary', 'accent', 'background', 'text'] as const) if (typeof op[k] === 'string' && HEX.test(op[k] as string)) { th[k] = op[k] as string; any = true; }
      if (!any) return null;
      if (th.backdrop?.colors?.length && typeof op.primary === 'string' && HEX.test(op.primary)) {
        const cols = [...th.backdrop.colors];
        cols[Math.min(2, cols.length - 1)] = op.primary;
        th.backdrop = { ...th.backdrop, colors: cols };
      }
      next.theme = th;
      return next;
    }
    case 'backdrop': {
      if (op.kind === 'none') { next.theme = { ...next.theme, backdrop: undefined }; return next; }
      if (typeof op.kind !== 'string' || !(BACKDROPS as readonly string[]).includes(op.kind) || op.kind === 'custom') return null;
      const colors = Array.isArray(op.colors) ? op.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 4) : [];
      next.theme = { ...next.theme, backdrop: { ...(next.theme.backdrop ?? {}), kind: op.kind as (typeof BACKDROPS)[number], glsl: undefined, colors: colors.length ? colors : next.theme.backdrop?.colors ?? [next.theme.background, next.theme.background, next.theme.primary, next.theme.accent] } };
      next.scenes = next.scenes.map((s) => (s.type === 'free' && s.bg && s.bg !== 'theme' ? { ...s, bg: 'theme' as const } : s));
      return next;
    }
    case 'duration': {
      const i = sceneIdx('scene');
      if (!next.scenes[i]) return null;
      next.scenes[i] = { ...next.scenes[i], duration: clampN(op.value, 1, next.scenes[i].type === 'video' ? 30 : 10, next.scenes[i].duration) } as Scene;
      return next;
    }
    case 'speed': {
      const f = clampN(op.factor, 0.4, 2.5, 1);
      if (f === 1) return null;
      next.scenes = next.scenes.map((s) => ({ ...s, duration: Math.round(Math.min(s.type === 'video' ? 30 : 10, Math.max(1, s.duration * f)) * 10) / 10 }) as Scene);
      return next;
    }
    case 'delete': {
      const i = sceneIdx('scene');
      if (!next.scenes[i] || next.scenes.length <= 1) return null;
      next.scenes.splice(i, 1);
      return next;
    }
    case 'move': {
      const i = sceneIdx('scene');
      const j = Math.min(next.scenes.length - 1, Math.max(0, sceneIdx('to')));
      if (!next.scenes[i]) return null;
      const [s] = next.scenes.splice(i, 1);
      next.scenes.splice(j, 0, s);
      return next;
    }
    case 'add':
    case 'redo': {
      const b = BlockSchema.safeParse(op.block);
      if (!b.success) return null;
      if (op.op === 'add') {
        if (next.scenes.length >= MAX_SCENES) return null;
        const at = Math.min(next.scenes.length, Math.max(0, typeof op.at === 'number' ? Math.round(op.at) : next.scenes.length));
        next.scenes.splice(at, 0, blockScene(b.data, next, at, o));
      } else {
        const i = sceneIdx('scene');
        if (!next.scenes[i]) return null;
        next.scenes[i] = blockScene(b.data, next, i, o);
      }
      return next;
    }
    case 'sticker': {
      const i = sceneIdx('scene');
      const s = next.scenes[i] as Scene & { magic?: unknown[] };
      if (!s || typeof op.text !== 'string' || !op.text.trim()) return null;
      const kind = ['sticker', 'badge', 'notification', 'emoji', 'button'].includes(op.kind as string) ? (op.kind as string) : 'sticker';
      const magic = [...(s.magic ?? []), { kind, text: op.text.slice(0, 60), emoji: typeof op.emoji === 'string' ? op.emoji.slice(0, 8) : undefined, at: Math.min(Math.max(0.3, s.duration * 0.3), 8) }].slice(-3);
      next.scenes[i] = { ...s, magic } as Scene;
      return next;
    }
    case 'music': {
      const music = (MUSIC as readonly string[]).includes(op.music as string) ? (op.music as (typeof MUSIC)[number]) : next.sound?.music;
      if (!music) return null;
      next.sound = { ...(next.sound ?? { volume: 0.7 }), music, bpm: clampN(op.bpm, 60, 170, next.sound?.bpm ?? 110) };
      return next;
    }
    case 'format':
      if (!['9:16', '16:9', '1:1'].includes(op.value as string)) return null;
      next.format = op.value as MotionProject['format'];
      return next;
    default:
      return null;
  }
}

/** Applique toutes les opérations valides (une opération qui casserait la pub est ignorée, pas tout le reste). */
export function applyOps(p: MotionProject, raw: unknown, o: { hasLogo: boolean; photos: number }): { project: MotionProject; applied: number; recreate: boolean } {
  let cur = p;
  let applied = 0;
  if (!Array.isArray(raw)) return { project: p, applied: 0, recreate: false };
  for (const op of raw.slice(0, 24)) {
    if (!op || typeof op !== 'object') continue;
    let r: MotionProject | null | 'recreate' = null;
    try {
      r = applyOne(cur, op as Record<string, unknown>, o);
    } catch {
      r = null;
    }
    if (r === 'recreate') return { project: p, applied: 0, recreate: true };
    if (!r) continue;
    const ok = MotionProjectSchema.safeParse(r);
    if (ok.success) { cur = ok.data; applied++; }
  }
  return { project: cur, applied, recreate: false };
}
