#!/bin/sh
set -e

echo "[start] Starting Omnibus backend on port ${BACKEND_PORT:-8686}..."
node /app/backend/dist/index.js &
BACKEND_PID=$!

# Give backend a moment to start, then verify it is still running
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "[start] ERROR: backend process exited unexpectedly. Check logs above."
  exit 1
fi

PLACEHOLDER="/__OMNIBUS_BASE_PATH__"
ACTUAL_BASE="${BASE_PATH:-}"
echo "[start] Setting base path: '${ACTUAL_BASE:-/}'"
find /app/frontend-server/frontend/.next -type f \( -name "*.js" -o -name "*.json" -o -name "*.html" -o -name "*.rsc" -o -name "*.body" \) \
  | xargs sed -i "s|${PLACEHOLDER}|${ACTUAL_BASE}|g"
sed -i "s|${PLACEHOLDER}|${ACTUAL_BASE}|g" /app/frontend-server/frontend/server.js

echo "[start] Starting Omnibus frontend on port ${PORT:-8080}..."
exec env PORT="${PORT:-8080}" HOSTNAME=0.0.0.0 node /app/frontend-server/frontend/server.js
