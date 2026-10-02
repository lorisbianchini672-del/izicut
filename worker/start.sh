#!/bin/sh
# Démarrage du worker IziCut sur serveur.
# 1) Serveur de PO token (bgutil) en arrière-plan.
# 2) Cloudflare WARP gratuit en proxy SOCKS5 local (wgcf + wireproxy) : les
#    téléchargements YouTube sortent par une IP Cloudflare au lieu de l'IP
#    du datacenter, souvent bloquée (« not a bot »). Désactivable : YT_WARP=0.
# 3) Le worker.

node /opt/bgutil/server/build/main.js > /tmp/bgutil.log 2>&1 &

if [ "${YT_WARP:-1}" = "1" ] && [ -z "$YTDLP_PROXY" ] && command -v wgcf >/dev/null && command -v wireproxy >/dev/null; then
  mkdir -p /tmp/warp && cd /tmp/warp
  if wgcf register --accept-tos >/tmp/warp/register.log 2>&1 && wgcf generate >/tmp/warp/generate.log 2>&1; then
    cat > /tmp/warp/wireproxy.conf <<CONF
WGConfig = /tmp/warp/wgcf-profile.conf

[Socks5]
BindAddress = 127.0.0.1:40000
CONF
    wireproxy -c /tmp/warp/wireproxy.conf > /tmp/warp/wireproxy.log 2>&1 &
    sleep 3
    export YTDLP_PROXY="socks5://127.0.0.1:40000"
    echo "[start] WARP actif : téléchargements YouTube via Cloudflare"
  else
    echo "[start] WARP indisponible ($(tail -1 /tmp/warp/register.log)), démarrage sans proxy"
  fi
  cd /app
fi

exec node --experimental-strip-types worker/index.js
