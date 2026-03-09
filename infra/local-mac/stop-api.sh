#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT_DIR/.run/local-api.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped API (pid $PID)"
else
  echo "Process not running (pid $PID)"
fi
rm -f "$PID_FILE"
