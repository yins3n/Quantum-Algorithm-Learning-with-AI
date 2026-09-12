#!/usr/bin/env sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

if [ ! -x ".venv/bin/uvicorn" ]; then
  echo "Missing .venv/bin/uvicorn. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

if ! curl -sf "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
  echo "Ollama is not running at $OLLAMA_URL. Start it (e.g. systemctl start ollama) and pull the model:" >&2
  echo "  ollama pull granite3.2:8b" >&2
  exit 1
fi

if curl -sf "http://localhost:$BACKEND_PORT/health/ready" > /dev/null 2>&1; then
  echo "Backend already running on :$BACKEND_PORT"
else
  LOG=/tmp/quantum-backend.log
  setsid nohup .venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port "$BACKEND_PORT" > "$LOG" 2>&1 < /dev/null &
  echo "Starting backend on :$BACKEND_PORT (logs: $LOG)"
fi

if curl -sf "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
  echo "Frontend already running on :$FRONTEND_PORT"
else
  LOG=/tmp/quantum-frontend.log
  setsid nohup npm run dev -- --host > "$LOG" 2>&1 < /dev/null &
  echo "Starting frontend on :$FRONTEND_PORT (logs: $LOG)"
fi

echo "API docs:  http://localhost:$BACKEND_PORT/docs"
echo "Frontend:  http://localhost:$FRONTEND_PORT"