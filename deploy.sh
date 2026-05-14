#!/bin/bash
# Dispatcher.PRO CI/CD Deploy Script
# Usage: ./deploy.sh [--skip-backup] [--skip-tests]
set -euo pipefail

DEPLOY_DIR="/home/n8n/dispatcher-deploy"
cd "$DEPLOY_DIR"

SKIP_BACKUP=false
SKIP_TESTS=false
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=true ;;
    --skip-tests)  SKIP_TESTS=true ;;
  esac
done

echo "========================================="
echo " Dispatcher.PRO Deploy - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# --- Backup ---
if [ "$SKIP_BACKUP" = false ]; then
  echo ""
  echo "[1/6] Running backup..."
  bash "$DEPLOY_DIR/backup-source.sh"
else
  echo ""
  echo "[1/6] Backup skipped (--skip-backup)"
fi

# --- Git pull ---
echo ""
echo "[2/6] Pulling latest code..."
if [ -d ".git" ]; then
  BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  git pull --ff-only 2>&1 || {
    echo "⚠️  Git pull failed or conflicts. Continuing with current code."
  }
  AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "  Updated: ${BEFORE:0:8} → ${AFTER:0:8}"
  else
    echo "  Already up to date (${BEFORE:0:8})"
  fi
else
  echo "  No git repo found, skipping."
fi

# --- Build ---
echo ""
echo "[3/6] Building Docker image..."
docker build -t n8n-dispatcher:latest -t n8n-dispatcher . 2>&1
echo "  ✓ Image built"

# --- Restart ---
echo ""
echo "[4/6] Restarting container..."
docker compose down 2>&1
docker compose up -d 2>&1
echo "  ✓ Container started"

# --- Health check ---
echo ""
echo "[5/6] Health check..."
HEALTH_OK=false
for i in $(seq 1 30); do
  if docker exec n8n-dispatcher-1 node -e "const h=require('http');h.get('http://localhost:8080/',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" 2>/dev/null; then
    HEALTH_OK=true
    echo "  ✓ Healthy (attempt $i)"
    break
  fi
  sleep 2
done

if [ "$HEALTH_OK" = false ]; then
  echo "  ✗ Health check FAILED after 60s"
  echo "  Showing last logs:"
  docker logs n8n-dispatcher-1 --tail 20
  exit 1
fi

# --- Tests ---
echo ""
echo "[6/6] Running API tests..."
if [ "$SKIP_TESTS" = true ]; then
  echo "  Skipped (--skip-tests)"
elif [ -d "tests" ] && [ -f "tests/test-api.js" ]; then
  # Copy tests into container and run
  docker cp tests n8n-dispatcher-1:/app/tests 2>&1
  if docker exec n8n-dispatcher-1 node tests/test-api.js 2>&1; then
    echo "  ✓ All tests passed"
  else
    echo "  ⚠️  Some tests failed (non-fatal)"
  fi
else
  echo "  No tests found, skipping."
fi

# --- Summary ---
echo ""
echo "========================================="
echo " Deploy Summary"
echo "========================================="
echo "  Container: n8n-dispatcher-1"
echo "  Status:    $(docker ps --filter name=n8n-dispatcher-1 --format '{{.Status}}' 2>/dev/null || echo 'unknown')"
echo "  Image:     $(docker inspect n8n-dispatcher-1 --format '{{.Image}}' 2>/dev/null | head -c 19 || echo 'unknown')"
echo "  Health:    $([ "$HEALTH_OK" = true ] && echo 'OK' || echo 'FAIL')"
echo "  Time:      $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
