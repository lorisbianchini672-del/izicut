import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * RUSTINE TEMPORAIRE — à supprimer quand IziCut quittera le dépôt IziFacture.
   * Tant que ce dossier vit dans IziFacture, Next détecte deux lockfiles
   * (parent + local) et choisit la mauvaise racine de traçage pour le
   * déploiement. Une fois extrait dans son propre dépôt, ce réglage devient
   * inutile : le retirer.
   */
  outputFileTracingRoot: process.cwd(),

  /**
   * Paquets laissés en dehors du bundling serveur.
   * Le SDK Stripe est ici volontairement chargé depuis node_modules plutôt
   * que compilé : cela évite de rebundler sa surface au moindre changement
   * et garde des traces de pile lisibles en production.
   *
   * À ne pas confondre avec le runtime des routes : le webhook Stripe doit
   * déclarer `export const runtime = 'nodejs'` DANS le fichier de route,
   * car le runtime Edge ne permet ni la vérification de signature
   * cryptographique ni l'accès au corps brut de la requête.
   */
  serverExternalPackages: ['stripe', '@sparticuz/chromium', 'puppeteer-core'],

  /** Le Chromium léger du moteur pro (rendu des vidéos) doit être embarqué avec ses routes. */
  outputFileTracingIncludes: {
    '/api/motion2/**': ['./node_modules/@sparticuz/chromium/bin/**']
  },

  /** Ne pas annoncer la techno du serveur aux robots. */
  poweredByHeader: false,

  async headers() {
    /**
     * En-têtes de sécurité sur tout le site :
     * - HSTS : HTTPS obligatoire (anti-interception) ;
     * - nosniff : pas d'exécution d'un fichier déguisé ;
     * - frame-ancestors / X-Frame-Options : le site ne peut pas être piégé
     *   dans le cadre d'un autre site (anti-clickjacking) ;
     * - object-src / base-uri : ferme deux portes classiques d'injection ;
     * - form-action : les formulaires ne partent que vers nous et Stripe ;
     * - Permissions-Policy : caméra, géolocalisation… désactivées.
     */
    const security = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(self "https://checkout.stripe.com"), usb=(), microphone=(self)' },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; upgrade-insecure-requests" }
    ];
    return [
      { source: '/:path*', headers: security },
      {
        // Aucune réponse d'API ne doit être mise en cache par un
        // intermédiaire : elles contiennent des données de compte.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }]
      }
    ];
  }
};

export default nextConfig;
