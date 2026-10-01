import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';
import { LEGAL, contactHref } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Données collectées, finalités, durées de conservation, sous-traitants et exercice de vos droits RGPD sur la plateforme IziCut.',
  robots: { index: true, follow: true }
};

const TOC = [
  { id: 'donnees', label: 'Données collectées' },
  { id: 'finalites', label: 'Finalités & bases légales' },
  { id: 'videos', label: 'Vidéos et transcriptions' },
  { id: 'conservation', label: 'Durées de conservation' },
  { id: 'sous-traitants', label: 'Sous-traitants' },
  { id: 'droits', label: 'Vos droits (RGPD)' },
  { id: 'cookies', label: 'Cookies' }
];

export default function ConfidentialitePage() {
  return (
    <InfoPage
      eyebrow="Vie privée"
      title="Politique de confidentialité"
      description="IziCut traite des vidéos, des transcriptions et des données de facturation. Cette page détaille ce qui est collecté, pourquoi, pendant combien de temps, et comment exercer vos droits."
      breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Confidentialité' }]}
      toc={TOC}
      updatedAt="22 septembre 2026"
    >
      <InfoSection id="donnees" title="Données collectées">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Exemples</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Identification</td>
                <td>Email, identifiant de compte</td>
                <td>À l’inscription</td>
              </tr>
              <tr>
                <td>Facturation</td>
                <td>Identifiant client et d’abonnement Stripe</td>
                <td>Lors d’un paiement</td>
              </tr>
              <tr>
                <td>Contenus</td>
                <td>Vidéos importées, URL sources, clips rendus</td>
                <td>Votre usage du service</td>
              </tr>
              <tr>
                <td>Techniques</td>
                <td>Journaux d’exécution, erreurs du pipeline</td>
                <td>Automatiquement</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Aucun moyen de paiement complet ne transite ni n’est stocké par IziCut : les paiements
          sont opérés par <strong>Stripe</strong>, qui agit comme prestataire de paiement.
        </p>
      </InfoSection>

      <InfoSection id="finalites" title="Finalités & bases légales">
        <ul>
          <li>
            <strong>Exécution du contrat :</strong> fournir le service de découpage, de sous-titrage
            et de rendu, gérer vos crédits de minutes.
          </li>
          <li>
            <strong>Intérêt légitime :</strong> sécuriser la plateforme, prévenir la fraude et
            mesurer la stabilité du pipeline.
          </li>
          <li>
            <strong>Consentement :</strong> envoi de la newsletter, que vous pouvez retirer à tout
            moment via le lien de désinscription.
          </li>
          <li>
            <strong>Obligation légale :</strong> conservation des pièces comptables liées aux
            abonnements.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="videos" title="Vidéos et transcriptions">
        <p>
          Les vidéos sources et les rendus sont stockés dans des <strong>buckets privés</strong> :
          l’accès se fait uniquement par URL signée à durée limitée, et les politiques d’accès
          garantissent qu’un compte ne peut lire que ses propres fichiers.
        </p>
        <ul>
          <li>
            L’audio est extrait temporairement pour la transcription puis supprimé après le rendu.
          </li>
          <li>
            Les transcriptions horodatées sont conservées avec le clip pour permettre l’édition
            mot-à-mot.
          </li>
          <li>
            La suppression d’un projet entraîne celle des clips, transcriptions et rendus associés.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="conservation" title="Durées de conservation">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Données</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compte et profil</td>
                <td>Jusqu’à la suppression du compte</td>
              </tr>
              <tr>
                <td>Vidéos sources</td>
                <td>Selon votre formule, puis purge automatique</td>
              </tr>
              <tr>
                <td>Clips rendus</td>
                <td>Jusqu’à suppression par l’utilisateur ou fin de l’abonnement</td>
              </tr>
              <tr>
                <td>Journaux techniques</td>
                <td>90 jours</td>
              </tr>
              <tr>
                <td>Documents de facturation</td>
                <td>10 ans (obligation comptable)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection id="sous-traitants" title="Sous-traitants">
        <p>
          Nous faisons appel à des prestataires encadrés par des engagements de confidentialité :
          hébergement applicatif et base de données, stockage objet pour les vidéos, prestataire de
          paiement, et fournisseurs de modèles d’intelligence artificielle pour la transcription et
          l’analyse (Whisper, GPT). Chaque prestataire n’accède qu’aux données strictement
          nécessaires à sa mission.
        </p>
      </InfoSection>

      <InfoSection id="droits" title="Vos droits (RGPD)">
        <p>
          Conformément au Règlement général sur la protection des données, vous disposez des droits
          d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de
          vos données.
        </p>
        <ol>
          <li>
            Écrivez à <a href={contactHref}>{LEGAL.contactEmail}</a> depuis l’adresse
            liée à votre compte.
          </li>
          <li>
            Nous accusons réception et répondons sous <strong>30 jours</strong> maximum.
          </li>
          <li>
            En cas de désaccord, vous pouvez saisir la CNIL ou l’autorité de contrôle compétente.
          </li>
        </ol>
      </InfoSection>

      <InfoSection id="cookies" title="Cookies">
        <p>
          IziCut utilise uniquement des cookies <strong>strictement nécessaires</strong> au
          fonctionnement du service : maintien de la session d’authentification et protection contre
          la falsification des requêtes. Aucun cookie publicitaire n’est déposé par défaut.
        </p>
        <ul>
          <li>
            <strong>Session :</strong> conserve votre connexion entre les pages.
          </li>
          <li>
            <strong>Sécurité :</strong> empêche l’usage de formulaires depuis un site tiers.
          </li>
        </ul>
        <p>
          Vous pouvez effacer ces cookies depuis votre navigateur ; l’opération vous déconnectera de
          la plateforme.
        </p>
      </InfoSection>

    </InfoPage>
  );
}
