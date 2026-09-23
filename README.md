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
│       └── pipeline/process/  Création projet + débit atomique des crédits
├── components/                Landing, upload, dashboard, editor, ui
├── lib/
│   ├── supabase/              client.ts (navigateur), server.ts (SSR), admin.ts (service_role)
│   ├── credits.ts             RPC grant/reserve/release (débit atomique)
│   ├── jobs.ts                Mise en file d'un job (render_jobs)
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

Vérifications : `npm run typecheck` (0 erreur), `npm test` (29/29),
`npm run build` (succès), `npm run check:worker` (chargement du pipeline).

Reste à faire avant la mise en production :
- créer les deux prix Stripe et renseigner `STRIPE_PRICE_PRO` /
  `STRIPE_PRICE_AGENCY` dans `.env.local` ;
- déclarer le webhook `https://<domaine>/api/stripe/webhook` dans le
  dashboard Stripe (`invoice.paid`, `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`).

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
| **2. Dépôt d'une vidéo** | `POST /api/projects` : insertion `projects` + job `ingest`, URL d'upload signée, envoi direct au Storage | 1 j |
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

C'est fait, et c'est la seule partie du pipeline déjà couverte :

- `worker/timestamps.ts` — module **PUR**, zéro dépendance : `planChunks`
  (découpage égal sous la limite des 25 Mo), `rebaseWords` (décalage de
  tranche), `mergeChunkWords` (recollage, doublons de frontière, monotonie),
  `wordsInRange` (recalage du clip sur zéro), `buildSrt`.
- `worker/timestamps.test.ts` — 29 tests, dont un **test de non-régression**
  qui échoue si le décalage de 600 s revient.

```bash
cd izicut && npm test     # 29 tests, ~100 ms, aucune dépendance requise
```

## Projet autonome

IziCut est un projet à part entière : il vit dans son propre dépôt git,
avec son propre `package.json`, son schéma Supabase et son pipeline. Il ne
partage plus rien avec IziFacture — ni code, ni base, ni déploiement.