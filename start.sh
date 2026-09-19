#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  export ADMIN_PASSWORD='admin123'
fi

echo "Starting BNA app with ADMIN_PASSWORD=admin123"
node server.js
