#!/usr/bin/env bash
# deploy/deploy-backend.sh
# Richtet das Audio-Cutter-Backend auf dem VPS ein und startet es unter PM2.
# Laeuft in-place aus dem geklonten Repo (z. B. /opt/audio-cutter).
#
# Auf dem Server (als root) aus der Repo-Wurzel ausfuehren:
#   cd /opt/audio-cutter
#   git pull
#   bash deploy/deploy-backend.sh
#
# Idempotent: kann gefahrlos mehrfach laufen (start ODER reload).

set -euo pipefail

APP_NAME="audio-cutter-api"

# Verzeichnis dieses Skripts -> Repo-Wurzel -> server/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"

echo "==> Audio-Cutter Backend Deploy (in-place)"
echo "    Backend: $SERVER_DIR"

# 1) Voraussetzungen pruefen ------------------------------------------------
for bin in ffmpeg ffprobe pm2 node npm; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "!! $bin fehlt. Bitte installieren." >&2
    [ "$bin" = "ffmpeg" ] || [ "$bin" = "ffprobe" ] && echo "   sudo apt-get install -y ffmpeg" >&2
    [ "$bin" = "pm2" ] && echo "   npm install -g pm2" >&2
    exit 1
  fi
done
echo "==> ffmpeg/ffprobe/pm2/node/npm vorhanden."

# 2) Produktions-Dependencies installieren ----------------------------------
cd "$SERVER_DIR"
npm install --omit=dev
echo "==> npm install (prod) fertig."

# 3) PM2: starten oder neu laden --------------------------------------------
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "==> $APP_NAME laeuft bereits -> reload."
  pm2 reload ecosystem.config.cjs --update-env
else
  echo "==> $APP_NAME noch nicht vorhanden -> start."
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> PM2 gespeichert."

# 4) Healthcheck ------------------------------------------------------------
PORT="$(node -e "process.stdout.write(String(require('./ecosystem.config.cjs').apps[0].env.PORT))")"
sleep 1
echo "==> Healthcheck (127.0.0.1:$PORT/health):"
if curl -fsS "http://127.0.0.1:$PORT/health"; then
  echo
  echo "==> OK. Backend laeuft auf Port $PORT."
else
  echo
  echo "!! Healthcheck fehlgeschlagen. Logs:  pm2 logs $APP_NAME --lines 50" >&2
  exit 1
fi
