#!/bin/bash
# Dispatcher.PRO Supabase Backup Script
# Runs daily via cron, keeps last 30 days

ENV_FILE="$(dirname "$0")/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi
SB_URL="${SB_URL:-}"
SB_KEY="${SB_KEY:-}"
if [ -z "$SB_URL" ] || [ -z "$SB_KEY" ]; then
  echo "ERROR: SB_URL and SB_KEY must be set in environment"; exit 1
fi
# Validate SB_KEY; fall back to SERVICE_ROLE_KEY if unregistered
probe=$(curl -s -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" "$SB_URL/rest/v1/users?select=id&limit=1")
case "$probe" in *"Unregistered API key"*|*"error"*|*"message"*)
  if [ -n "${SERVICE_ROLE_KEY:-}" ]; then
    echo "NOTE: SB_KEY invalid, using SERVICE_ROLE_KEY"
    SB_KEY="$SERVICE_ROLE_KEY"
  fi;; esac
BACKUP_DIR="/home/n8n/dispatcher-deploy/backups"
DATE=$(date +%Y-%m-%d_%H%M)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.json"

# Tables to backup
TABLES="users workers clients shifts shift_assignments shift_requirements service_types payments"

mkdir -p "$BACKUP_DIR"

echo "[$DATE] Starting backup..."

# Start JSON object
echo "{" > "$BACKUP_FILE"

FIRST=true
for TABLE in $TABLES; do
  DATA=$(curl -s -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" "$SB_URL/rest/v1/$TABLE?select=*&limit=10000")
  
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> "$BACKUP_FILE"
  fi
  
  echo "\"$TABLE\": $DATA" >> "$BACKUP_FILE"
  COUNT=$(echo "$DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 'ERROR')" 2>/dev/null)
  echo "  $TABLE: $COUNT records"
done

echo "}" >> "$BACKUP_FILE"

# Compress
gzip -f "$BACKUP_FILE"

SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "[$DATE] Backup done: ${BACKUP_FILE}.gz ($SIZE)"

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "backup_*.json.gz" -mtime +30 -delete
echo "[$DATE] Old backups cleaned"
