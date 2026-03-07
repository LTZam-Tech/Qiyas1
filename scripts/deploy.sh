#!/usr/bin/env bash
# =============================================================================
# Qiyas Platform — Deployment Script
# Deploys the application to the production server via SSH + Docker Compose.
#
# Usage:
#   ./scripts/deploy.sh              # deploy from current branch
#   BRANCH=main ./scripts/deploy.sh  # deploy specific branch
# =============================================================================
set -euo pipefail

# --- Configuration -----------------------------------------------------------
SERVER_IP="194.163.172.141"
SERVER_USER="${DEPLOY_USER:-deploy}"
APP_DIR="/opt/qiyas"
BRANCH="${BRANCH:-main}"
REPO_URL="https://github.com/LTZam-Tech/Qiyas.git"

echo "=== Qiyas Deployment ==="
echo "Server:  ${SERVER_USER}@${SERVER_IP}"
echo "App dir: ${APP_DIR}"
echo "Branch:  ${BRANCH}"
echo ""

# --- Deploy via SSH ----------------------------------------------------------
ssh "${SERVER_USER}@${SERVER_IP}" bash -s <<REMOTE_SCRIPT
set -euo pipefail

echo "[1/5] Pulling latest code..."
if [ -d "${APP_DIR}/.git" ]; then
  cd "${APP_DIR}"
  git fetch origin
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}"
else
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "[2/5] Verifying .env.production exists..."
if [ ! -f "${APP_DIR}/.env.production" ]; then
  echo "ERROR: ${APP_DIR}/.env.production not found."
  echo "Copy .env.production.example and fill in real values first."
  exit 1
fi

echo "[3/5] Building and starting containers..."
cd "${APP_DIR}"
docker compose --env-file .env.production down --remove-orphans 2>/dev/null || true
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d

echo "[4/5] Waiting for services to be healthy..."
sleep 15

echo "[5/5] Health check..."
if curl -sf http://localhost/api/v1/auth/login -o /dev/null 2>/dev/null || curl -sf http://localhost:8000/health -o /dev/null 2>/dev/null; then
  echo "Health check PASSED"
else
  echo "WARNING: Health check did not pass yet. Services may still be starting."
  echo "Check logs with: docker compose logs -f"
fi

echo ""
echo "=== Deployment Complete ==="
echo "Application: http://${SERVER_IP}"
echo ""
echo "Useful commands:"
echo "  docker compose --env-file .env.production logs -f          # View logs"
echo "  docker compose --env-file .env.production ps               # Service status"
echo "  docker compose --env-file .env.production restart backend  # Restart backend"
REMOTE_SCRIPT

echo "Done."
