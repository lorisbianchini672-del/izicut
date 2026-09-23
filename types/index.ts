/**
 * ============================================================
 * types/index.ts — Types du domaine, partagés app / worker / API
 * ------------------------------------------------------------
 * Ces types suivent les noms EXACTS du schéma SQL
 * (`supabase/migrations/..._initial_schema.sql`) : une colonne nommée
 * `start_time` ici est une colonne `start_time` en base. Aucun alias, aucun
 * mapping silencieux — c'est ce qui évite les erreurs de conversion.
 * ============================================================
 */

// ---------- Statuts ----------

/** Cycle de vie d'un projet (une vidéo source). */
export type ProjectStatus =
  | 'pending'
  | 'transcribing'
  | 'analyzing'
  | 'completed'
  | 'error';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'pending',
  'transcribing',
  'analyzing',
  'completed',
  'error'
];

/** Cycle de vie d'un clip. */
export type ClipStatus = 'suggested' | 'rendering' | 'ready' | 'failed';

export const CLIP_STATUSES: ClipStatus[] = ['suggested', 'rendering', 'ready', 'failed'];

/** Libellés français, pour l'interface uniquement. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pending: 'En attente',
  transcribing: 'Transcription en cours',
  analyzing: 'Analyse des moments forts',
  completed: 'Terminé',
  error: 'Échec'
};

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  suggested: 'Suggéré',
  rendering: 'Rendu en cours',
  ready: 'Prêt',
  failed: 'Échec'
};

// ---------- Transcription ----------

/**
 * Un mot horodaté, en SECONDES relatives à la vidéo source.
 *
 * Volontairement dupliqué depuis `worker/timestamps.ts` : ce dernier est un
 * module PUR, sans aucun import, pour rester exécutable par Node sans
 * résolution d'alias (`@/…`). Le coupler aux types de l'application
 * casserait cette propriété. Les deux définitions doivent rester alignées :
 * `{ word, start, end }`.
 */
export type TranscriptWord = { word: string; start: number; end: number };

/** Mot avec timestamps relatifs au clip (0 = début du clip). */
export type RelativeWord = { word: string; start: number; end: number };

/** Séquence de transcription, telle que stockée dans `clips.transcript_segment`. */
export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};

// ---------- Entités ----------

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  /** Solde de crédits en SECONDES : source de vérité, débitée en SQL. */
  video_credits_seconds: number;
  updated_at: string;
  created_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  title: string;
  source_type: 'upload_gallery' | 'external_url';
  source_url: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  status: ProjectStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Clip = {
  id: string;
  project_id: string;
  title: string;
  start_time: number;
  end_time: number;
  virality_score: number | null;
  hook_text: string | null;
  summary: string | null;
  transcript_json: object | null; // JSONB
  style_config: StyleConfig | null;
  rendered_storage_path: string | null;
  status: ClipStatus;
  created_at: string;
  updated_at: string | null;
  // Champs calculés/cachés pour l'UI (pas en base)
  speaker_detection?: SpeakerDetection;
};

// ---------- File de travail du worker ----------

export type JobKind = 'ingest' | 'transcribe' | 'analyze' | 'render';
export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type RenderJob = {
  id: string;
  user_id: string;
  project_id: string | null;
  clip_id: string | null;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  progress: number;
  /** Coût de la tâche, en secondes de vidéo source. */
  cost_seconds: number;
  output_path: string | null;
  error: string | null;
  locked_at: string | null;
  locked_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

// ---------- PILIER 2 — Speaker Detection & Auto-Reframe ----------

/** Bounding box d'un locuteur détecté (pixels, relativement à la vidéo source). */
export type SpeakerBox = {
  /** Coordonnées relatives (0-1) : x, y = centre ; w, h = largeur, hauteur */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Confiance de la détection (0-1) */
  confidence: number;
  /** Identifiant du locuteur (pour suivi multi-locuteurs) */
  speaker_id: string;
  /** Noms humains associés (optionnel, vient du transcript/LLM) */
  name?: string;
};

/** Position cible dans le cadre 9:16 pour un locuteur. */
export type ReframeTarget = {
  /** Ordre d'importance pour le crop (0 = principal, 1 = secondaire, etc.) */
  priority: number;
  /** Boîte du locuteur (mouvement compteur le temps) */
  box: SpeakerBox;
  /** Position préférée dans le cadre vertical : 'center' | 'left' | 'right' */
  preferred_position?: 'center' | 'left' | 'right';
};

/** Disposition des locuteurs pour split-screen. */
export type SpeakerLayout =
  | { type: 'single'; main_speaker: ReframeTarget }
  | { type: 'split_horizontal'; speakers: ReframeTarget[]; split_position?: 'left' | 'right' }
  | { type: 'split_vertical'; speakers: ReframeTarget[]; split_position?: 'top' | 'bottom' }
  | { type: 'picture_in_picture'; main: ReframeTarget; secondary: ReframeTarget }
  | { type: 'grid'; speakers: ReframeTarget[]; columns: number };

/** Template visuel / style du clip (PILIER 2 + PILIER 5) */
export type StyleConfig = {
  /** Style recommandé par l'IA (PILIER 1) */
  recommended_style?: 'dynamic' | 'calm' | 'educational' | 'humor' | 'minimalist';
  /** Couleurs de la charte */
  colors?: {
    primary?: string;
    background?: string;
    text?: string;
    highlight?: string;
  };
  /** Polices (noms de familles, le renderer choisit la font disponible) */
  fonts?: {
    heading?: string;
    body?: string;
  };
  /** Spécificités du template */
  template?: 'hormozi' | 'ios_notes' | 'tweet' | 'minimal' | 'colorful';
  /** Paramètres de crop auto */
  crop?: {
    /** Zoom par défaut (1 = plein cadre, 1.5 = zoom 50%) */
    default_zoom?: number;
    /** Zoom lors de mouvements importants */
    motion_zoom?: boolean;
    /** Marge minimale autour du visage (0-0.5) */
    face_margin?: number;
  };
  /** Sous-titres : style Hormozi (word-by-word highlight) */
  captions?: {
    /** Activer le surlignage mot-à-mot */
    karaoke?: boolean;
    /** Couleur du mot actif */
    active_color?: string;
    /** Couleur des mots inactifs */
    inactive_color?: string;
    /** Taille de police (pixels dans Remotion) */
    font_size?: number;
    /** Position verticale (0 = haut, 1 = bas) */
    position?: number;
    /** Effet de chargement (fade, slide, pop) */
    animation?: 'fade' | 'slide' | 'pop' | 'none';
  };
};

/** Métadonnées de speaker detection attachées à un clip. */
export type SpeakerDetection = {
  /** Disposition calculée par le pipeline (crop automatique) */
  layout: SpeakerLayout;
  /** Frame rate estimé de la détection (FPS) */
  detection_fps?: number;
  /** Qualité de la détection (0-1) */
  quality?: number;
  /** Frame d'illustration du locuteur principal (chemin relatif ou URL) */
  thumbnail_frame?: string;
};
