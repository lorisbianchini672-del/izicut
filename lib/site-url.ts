/**
 * URL publique du site, sans « / » final.
 * Ordre : NEXT_PUBLIC_SITE_URL (si renseignée ET valide) → domaine de
 * production Vercel → URL du déploiement Vercel → localhost.
 * Une variable présente mais vide ne doit jamais casser le build.
 */
export function getSiteUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ];
  for (const value of candidates) {
    const v = value?.trim();
    if (!v) continue;
    try {
      return new URL(v).origin;
    } catch {
      // valeur invalide : on essaie la suivante
    }
  }
  return 'http://localhost:3000';
}
