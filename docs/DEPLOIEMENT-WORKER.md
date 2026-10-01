# Mettre le moteur IziCut en ligne 24h/24

Le site (Vercel) reçoit les commandes ; le **worker** fabrique les clips
(téléchargement, transcription, détection des moments, rendu). Tant qu'il
tourne sur le Mac, les clients attendent quand le Mac est éteint.

## Option recommandée : Railway (≈ 5 à 20 €/mois selon l'usage)

1. Créer un compte sur railway.com (connexion avec GitHub).
2. « New Project » → « Deploy from GitHub repo » → `izicut`.
   Railway lit `railway.json` et construit `worker/Dockerfile` tout seul.
3. Onglet **Variables** du service, ajouter :

| Variable | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clé *service_role* (Supabase → Settings → API) |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | clé OpenAI (platform.openai.com) |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` |
| `FFPROBE_PATH` | `/usr/bin/ffprobe` |
| `WORKER_CONCURRENCY` | `1` (monter à 2 si la machine a ≥ 4 Go de RAM) |
| `YTDLP_COOKIES_B64` | *(facultatif, voir plus bas)* |
| `YTDLP_PROXY` | *(facultatif)* `http://user:pass@hote:port` |

4. Déployer. Les logs doivent afficher `worker-1 démarré`.
5. Arrêter le worker du Mac (fermer « Lancer IziCut ») pour éviter deux
   moteurs sur la même file — ce n'est pas dangereux, mais inutile.

> Pourquoi OpenAI sur le serveur ? L'IA locale (Whisper + Ollama) demande
> ~8–16 Go de RAM : un serveur capable coûte 30–60 €/mois. Avec OpenAI,
> une vidéo d'1 h coûte environ 0,40 € de transcription + quelques centimes
> d'analyse — à intégrer dans le prix des offres.

## YouTube bloque le serveur (« Sign in to confirm you're not a bot »)

Les IP de datacenter sont souvent bloquées. Deux remèdes (cumulables) :

- **Cookies** : se connecter à YouTube avec un compte *secondaire* dans
  Chrome, exporter les cookies au format `cookies.txt` (extension
  « Get cookies.txt LOCALLY »), puis sur le Mac :
  `base64 -i cookies.txt | pbcopy` et coller dans `YTDLP_COOKIES_B64`.
  À renouveler si les erreurs reviennent.
- **Proxy résidentiel** (≈ 5–15 €/mois) dans `YTDLP_PROXY`.

En cas d'échec, le client voit un message clair et ses minutes sont
**recréditées automatiquement** (`fail_render_job` → `release_credits`).

## Alternative : Render

« New » → « Background Worker » → dépôt `izicut` → Docker,
Dockerfile path `worker/Dockerfile`, mêmes variables. Plan Starter minimum.
