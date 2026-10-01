# Architecture — IziCut

Document de référence des décisions techniques. À lire avant d'écrire du code.

## 1. Vue d'ensemble

```
                    +------------------------------+
   Navigateur ----> |  Next.js sur Vercel          |
   (URL signee)     |  - auth Supabase SSR         |
                    |  - API : creer projet / clip |
                    |  - Stripe Checkout + webhook |
                    |  - reservation des credits   |
                    +------+---------------+-------+
                           |               |
                ecrit/lit  |               |  RPC atomiques
                           v               v
                    +------------------------------+
                    | Supabase (Postgres + Storage) |
                    | projects / clips / jobs       |
                    | credit_accounts / ledger      |
                    +------^---------------+-------+
                           |               |
                ecrit le   |               |  file render_jobs
                resultat   |               |  (claim SKIP LOCKED)
                           |               v
                    +------------------------------+
                    |  Worker (VM / Fly / Lambda)  |
                    |  yt-dlp > ffmpeg > Whisper   |
                    |  GPT-4o-mini > Remotion      |
                    +------------------------------+
```

**Le point non négociable** : le rendu vidéo ne tourne **pas** sur Vercel.
Voir section 2.

## 2. Pourquoi un worker séparé

| Contrainte mesurée | Conséquence |
| --- | --- |
| Vercel Function : **300 s max (Hobby)**, 800 s max / 1 800 s en beta (Pro), bundle **250 Mo décompressé** | Un rendu 9:16 sous-titré dépasse ces limites, et ni ffmpeg ni Chromium n'y sont disponibles |
| Doc officielle Remotion | Trois voies seulement : rendu client, **Vercel Sandbox**, ou **Remotion Lambda** |
| `yt-dlp` = binaire Python | Impossible dans une Function ; le téléchargement de la source doit se faire ailleurs |
| Whisper API : **25 Mo max par requête** | Exige extraction audio + découpage avant envoi, donc ffmpeg |

Le worker est un service Node **séparé** (`worker/`), déployé avec son
`Dockerfile` (ffmpeg + yt-dlp + Chrome Headless Shell). Il ne partage avec
Next.js que le schéma Supabase et les RPC de crédits.

## 3. Pipeline, étape par étape

### 3.1 `ingest`

- **Upload** : le navigateur dépose le fichier directement dans le bucket
  privé `raw-videos`, sous la clé `<user_id>/<fichier>` — le premier
  segment **doit** être `auth.uid()`, c'est la politique RLS du bucket.
  Le fichier ne traverse jamais Vercel (limite de taille de corps de
  requête). La clé est ensuite transmise telle quelle à
  `POST /api/pipeline/process` : **sans** préfixe de bucket (`raw-videos/`),
  sinon l'URL signée de lecture pointerait un objet inexistant.
- **YouTube** : le worker exécute
  `yt-dlp -f "bv*+ba/b" --merge-output-format mp4`.
  À faire uniquement sur des contenus dont l'utilisateur détient les
  droits : c'est une condition des CGU YouTube et un risque juridique réel.
- Ensuite `ffprobe` pour la durée, puis extraction audio :
  `ffmpeg -i source.mp4 -ac 1 -ar 16000 -vn audio.wav`.

### 3.2 `transcribe`

1. Découpage en tranches sous la limite Whisper :
   `ffmpeg -i audio.wav -f segment -segment_time 600 -c copy chunk_%03d.wav`
2. Un appel
   `audio.transcriptions.create({ model: 'whisper-1', response_format: 'verbose_json', timestamp_granularities: ['word'] })`
   par tranche, avec **reprise sur 429/503** (même stratégie que
   `lib/retry.js` du projet IZI).
3. **Recalage obligatoire** : chaque mot reçoit
   `start + offset de la tranche`. Sans cette étape, les sous-titres des
   clips situés après la première tranche sont décalés — c'est le bug le
   plus fréquent de ce type de produit.
4. Écriture dans `transcripts` (`words`, `segments`, `content`).

Implémentation **déjà écrite et testée** : `worker/timestamps.ts`
(`planChunks`, `rebaseWords`, `mergeChunkWords`, `wordsInRange`) et ses
24 tests dans `worker/timestamps.test.ts`. Tests à connaître :
`mergeChunkWords` écarte le mot répété à la frontière de tranche et garantit
des temps strictement croissants ; `wordsInRange` recale le clip sur zéro.

### 3.3 `analyze`

- `gpt-4o-mini` reçoit la transcription horodatée et doit répondre en
  **JSON strict** : 2 à 3 passages, avec `start`, `end`, `title`, `hook`,
  `rationale`, `score`.
- Utiliser `response_format: { type: 'json_schema' }` puis **valider avec
  Zod** : un LLM produit régulièrement des bornes hors vidéo ou un
  `end < start`. Les bornes sont rognées sur `[0, duration]`, la durée
  ramenée dans une fourchette de 15 à 60 s, et tout doublon de plage
  écarté. Les clips retenus sont insérés dans `clips` (statut
  `suggested`) : rien n'est rendu automatiquement, l'utilisateur choisit.

### 3.4 `render`

- API programmatique : `bundle()` de `@remotion/bundler` (mis en cache
  entre deux rendus) puis `renderMedia()` de `@remotion/renderer`.
- `inputProps` : URL **signée** de la vidéo source, mots du clip (déjà
  recadrés sur `start`), `layout`, `aspectRatio`.
