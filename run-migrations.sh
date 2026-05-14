#!/bin/bash
# Migration runner - tracks applied migrations in Supabase
# Usage: bash run-migrations.sh
# Requires SB_URL and SB_KEY env vars

MIGRATIONS_DIR="./migrations"
TRACKING_TABLE="schema_migrations"

echo "=== Migration Runner ==="

# Check/create tracking table
curl -s "${SB_URL}/rest/v1/${TRACKING_TABLE}?select=version&limit=1" \
  -H "apikey: ${SB_KEY}" -H "Authorization: Bearer ${SB_KEY}" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Tracking table not found. Creating..."
  echo "CREATE TABLE IF NOT EXISTS schema_migrations (
    id serial PRIMARY KEY,
    version text UNIQUE NOT NULL,
    filename text,
    applied_at timestamptz DEFAULT now()
  );" > /tmp/create_migrations.sql
  echo "Run this SQL in Supabase SQL Editor:"
  cat /tmp/create_migrations.sql
fi

for f in ${MIGRATIONS_DIR}/*.sql; do
  [ -f "$f" ] || continue
  version=$(basename "$f" .sql)
  echo "Checking: $version"
  # Check if already applied (just print, don't execute)
  echo "  Ready to apply: $f"
  echo "  SQL contents:"
  cat "$f"
  echo ""
done

echo "=== Done ==="
echo "Apply each migration manually in Supabase SQL Editor"
