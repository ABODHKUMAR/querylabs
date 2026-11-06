#!/usr/bin/env bash
# Runs ON the VM (copied by GitHub Actions / local deploy).
# Installs Docker if needed, pulls latest code, rebuilds compose stack.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/querylab}"
GIT_BRANCH="${GIT_BRANCH:-master}"
REPO_URL="${REPO_URL:-https://github.com/ABODHKUMAR/querylabs.git}"

echo "[INFO] Ensuring Docker + git are installed..."
if ! command -v docker >/dev/null 2>&1; then
  sudo dnf install -y docker git
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER" || true
fi

# Small EC2 instances OOM during frontend vite builds without swap.
if [ ! -f /swapfile ]; then
  echo "[INFO] Creating 4G swapfile..."
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
elif ! swapon --show | grep -q '/swapfile'; then
  sudo swapon /swapfile || true
fi

if ! sudo docker compose version >/dev/null 2>&1; then
  echo "[INFO] Installing Docker Compose plugin..."
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL \
    "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo "[INFO] Preparing deploy directory: $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo chown "$USER:$USER" "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

if [ ! -d .git ]; then
  echo "[INFO] Cloning $REPO_URL ..."
  git clone "$REPO_URL" .
fi

echo "[INFO] Pulling latest code ($GIT_BRANCH)..."
git remote set-url origin "$REPO_URL" || true
git fetch origin
git checkout "$GIT_BRANCH"
git reset --hard "origin/$GIT_BRANCH"

if ! ls .env.* >/dev/null 2>&1; then
  echo "[WARN] No .env.* files found in $DEPLOY_DIR"
  echo "[WARN] Copy env files onto the VM before the stack can start cleanly."
fi

echo "[INFO] Rebuilding and starting services..."
sudo docker compose down --remove-orphans || true
sudo docker compose up --build -d

echo "[INFO] Container status:"
sudo docker compose ps
echo "[INFO] Remote deploy finished."
