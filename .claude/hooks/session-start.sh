#!/bin/bash
# Installs frontend and backend dependencies in Claude Code cloud sessions
# so lint, build and tests can run right away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
export PATH="$HOME/.local/bin:$PATH"

# Frontend: npm install (not ci) so the cached node_modules is reused.
(cd frontend && npm install --no-audit --no-fund --loglevel=error) >&2

# Backend: uv builds backend/.venv from uv.lock with the Python in backend/.python-version.
if command -v uv >/dev/null 2>&1; then
  (cd backend && uv sync --frozen --quiet) >&2
else
  # Fallback without uv: runtime deps from the exported requirements.txt plus test tools.
  [ -x backend/.venv/bin/python ] || python3 -m venv backend/.venv
  backend/.venv/bin/pip install --quiet --disable-pip-version-check -r backend/requirements.txt pytest ruff >&2
fi

echo "Dependencies ready: frontend/node_modules, backend/.venv ($(backend/.venv/bin/python --version))"
