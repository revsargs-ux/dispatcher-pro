#!/bin/bash
# Dispatcher.PRO Source File Backup
# Creates timestamped backup of all source files, keeps last 5
set -euo pipefail

DEPLOY_DIR="/home/n8n/dispatcher-deploy"
BACKUP_DIR="$DEPLOY_DIR/backups/source"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/source_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Creating source backup..."

tar -czf "$BACKUP_FILE" \
  -C "$DEPLOY_DIR" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='backups' \
  --exclude='data' \
  --exclude='*.bak' \
  --exclude='*.bak.*' \
  --exclude='notifications.json' \
  --exclude='monitor.log' \
  server.js index.html worker.html owner.html client.html \
  package.json package-lock.json manifest.json sw.js push-client.js \
  modules/ notifications-module/ receipts/ test/ tests/ \
  Dockerfile docker-compose.yml backup.sh deploy.sh backup-source.sh \
  2>/dev/null || true

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup] Done: $BACKUP_FILE ($SIZE)"

# Keep last 5 backups, delete older
cd "$BACKUP_DIR"
COUNT=$(ls -1 source_*.tar.gz 2>/dev/null | wc -l)
if [ "$COUNT" -gt 5 ]; then
  DELETE_COUNT=$((COUNT - 5))
  ls -1t source_*.tar.gz | tail -n "$DELETE_COUNT" | xargs rm -f
  echo "[backup] Cleaned $DELETE_COUNT old backup(s)"
fi

echo "[backup] Current backups: $(ls -1 source_*.tar.gz 2>/dev/null | wc -l)"
