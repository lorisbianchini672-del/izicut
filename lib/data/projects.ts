/**
 * ============================================================
 * lib/data/projects.ts — Lectures Supabase pour l'interface
 * ------------------------------------------------------------
 * Une seule couche d'accès : les pages n'écrivent pas de requête
 * elles-mêmes. Deux raisons :
 *   1. la RLS s'applique partout de la même façon (jamais de
 *      `service_role` dans un composant client) ;
 *   2. les colonnes lues sont énumérées une seule fois.
 *
 * Les statuts, types de source et colonnes suivent exactement
 * `supabase/schema.sql`.
 * ============================================================
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ClipStatus, ProjectStatus, SourceType, TranscriptWord } from '@/types';

/** Nombre de projets remontés par le tableau de bord. */
export const DASHBOARD_PROJECT_LIMIT = 50;

export type DashboardProject = {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  status: ProjectStatus;
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
  clipsCount: number;
  bestScore: number | null;
};

export type ProfileCredits = {
  /** Solde en SECONDES de vidéo source (unité du schéma). */
  balanceSeconds: number;
  subscriptionStatus: string;
};

export type ProjectDetail = {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  status: ProjectStatus;
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ProjectClip = {
  id: string;
  title: string;
  hookText: string | null;
  summary: string | null;
  startTime: number;
  endTime: number;
  viralityScore: number | null;
  status: ClipStatus;
  renderedStoragePath: string | null;
  /** Mots horodatés RELATIFS au clip (0 = début du clip). */
  words: TranscriptWord[];
};

/** Ligne brute renvoyée par PostgREST : on ne lui fait pas confiance. */
type Row = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Un projet dont le statut est inconnu doit rester affichable. */
function asProjectStatus(value: unknown): ProjectStatus {
  const known: ProjectStatus[] = [
    'draft',
    'uploading',
    'processing_audio',
    'transcribing',
    'analyzing',
    'completed',
    'error'
  ];
  return known.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'draft';
}

function asClipStatus(value: unknown): ClipStatus {
  const known: ClipStatus[] = ['suggested', 'queued', 'rendering', 'ready', 'failed'];
  return known.includes(value as ClipStatus) ? (value as ClipStatus) : 'suggested';
}

function asSourceType(value: unknown): SourceType {
  return value === 'external_url' ? 'external_url' : 'upload_gallery';
}

/** Mots horodatés stockés dans `clips.transcript_json`. */
function asWords(value: unknown): TranscriptWord[] {
  const container = (value ?? {}) as Row;
  const list = Array.isArray(container.words) ? container.words : [];
  return list
    .map((entry) => {
      const word = entry as Row;
      const start = asNumber(word.start);
      const end = asNumber(word.end);
      const text = asString(word.word);
      if (start === null || end === null || !text) return null;
      return { word: text, start, end };
    })
    .filter((item): item is TranscriptWord => item !== null);
}

/** Solde de crédits du profil connecté (le sien seulement : RLS). */
export async function fetchProfileCredits(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileCredits | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('video_credits_seconds, subscription_status')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    balanceSeconds: asNumber(data.video_credits_seconds) ?? 0,
    subscriptionStatus: asString(data.subscription_status, 'inactive')
  };
}

/**
 * Projets de l'utilisateur + leurs clips (identifiant, score) : le
 * tableau de bord en déduit le nombre de clips et le meilleur score sans
 * requête supplémentaire. Le nombre de clips par projet reste petit
 * (2 à 4), la jointure est donc préférable à une agrégation.
 */
export async function fetchDashboardProjects(
  supabase: SupabaseClient,
  limit = DASHBOARD_PROJECT_LIMIT
): Promise<DashboardProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, title, source_type, source_url, status, duration_seconds, error_message, created_at, clips ( id, virality_score )'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as Row[]).map((row) => {
    const clips = Array.isArray(row.clips) ? (row.clips as Row[]) : [];
    const scores = clips
      .map((clip) => asNumber(clip.virality_score))
      .filter((score): score is number => score !== null);

    return {
      id: asString(row.id),
      title: asString(row.title, 'Vidéo sans titre'),
      sourceType: asSourceType(row.source_type),
      sourceUrl: asOptionalString(row.source_url),
      status: asProjectStatus(row.status),
      durationSeconds: asNumber(row.duration_seconds),
      errorMessage: asOptionalString(row.error_message),
      createdAt: asString(row.created_at),
      clipsCount: clips.length,
      bestScore: scores.length > 0 ? Math.max(...scores) : null
    };
  });
}

/** Un projet et ses clips, triés par score de viralité décroissant. */
export async function fetchProjectDetail(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ project: ProjectDetail; clips: ProjectClip[] } | null> {
  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, title, source_type, source_url, status, duration_seconds, error_message, created_at'
    )
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !projectRow) return null;

  const { data: clipRows, error: clipsError } = await supabase
    .from('clips')
    .select(
      'id, title, hook_text, summary, start_time, end_time, virality_score, status, rendered_storage_path, transcript_json'
    )
    .eq('project_id', projectId)
    .order('virality_score', { ascending: false });

  if (clipsError) return null;

  const clips = ((clipRows ?? []) as Row[]).map((row) => ({
    id: asString(row.id),
    title: asString(row.title, 'Clip sans titre'),
    hookText: asOptionalString(row.hook_text),
    summary: asOptionalString(row.summary),
    startTime: asNumber(row.start_time) ?? 0,
    endTime: asNumber(row.end_time) ?? 0,
    viralityScore: asNumber(row.virality_score),
    status: asClipStatus(row.status),
    renderedStoragePath: asOptionalString(row.rendered_storage_path),
    words: asWords(row.transcript_json)
  }));

  return {
    project: {
      id: asString(projectRow.id),
      title: asString(projectRow.title, 'Vidéo sans titre'),
      sourceType: asSourceType(projectRow.source_type),
      sourceUrl: asOptionalString(projectRow.source_url),
      status: asProjectStatus(projectRow.status),
      durationSeconds: asNumber(projectRow.duration_seconds),
      errorMessage: asOptionalString(projectRow.error_message),
      createdAt: asString(projectRow.created_at)
    },
    clips
  };
}

/**
 * Secondes RÉELLEMENT consommées au cours des `sinceDays` derniers jours.
 * Le solde seul ne dit pas quelle part de la période a été utilisée : la
 * somme des débits du journal (`credit_ledger`, lecture réservée au
 * propriétaire par la RLS) donne « X min utilisées ce mois-ci ».
 */
export async function fetchMonthlyUsage(
  supabase: SupabaseClient,
  userId: string,
  sinceDays = 30
): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('credit_ledger')
    .select('delta_seconds')
    .eq('user_id', userId)
    .lt('delta_seconds', 0)
    .gte('created_at', since);

  if (error || !data) return 0;

  return (data as Row[]).reduce((total, row) => {
    const delta = asNumber(row.delta_seconds) ?? 0;
    return total + Math.abs(delta);
  }, 0);
}

/**
 * URL signée de lecture et de téléchargement d'un rendu. Le bucket
 * `clips` est PRIVÉ : c'est le seul accès possible depuis le navigateur,
 * et la politique RLS exige que le premier segment du chemin soit
 * l'identifiant de l'utilisateur. Renvoie `null` si le rendu n'existe
 * pas ou n'appartient pas à l'appelant.
 */
export async function createClipSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from('clips')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