- Composition 9:16 : la source est recadrée en `object-cover` sur un
  canevas 1080x1920, les mots sont surlignés en cadence mot-à-mot. Un
  `onProgress` met à jour `render_jobs.progress` (au plus une écriture
  toutes les 4 s), ce qui alimentera la barre de progression côté
  navigateur via Realtime.
- Sortie : objet `<user_id>/<clip_id>.mp4` dans le bucket privé `clips` —
  même convention que le SRT (premier segment = identifiant de
  l'utilisateur, exigence de la politique RLS de lecture).
- **Pas encore fait** : la vignette JPEG du clip, et
  `clips.render_progress` cité plus haut n'existe pas en base — la
  progression se lit sur `render_jobs.progress`.

### 3.5 Coûts et crédits

- Réservation **au dépôt**, avant même l'ingestion :
  `create_project_with_job(user_id, …, cost_seconds, kind)` débite le
  solde, crée le projet **et** met le job `ingest` en file dans une seule
  transaction. Le coût réservé est écrit sur le job
  (`render_jobs.cost_seconds`), donc remboursable.
  Si le solde est insuffisant, la RPC renvoie `insufficient_credits` et
  l'API répond 402 : aucun projet, aucun job, aucun débit.
- Coût réservé = durée annoncée + 20 % (`lib/pipeline-cost.ts`, module
  pur et testé), plafonné à 4 h : la durée vient du client, elle n'est
  qu'une estimation — le worker mesure la vraie durée avec `ffprobe`.
- Job définitivement en échec (`attempts >= max_attempts`) :
  `release_credits(...)` rembourse en se basant sur le coût porté par le
  job. Un succès ne rembourse jamais.
- Le débit est **atomique** (voir section 4) : deux dépôts simultanés ne
  peuvent pas faire passer le solde en négatif.
- **Jamais deux transactions séparées** pour « débiter puis insérer » :
  si la seconde échoue, le solde reste amputé sans job — donc sans
  remboursement possible. C'est précisément ce que corrige
  `create_project_with_job`.

## 4. Pourquoi les crédits vivent en Postgres et pas dans l'application

Le réflexe naturel — lire le solde, comparer, écrire — est une course
(*time-of-check to time-of-use*). Deux requêtes lancées à 50 ms d'écart
lisent le même solde et passent toutes les deux.

Ici, le débit est un `UPDATE ... WHERE balance_minutes >= p_minutes` :
PostgreSQL pose un verrou sur la ligne, puis **réévalue la condition après**
le commit de la transaction concurrente. Le second appel ne trouve donc
plus de ligne, `v_balance` reste `NULL`, et la fonction lève l'exception.
La contrainte `check (balance_minutes >= 0)` est la seconde ligne de
défense : un solde négatif est impossible même en cas de bug applicatif.

`credit_ledger` sert d'audit : la somme des `delta_minutes` doit toujours
égaler `credit_accounts.balance_minutes` (à vérifier par requête de
contrôle après incident).

## 5. Sécurité

- **Double barrière** : RLS + privilèges de colonne. Le client ne peut ni
  insérer, ni supprimer, ni modifier autre chose qu'un titre.
- **`REVOKE` sur les fonctions `SECURITY DEFINER`** : sans cela, un
  utilisateur connecté appellerait `grant_credits(auth.uid(), 10000)`.
  C'est la faille la plus coûteuse et la plus facile à oublier.
- **Stockage privé uniquement** : URL signées de courte durée, jamais
  d'objet public.
- **Webhook Stripe** : signature vérifiée sur le corps **brut**, et
  `stripe_events.id` en clé primaire pour absorber les rejeux.
- **Worker** : authentifié par `WORKER_TOKEN` sur ses callbacks ; il utilise
  `service_role` et n'expose jamais cette clé au navigateur.
- **Rendu** : ne jamais passer à Remotion une URL publique de la source.
  Toujours une URL signée à durée courte.

## 6. Options de rendu, à trancher

| Option | Avantages | Limites |
| --- | --- | --- |
| **Worker auto-hébergé** (VPS Scaleway déjà en place) | Pas de facturation à la seconde, contrôle total, ffmpeg + yt-dlp au même endroit | Une machine à administrer ; montée en charge manuelle |
| **Remotion Lambda** | Élastique, pas de serveur, Chrome fourni | Coût par rendu, complexité AWS, yt-dlp à héberger malgré tout |
| **Vercel Sandbox** | Intégré à Vercel, éphémère | Facturé à la durée, et ne résout pas le cas `yt-dlp` |

Recommandation : démarrer sur le **worker auto-hébergé** (le plus simple à
opérer avec l'infrastructure existante), puis basculer le seul rendu
Remotion vers **Lambda** quand la file d'attente devient le goulot
d'étranglement. `RENDER_DRIVER` dans `.env.example` permet ce basculement
sans réécrire la file de jobs.

## 7. Points de vigilance produit

- **Droits sur la source** : n'accepter que des contenus dont
  l'utilisateur est titulaire des droits, et le rappeler dans les CGU.
  C'est une condition des CGU YouTube, et un risque juridique réel.
- **Coût Whisper** : proportionnel à la durée audio, donc un projet de
  3 heures consomme du budget avant même la première seconde de rendu —
  d'où l'intérêt de facturer aussi la transcription, pas seulement le
  rendu. Vérifier le tarif public en vigueur avant de figer les prix.
- **Durée de vie du stockage** : prévoir une purge des sources et des clips
  (par exemple 30 jours) pour maîtriser le coût Storage et le RGPD.
- **File d'attente visible** : un utilisateur qui attend sans retour se
  croit bloqué. La progression Realtime n'est pas un luxe, c'est une
  condition d'usage.