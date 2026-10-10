"""Run the real backend with an in-memory Firestore and a debug dump endpoint.

QA_FAKE_ADMIN=1 accepts any Firebase ID token as owner@309.so (dashboard QA only).
QA_NOTES=1 loads the fake Obsidian notes in qa/e2e/notes/309-persona as private notes.
QA_CLAUDE=1 adds Claude as the last fallback, pointed at fake_llm.py's /v1/messages.
"""
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
os.environ.update(
    OPENAI_BASE_URL="http://127.0.0.1:11500/v1", OPENAI_API_KEY="x",
    FIREBASE_CREDENTIALS_PATH="", FIREBASE_CREDENTIALS_JSON="",
    # Never the real Claude API from QA, even when the shell has a key.
    ANTHROPIC_API_KEY="", ANTHROPIC_BASE_URL="",
)
if os.environ.get("QA_CLAUDE") == "1":
    os.environ.update(ANTHROPIC_API_KEY="qa-key", ANTHROPIC_BASE_URL="http://127.0.0.1:11500")
if os.environ.get("QA_NOTES") == "1":
    os.environ.update(NOTES_DIR=str(Path(__file__).resolve().parent / "notes"), NOTES_SUBDIR="309-persona")

from tests.fake_firestore import FakeFirestore  # noqa: E402

FAKE = FakeFirestore()
import app.core.firebase as fb  # noqa: E402

fb.get_firestore_client = lambda: FAKE
import app.main as main_mod  # noqa: E402
from app.core import auth as core_auth  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services import conversation_service, visitor_service  # noqa: E402

main_mod.get_firestore_client = visitor_service.get_firestore_client = conversation_service.get_firestore_client = lambda: FAKE

if os.environ.get("QA_FAKE_ADMIN") == "1":
    core_auth.auth.verify_id_token = lambda _token: {"email": "owner@309.so", "email_verified": True}
    settings.admin_allowed_emails = ["owner@309.so"]


@app.get("/__debug/db")
def dump():
    return json.loads(json.dumps(FAKE.data, default=str, ensure_ascii=False))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
