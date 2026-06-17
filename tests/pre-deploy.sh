#!/bin/bash
# Pre-deploy E2E test hook
# Runs quick E2E tests (auth + shift-lifecycle + security) before allowing deploy

set -e

cd /home/n8n/dispatcher-deploy/tests

echo "🧪 Running E2E tests (quick mode)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

NODE_PATH=/home/n8n/.npm-global/lib/node_modules node run.js --quick
EXIT=$?

if [ $EXIT -ne 0 ]; then
  echo ""
  echo "❌ E2E FAILED — deploy aborted"
  echo "Check report: /home/n8n/dispatcher-deploy/tests/report.md"
  exit 1
fi

echo ""
echo "✅ E2E PASSED — deploy allowed"
exit 0
