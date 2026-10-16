#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
PORT="${PORT:-3000}"

if ! curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  if [ ! -d node_modules ]; then
    echo "Run npm install in $ROOT first" >&2
    exit 1
  fi
  if [ -f dist/client/index.html ]; then
    nohup npm run start:server >> logs/monjtv.log 2>&1 &
  else
    nohup npm start >> logs/monjtv.log 2>&1 &
  fi
  ready=0
  for _ in $(seq 1 240); do
    if curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
      ready=1
      break
    fi
    sleep 0.5
  done
  if [ "$ready" -ne 1 ]; then
    echo "monjTV did not start. See $ROOT/logs/monjtv.log" >&2
    exit 1
  fi
fi

if command -v xdg-open >/dev/null; then
  xdg-open "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 || true
elif command -v open >/dev/null; then
  open "http://127.0.0.1:${PORT}/"
fi

curl -sf -X POST "http://127.0.0.1:${PORT}/api/player/start" >/dev/null || true
