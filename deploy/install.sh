#!/usr/bin/env bash
# Install without Docker on Debian/Ubuntu. Run as root from the project folder.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run this script as root (sudo)."; exit 1; fi
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST=/opt/playroom

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "> Installing Node.js 22"
  apt-get update && apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id playroom >/dev/null 2>&1 || useradd --system --home "$DEST" --shell /usr/sbin/nologin playroom
mkdir -p "$DEST/data"
cp -r "$SRC/server.js" "$SRC/package.json" "$SRC/src" "$SRC/public" "$DEST/"
[ -f "$DEST/.env" ] || cp "$SRC/.env.example" "$DEST/.env"
chown -R playroom:playroom "$DEST"
chmod 600 "$DEST/.env"

cp "$SRC/deploy/playroom.service" /etc/systemd/system/playroom.service
systemctl daemon-reload
systemctl enable --now playroom

echo
echo "Playroom installed in $DEST"
echo "1. Setup code: journalctl -u playroom | grep -i 'setup code'"
echo "2. Open the site and create your account with that code"
echo "3. Logs: journalctl -u playroom -f"
echo "Site: http://$(hostname -I | awk '{print $1}'):8080"
