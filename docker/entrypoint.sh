#!/bin/bash
set -e

mkdir -p /data
export MOSTLY_DB_PATH="${MOSTLY_DB_PATH:-/data/mostly.db}"

echo "Mostly Docker — starting up"
echo "  DB: $MOSTLY_DB_PATH"
echo "  Port: ${MOSTLY_PORT:-6080}"

# Seed demo data if requested
if [ "${MOSTLY_SEED_DEMO}" = "true" ]; then
  echo "Running demo seed..."
  node packages/server/dist/seed.js
fi

echo "Starting server..."
exec node packages/server/dist/serve.js
