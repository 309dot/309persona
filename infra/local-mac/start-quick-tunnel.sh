#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/Library/Logs/309persona"
mkdir -p "$LOG_DIR"

echo "Starting Cloudflare quick tunnel to http://127.0.0.1:8000 ..."
cloudflared tunnel --url http://127.0.0.1:8000 2>&1 | tee "$LOG_DIR/cloudflared-quick.log"
