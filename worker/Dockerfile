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

# yt-dlp : récupération de la source YouTube (hors Vercel par conception).
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp

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
CMD ["node", "--experimental-strip-types", "worker/index.js"]
