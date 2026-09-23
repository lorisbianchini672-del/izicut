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
  serverExternalPackages: ['stripe'],

  async headers() {
    return [
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
