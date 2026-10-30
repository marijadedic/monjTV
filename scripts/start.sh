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

health() {
  curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1
}

note() {
  if [ "$(uname -s)" = "Darwin" ]; then
    osascript -e "display notification \"$1\" with title \"monjTV\"" >/dev/null 2>&1 || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name=monjTV "monjTV" "$1" >/dev/null 2>&1 || true
  fi
}

fail() {
  echo "$1" >&2
  note "$1"
  exit 1
}

# Processes listening on PORT, one pid per line.
listener_pids() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  fi
  if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
    pids="$(ss -H -ltnp "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' || true)"
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "${PORT}" 2>/dev/null || true)"
  fi
  printf '%s\n' $pids | awk 'NF && !seen[$0]++'
}

children_of() {
  if [ "$(uname -s)" = "Darwin" ]; then
    ps -ax -o pid=,ppid= 2>/dev/null | awk -v p="$1" '$2 == p { print $1 }'
  else
    ps -o pid= --ppid "$1" 2>/dev/null | awk '{ print $1 }'
  fi
}

# Child processes under a pid, deepest first, so mpv stops with the server.
subtree_pids() {
  local child
  while IFS= read -r child; do
    [ -n "$child" ] || continue
    subtree_pids "$child"
    printf '%s\n' "$child"
  done < <(children_of "$1")
}

# Stop whatever is already serving this port so the next process loads new code.
stop_server() {
  health || return 0
  local pid pids=""
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    pids="$pids $(subtree_pids "$pid") $pid"
  done < <(listener_pids)
  pids="$(printf '%s\n' $pids | awk 'NF && !seen[$0]++' | tr '\n' ' ')"
  if [ -z "${pids// /}" ]; then
    fail "monjTV is running on port ${PORT}, but its process was not found."
  fi
  echo "stopping ${pids}" >> logs/monjtv.log
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  local _
  for _ in $(seq 1 40); do
    health || return 0
    sleep 0.25
  done
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  for _ in $(seq 1 20); do
    health || return 0
    sleep 0.25
  done
  fail "monjTV on port ${PORT} did not stop. See ${ROOT}/logs/monjtv.log"
}

if [ ! -d node_modules ]; then
  fail "Run npm install in ${ROOT} first"
fi

echo "---- $(date) build ----" >> logs/monjtv.log
note "Building the latest changes…"
if ! npm run build >> logs/monjtv.log 2>&1; then
  fail "monjTV build failed. See ${ROOT}/logs/monjtv.log"
fi

stop_server
spawn_server npm run start:server
ready=0
for _ in $(seq 1 60); do
  if health; then
    ready=1
    break
  fi
  sleep 0.5
done
if [ "$ready" -ne 1 ]; then
  fail "monjTV did not start. See ${ROOT}/logs/monjtv.log"
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
  # xdg-open can wait on the browser it starts. Leave that window and exit.
  xdg-open "$ui" >/dev/null 2>&1 &
  disown || true
fi
