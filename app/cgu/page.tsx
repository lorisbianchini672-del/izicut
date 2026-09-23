import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';

export const metadata: Metadata = {
  title: 'Conditions générales d’utilisation',
  description:
    'Objet, compte, usage acceptable, crédits de minutes, abonnements Stripe, résiliation et droit applicable des conditions générales d’utilisation d’IziCut.',
  robots: { index: true, follow: true }
};

const TOC = [
  { id: 'objet', label: 'Objet du service' },
  { id: 'compte', label: 'Compte utilisateur' },
  { id: 'acceptable', label: 'Usage acceptable' },
  { id: 'credits', label: 'Crédits & abonnements' },
  { id: 'contenus', label: 'Vos contenus' },
  { id: 'disponibilite', label: 'Disponibilité & garanties' },
  { id: 'resiliation', label: 'Résiliation' },
  { id: 'droit', label: 'Droit applicable' }
];

export default function CguPage() {
  return (
    <InfoPage
      eyebrow="Cadre contractuel"
      title="Conditions générales d’utilisation"
      description="Les présentes conditions encadrent l’accès et l’utilisation de la plateforme IziCut. En créant un compte, vous les acceptez sans réserve."
      breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'CGU' }]}
      toc={TOC}
      updatedAt="22 septembre 2026"
    >
      <InfoSection id="objet" title="Objet du service">
        <p>
          IziCut est un service en ligne de <strong>clipping vidéo assisté par intelligence
          artificielle</strong> : à partir d’un fichier vidéo ou d’un lien YouTube / Twitch, le
          service transcrit l’audio, identifie les séquences à fort potentiel puis génère des clips
          verticaux 9:16 sous-titrés.
        </p>
        <p>
          Le service est fourni en mode « logiciel en tant que service » (SaaS), accessible depuis un
          navigateur, sans installation locale.
        </p>
      </InfoSection>

      <InfoSection id="compte" title="Compte utilisateur">
        <ul>
          <li>
            La création d’un compte nécessite une adresse email valide et un mot de passe
            confidentiel.
          </li>
          <li>
            Vous êtes responsable de la confidentialité de vos identifiants et de toute activité
            réalisée depuis votre compte.
          </li>
          <li>
            Un compte est strictement personnel ; le partage d’un même accès entre plusieurs
            utilisateurs non déclarés est interdit.
          </li>
          <li>
            Toute utilisation frauduleuse ou tentative de contournement des quotas entraîne la
            suspension du compte.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="acceptable" title="Usage acceptable">
        <p>Vous vous engagez à ne pas utiliser IziCut pour :</p>
        <ul>
          <li>importer des vidéos dont vous ne détenez pas les droits ;</li>
          <li>
            reproduire, diffuser ou monétiser des contenus protégés sans autorisation de leurs ayants
            droit ;
          </li>
          <li>
            générer des contenus haineux, diffamatoires, mensongers ou portant atteinte à la dignité
            des personnes ;
          </li>
          <li>
            contourner les limites techniques du service (automatisation abusive, revente de l’accès,
            surcharge volontaire).
          </li>
        </ul>
        <blockquote>
          <p>
            Vous restez seul responsable du contenu que vous publiez sur les plateformes tierces
            après export.
          </p>
        </blockquote>
      </InfoSection>

      <InfoSection id="credits" title="Crédits & abonnements">
        <p>
          Chaque formule inclut un volume de <strong>minutes vidéo</strong> traitées par mois. Une
          minute de vidéo source analysée et rendue décompte une minute de crédit.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Formule</th>
                <th>Minutes incluses / mois</th>
                <th>Facturation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>30</td>
                <td>Gratuite</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>150</td>
                <td>Mensuelle ou annuelle</td>
              </tr>
              <tr>
                <td>Agency</td>
                <td>600</td>
                <td>Mensuelle ou annuelle</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>
            Les abonnements sont gérés par <strong>Stripe Billing</strong> et se renouvellent
            automatiquement sauf résiliation.
          </li>
          <li>
            Les minutes sont créditées à chaque période payée ; les minutes non consommées ne sont pas
            reportées au-delà de la période suivante.
          </li>
          <li>
            En cas d’échec d’un rendu de notre fait, les minutes débitées sont automatiquement
            recréditées.
          </li>
          <li>
            Le droit de rétractation ne s’applique pas aux contenus numériques exécutés immédiatement
            avec votre accord exprès.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="contenus" title="Vos contenus">
        <p>
          Vous conservez tous les droits sur vos vidéos et sur les clips générés. Vous accordez à
          IziCut une licence technique limitée, non exclusive et révocable, strictement nécessaire au
          traitement : extraction audio, transcription, analyse et rendu vidéo.
        </p>
        <p>
          La suppression d’un projet met fin à cette licence pour les éléments concernés. Voir la{' '}
          <a href="/confidentialite">politique de confidentialité</a> pour les durées de
          conservation.
        </p>
      </InfoSection>

      <InfoSection id="disponibilite" title="Disponibilité & garanties">
        <p>
          IziCut met en œuvre des moyens raisonnables pour assurer la continuité du service, sans
          garantir une disponibilité ininterrompue. Les maintenances planifiées sont réalisées hors
          des périodes de forte activité.
        </p>
        <ul>
          <li>
            Les scores de viralité et les suggestions de découpage sont indicatifs et ne constituent
            pas un engagement de performance.
          </li>
          <li>La qualité du rendu dépend de la qualité de la source fournie.</li>
          <li>
            L’API peut évoluer ; les changements incompatibles sont annoncés avec un préavis de 30
            jours.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="resiliation" title="Résiliation">
        <p>
          Vous pouvez résilier votre abonnement à tout moment depuis le portail de facturation : la
          résiliation prend effet à la fin de la période en cours, sans frais supplémentaires.
        </p>
        <p>
          IziCut peut suspendre ou résilier un compte en cas de manquement grave aux présentes
          conditions, notamment l’import massif de contenus protégés ou une tentative de fraude aux
          quotas.
        </p>
      </InfoSection>

      <InfoSection id="droit" title="Droit applicable">
        <p>
          Les présentes conditions sont soumises au <strong>droit français</strong>. En cas de
          litige, une solution amiable sera recherchée en priorité via{' '}
          <a href="mailto:support@izicut.app">support@izicut.app</a> avant toute action
          contentieuse.
        </p>
      </InfoSection>

    </InfoPage>
  );
}
