/**
 * ============================================================
 * lib/entitlements.ts — Ce que chaque offre autorise VRAIMENT
 * ------------------------------------------------------------
 * Module PUR, zéro import : il est lu par Next.js (éditeur, API)
 * ET par le worker Node (rendu), sans résolution d'alias.
 *
 * Règle de sécurité : l'interface peut afficher ce qu'elle veut,
 * c'est `sanitizeRenderSettings` — appelée par l'API ET par le
 * worker au moment du rendu — qui fait foi. Un utilisateur Free
 * qui forge une requête (ou écrit dans `clips.style_config` via
 * la RLS) obtient un rendu Free, jamais une fonction payante.
 * ============================================================
 */

export type PlanTier = 'free' | 'pro' | 'agency';

export const PLAN_TIERS: PlanTier[] = ['free', 'pro', 'agency'];

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  agency: 'Agency'
};

/** Styles de sous-titres animés disponibles au rendu. */
export type CaptionTemplate =
  | 'hormozi'
  | 'clean'
  | 'karaoke_box'
  | 'neon'
  | 'bold_pop'
  | 'minimal';

export const CAPTION_TEMPLATES: { key: CaptionTemplate; label: string; description: string }[] = [
  { key: 'hormozi', label: 'Hormozi', description: 'Majuscules, contour noir, mot actif coloré' },
  { key: 'clean', label: 'Clean', description: 'Sobre et lisible, idéal pour l’éducatif' },
  { key: 'karaoke_box', label: 'Karaoké Box', description: 'Le mot prononcé s’allume dans un bloc coloré' },
  { key: 'neon', label: 'Néon', description: 'Halo lumineux sur le mot actif' },
  { key: 'bold_pop', label: 'Bold Pop', description: 'Un mot géant à la fois, effet punch' },
  { key: 'minimal', label: 'Minimal', description: 'Petit, discret, en bas de l’écran' }
];

/** Cadrage 9:16 : recadrage plein écran ou vidéo entière sur fond flou. */
export type FrameLayout = 'crop' | 'blur_fit';

/** Réglages de rendu stockés dans `clips.style_config` (forme plate). */
export type RenderSettings = {
  template: CaptionTemplate;
  /** Couleur du mot prononcé (#RRGGBB). */
  active_color: string;
  /** Couleur des autres mots (#RRGGBB). */
  text_color: string;
  /** Taille des sous-titres en pixels (canevas 1080×1920). */
  font_size: number;
  /** Centre vertical des sous-titres : 0 = haut, 1 = bas. */
  position: number;
  uppercase: boolean;
  layout: FrameLayout;
  /** Point de cadrage horizontal : 0 = gauche, 0.5 = centre, 1 = droite. */
  focus_x: number;
  remove_silences: boolean;
  enhance_audio: boolean;
  auto_zoom: boolean;
  hook_title: boolean;
  /** Texte du titre d'accroche (vide = accroche proposée par l'IA). */
  hook_title_text: string;
  progress_bar: boolean;
  fps: 30 | 60;
  /** Signature personnalisée (Agency) : remplace le filigrane. */
  brand_text: string;
};

export type Entitlements = {
  /** Nombre maximal de clips proposés par l'IA pour une vidéo. */
  maxClipsPerVideo: number;
  /** Rendus autorisés par clip (null = illimité). */
  maxRendersPerClip: number | null;
  templates: CaptionTemplate[];
  customColors: boolean;
  watermark: boolean;
  removeSilences: boolean;
  enhanceAudio: boolean;
  autoZoom: boolean;
  hookTitle: boolean;
  progressBar: boolean;
  blurLayout: boolean;
  manualReframe: boolean;
  fps60: boolean;
  brandText: boolean;
  /** Qualité x264 (CRF : plus bas = meilleure qualité, fichier plus lourd). */
  crf: number;
};

