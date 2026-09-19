#!/usr/bin/env bash
set -euo pipefail

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ADMIN_PASSWORD is not set."
  echo "Use: ADMIN_PASSWORD='your_admin_password_here' ./start.sh"
  echo "Or: ADMIN_PASSWORD='your_admin_password_here' npm start"
  exit 1
fi

node server.js
