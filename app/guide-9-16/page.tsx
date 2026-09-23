import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';

export const metadata: Metadata = {
  title: 'Guide des formats verticaux 9:16',
  description:
    'Safe Zones TikTok, Reels et Shorts, résolutions d’export, durée idéale et bonnes pratiques de sous-titres : le guide complet pour publier des clips qui convertissent.',
  openGraph: {
    title: 'Guide des formats verticaux 9:16 · IziCut',
    description: 'Safe Zones, encodage 1080×1920, durées idéales et styles de sous-titres.'
  }
};

const TOC = [
  { id: 'pourquoi', label: 'Pourquoi le 9:16' },
  { id: 'safe-zones', label: 'Safe Zones par plateforme' },
  { id: 'export', label: 'Réglages d’export' },
  { id: 'captions', label: 'Sous-titres qui retiennent' },
  { id: 'cadrage', label: 'Cadrage & sujet' },
  { id: 'checklist', label: 'Checklist avant publication' }
];

export default function GuidePage() {
  return (
    <InfoPage
      eyebrow="Guide pratique"
      title="Guide des formats 9:16"
      description="Un clip excellent mal cadré passe inaperçu. Ce guide récapitule les zones sûres de chaque plateforme, les réglages d’encodage recommandés et les règles de sous-titrage qu’IziCut applique par défaut."
      breadcrumbs={[
        { label: 'Accueil', href: '/' },
        { label: 'Ressources', href: '/#features' },
        { label: 'Guide 9:16' }
      ]}
      toc={TOC}
      updatedAt="22 septembre 2026"
      ctaLabel="Tester sur ma vidéo"
    >
      <InfoSection id="pourquoi" title="Pourquoi le 9:16 d’abord">
        <p>
          TikTok, Instagram Reels et YouTube Shorts affichent tous le même ratio vertical{' '}
          <strong>9:16</strong>. Un même export alimente donc les trois plateformes — à condition de
          respecter les <strong>zones d’interface</strong> qui se superposent à la vidéo.
        </p>
        <h3>Le format cible</h3>
        <ul>
          <li>
            <strong>Résolution :</strong> 1080 × 1920 px. Tourner en 4K puis recadrer est inutile,
            la plateforme recompresse.
          </li>
          <li>
            <strong>Ratio :</strong> 9:16 exact, sans bandes noires latérales.
          </li>
          <li>
            <strong>Durée :</strong> 18 à 45 secondes pour un clip narratif, jusqu’à 60 s pour un
            extrait d’interview.
          </li>
          <li>
            <strong>Audio :</strong> normalisé autour de -14 LUFS, voix au-dessus de la musique.
          </li>
        </ul>
        <blockquote>
          <p>
            Les <strong>2 premières secondes</strong> déterminent plus de la moitié de la rétention :
            le hook doit être posé en mots ET à l’image.
          </p>
        </blockquote>
      </InfoSection>

      <InfoSection id="safe-zones" title="Safe Zones par plateforme">
        <p>
          Chaque plateforme masque une partie de l’image avec son interface. Dans IziCut, les Safe
          Zones s’affichent en overlay dans l’éditeur (onglet <strong>Cadrage</strong>) : vous
          vérifiez qu’aucun visage ni sous-titre ne passe dessous.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plateforme</th>
                <th>Zone haute masquée</th>
                <th>Zone basse masquée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TikTok</td>
                <td>12 % (recherche + onglets)</td>
                <td>20 % (légende + boutons)</td>
              </tr>
              <tr>
                <td>Instagram Reels</td>
                <td>10 % (pastille Reels)</td>
                <td>16 % (légende + actions)</td>
              </tr>
              <tr>
                <td>YouTube Shorts</td>
                <td>9 % (barre de titre)</td>
                <td>14 % (titre + boutons)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          IziCut applique par défaut la zone la plus contraignante (<strong>TikTok</strong>), ce qui
          garantit la lisibilité sur les trois réseaux. Placez vos sous-titres vers{' '}
          <strong>70-75 % de la hauteur</strong> : assez bas pour capter l’attention, assez haut pour
          rester hors de la zone masquée.
        </p>
      </InfoSection>

      <InfoSection id="export" title="Réglages d’export recommandés">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Valeur conseillée</th>
                <th>Pourquoi</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Résolution</td>
                <td>
                  <code>1080 × 1920</code>
                </td>
                <td>Standard des trois plateformes</td>
              </tr>
              <tr>
                <td>Frame rate</td>
                <td>
                  <code>60 fps</code> (30 si la source est en 30)
                </td>
                <td>Zoom lent sans saccade</td>
              </tr>
              <tr>
                <td>Bitrate</td>
                <td>
                  <code>16 Mbps</code>
                </td>
                <td>Marge de sécurité face à la recompression</td>
              </tr>
              <tr>
                <td>Codec</td>
                <td>
                  <code>H.264 / AAC</code>
                </td>
                <td>Compatibilité maximale</td>
              </tr>
              <tr>
                <td>Audio</td>
                <td>48 kHz stéréo, ~-14 LUFS</td>
                <td>Évite le volume écrasé par la plateforme</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Ces valeurs sont pré-remplies dans la fenêtre <strong>Export</strong> d’IziCut ; seul le
          frame rate est à confirmer si votre source est en 30 fps.
        </p>
      </InfoSection>

      <InfoSection id="captions" title="Sous-titres qui retiennent">
        <p>
          Sur mobile, la majorité des vues se font <strong>sans le son</strong>. Le sous-titre n’est
          pas un accessoire : c’est le second narrateur du clip.
        </p>
        <h3>Les règles appliquées par IziCut</h3>
        <ol>
          <li>
            <strong>Groupes de 2 à 4 mots</strong> affichés en gros, avec le mot prononcé mis en
            évidence (effet karaoké, style Alex Hormozi).
          </li>
          <li>
            <strong>Contraste maximal</strong> : texte jaune ou blanc, contour noir épais, ombre
            portée pour rester lisible sur fond clair.
          </li>
          <li>
            <strong>Transcription mot-à-mot éditable</strong> : corrigez un terme technique dans
            l’éditeur, le rendu se met à jour instantanément.
          </li>
          <li>
            <strong>Emojis intelligents</strong> insérés uniquement sur les pics émotionnels, jamais
            sur chaque phrase.
          </li>
        </ol>
        <blockquote>
          <p>
            Une faute de transcription sur un mot-clé coûte de la crédibilité : relisez toujours les
            10 premières secondes du hook.
          </p>
        </blockquote>
      </InfoSection>

      <InfoSection id="cadrage" title="Cadrage & suivi du sujet">
        <p>
          Passer du 16:9 au 9:16 supprime environ <strong>60 % des pixels</strong> de la scène. Sans
          règle claire, le sujet se retrouve coupé au niveau du front.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Quand l’utiliser</th>
                <th>Ce qu’IziCut fait</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Suivi de visage</td>
                <td>Une seule personne à l’écran (face-cam, discours)</td>
                <td>Recentre en continu sur le visage détecté</td>
              </tr>
              <tr>
                <td>Split-screen</td>
                <td>Interview, débat, podcast à deux</td>
                <td>Empile les intervenants et met en avant celui qui parle</td>
              </tr>
              <tr>
                <td>Crop manuel</td>
                <td>Écran d’ordinateur, jeu vidéo, contenu sans visage</td>
                <td>Conserve votre cadrage et applique un fond flouté</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Laissez une marge de <strong>10 % au-dessus du crâne</strong> dans tous les cas : c’est cette
          respiration qui distingue un cadrage professionnel d’un recadrage automatique brut.
        </p>
      </InfoSection>

      <InfoSection id="checklist" title="Checklist avant publication">
        <ol>
          <li>
            Le hook est visible <strong>dès la première image</strong>, sans générique ni logo long.
          </li>
          <li>
            Les sous-titres restent dans la Safe Zone <strong>TikTok</strong> (donc valides partout).
          </li>
          <li>
            Le texte est relu : aucune faute sur les noms propres ni les chiffres.
          </li>
          <li>
            Le clip fait entre <strong>18 et 45 secondes</strong> et se termine sur une phrase
            complète.
          </li>
          <li>
            Le fichier est exporté en <code>1080 × 1920</code>, 60 fps, 16 Mbps.
          </li>
          <li>
            Un <strong>appel à l’action</strong> discret est présent dans les 3 dernières secondes.
          </li>
        </ol>
        <p>
          Une fois ces six points validés, votre clip est prêt pour TikTok, Reels et Shorts — un
          seul export, trois publications.
        </p>
      </InfoSection>

    </InfoPage>
  );
}
