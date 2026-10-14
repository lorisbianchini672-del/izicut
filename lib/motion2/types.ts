/**
 * Moteur « pro » : chaque pub est une vraie composition animée web
 * (HTML + CSS + timeline GSAP), écrite par le directeur artistique IA,
 * jouée telle quelle dans l'aperçu et enregistrée image par image à l'export.
 */
import { z } from 'zod';

import { MUSIC, SFX } from '../motion/types';
import { BlockSchema, PaletteSchema } from './templates';

export const COMP_FORMATS = ['9:16', '16:9', '1:1'] as const;
export const COMP_SIZE: Record<(typeof COMP_FORMATS)[number], { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 }
};

export const CompSchema = z.object({
  v: z.literal(1).default(1),
  format: z.enum(COMP_FORMATS),
  /** Durée totale en secondes. */
  duration: z.number().min(3).max(60),
  title: z.string().max(80).optional(),
  brand: z.string().max(60).optional(),
  css: z.string().max(60_000),
  html: z.string().max(120_000).default(''),
  js: z.string().max(60_000).default(''),
  /** Couleurs de la pub (utilisées par les modèles). */
  palette: PaletteSchema.optional(),
  /** Scènes issues des modèles prêts (typographie élastique, interfaces 3D, morphing…). */
  blocks: z.array(BlockSchema).max(12).optional(),
  sound: z.object({
    music: z.enum(MUSIC),
    bpm: z.number().min(60).max(180),
    cues: z.array(z.object({ at: z.number().min(0).max(60), sfx: z.enum(SFX) })).max(40).optional()
  }).optional(),
  /** Images trouvées pour la pub : clé « search:mots » → adresse de la photo libre de droits. */
  assets: z.record(z.string().max(80), z.string().max(600)).optional()
});
export type Comp = z.infer<typeof CompSchema>;
/** Une composition doit avoir des scènes : écrites sur mesure et/ou issues des modèles. */
export const hasContent = (c: Pick<Comp, 'html' | 'js' | 'blocks'>) => (c.html.length > 20 && c.js.length > 20) || Boolean(c.blocks?.length);

/** Code interdit dans une composition (elle tourne dans un cadre isolé, mais on reste strict). */
const FORBIDDEN_JS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|localStorage|sessionStorage|indexedDB|eval)\b|document\.cookie|window\.(parent|top|opener)|\bparent\.(postMessage|location|document)|\btop\.|new\s+Function|\bimport\s*\(|<\s*script|javascript:/;
const FORBIDDEN_HTML = /<\s*(script|iframe|object|embed|link|meta|base|form)\b|javascript:|\son[a-z]+\s*=/i;

export function checkComp(c: Comp): string | null {
  if (FORBIDDEN_JS.test(c.js)) return 'le code utilise une fonction interdite (réseau, stockage ou fenêtre parente)';
  if (FORBIDDEN_HTML.test(c.html)) return 'le HTML contient une balise ou un attribut interdit (script, iframe, on…=)';
  // Seules les importations de feuilles externes et les adresses javascript: sont refusées (le reste est confiné par le cadre isolé).
  if (/@import|url\(\s*['"]?\s*javascript:/i.test(c.css)) return 'le CSS charge une feuille de style externe interdite';
  return null;
}

/** Repères d'images dans la composition : {{photo:0}}, {{logo}}, {{search:fresh bread}}. */
export function compAssetKeys(c: Pick<Comp, 'html' | 'css'> & { blocks?: unknown }): string[] {
  const keys = new Set<string>();
  const fromBlocks = JSON.stringify((c as { blocks?: unknown }).blocks ?? []).replace(/"((?:logo|photo:\d{1,2}|search:[^"{}]{2,60}))"/g, '{{$1}}');
  for (const m of `${c.html}\n${c.css}\n${fromBlocks}`.matchAll(/\{\{\s*(logo|photo:\d{1,2}|search:[^}]{2,60})\s*\}\}/g)) keys.add(m[1].trim());
  return [...keys];
}
