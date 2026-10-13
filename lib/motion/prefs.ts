import { z } from 'zod';

import { TRANSITIONS } from './types';

/** Préférences de l'IA choisies par le client dans le Studio (gardées dans son navigateur, envoyées à chaque demande). */
export const AiPrefsSchema = z.object({
  tone: z.enum(['pro', 'fun', 'luxe', 'urgent', 'chaleureux', 'inspirant']).optional(),
  pace: z.enum(['calme', 'dynamique', 'rapide']).optional(),
  duration: z.number().int().min(6).max(60).optional(),
  look: z.enum(['sombre', 'clair', 'colore', 'neon']).optional(),
  textStyles: z.array(z.enum(['push', 'highlight', 'stack', 'echo', 'type', 'wave', 'karaoke', 'blur', 'mask', 'slam'])).max(10).optional(),
  transition: z.enum(TRANSITIONS).optional(),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(2).optional(),
  emojis: z.boolean().optional(),
  address: z.enum(['tu', 'vous']).optional(),
  language: z.enum(['fr', 'en', 'es']).optional(),
  cta: z.string().trim().max(60).optional(),
  rules: z.string().trim().max(600).optional()
});
export type AiPrefs = z.infer<typeof AiPrefsSchema>;

const TONES: Record<NonNullable<AiPrefs['tone']>, string> = {
  pro: 'professionnel, clair et rassurant',
  fun: 'drôle, décalé, avec des jeux de mots',
  luxe: 'haut de gamme, sobre, phrases très courtes et élégantes',
  urgent: 'urgent et promotionnel (offre limitée, appel à agir tout de suite) — sans inventer de date ni de chiffre',
  chaleureux: 'chaleureux, proche, humain',
  inspirant: 'inspirant, émotionnel, qui fait rêver'
};
const PACES = { calme: 'rythme posé : peu de scènes, mouvements doux, bpm 80-95', dynamique: 'rythme dynamique : bpm 110-125', rapide: 'rythme très rapide façon TikTok : beaucoup de scènes courtes, bpm 128-140' };
const LOOKS = { sombre: 'fond sombre premium (noir profond, halos de couleur)', clair: 'fond clair épuré (backdrop "paper", textes foncés)', colore: 'très coloré et pop (backdrop "mesh", couleurs vives)', neon: 'néon nocturne (backdrop "aurora", couleurs électriques)' };
const STYLES: Record<string, string> = { push: 'phrases qui se poussent', highlight: 'surligné', stack: 'lignes géantes', echo: 'mot géant en écho', type: 'machine à écrire', wave: 'vague', karaoke: 'karaoké', blur: 'flou → net', mask: 'masque', slam: 'impact' };
const LANG = { fr: 'français', en: 'anglais', es: 'espagnol' };

/** Consignes à ajouter au message envoyé à l'IA. */
export function prefsPrompt(p: AiPrefs | undefined): string {
  if (!p) return '';
  const l: string[] = [];
  if (p.tone) l.push(`Ton : ${TONES[p.tone]}.`);
  if (p.pace) l.push(`Rythme : ${PACES[p.pace]}.`);
  if (p.duration) l.push(`Durée totale : environ ${p.duration} secondes.`);
  if (p.look) l.push(`Esthétique : ${LOOKS[p.look]}.`);
  if (p.colors?.length) l.push(`Couleurs imposées : ${p.colors.join(' et ')} (accent = ${p.colors[0]}).`);
  if (p.textStyles?.length) l.push(`Textes animés préférés (blocs "kinetic", "style") : ${p.textStyles.map((s) => `"${s}" (${STYLES[s]})`).join(', ')}.`);
  if (p.transition) l.push(`Transition entre les scènes : "${p.transition}".`);
  if (p.emojis !== undefined) l.push(p.emojis ? 'Ajoute quelques emojis dans les textes.' : 'Aucun emoji dans les textes.');
  if (p.address) l.push(p.address === 'tu' ? 'Tutoie le spectateur.' : 'Vouvoie le spectateur.');
  if (p.language) l.push(`Tous les textes de la vidéo en ${LANG[p.language]} (le message au client reste en français).`);
  if (p.cta) l.push(`Appel à l'action final, mot pour mot : « ${p.cta} ».`);
  if (p.rules) l.push(`Règles personnelles du client (à respecter toujours) : ${p.rules}`);
  return l.length ? `PRÉFÉRENCES DU CLIENT POUR L'IA (obligatoires, prioritaires sur tes choix) :\n- ${l.join('\n- ')}\n\n` : '';
}