export const ENTITLEMENTS: Record<PlanTier, Entitlements> = {
  free: {
    maxClipsPerVideo: 3,
    maxRendersPerClip: 3,
    templates: ['hormozi', 'clean'],
    customColors: false,
    watermark: true,
    removeSilences: false,
    enhanceAudio: false,
    autoZoom: false,
    hookTitle: false,
    progressBar: false,
    blurLayout: false,
    manualReframe: false,
    fps60: false,
    brandText: false,
    crf: 20
  },
  pro: {
    maxClipsPerVideo: 6,
    maxRendersPerClip: null,
    templates: CAPTION_TEMPLATES.map((t) => t.key),
    customColors: true,
    watermark: false,
    removeSilences: true,
    enhanceAudio: true,
    autoZoom: true,
    hookTitle: true,
    progressBar: true,
    blurLayout: true,
    manualReframe: true,
    fps60: true,
    brandText: false,
    crf: 16
  },
  agency: {
    maxClipsPerVideo: 10,
    maxRendersPerClip: null,
    templates: CAPTION_TEMPLATES.map((t) => t.key),
    customColors: true,
    watermark: false,
    removeSilences: true,
    enhanceAudio: true,
    autoZoom: true,
    hookTitle: true,
    progressBar: true,
    blurLayout: true,
    manualReframe: true,
    fps60: true,
    brandText: true,
    crf: 16
  }
};

/** Fonctions verrouillables, pour l'affichage des cadenas dans l'éditeur. */
export type LockableFeature =
  | 'customColors'
  | 'removeSilences'
  | 'enhanceAudio'
  | 'autoZoom'
  | 'hookTitle'
  | 'progressBar'
  | 'blurLayout'
  | 'manualReframe'
  | 'fps60'
  | 'brandText'
  | 'noWatermark'
  | 'premiumTemplates';

/** Offre minimale qui débloque une fonction. */
export function requiredTier(feature: LockableFeature): PlanTier {
  return feature === 'brandText' ? 'agency' : 'pro';
}

export function hasFeature(tier: PlanTier, feature: LockableFeature): boolean {
  const e = ENTITLEMENTS[tier];
  switch (feature) {
    case 'noWatermark':
      return !e.watermark;
    case 'premiumTemplates':
      return e.templates.length > ENTITLEMENTS.free.templates.length;
    default:
      return e[feature];
  }
}

/** Palette imposée à l'offre Free (couleurs libres = Pro). */
export const FREE_ACTIVE_COLORS = ['#FFD400', '#22D3EE', '#4ADE80'];

const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Offre effective d'un profil. Une offre payante n'est retenue que si
 * l'abonnement Stripe est en cours : un abonnement résilié ou impayé
 * retombe en Free, même si la colonne `plan` n'a pas encore été remise
 * à jour par le webhook.
 */
export function resolvePlanTier(plan: unknown, subscriptionStatus?: unknown): PlanTier {
  const tier: PlanTier = plan === 'pro' || plan === 'agency' ? plan : 'free';
  if (tier === 'free') return 'free';
  return typeof subscriptionStatus === 'string' && PAID_STATUSES.has(subscriptionStatus)
    ? tier
    : 'free';
}

/** Convertit une clé d'offre commerciale (lib/plans.ts) en niveau d'accès. */
export function tierFromPlanKey(planKey: string | null | undefined): PlanTier {
  if (planKey === 'agency' || planKey === 'studio') return 'agency';
  if (planKey === 'pro' || planKey === 'creator') return 'pro';
  return 'free';
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  template: 'hormozi',
  active_color: '#FFD400',
  text_color: '#FFFFFF',
  font_size: 84,
  position: 0.72,
  uppercase: true,
  layout: 'crop',
  focus_x: 0.5,
  remove_silences: false,
  enhance_audio: false,
  auto_zoom: false,
  hook_title: false,
  hook_title_text: '',
  progress_bar: false,
  fps: 30,
  brand_text: ''
};

/**
 * Réglages appliqués par défaut à un NOUVEAU clip : un abonné reçoit
 * directement un montage « poussé » sans rien toucher (silences coupés,
 * zooms, titre d'accroche, audio studio).
 */
export function defaultSettingsForTier(tier: PlanTier): RenderSettings {
  if (tier === 'free') return { ...DEFAULT_RENDER_SETTINGS };
  return {
    ...DEFAULT_RENDER_SETTINGS,
    remove_silences: true,
    enhance_audio: true,
    auto_zoom: true,
    hook_title: true,
    progress_bar: false
  };
}

// ---------- Validation défensive ----------

type Loose = Record<string, unknown>;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function pickColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

function pickNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Texte affiché dans la vidéo : une ligne, sans caractères de contrôle. */
function pickText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Lit n'importe quelle valeur de `style_config` (forme actuelle, ancienne
 * forme plate du worker, ancienne forme imbriquée de l'éditeur) et
 * renvoie des réglages valides.
 */
