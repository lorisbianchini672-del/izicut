import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';
import { LEGAL, contactHref } from '@/lib/legal';

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
      updatedAt="1er octobre 2026"
    >
      <InfoSection id="editeur" title="Éditeur du site">
        <p>
          Le site IziCut et la plateforme de clipping vidéo assistée par intelligence artificielle
          sont édités par :
        </p>
        <ul>
          <li>
            <strong>Éditeur :</strong> {LEGAL.editorName}
          </li>
          <li>
            <strong>Statut :</strong> {LEGAL.legalForm}
          </li>
          <li>
            <strong>SIRET :</strong> {LEGAL.siret || 'immatriculation en cours'}
          </li>
          <li>
            <strong>Adresse :</strong> {LEGAL.address}
          </li>
          <li>
            <strong>TVA :</strong> {LEGAL.vatNote}
          </li>
          <li>
            <strong>Contact :</strong> <a href={contactHref}>{LEGAL.contactEmail}</a>
          </li>
        </ul>
        <p>
          Directeur de la publication : {LEGAL.editorName}. La version en vigueur de ces
          informations est celle publiée sur cette page.
        </p>
      </InfoSection>

      <InfoSection id="hebergeur" title="Hébergement">
        <p>
          Le site et l’application sont hébergés par des prestataires techniques ; les transferts
          sont chiffrés (TLS).
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Prestataire</th>
                <th>Rôle</th>
                <th>Coordonnées</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vercel Inc.</td>
                <td>Hébergement du site, du tableau de bord et de l’API</td>
                <td>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com</td>
              </tr>
              <tr>
                <td>Supabase Inc.</td>
                <td>Base de données, comptes, stockage des vidéos et clips</td>
                <td>970 Toa Payoh North #07-04, Singapour 318992 — supabase.com</td>
              </tr>
              <tr>
                <td>Stripe Payments Europe Ltd.</td>
                <td>Paiement sécurisé des abonnements</td>
                <td>1 Grand Canal Street Lower, Dublin 2, Irlande — stripe.com</td>
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
          <a href={contactHref}>{LEGAL.contactEmail}</a>. Voir également nos{' '}
          <a href="/cgu">conditions générales d’utilisation</a> et notre{' '}
          <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
