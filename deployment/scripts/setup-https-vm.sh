#!/usr/bin/env bash
# Install nginx + Let's Encrypt on the Query Labs VM and terminate TLS.
# Usage (on VM as root/sudo): DOMAIN=3.109.189.178.sslip.io EMAIL=you@example.com ./setup-https-vm.sh
set -euo pipefail

DOMAIN="${DOMAIN:-3.109.189.178.sslip.io}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
CONF_SRC="${CONF_SRC:-/opt/querylab/deployment/nginx/querylabs.conf}"
CONF_DST="/etc/nginx/conf.d/querylabs.conf"

echo "[https] domain=${DOMAIN} email=${EMAIL}"

if ! command -v nginx >/dev/null 2>&1; then
  echo "[https] installing nginx..."
  sudo dnf install -y nginx
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "[https] installing certbot..."
  sudo dnf install -y certbot python3-certbot-nginx
fi

if [[ -f "$CONF_SRC" ]]; then
  # Ensure server_name matches DOMAIN
  tmp=$(mktemp)
  sed "s/server_name .*/server_name ${DOMAIN};/" "$CONF_SRC" > "$tmp"
  sudo cp "$tmp" "$CONF_DST"
  rm -f "$tmp"
else
  echo "[https] missing $CONF_SRC" >&2
  exit 1
fi

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "[https] requesting certificate (HTTP-01)..."
sudo certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  --redirect

sudo nginx -t
sudo systemctl reload nginx

echo "[https] done — try: https://${DOMAIN}"
curl -sI "https://${DOMAIN}" | head -n 5 || true
