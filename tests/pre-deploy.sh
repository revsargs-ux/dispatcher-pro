#!/bin/bash
# Pre-deploy E2E test runner
set -e
cd "$(dirname "$0")"
export NODE_PATH=/home/n8n/.npm-global/lib/node_modules
echo "=== Pre-deploy E2E Test ==="
node run.js --quick
EOF
