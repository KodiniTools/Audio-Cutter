#!/usr/bin/env bash
# deploy/deploy-backend.sh
# Richtet das Audio-Cutter-Backend auf dem VPS ein und startet es unter PM2.
#
# Auf dem Server ausfuehren (als root), aus dem geklonten Repo heraus:
#   cd /pfad/zum/Audio-Cutter
#   bash deploy/deploy-backend.sh
#
# Idempotent: kann gefahrlos mehrfach laufen (start ODER reload).

set -euo pipefail

TARGET_DIR="${TARGET_DIR:-/var/www/kodinitools.com/audio-cutter-api}"
APP_NAME="audio-cutter-api"

# Verzeichnis dieses Skripts -> Repo-Wurzel -> server/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"

echo "==> Audio-Cutter Backend Deploy"
echo "    Quelle: $SERVER_DIR"
echo "    Ziel:   $TARGET_DIR"

# 1) Voraussetzungen pruefen ------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "!! ffmpeg fehlt. Installiere es mit:  sudo apt-get install -y ffmpeg" >&2
  exit 1
fi
if ! command -v ffprobe >/dev/null 2>&1; then
  echo "!! ffprobe fehlt (Teil des ffmpeg-Pakets). Installiere:  sudo apt-get install -y ffmpeg" >&2
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "!! pm2 fehlt. Installiere es mit:  npm install -g pm2" >&2
  exit 1
fi
echo "==> ffmpeg/ffprobe/pm2 vorhanden."

# 2) Dateien ins Zielverzeichnis kopieren -----------------------------------
mkdir -p "$TARGET_DIR"
cp "$SERVER_DIR/index.js"             "$TARGET_DIR/"
cp "$SERVER_DIR/package.json"         "$TARGET_DIR/"
cp "$SERVER_DIR/ecosystem.config.cjs" "$TARGET_DIR/"
echo "==> Dateien kopiert."

# 3) Produktions-Dependencies installieren ----------------------------------
cd "$TARGET_DIR"
npm install --omit=dev
echo "==> npm install (prod) fertig."

# 4) PM2: starten oder neu laden --------------------------------------------
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "==> $APP_NAME laeuft bereits -> reload."
  pm2 reload ecosystem.config.cjs --update-env
else
  echo "==> $APP_NAME noch nicht vorhanden -> start."
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "==> PM2 gespeichert."

# 5) Healthcheck ------------------------------------------------------------
sleep 1
echo "==> Healthcheck (127.0.0.1:9016/health):"
if curl -fsS http://127.0.0.1:9016/health; then
  echo
  echo "==> OK. Backend laeuft."
else
  echo
  echo "!! Healthcheck fehlgeschlagen. Logs:  pm2 logs $APP_NAME --lines 50" >&2
  exit 1
fi
