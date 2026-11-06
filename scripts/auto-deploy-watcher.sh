#!/usr/bin/env bash
# Poll origin/master and redeploy when a new commit appears.
# Intended to run on the VM via systemd timer (GitHub Actions backup).
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/querylab}"
GIT_BRANCH="${GIT_BRANCH:-master}"
LOCK_FILE="${LOCK_FILE:-/tmp/querylab-auto-deploy.lock}"
LOG_TAG="querylab-auto-deploy"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [$LOG_TAG] $*"; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another deploy is running; skipping"
  exit 0
fi

cd "$DEPLOY_DIR"

git fetch origin "$GIT_BRANCH" --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$GIT_BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  log "Already up to date ($LOCAL)"
  exit 0
fi

log "New commit detected: $LOCAL -> $REMOTE"
export DEPLOY_DIR GIT_BRANCH
export REPO_URL="${REPO_URL:-https://github.com/ABODHKUMAR/querylabs.git}"
bash "$DEPLOY_DIR/scripts/remote-deploy.sh"
log "Deploy finished for $REMOTE"
