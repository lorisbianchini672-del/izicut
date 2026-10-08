/**
 * Contrôle qualité IziCut : la pub est passée au crible des règles d'une
 * agence (accroche, rythme, lisibilité, appel à l'action, son, marque…).
 * Au-dessus de 85/100, elle reçoit le label « Certifiée IziCut — prête à
 * publier ». La plupart des défauts se corrigent en un clic (autoFix).
 */
import { totalDuration, type MotionProject, type Scene } from './types';

export type QualityCheck = { id: string; label: string; ok: boolean; weight: number; tip: string; fixable: boolean };
export type QualityReport = { score: number; certified: boolean; checks: QualityCheck[] };

export const CERTIFIED_SCORE = 85;

function hexLum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [hexLum(a), hexLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Texte lu à l'écran dans une scène (pour mesurer la vitesse de lecture). */
function sceneText(s: Scene): string {
  switch (s.type) {
    case 'title': return `${s.title} ${s.subtitle ?? ''}`;
    case 'bullets': return `${s.title} ${s.items.join(' ')}`;
    case 'stat': return `${s.value} ${s.label}`;
    case 'screenshot': return s.caption;
    case 'quote': return `${s.text} ${s.author ?? ''}`;
    case 'cta': return `${s.title} ${s.button}`;
    case 'video': return s.caption ?? '';
    case 'photo': return s.caption ?? '';
    case 'logo': return `${s.title} ${s.subtitle ?? ''}`;
    case 'chips': return `${s.title ?? ''} ${s.items.join(' ')}`;
    // La demande tapée se lit au rythme de la frappe : elle compte peu dans la charge de lecture.
    case 'prompt': return s.text.split(/\s+/).slice(0, 4).join(' ');
    case 'mockup': return `${s.title} ${s.button ?? ''}`;
    case 'free': return s.layers.flatMap((l) => (l.kind === 'text' ? [l.text] : l.kind === 'group' ? l.children.flatMap((ch) => (ch.kind === 'text' ? [ch.text] : [])) : [])).join(' ');
  }
}
const words = (t: string) => t.replace(/\*/g, '').split(/\s+/).filter(Boolean).length;
const isMedia = (s: Scene) => s.type === 'video' || s.type === 'photo';
/** Vitesse de lecture maximale à l'écran (mots par seconde). */
const MAX_WPS = 4.2;
const maxDur = (s: Scene) => (isMedia(s) ? 15 : 4.5);

export function checkQuality(p: MotionProject, opts: { hasLogo?: boolean } = {}): QualityReport {
  const total = totalDuration(p);
  const first = p.scenes[0];
  const last = p.scenes[p.scenes.length - 1];
  const vertical = p.format === '9:16';
  const tooFast = p.scenes.filter((s) => words(sceneText(s)) / Math.max(0.8, s.duration - 0.4) > MAX_WPS);
  const tooLong = p.scenes.filter((s) => !isMedia(s) && s.duration > 4.5);
  const hasCta = last?.type === 'cta' || p.scenes.some((s) => s.magic?.some((m) => m.kind === 'button' || m.kind === 'sticker'));
  const hasLink = p.scenes.some((s) => s.magic?.some((m) => (m.kind === 'button' || m.kind === 'sticker') && Boolean(m.sub)));
  const genericBrand = !p.brand.trim() || /^(mon|ma|votre|mes)\s?(appli|marque|compte|salon|boutique|entreprise)?$/i.test(p.brand.trim()) || /^(MonAppli|MaMarque|@moncompte)$/i.test(p.brand.trim());
  const c = contrast(p.theme.text, p.theme.background);
  const checks: QualityCheck[] = [
    { id: 'hook', label: 'Accroche en moins de 3 s', ok: Boolean(first) && first.duration <= 3.2 && words(sceneText(first)) <= 9 && words(sceneText(first)) > 0, weight: 16, tip: 'La 1re scène doit frapper en moins de 3 s avec 9 mots maximum.', fixable: true },
    { id: 'duration', label: vertical ? 'Durée idéale (10 à 20 s)' : 'Durée adaptée (10 à 60 s)', ok: total >= 10 && total <= (vertical ? 20.5 : 60), weight: 12, tip: 'Les pubs courtes sont vues jusqu’au bout : visez 15 s.', fixable: true },
    { id: 'rhythm', label: 'Rythme publicitaire (aucune scène > 4,5 s)', ok: tooLong.length === 0, weight: 10, tip: 'Une scène trop longue fait décrocher : coupez-la en deux ou raccourcissez-la.', fixable: true },
    { id: 'reading', label: 'Textes lisibles à temps', ok: tooFast.length === 0, weight: 12, tip: 'Trop de mots pour la durée de la scène : raccourcissez le texte ou allongez la scène.', fixable: true },
    { id: 'contrast', label: 'Contraste texte / fond suffisant', ok: c >= 4.5, weight: 12, tip: 'Le texte doit ressortir nettement du fond (contraste ≥ 4,5).', fixable: true },
    { id: 'cta', label: 'Appel à l’action clair', ok: hasCta, weight: 14, tip: 'Terminez par une scène qui dit quoi faire : réserver, commander, venir…', fixable: true },
    { id: 'link', label: 'Lien ou « lien en bio » visible', ok: hasLink, weight: 6, tip: 'Ajoutez votre lien ou un sticker « Lien en bio » dans la scène finale.', fixable: true },
    { id: 'sound', label: 'Musique et bruitages', ok: Boolean(p.sound && p.sound.music !== 'none'), weight: 8, tip: 'Le son fait partie de l’accroche : ajoutez une musique.', fixable: true },
    { id: 'brand', label: 'Marque identifiable', ok: !genericBrand || Boolean(opts.hasLogo), weight: 6, tip: 'Indiquez le nom de votre marque (onglet Style) ou ajoutez votre logo.', fixable: false },
    { id: 'proof', label: 'Vos vraies images (photo ou vidéo)', ok: p.scenes.some(isMedia), weight: 4, tip: 'Une vraie photo de votre activité rend la pub plus crédible (onglet Médias).', fixable: false }
  ];
  const max = checks.reduce((n, k) => n + k.weight, 0);
  const score = Math.round((checks.reduce((n, k) => n + (k.ok ? k.weight : 0), 0) / max) * 100);
  return { score, certified: score >= CERTIFIED_SCORE && checks.find((k) => k.id === 'cta')!.ok && checks.find((k) => k.id === 'contrast')!.ok, checks };
}

/** Corrige automatiquement ce qui peut l'être, sans toucher au style de la pub. */
export function autoFix(p: MotionProject, opts: { link?: string } = {}): MotionProject {
  let scenes = p.scenes.map((s) => ({ ...s })) as Scene[];
  // Rythme : on raccourcit les scènes trop longues (hors photos / vidéos).
  scenes = scenes.map((s) => (!isMedia(s) && s.duration > 4.5 ? ({ ...s, duration: 4 } as Scene) : s));
  // Accroche : 1re scène courte et dense (on retire le sous-titre si trop de mots).
  if (scenes[0]) {
    let h = scenes[0];
    if (h.type === 'title' && h.subtitle && words(sceneText(h)) > 9) h = { ...h, subtitle: undefined };
    if (h.duration > 3.2) h = { ...h, duration: 2.8 } as Scene;
    scenes[0] = h;
  }
  // Lisibilité : on allège les textes trop longs pour la durée maximale d'une scène…
  scenes = scenes.map((s, i) => {
    let x = s;
    const limit = i === 0 ? 3.2 : maxDur(x);
    const tooMuch = () => words(sceneText(x)) / Math.max(0.8, limit - 0.4) > MAX_WPS;
    if (tooMuch() && x.type === 'title' && x.subtitle) x = { ...x, subtitle: undefined };
    while (tooMuch() && x.type === 'bullets' && x.items.length > 2) x = { ...x, items: x.items.slice(0, -1) };
    if (tooMuch() && x.type === 'quote' && x.author) x = { ...x, author: undefined };
    return x;
  });
  // … puis on donne le temps de lire.
  scenes = scenes.map((s, i) => {
    const limit = i === 0 ? 3.2 : maxDur(s);
    const need = Math.min(limit, Math.max(s.duration, words(sceneText(s)) / (MAX_WPS - 0.6) + 0.4));
    return need > s.duration ? ({ ...s, duration: Math.round(need * 10) / 10 } as Scene) : s;
  });
  // Appel à l'action.
  const last = scenes[scenes.length - 1];
  if (last?.type !== 'cta' && !scenes.some((s) => s.magic?.some((m) => m.kind === 'button' || m.kind === 'sticker'))) {
    scenes.push({ type: 'cta', duration: 3, title: 'Découvrez-nous *dès maintenant*', button: opts.link ? opts.link.replace(/^https?:\/\//, '').slice(0, 30) : 'En savoir plus', sfx: 'impact' });
  }
  // Lien en bio.
  const end = scenes[scenes.length - 1];
  const hasLink = scenes.some((s) => s.magic?.some((m) => (m.kind === 'button' || m.kind === 'sticker') && m.sub));
  if (!hasLink && end) {
    const magic = (end.magic ?? []).filter((m) => m.kind !== 'sticker').slice(0, 2);
    const sub = opts.link ? opts.link.replace(/^https?:\/\//, '').slice(0, 60) : 'Tout est dans le lien';
    scenes[scenes.length - 1] = { ...end, magic: [...magic, { kind: 'sticker', text: 'Lien en bio', emoji: '👇', sub, at: Math.min(0.6, Math.max(0, end.duration - 0.8)) }] } as Scene;
  }
  // Durée totale : on étire ou on resserre vers 15 s.
  const sum = scenes.reduce((n, s) => n + s.duration, 0);
  if (p.format === '9:16' && (sum < 10 || sum > 20.5)) {
    const k = 15 / sum;
    scenes = scenes.map((s, i) => ({ ...s, duration: Math.round(Math.min(i === 0 ? 3.2 : maxDur(s), Math.max(1.5, s.duration * k)) * 10) / 10 }) as Scene);
  }
  // Contraste.
  let theme = p.theme;
  if (contrast(theme.text, theme.background) < 4.5) {
    theme = { ...theme, text: contrast('#ffffff', theme.background) >= contrast('#101225', theme.background) ? '#ffffff' : '#101225' };
  }
  const sound = p.sound && p.sound.music !== 'none' ? p.sound : { music: 'pop' as const, bpm: 116 };
  return { ...p, theme, sound, scenes: scenes.slice(0, 12) };
}
