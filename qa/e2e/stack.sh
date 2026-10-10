#!/bin/bash
# Local QA stack: fake LLM (11500) + backend with in-memory Firestore (8000) + vite preview (4173).
# usage: qa/e2e/stack.sh build | build-admin | start | stop | restart
# Env passed through to the backend: ANSWER_PIPELINE=direct, QA_FAKE_ADMIN=1.
set -u
QA="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$QA/../.." && pwd)"
FE="$ROOT/frontend"
PY="$ROOT/backend/.venv/bin/python"
LOGS="$QA/.logs"
mkdir -p "$LOGS"

stop() {
  pkill -f "[f]ake_llm.py"; pkill -f "[r]un_backend.py"; pkill -f "[v]ite.*preview"; sleep 1
}

wait_url() {
  for _ in $(seq 1 60); do curl -sf -o /dev/null "$1" && return 0; sleep 0.5; done
  echo "timeout waiting for $1"; return 1
}

start() {
  (cd "$QA" && setsid nohup "$PY" fake_llm.py > "$LOGS/fake_llm.log" 2>&1 < /dev/null &)
  (cd "$QA" && setsid nohup "$PY" run_backend.py > "$LOGS/backend.log" 2>&1 < /dev/null &)
  (cd "$FE" && setsid nohup "$FE/node_modules/.bin/vite" preview --host 127.0.0.1 --port 4173 --strictPort > "$LOGS/preview.log" 2>&1 < /dev/null &)
  wait_url http://127.0.0.1:11500/__calls && wait_url http://127.0.0.1:8000/health && wait_url http://127.0.0.1:4173/persona && echo "stack up"
}

case "${1:-}" in
  build) (cd "$FE" && VITE_API_BASE_URL=http://127.0.0.1:8000/api npm run build) ;;
  # Dashboard QA: Firebase config that only points at the faked Auth REST responses in e2e_admin.cjs.
  build-admin) (cd "$FE" && VITE_API_BASE_URL=http://127.0.0.1:8000/api VITE_FIREBASE_API_KEY=qa-key \
    VITE_FIREBASE_AUTH_DOMAIN=qa-project.firebaseapp.com VITE_FIREBASE_PROJECT_ID=qa-project \
    VITE_FIREBASE_APP_ID=1:1:web:qa npm run build) ;;
  start) start ;;
  stop) stop; echo "stack down" ;;
  restart) stop; start ;;
  *) echo "usage: $0 build | build-admin | start | stop | restart"; exit 1 ;;
esac
