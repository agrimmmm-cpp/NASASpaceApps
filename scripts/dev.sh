#!/usr/bin/env bash
# Start backend (:8000) and frontend (:5173). Ctrl-C stops both. Refuses to start if a port is busy (R-35).
set -u
cd "$(dirname "$0")/.."

for port in 8000 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    if [ "$port" = 5173 ] && [ ! -f frontend/package.json ]; then continue; fi
    echo "Port $port is already in use. Stop whatever is using it (lsof -nP -iTCP:$port -sTCP:LISTEN) and retry." >&2
    exit 1
  fi
done

[ -x backend/.venv/bin/uvicorn ] || { echo "Backend not set up. Run: make setup" >&2; exit 1; }
[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

trap 'kill 0' INT TERM EXIT

(cd backend && .venv/bin/uvicorn main:app --reload --port 8000) &

if [ -f frontend/package.json ]; then
  (cd frontend && npm run dev) &
else
  echo "(no frontend/ yet - backend only)"
fi

wait
