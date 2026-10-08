/**
 * « Ma marque » : la fiche d'une entreprise ou d'une association, que l'IA
 * utilise pour créer des pubs qui lui ressemblent.
 */
import { z } from 'zod';

export const CompanySchema = z.object({
  siren: z.string().max(12),
  name: z.string().max(160),
  activityCode: z.string().max(10).nullish(),
  activityLabel: z.string().max(160).nullish(),
  city: z.string().max(80).nullish(),
  postalCode: z.string().max(10).nullish(),
  address: z.string().max(200).nullish(),
  createdAt: z.string().max(12).nullish(),
  employees: z.string().max(40).nullish(),
  isAssociation: z.boolean().nullish(),
  category: z.string().max(20).nullish()
});
export type Company = z.infer<typeof CompanySchema>;

export const BrandBriefSchema = z.object({
  pitch: z.string().max(400),
  audience: z.string().max(300),
  tone: z.string().max(120),
  strengths: z.array(z.string().max(120)).max(6),
  slogans: z.array(z.string().max(90)).max(5),
  adIdeas: z.array(z.string().max(220)).max(5),
  /** Faits précis tirés du registre et du site (palmarès, offres, chiffres, événements…). */
  facts: z.array(z.string().max(200)).max(10).optional(),
  palette: z.object({ primary: z.string(), accent: z.string(), background: z.string() }).optional()
});
export type BrandBrief = z.infer<typeof BrandBriefSchema>;

export const SiteSchema = z.object({
  url: z.string().max(200),
  title: z.string().max(120),
  description: z.string().max(300),
  colors: z.array(z.string().max(7)).max(6),
  fonts: z.array(z.string().max(40)).max(4),
  image: z.string().max(300).optional(),
  logo: z.string().max(400).optional(),
  images: z.array(z.string().max(400)).max(12).optional(),
  /** Texte réel du site (accueil + pages internes), pour que l'IA parle de faits précis. */
  text: z.string().max(9000).optional(),
  radius: z.enum(['square', 'rounded', 'pill']).optional(),
  /** Rubriques du menu du site (Accueil, Équipes, Contact…). */
  nav: z.array(z.string().max(20)).max(6).optional()
});
export type SiteDna = z.infer<typeof SiteSchema>;

export type BrandProfile = {
  company: Company | null;
  /** Ce que le client dit lui-même de son activité (le plus précieux). */
  notes: string;
  brief: BrandBrief | null;
  /** ADN visuel du site web du client (facultatif). */
  site?: SiteDna | null;
  /** Lien vers lequel la pub renvoie (site, réservation, boutique…). */
  link?: string;
};
