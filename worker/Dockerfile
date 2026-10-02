# Worker IziCut — image dédiée, à NE PAS déployer sur Vercel.
# Contient ce qu'une Vercel Function ne peut pas embarquer : ffmpeg,
# yt-dlp et un navigateur headless pour Remotion.
FROM node:22-bookworm-slim

# Libs requises par Chrome Headless Shell (rendu Remotion).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      ca-certificates \
      curl \
      fonts-dejavu-core \
      fonts-liberation \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libgbm1 libasound2 libpangocairo-1.0-0 libxcomposite1 \
      libxdamage1 libxrandr2 libxkbcommon0 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp (via pip, pour pouvoir lui ajouter des plugins) + fournisseur de
# « PO token » bgutil : il aide YouTube à ne pas prendre le serveur pour un
# robot (« Sign in to confirm you're not a bot »). Le serveur bgutil tourne
# en local sur le port 4416, le plugin yt-dlp l'utilise automatiquement.
RUN apt-get update && apt-get install -y --no-install-recommends git python3-pip \
    && rm -rf /var/lib/apt/lists/*
RUN BGUTIL_TAG=$(curl -fsSL https://api.github.com/repos/Brainicism/bgutil-ytdlp-pot-provider/releases/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])") \
    && echo "bgutil $BGUTIL_TAG" \
    && python3 -m pip install --break-system-packages --no-cache-dir -U "yt-dlp[default]" "bgutil-ytdlp-pot-provider==$BGUTIL_TAG" \
    && git clone --depth 1 --branch "$BGUTIL_TAG" https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
    && cd /opt/bgutil/server && npm ci && npx tsc

WORKDIR /app

# Dépendances d'exécution uniquement (pas de Next.js dans cette image).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Pré-téléchargement du navigateur : évite un premier rendu à froid de
# plusieurs minutes, et rend l'image autosuffisante hors ligne.
RUN node -e "require('@remotion/renderer').ensureBrowser().then(() => console.log('Chrome Headless Shell prêt'))"

COPY worker ./worker
# Droits par offre : module PUR partagé avec Next.js, importé par
# worker/pipeline.js (../lib/entitlements.ts). Sans lui, le worker ne
# démarre pas.
COPY lib/entitlements.ts ./lib/entitlements.ts

ENV NODE_ENV=production
# Type stripping : le worker importe ./timestamps.ts (module pur testé)
# sans étape de build. Requis sur Node 22 ; natif à partir de Node 23.6.
# Le serveur de PO token démarre en arrière-plan avant le worker.
CMD ["sh", "-c", "(node /opt/bgutil/server/build/main.js > /tmp/bgutil.log 2>&1 &) ; exec node --experimental-strip-types worker/index.js"]
