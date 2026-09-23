import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/marketing/InfoPage';

export const metadata: Metadata = {
  title: 'Documentation API & Webhooks',
  description:
    "API REST IziCut : créez des projets, suivez le pipeline IA (Whisper, GPT-4o-mini, Remotion), récupérez vos clips 9:16 et écoutez les webhooks de rendu.",
  openGraph: {
    title: 'Documentation API & Webhooks · IziCut',
    description: 'Automatisez le clipping vidéo depuis vos propres outils : endpoints, quotas et webhooks.'
  }
};

const TOC = [
  { id: 'demarrage', label: 'Démarrage rapide' },
  { id: 'authentification', label: 'Authentification' },
  { id: 'projets', label: 'Créer un projet' },
  { id: 'clips', label: 'Récupérer les clips' },
  { id: 'rendu', label: 'Lancer un rendu' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'limites', label: 'Quotas & erreurs' }
];

export default function DocsPage() {
  return (
    <InfoPage
      eyebrow="Développeurs"
      title="Documentation API"
      description="Automatisez le clipping vidéo depuis vos propres outils : lancez un pipeline IA, suivez son avancement, récupérez les clips 9:16 rendus et soyez notifié par webhook. Toutes les routes consomment les minutes vidéo de votre compte."
      breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Documentation' }]}
      toc={TOC}
      updatedAt="22 septembre 2026"
      ctaLabel="Créer une clé API"
      ctaHref="/dashboard"
    >
      <InfoSection id="demarrage" title="Démarrage rapide">
        <p>
          L&apos;API IziCut est une <strong>API REST</strong> en JSON sur{' '}
          <code>https://izicut.app/api/v1</code>. Trois appels suffisent pour transformer une vidéo
          longue en clips viraux : créer le projet, attendre le webhook de fin d&apos;analyse, puis
          lancer le rendu des clips retenus.
        </p>
        <pre>
          <code>{`# 1. Créer un projet à partir d'un lien YouTube
curl -X POST https://izicut.app/api/v1/projects \\
  -H "Authorization: Bearer $IZICUT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Podcast #42 - Scaling",
    "source_type": "external_url",
    "source_url": "https://www.youtube.com/watch?v=XXXXXXXXXXX"
  }'

# 2. Déclencher le rendu du meilleur clip
curl -X POST https://izicut.app/api/v1/clips/CLIP_ID/render \\
  -H "Authorization: Bearer $IZICUT_API_KEY" \\
  -d '{ "fps": 60, "captions": { "style": "hormozi", "color": "#FACC15" } }'`}</code>
        </pre>
        <blockquote>
          <p>
            Le pipeline est <strong>asynchrone</strong> : chaque projet traverse les états{' '}
            <code>queued</code> → <code>processing_audio</code> → <code>transcribing</code> →{' '}
            <code>analyzing</code> → <code>rendering</code> → <code>completed</code> (ou{' '}
            <code>failed</code>).
          </p>
        </blockquote>
      </InfoSection>

      <InfoSection id="authentification" title="Authentification">
        <p>
          Générez une clé depuis <strong>Dashboard → Paramètres → Clés API</strong>. Chaque requête
          doit porter l&apos;en-tête <code>Authorization: Bearer &lt;clé&gt;</code>. Une clé est liée
          à un seul compte : les minutes consommées sont celles de l&apos;abonnement associé.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>En-tête</th>
                <th>Valeur</th>
                <th>Obligatoire</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>Authorization</code>
                </td>
                <td>
                  <code>Bearer izi_live_…</code>
                </td>
                <td>Oui</td>
              </tr>
              <tr>
                <td>
                  <code>Content-Type</code>
                </td>
                <td>
                  <code>application/json</code>
                </td>
                <td>Oui hors GET</td>
              </tr>
              <tr>
                <td>
                  <code>Idempotency-Key</code>
                </td>
                <td>UUID v4</td>
                <td>Recommandé sur POST</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Les clés ne sont affichées <strong>qu&apos;une seule fois</strong> à la création.
          Révoquez-les immédiatement en cas de fuite : la révocation est instantanée et n&apos;affecte
          pas les rendus déjà en file.
        </p>
      </InfoSection>
      <InfoSection id="projets" title="Créer un projet">
        <p>
          <code>POST /v1/projects</code> — enregistre une source et lance l&apos;analyse IA
          (transcription Whisper mot-à-mot puis scoring de viralité GPT-4o-mini).
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Champ</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>title</code>
                </td>
                <td>string</td>
                <td>Titre affiché dans le dashboard (max. 120 caractères)</td>
              </tr>
              <tr>
                <td>
                  <code>source_type</code>
                </td>
                <td>
                  <code>upload_gallery</code> | <code>external_url</code>
                </td>
                <td>Fichier téléversé ou lien distant (contrainte SQL)</td>
              </tr>
              <tr>
                <td>
                  <code>source_url</code>
                </td>
                <td>string</td>
                <td>
                  Requis si <code>source_type = external_url</code> (YouTube, Twitch, Vimeo…)
                </td>
              </tr>
              <tr>
                <td>
                  <code>language</code>
                </td>
                <td>string</td>
                <td>
                  Force la langue de transcription (ex. <code>fr</code>) — détection automatique
                  sinon
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre>
          <code>{`{
  "id": "prj_8fK2dPq",
  "status": "processing_audio",
  "duration_seconds": 3720,
  "estimated_clips": 6,
  "created_at": "2026-09-22T14:03:11Z"
}`}</code>
        </pre>
      </InfoSection>

      <InfoSection id="clips" title="Récupérer les clips">
        <p>
          <code>GET /v1/projects/&lt;projet&gt;/clips</code> renvoie les extraits détectés, triés par
          score de viralité décroissant. Chaque clip expose son hook, son transcript horodaté et sa
          configuration de style.
        </p>
        <pre>
          <code>{`{
  "data": [
    {
      "id": "clp_2nQ8xL",
      "title": "Ta motivation est une arnaque",
      "start_time": 1284.5,
      "end_time": 1322.0,
      "virality_score": 92,
      "hook_text": "La motivation ne sert à RIEN",
      "status": "ready",
      "rendered_url": "https://cdn.izicut.app/clips/clp_2nQ8xL.mp4",
      "style_config": { "captions": { "style": "hormozi", "words_per_group": 3 } }
    }
  ],
  "total": 6
}`}</code>
        </pre>
        <h3>Bonnes pratiques de sélection</h3>
        <ul>
          <li>
            Privilégiez les clips dont le <strong>score de viralité dépasse 80</strong> : le modèle
            pénalise les extraits sans tension narrative ni chiffre marquant.
          </li>
          <li>
            Gardez <code>end_time - start_time</code> entre 18 et 45 secondes pour TikTok et Reels.
          </li>
          <li>
            Le champ <code>hook_text</code> couvre les 2 premières secondes : réutilisez-le comme
            description de publication.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="rendu" title="Lancer un rendu">
        <p>
          <code>POST /v1/clips/&lt;clip&gt;/render</code> encode le clip en 1080×1920 (9:16) via
          Remotion. Le rendu est facturé en minutes vidéo, débitées au lancement puis remboursées
          automatiquement en cas d&apos;échec.
        </p>
        <pre>
          <code>{`{
  "fps": 60,
  "captions": { "style": "hormozi", "color": "#FACC15", "animation": "karaoke" },
  "framing": { "mode": "face_tracking", "safe_zones": "tiktok" },
  "background": { "type": "blur", "blur_px": 24 }
}`}</code>
        </pre>
        <p>
          Réponse <code>202 Accepted</code> avec un <code>job_id</code>. Les fichiers rendus sont
          déposés dans un bucket <strong>privé</strong> : utilisez{' '}
          <code>GET /v1/clips/&lt;clip&gt;/download</code> pour obtenir une URL signée valable 1
          heure.
        </p>
      </InfoSection>

      <InfoSection id="webhooks" title="Webhooks">
        <p>
          Déclarez une URL de callback dans le dashboard. Chaque livraison est signée via
          l&apos;en-tête <code>X-IziCut-Signature</code> (HMAC SHA-256 du corps brut, secret{' '}
          <code>whsec_…</code>). <strong>Validez la signature sur le corps brut</strong> avant de
          parser le JSON : une re-sérialisation invaliderait la signature.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Événement</th>
                <th>Déclenché quand</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>project.analyzed</code>
                </td>
                <td>Transcription et scoring terminés, clips disponibles</td>
              </tr>
              <tr>
                <td>
                  <code>clip.render.completed</code>
                </td>
                <td>Le MP4 9:16 est encodé et téléchargeable</td>
              </tr>
              <tr>
                <td>
                  <code>clip.render.failed</code>
                </td>
                <td>Échec du rendu après 3 tentatives — minutes remboursées</td>
              </tr>
              <tr>
                <td>
                  <code>credits.low</code>
                </td>
                <td>Solde sous 20 % du quota mensuel</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre>
          <code>{`{
  "id": "evt_7Hq1Z",
  "type": "clip.render.completed",
  "created_at": "2026-09-22T14:41:02Z",
  "data": {
    "clip_id": "clp_2nQ8xL",
    "project_id": "prj_8fK2dPq",
    "rendered_url": "https://cdn.izicut.app/clips/clp_2nQ8xL.mp4",
    "duration_seconds": 37.5
  }
}`}</code>
        </pre>
        <p>
          Renvoyez un <code>2xx</code> en moins de 10 secondes, sinon nous réessayons avec un
          backoff exponentiel (3 tentatives sur 24 heures).
        </p>
      </InfoSection>

      <InfoSection id="limites" title="Quotas & erreurs">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Formule</th>
                <th>Minutes / mois</th>
                <th>Projets simultanés</th>
                <th>Requêtes / min</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>30</td>
                <td>1</td>
                <td>20</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>150</td>
                <td>5</td>
                <td>120</td>
              </tr>
              <tr>
                <td>Agency</td>
                <td>600</td>
                <td>20</td>
                <td>600</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Signification</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>401</code>
                </td>
                <td>Clé absente ou révoquée</td>
                <td>Régénérer une clé</td>
              </tr>
              <tr>
                <td>
                  <code>402</code>
                </td>
                <td>Minutes épuisées</td>
                <td>Recharger ou changer de formule</td>
              </tr>
              <tr>
                <td>
                  <code>409</code>
                </td>
                <td>
                  <code>Idempotency-Key</code> déjà utilisée
                </td>
                <td>Réutiliser la réponse en cache</td>
              </tr>
              <tr>
                <td>
                  <code>422</code>
                </td>
                <td>Source illisible (vidéo privée, DRM)</td>
                <td>Vérifier les droits d&apos;accès</td>
              </tr>
              <tr>
                <td>
                  <code>429</code>
                </td>
                <td>Débit dépassé</td>
                <td>
                  Respecter l&apos;en-tête <code>Retry-After</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Une question d&apos;intégration ? Écrivez à{' '}
          <a href="mailto:support@izicut.app">support@izicut.app</a> — réponse sous 24 h ouvrées.
        </p>
      </InfoSection>

    </InfoPage>
  );
}
