import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Éditeur, hébergeur, propriété intellectuelle et responsabilité de la plateforme IziCut (clipping vidéo IA).',
  robots: { index: true, follow: true }
};

const TOC = [
  { id: 'editeur', label: 'Éditeur du site' },
  { id: 'hebergeur', label: 'Hébergement' },
  { id: 'propriete', label: 'Propriété intellectuelle' },
  { id: 'responsabilite', label: 'Responsabilité' },
  { id: 'contact', label: 'Contact' }
];

export default function MentionsLegalesPage() {
  return (
    <InfoPage
      eyebrow="Informations légales"
      title="Mentions légales"
      description="Informations relatives à l’éditeur de la plateforme IziCut, à son hébergement et aux conditions d’utilisation des contenus mis en ligne."
      breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Mentions légales' }]}
      toc={TOC}
      updatedAt="22 septembre 2026"
    >
      <InfoSection id="editeur" title="Éditeur du site">
        <p>
          Le site <strong>izicut.app</strong> et la plateforme de clipping vidéo assistée par
          intelligence artificielle sont édités par :
        </p>
        <ul>
          <li>
            <strong>Dénomination :</strong> IziCut Technologies SAS
          </li>
          <li>
            <strong>Forme juridique :</strong> société par actions simplifiée
          </li>
          <li>
            <strong>Siège social :</strong> France
          </li>
          <li>
            <strong>Contact :</strong>{' '}
            <a href="mailto:support@izicut.app">support@izicut.app</a>
          </li>
        </ul>
        <p>
          Le directeur de la publication est le représentant légal de la société. Ces informations
          sont susceptibles d’évoluer ; la version en vigueur est celle publiée sur cette page.
        </p>
      </InfoSection>

      <InfoSection id="hebergeur" title="Hébergement">
        <p>
          L’application web est hébergée sur une infrastructure cloud mutualisée située dans
          l’Union européenne. Le traitement des vidéos (transcription, analyse et rendu) est
          effectué par des services de calcul dédiés, avec chiffrement des transferts en TLS.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Composant</th>
                <th>Rôle</th>
                <th>Localisation des données</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hébergement applicatif</td>
                <td>Site, dashboard, API</td>
                <td>Union européenne</td>
              </tr>
              <tr>
                <td>Base de données</td>
                <td>Comptes, projets, clips</td>
                <td>Union européenne</td>
              </tr>
              <tr>
                <td>Stockage vidéo</td>
                <td>Sources et rendus (buckets privés)</td>
                <td>Union européenne</td>
              </tr>
              <tr>
                <td>Moteurs IA</td>
                <td>Transcription et scoring</td>
                <td>Selon le prestataire sous-traitant</td>
              </tr>
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection id="propriete" title="Propriété intellectuelle">
        <p>
          La marque, l’interface, le code source, les éléments graphiques et la documentation
          d’IziCut sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou
          représentation, totale ou partielle, sans autorisation écrite est interdite.
        </p>
        <h3>Vos contenus restent les vôtres</h3>
        <p>
          Vous conservez l’intégralité des droits sur les vidéos que vous importez et sur les clips
          générés. IziCut ne dispose que d’une licence technique limitée, strictement nécessaire au
          traitement demandé (extraction audio, transcription, rendu) et à la durée de conservation
          choisie.
        </p>
        <blockquote>
          <p>
            Vous garantissez détenir les droits nécessaires sur les vidéos importées, y compris
            lorsqu’elles proviennent d’une plateforme tierce.
          </p>
        </blockquote>
      </InfoSection>

      <InfoSection id="responsabilite" title="Responsabilité">
        <p>
          IziCut met en œuvre des moyens raisonnables pour assurer la disponibilité et l’exactitude
          du service, sans garantie d’absence d’interruption. Les scores de viralité, les
          transcriptions et les suggestions de découpage sont fournis à titre indicatif et ne
          constituent pas un engagement de résultat.
        </p>
        <ul>
          <li>
            La responsabilité d’IziCut ne saurait être engagée pour un usage non conforme des clips
            générés sur les plateformes tierces.
          </li>
          <li>
            Les liens externes présents sur le site n’engagent pas la responsabilité de l’éditeur
            quant à leur contenu.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="contact" title="Contact">
        <p>
          Pour toute question juridique, réclamation ou demande relative à vos données :{' '}
          <a href="mailto:support@izicut.app">support@izicut.app</a>. Voir également nos{' '}
          <a href="/cgu">conditions générales d’utilisation</a> et notre{' '}
          <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
