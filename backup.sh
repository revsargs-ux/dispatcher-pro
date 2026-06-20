#!/bin/bash
# Dispatcher.PRO Supabase Backup Script
# Runs daily via cron, keeps last 30 days

SB_URL="${SB_URL:-}"
SB_KEY="${SUPABASE_ANON_KEY:-}"
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
