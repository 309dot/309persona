#!/usr/bin/env bash
set -euo pipefail

PID_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.run/qwen35-server.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "stopped qwen3.5 server pid=$PID"
else
  echo "process not running pid=$PID"
fi
rm -f "$PID_FILE"
