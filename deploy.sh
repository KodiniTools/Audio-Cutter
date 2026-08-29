#!/usr/bin/env bash
# deploy.sh — Ein-Kommando-Deploy fuer den Audio-Cutter auf dem VPS.
#
# Auf dem Server (als root) aus der Repo-Wurzel ausfuehren:
#   cd /opt/audio-cutter
#   bash deploy.sh                # pull + Frontend bauen/ausliefern; Backend nur bei Bedarf
#
# Optionen:
#   bash deploy.sh --no-pull      # ohne git pull (lokalen Stand deployen)
#   bash deploy.sh --backend      # Backend-Deploy/Reload erzwingen
#   bash deploy.sh --frontend     # nur Frontend, Backend nie anfassen
#
# WANN wird das Backend neu gestartet?
#   - NUR wenn sich Dateien unter server/ geaendert haben (index.js, package.json,
#     ecosystem.config.cjs) — oder mit --backend erzwungen.
#   - Reine Frontend-Aenderungen (src/, Komponenten, i18n, Styles) brauchen KEINEN
#     Backend-Restart: der Node-Dienst liefert nur die API, nicht die SPA.

set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WEB_ROOT="${WEB_ROOT:-/var/www/kodinitools.com/audio-cutter}"

DO_PULL=1
FORCE_BACKEND=0
FRONTEND_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    --backend) FORCE_BACKEND=1 ;;
    --frontend) FRONTEND_ONLY=1 ;;
    *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Audio-Cutter Deploy  (Web-Root: $WEB_ROOT)"

# --- 1) Code aktualisieren --------------------------------------------------
OLD_REV="$(git rev-parse HEAD)"
if [ "$DO_PULL" = "1" ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  echo "==> git pull (Branch: $BRANCH)"
  git pull --ff-only origin "$BRANCH"
fi
NEW_REV="$(git rev-parse HEAD)"

# Hat sich unter server/ etwas geaendert?
backend_changed() {
  [ "$OLD_REV" != "$NEW_REV" ] && [ -n "$(git diff --name-only "$OLD_REV" "$NEW_REV" -- server/)" ]
}

# --- 2) Frontend bauen + ausliefern ----------------------------------------
echo "==> Frontend: npm install + build"
npm install
npm run build

mkdir -p "$WEB_ROOT"
# Alte gehashte Assets + index.html entfernen, damit nichts Veraltetes zurueckbleibt.
rm -rf "$WEB_ROOT/assets" "$WEB_ROOT/index.html"
cp -r dist/* "$WEB_ROOT/"
echo "==> Frontend ausgeliefert nach $WEB_ROOT"

# --- 3) Backend nur bei Bedarf ---------------------------------------------
if [ "$FRONTEND_ONLY" = "1" ]; then
  echo "==> --frontend gesetzt -> Backend wird nicht angefasst."
elif [ "$FORCE_BACKEND" = "1" ] || backend_changed; then
  if [ "$FORCE_BACKEND" = "1" ]; then
    echo "==> Backend-Deploy erzwungen (--backend)."
  else
    echo "==> Aenderungen unter server/ erkannt -> Backend-Deploy/Reload."
  fi
  bash deploy/deploy-backend.sh
else
  echo "==> Backend unveraendert -> kein Restart noetig."
fi

echo "==> Deploy fertig."
