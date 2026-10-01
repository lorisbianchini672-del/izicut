# IziCut

Micro-SaaS de **clipping vidéo assisté par IA** : à partir d'une vidéo longue
(upload ou lien YouTube), le service produit des **clips verticaux 9:16
sous-titrés** prêts pour TikTok, Reels et Shorts.

## Le produit en une phrase

L'utilisateur dépose une vidéo longue ; il reçoit 2 à 3 extraits de 15 à 60 s,
recadrés en vertical, avec des sous-titres animés mot-à-mot, choisis pour leur
potentiel de rétention par un LLM qui a lu la transcription.

## Chaîne technique

1. **Transcription** — Whisper API, horodatage au mot (découpage > 25 Mo).
2. **Sélection** — `gpt-4o-mini` sur la transcription horodatée, sortie JSON
   stricte validée par Zod.
3. **Rendu** — Remotion : composition 9:16, sous-titres animés, rendu par un
   worker dédié. **Jamais sur Vercel** (voir `docs/ARCHITECTURE.md`).
4. **Facturation** — Stripe Billing : abonnements à quota de minutes, débit
   atomique des crédits par fonction Postgres.

## Structure du projet

```
izicut/
├── README.md                  Ce fichier
├── docs/
│   └── ARCHITECTURE.md        Décisions techniques, pipeline, sécurité
├── supabase/
│   └── schema.sql             Schéma complet (généré par scripts/write-schema.mjs)
├── app/                       Next.js App Router
│   ├── layout.tsx             Gabarit global
│   ├── page.tsx               Vitrine + tarifs
│   ├── upload/                Import fichier ou lien YouTube/Twitch
│   ├── dashboard/             Liste des projets + solde de minutes
│   ├── login/                 Connexion, inscription, lien magique
│   ├── auth/confirm/          Retour des emails Supabase (ouverture de session)
│   ├── project/[id]/          Clips, score de viralité, téléchargements
│   ├── editor/                Studio d'édition (In/Out, sous-titres, safe zones)
│   └── api/
│       └── pipeline/process/  Débit + projet + job `ingest` : UNE transaction
├── components/                Landing, upload, dashboard, editor, ui
├── lib/
│   ├── supabase/              client.ts (navigateur), server.ts (SSR), admin.ts (service_role)
│   ├── credits.ts             RPC grant/reserve/release (débit atomique)
│   ├── jobs.ts                Mise en file d'un job (create_project_with_job)
│   ├── pipeline-cost.ts       Coût réservé — module pur, testé
│   ├── ai/prompts.ts          Prompts LLM + validation Zod
│   ├── remotion/              Composition de référence (éditeur)
│   └── plans.ts               Offres Free / Pro / Agency
├── stores/use-intake.ts       État d'import (lien ou fichier) entre pages
├── types/index.ts             Types du domaine = colonnes SQL exactes
├── scripts/
│   ├── write-schema.mjs       Génère supabase/schema.sql (source de vérité)
│   └── smoke-worker.mjs       Vérifie le chargement du worker (sans clés)
├── worker/                    Service séparé, hors Vercel
│   ├── Dockerfile             ffmpeg + yt-dlp + Chrome Headless Shell
│   ├── index.js               Boucle : claim_render_job (SKIP LOCKED) puis traitement
│   ├── pipeline.js            ingest → transcribe → analyze → render
│   ├── timestamps.ts          Recalage des horodatages — module pur
│   ├── timestamps.test.ts     29 tests du recalage — exécutés par npm test
│   └── remotion/
│       ├── index.ts           Entrée bundle() Remotion
│       └── ClipVertical.tsx   Composition 9:16 + sous-titres animés
├── next.config.ts
├── postcss.config.mjs         Tailwind CSS 4
├── tsconfig.json              Alias @/*, strict
├── package.json               Next.js, Supabase, Stripe, OpenAI, Remotion, Zod
└── .env.example               Toutes les variables, commentées
```

### Statut des fichiers de ce dépôt

Tout le socle est écrit et validé : configuration, schéma SQL complet
(8 tables + vue `credit_balances` + 2 buckets privés), interface
(`app/`, `components/`), couche d'accès (`lib/supabase/`, `lib/credits.ts`,
`lib/jobs.ts`) et **le worker complet** (`worker/index.js`, `worker/pipeline.js`,
`worker/remotion/`) — soit la chaîne `ingest → transcribe → analyze → render`.

