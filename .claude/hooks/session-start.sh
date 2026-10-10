#!/bin/bash
# Installs frontend and backend dependencies in Claude Code cloud sessions
# so lint, build and smoke tests can run right away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Frontend: npm install (not ci) so the cached node_modules is reused.
(cd frontend && npm install --no-audit --no-fund --loglevel=error) >&2

# Backend: venv at backend/.venv, matching the Docker image's Python when available.
PY=python3.11
command -v "$PY" >/dev/null 2>&1 || PY=python3
if [ ! -x backend/.venv/bin/python ]; then
  "$PY" -m venv backend/.venv
fi
backend/.venv/bin/pip install --quiet --disable-pip-version-check -r backend/requirements.txt >&2

echo "Dependencies ready: frontend/node_modules, backend/.venv ($(backend/.venv/bin/python --version))"
