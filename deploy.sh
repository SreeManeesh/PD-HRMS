#!/bin/bash
# ============================================================
#  PD_HRMS — Deployment Script
#  Usage:
#    ./deploy.sh              -> pull latest + rebuild + restart
#    ./deploy.sh --skip-pull  -> rebuild/restart only
#    ./deploy.sh --logs       -> tail api+frontend logs after deploy
# ============================================================
set -e
cd /home/deploy/PD_HRMS

echo "==> [1/5] Pulling latest code from GitHub..."
if [ "$1" != "--skip-pull" ]; then
  git pull origin main
else
  echo "    (skipped)"
fi

echo "==> [2/5] Validating docker-compose.yml..."
docker compose config --quiet || { echo "❌ YAML BROKEN — fix before deploying!"; exit 1; }
echo "    YAML OK"

echo "==> [3/5] Building frontend..."
cd frontend
npm ci
npm run build
cd ..

echo "==> [4/5] Rebuilding + restarting containers..."
docker compose up -d --build api
docker compose restart frontend

echo "==> [5/5] Health checks..."
sleep 5
HEALTH=$(curl -s http://localhost:1007/api/health || true)
echo "$HEALTH"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✅ DEPLOY SUCCESS — https://app.hrms.protecciodata.co.in"
else
  echo "❌ Health check FAILED — run: docker compose logs -f api"
  exit 1
fi

if [ "$1" == "--logs" ]; then
  docker compose logs -f api frontend
fi
