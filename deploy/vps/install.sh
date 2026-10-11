#!/usr/bin/env bash
# Provisions the Publisle API endpoint on a fresh Debian/Ubuntu VPS (OVH).
# Usage: sudo ./install.sh
# Prereqs: DNS A/AAAA record api.publisle.xyz -> this server; ports 22/80/443 open.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

APP_DIR=/opt/publisle-api
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ufw

echo "==> Node.js 24"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi
node --version

echo "==> Caddy (official repo)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "==> Service user and app files"
id -u publisle >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin publisle
install -d -o publisle -g publisle "$APP_DIR"
install -o publisle -g publisle -m 0644 "$SCRIPT_DIR/server.mjs" "$APP_DIR/server.mjs"
install -m 0644 "$SCRIPT_DIR/publisle-api.service" /etc/systemd/system/publisle-api.service
install -m 0644 "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile

echo "==> Firewall (ufw)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
yes | ufw enable >/dev/null || true

echo "==> Start services"
systemctl daemon-reload
systemctl enable --now publisle-api.service
systemctl reload caddy 2>/dev/null || systemctl restart caddy

sleep 1
curl -fsS http://127.0.0.1:8787/health
echo
curl -fsS "https://api.publisle.xyz/health" || echo "(public URL not ready yet — check DNS/ports)"
echo "==> Done. Flip PDF_ENABLED=true in the unit when the PDF service ships."