export function parseRenderSettings(input: unknown): RenderSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Loose;
  const captions = (raw.captions && typeof raw.captions === 'object' ? raw.captions : {}) as Loose;
  const colors = (raw.colors && typeof raw.colors === 'object' ? raw.colors : {}) as Loose;
  const d = DEFAULT_RENDER_SETTINGS;

  const templateKeys = CAPTION_TEMPLATES.map((t) => t.key) as string[];
  const template =
    typeof raw.template === 'string' && templateKeys.includes(raw.template)
      ? (raw.template as CaptionTemplate)
      : d.template;

  return {
    template,
    active_color: pickColor(raw.active_color ?? captions.active_color ?? colors.primary, d.active_color),
    text_color: pickColor(raw.text_color ?? raw.inactive_color ?? captions.inactive_color ?? colors.text, d.text_color),
    font_size: Math.round(pickNumber(raw.font_size ?? captions.font_size, 48, 140, d.font_size)),
    position: pickNumber(raw.position ?? captions.position, 0.15, 0.85, d.position),
    uppercase: pickBool(raw.uppercase, d.uppercase),
    layout: raw.layout === 'blur_fit' ? 'blur_fit' : 'crop',
    focus_x: pickNumber(raw.focus_x, 0, 1, d.focus_x),
    remove_silences: pickBool(raw.remove_silences, d.remove_silences),
    enhance_audio: pickBool(raw.enhance_audio, d.enhance_audio),
    auto_zoom: pickBool(raw.auto_zoom, d.auto_zoom),
    hook_title: pickBool(raw.hook_title, d.hook_title),
    hook_title_text: pickText(raw.hook_title_text, 80),
    progress_bar: pickBool(raw.progress_bar, d.progress_bar),
    fps: Number(raw.fps) === 60 ? 60 : 30,
    brand_text: pickText(raw.brand_text, 40)
  };
}

/**
 * Valide PUIS rabote les réglages selon l'offre. Renvoie aussi la liste
 * des fonctions retirées, pour que l'interface puisse l'expliquer.
 */
export function sanitizeRenderSettings(
  input: unknown,
  tier: PlanTier
): { settings: RenderSettings; removed: LockableFeature[] } {
  const s = parseRenderSettings(input);
  const e = ENTITLEMENTS[tier];
  const removed: LockableFeature[] = [];

  if (!e.templates.includes(s.template)) {
    s.template = 'hormozi';
    removed.push('premiumTemplates');
  }
  if (!e.customColors) {
    if (!FREE_ACTIVE_COLORS.includes(s.active_color) || s.text_color !== '#FFFFFF') {
      removed.push('customColors');
    }
    if (!FREE_ACTIVE_COLORS.includes(s.active_color)) s.active_color = FREE_ACTIVE_COLORS[0];
    s.text_color = '#FFFFFF';
  }
  const flags: [keyof RenderSettings, LockableFeature, boolean][] = [
    ['remove_silences', 'removeSilences', e.removeSilences],
    ['enhance_audio', 'enhanceAudio', e.enhanceAudio],
    ['auto_zoom', 'autoZoom', e.autoZoom],
    ['hook_title', 'hookTitle', e.hookTitle],
    ['progress_bar', 'progressBar', e.progressBar]
  ];
  for (const [key, feature, allowed] of flags) {
    if (!allowed && s[key] === true) {
      (s as Record<string, unknown>)[key] = false;
      removed.push(feature);
    }
  }
  if (!e.hookTitle) s.hook_title_text = '';
  if (!e.blurLayout && s.layout !== 'crop') {
    s.layout = 'crop';
    removed.push('blurLayout');
  }
  if (!e.manualReframe && s.focus_x !== 0.5) {
    s.focus_x = 0.5;
    removed.push('manualReframe');
  }
  if (!e.fps60 && s.fps === 60) {
    s.fps = 30;
    removed.push('fps60');
  }
  if (!e.brandText && s.brand_text) {
    s.brand_text = '';
    removed.push('brandText');
  }

  return { settings: s, removed };
}

/** Texte incrusté en bas de l'image : filigrane Free ou signature Agency. */
export function overlaySignature(settings: RenderSettings, tier: PlanTier): string {
  if (ENTITLEMENTS[tier].brandText && settings.brand_text) return settings.brand_text;
  return ENTITLEMENTS[tier].watermark ? 'Réalisé avec IziCut' : '';
}
