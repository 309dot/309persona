#!/usr/bin/env bash
set -euo pipefail

PORT="${QWEN35_PORT:-8011}"
PID_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.run/qwen35-server.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "running pid=$(cat "$PID_FILE")"
else
  echo "not running"
fi

curl -sS "http://127.0.0.1:$PORT/health" || true