Vérifications : `npm run typecheck` (0 erreur), `npm test` (36/36),
`npm run build` (succès), `npm run check:worker` (chargement du pipeline).

Le **dépôt d'une vidéo est branché de bout en bout** : le navigateur dépose
le fichier dans le bucket privé, puis `POST /api/pipeline/process` débite
les crédits, crée le projet et met le job `ingest` en file dans **une seule
transaction SQL** (`create_project_with_job`). Le coût réservé est porté par
le job, donc remboursé par `release_credits` si le job échoue définitivement.
Le worker n'a plus qu'à revendiquer le job via `claim_render_job`.

Reste à faire avant la mise en production :
- **rejouer `supabase/schema.sql`** — il ajoute aussi `profiles.plan`,
  le trigger `profiles_protect_billing`, et passe `render_jobs` en
  lecture seule pour le client (avant, un utilisateur pouvait insérer
  lui-même un job et faire traiter une vidéo sans crédits) ;
- ancien point, toujours valable — rejouer le schéma (ou `node scripts/apply-schema.cjs`) :
  la RPC `create_project_with_job` est nouvelle, `check_and_deduct_credits`
  est supprimée, et `reserve_credits` n'est plus exécutable par un client
  `authenticated` (sinon n'importe quel utilisateur connecté pouvait vider
  le solde d'un autre compte) ;
- créer les deux prix Stripe et renseigner `STRIPE_PRICE_PRO` /
  `STRIPE_PRICE_AGENCY` dans `.env.local` ;
- déclarer le webhook `https://<domaine>/api/stripe/webhook` dans le
  dashboard Stripe (`invoice.paid`, `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`) ;
- brancher `MediaUploader` dans les pages (`/upload`, `/dashboard`) : le
  composant d'upload réel existe mais l'interface affiche encore des
  données d'exemple.

## Offres Free / Pro / Agency — ce qui est réellement débloqué

Source unique : `lib/entitlements.ts` (module pur, testé par
`lib/entitlements.test.ts`, partagé par Next.js ET le worker).

| Fonction | Free | Pro | Agency |
| --- | --- | --- | --- |
| Clips IA par vidéo | 3 | 6 | 10 |
| Styles de sous-titres | 2 | 6 | 6 |
| Couleurs libres | — | ✅ | ✅ |
| Suppression des silences (+ recalage des sous-titres) | — | ✅ | ✅ |
| Zooms dynamiques, titre d'accroche, barre de progression | — | ✅ | ✅ |
| Fond flou / recadrage manuel | — | ✅ | ✅ |
| Audio studio (débruitage, compression) | volume normalisé | ✅ | ✅ |
| 60 fps, qualité maximale (CRF 17) | — | ✅ | ✅ |
| Filigrane | oui | non | non |
| Votre marque incrustée | — | — | ✅ |
| Rendus par clip | 3 | illimités | illimités |

**Où se joue la protection.** L'offre vient de `profiles.plan`, écrite
uniquement par le webhook Stripe (trigger `profiles_protect_billing` :
le client ne peut pas se l'attribuer). Les réglages sont rabotés par
`sanitizeRenderSettings` deux fois : dans `POST /api/clips/[id]/render`
et au moment du rendu dans le worker. Un abonnement résilié ou impayé
retombe en Free.

**Chaîne de rendu d'un clip** (`worker/pipeline.js` → `runRender`) :
pré-découpe ffmpeg de l'extrait (cadence fixe, silences retirés, audio
traité) → `worker/remotion/ClipVertical.tsx` (vidéo réelle, sous-titres
paginés, zooms, titre, signature) → upload dans le bucket `clips`.
La logique de montage est pure et testée : `worker/edit-plan.ts`.

## Prérequis de la machine

| Outil | État constaté | Rôle |
| --- | --- | --- |
| Node.js >= 20 | **v24.20.0 présent** | Next.js et worker |
| `ffmpeg` | absent | extraction audio, découpage, rendu |
| `yt-dlp` | absent | récupération d'une source YouTube |
| `docker` | absent | image du worker |
| `psql` / `supabase` CLI | absents | facultatif : le schéma s'exécute dans le dashboard |

`ffmpeg`, `yt-dlp` et `docker` ne sont nécessaires que pour le **worker**.
Le développement de l'interface peut se faire sans eux ; seul l'onglet
« rendu » restera inactif jusqu'à leur installation.

## Démarrage (une seule fois)

1. **Supabase** : créer le projet, puis *SQL Editor* → coller
   `supabase/schema.sql` → *Run*. Le script est rejouable sans perte de
   données. Vérifier ensuite que les 8 tables (`profiles`, `projects`,
   `transcripts`, `clips`, `render_jobs`, `credit_accounts`,
   `credit_ledger`, `stripe_events`), la vue `credit_balances`, les RPC
   de crédits et les 2 compartiments privés (`raw-videos`, `clips`)
   existent.
2. **Auth** : activer le fournisseur Email, puis ajouter
   `http://localhost:3000/auth/confirm` et l'URL de production aux
   *Redirect URLs*.
3. **Stripe** : créer les deux prix d'abonnement, noter leurs identifiants,
   puis déclarer le point d'entrée webhook
   `https://<domaine>/api/stripe/webhook` (événements
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`).
4. **OpenAI** : créer une clé API.
5. **Environnement** : `cp .env.example .env.local` puis renseigner les
   valeurs. `chmod 600 .env.local`.
6. `npm install` puis `npm run dev`.

## Plan d'action technique

| Étape | Contenu | Durée indicative |
| --- | --- | --- |
| **0. Socle** | Projet Supabase, exécution du schéma, clés Stripe/OpenAI, `.env.local` | 0,5 j |
| **1. Coquille Next** | `app/layout.tsx`, pages d'authentification, `middleware.ts` de session, dashboard vide | 1 j |
| **2. Dépôt d'une vidéo** ✅ | `POST /api/pipeline/process` : dépôt direct dans le bucket privé par le navigateur, puis débit + `projects` + job `ingest` **en une seule transaction** (`create_project_with_job`) | fait |
| **3. Worker : ingestion** | Boucle `claim_render_job`, image Docker, `yt-dlp`/`ffprobe`, extraction audio, chronométrage | 1 j |
| **4. Transcription** | Découpage, appels Whisper avec reprise, **recalage des offsets**, insertion `transcripts` | 1–2 j |
| **5. Sélection LLM** | Prompt `json_schema`, validation Zod, rognage des bornes, insertion de 2–3 `clips` `suggested` | 1 j |
| **6. Rendu Remotion** | Composition 9:16 + sous-titres animés, `bundle`/`renderMedia`, progression, upload dans `clips` | 2–3 j |
| **7. Paiement et crédits** | Checkout abonnement, webhook → `grant_credits`, `reserve_credits` au lancement, `release_credits` en échec, portail client | 1 j |
| **8. Durcissement** | Purge Storage (30 j), quota d'upload, limitation de débit, CGU « droits sur la source », supervision | 1 j |

**MVP utilisable : environ 9 à 12 jours de développement.**

### Le test qui compte avant tout le reste

Le **recalage des horodatages** après découpage Whisper est la brique la
plus fragile et la plus coûteuse à corriger après coup : un décalage de
600 s sur la deuxième tranche produit des sous-titres faux sur tous les
clips suivants. Écrire ce test (offset de tranche + concaténation) **avant**
de brancher Remotion.

C'est fait, et c'est la partie du pipeline la mieux couverte :

- `worker/timestamps.ts` — module **PUR**, zéro dépendance : `planChunks`
  (découpage égal sous la limite des 25 Mo), `rebaseWords` (décalage de
  tranche), `mergeChunkWords` (recollage, doublons de frontière, monotonie),
  `wordsInRange` (recalage du clip sur zéro), `buildSrt`.
- `worker/timestamps.test.ts` — 24 tests, dont un **test de non-régression**
  qui échoue si le décalage de 600 s revient.
- `lib/pipeline-cost.test.ts` — 7 tests du coût réservé : marge de 20 %,
  plafond de 4 h, durées inexploitables, arrondi jamais en dessous.
- `components/upload/validate-intake.test.ts` — 5 tests des règles de prise
  en charge (extensions, plafond de 10 Go, liens YouTube / Twitch).

```bash
cd izicut && npm test     # 36 tests, ~100 ms, aucune dépendance requise
```

## Projet autonome

IziCut est un projet à part entière : il vit dans son propre dépôt git,
avec son propre `package.json`, son schéma Supabase et son pipeline. Il ne
partage plus rien avec IziFacture — ni code, ni base, ni déploiement.