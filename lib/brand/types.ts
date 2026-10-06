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
  palette: z.object({ primary: z.string(), accent: z.string(), background: z.string() }).optional()
});
export type BrandBrief = z.infer<typeof BrandBriefSchema>;

export type BrandProfile = {
  company: Company | null;
  /** Ce que le client dit lui-même de son activité (le plus précieux). */
  notes: string;
  brief: BrandBrief | null;
};
