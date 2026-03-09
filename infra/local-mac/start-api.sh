#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_DIR="$HOME/Library/Logs/309persona"
PID_FILE="$ROOT_DIR/.run/local-api.pid"

mkdir -p "$LOG_DIR" "$ROOT_DIR/.run"
cd "$BACKEND_DIR"

if [[ ! -f .env.local ]]; then
  cp env.sample .env.local
fi

python3 - <<'PY'
from pathlib import Path
p = Path('.env.local')
lines = p.read_text().splitlines()
out = []
for line in lines:
    if line.startswith('ALLOWED_ORIGINS=') or line.startswith('ADMIN_ALLOWED_EMAILS='):
        key, val = line.split('=',1)
        val = val.strip()
        if val and not val.startswith('['):
            parts = [x.strip() for x in val.split(',') if x.strip()]
            line = key + '=' + '[' + ','.join(f'"{x}"' for x in parts) + ']'
    if line.startswith('OPENAI_MODEL=') and 'qwen3.5' in line:
        line = 'OPENAI_MODEL=qwen3:32b'
    if line.startswith('OPENAI_FALLBACK_MODEL=') and 'qwen3.5' in line:
        line = 'OPENAI_FALLBACK_MODEL=qwen3:32b'
    out.append(line)
p.write_text('\n'.join(out) + '\n')
PY

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "API already running (pid $(cat "$PID_FILE"))"
  exit 0
fi

source .venv/bin/activate

nohup uvicorn app.main:app --env-file .env.local --host 0.0.0.0 --port 8000 > "$LOG_DIR/api.stdout.log" 2> "$LOG_DIR/api.stderr.log" &
echo $! > "$PID_FILE"
echo "Started API (pid $(cat "$PID_FILE"))"
