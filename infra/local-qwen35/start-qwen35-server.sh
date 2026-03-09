#!/usr/bin/env bash
set -euo pipefail

PORT="${QWEN35_PORT:-8011}"
MODEL_PATH="${QWEN35_MODEL_PATH:-}"
LOG_DIR="$HOME/Library/Logs/309persona"
PID_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.run/qwen35-server.pid"

if [[ -z "$MODEL_PATH" ]]; then
  echo "QWEN35_MODEL_PATH is not set"
  echo "Example: export QWEN35_MODEL_PATH=~/models/qwen3.5-14b-instruct-q4_k_m.gguf"
  exit 1
fi

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Model file not found: $MODEL_PATH"
  exit 1
fi

mkdir -p "$LOG_DIR" "$(dirname "$PID_FILE")"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "qwen3.5 server already running (pid $(cat "$PID_FILE"))"
  exit 0
fi

nohup llama-server \
  -m "$MODEL_PATH" \
  --host 0.0.0.0 \
  --port "$PORT" \
  -ngl 999 \
  -c 16384 \
  > "$LOG_DIR/qwen35-server.stdout.log" 2> "$LOG_DIR/qwen35-server.stderr.log" &

echo $! > "$PID_FILE"
echo "started qwen3.5 server pid=$(cat "$PID_FILE") port=$PORT"
