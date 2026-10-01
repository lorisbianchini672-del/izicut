/**
 * Informations légales de l'éditeur — UN SEUL endroit à mettre à jour.
 *
 * Les valeurs vides sont affichées « en cours » sur le site : complétez-les
 * dès que la micro-entreprise est immatriculée (SIRET reçu par l'INSEE).
 * Elles peuvent aussi être fournies par variables d'environnement Vercel.
 */
export const LEGAL = {
  /** Nom de l'entrepreneur individuel (ou de la société). */
  editorName: process.env.NEXT_PUBLIC_LEGAL_NAME || 'Loris Bianchini',
  /** Forme juridique affichée. */
  legalForm: process.env.NEXT_PUBLIC_LEGAL_FORM || 'Entrepreneur individuel (micro-entreprise)',
  /** Numéro SIRET (14 chiffres). Vide = « immatriculation en cours ». */
  siret: process.env.NEXT_PUBLIC_LEGAL_SIRET || '',
  /** Adresse postale (ou de domiciliation). */
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || 'Villeurbanne (69100), France',
  /** Adresse de contact affichée partout sur le site. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'support@izicut.app',
  /** TVA : franchise en base tant que le seuil n'est pas dépassé. */
  vatNote: 'TVA non applicable, art. 293 B du CGI'
} as const;

export const contactHref = `mailto:${LEGAL.contactEmail}`;
