#!/bin/bash
set -e

mkdir -p /data
export MOSTLY_DB_PATH="${MOSTLY_DB_PATH:-/data/mostly.db}"

echo "Starting Mostly server..."
echo "  DB: $MOSTLY_DB_PATH"
echo "  Port: ${MOSTLY_PORT:-6080}"

exec node packages/server/dist/serve.js
