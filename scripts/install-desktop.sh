#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/applications/monjtv.desktop"
mkdir -p "$(dirname "$TARGET")"
sed "s|__ROOT__|$ROOT|g" "$ROOT/scripts/monjtv.desktop" > "$TARGET"
chmod +x "$ROOT/scripts/start.sh"
echo "Installed $TARGET"
