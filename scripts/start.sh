#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs
export PATH="$ROOT/tools:$PATH"
PORT="${PORT:-3000}"

# Leave the desktop app's process. macOS ignores another click while that app is still running.
spawn_server() {
  (
    trap '' HUP
    set -m
    "$@" >> logs/monjtv.log 2>&1 < /dev/null &
    disown || true
    exit 0
  ) &
  wait $! || true
}

if ! curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  if [ ! -d node_modules ]; then
    echo "Run npm install in $ROOT first" >&2
    exit 1
  fi
  if [ -f dist/client/index.html ]; then
    spawn_server npm run start:server
  else
    spawn_server npm start
  fi
  ready=0
  for _ in $(seq 1 240); do
    if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
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

# A new query skips the browser's saved copy of Today. The hash changes with each UI build.
ui="http://127.0.0.1:${PORT}/"
asset="$(grep -o 'assets/index-[^"]*\.js' dist/client/index.html 2>/dev/null | head -n 1 || true)"
if [ -n "$asset" ]; then
  hash="${asset#assets/index-}"
  hash="${hash%.js}"
  ui="${ui}?v=${hash}"
fi
echo "opening ${ui}" >> logs/monjtv.log
if [ "$(uname -s)" = "Darwin" ]; then
  open "$ui"
elif command -v xdg-open >/dev/null; then
  xdg-open "$ui" >/dev/null 2>&1 || true
fi
