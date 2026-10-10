"""Shared fixtures. Tests run without Firebase credentials or an LLM."""

import os

# Force the no-Firebase path even if .env.local holds real credentials,
# so tests never write to the production Firestore.
os.environ["FIREBASE_CREDENTIALS_PATH"] = ""
os.environ["FIREBASE_CREDENTIALS_JSON"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import auth as core_auth  # noqa: E402
from app.core import rate_limiter  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services.obsidian_notes import reset_notes  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    """Every test starts with empty session/IP windows (TestClient always uses one IP)."""
    rate_limiter.reset_all()
    yield
    rate_limiter.reset_all()


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session_id(client):
    res = client.post("/api/visitors", json={"visitor_name": "Smoke QA"})
    assert res.status_code == 200, res.text
    return res.json()["session_id"]


@pytest.fixture
def admin(monkeypatch):
    """Authorization header that verify_admin accepts."""
    monkeypatch.setattr(core_auth.auth, "verify_id_token", lambda _token: {"email": "owner@309.so"})
    monkeypatch.setattr(settings, "admin_allowed_emails", ["owner@309.so"])
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def notes(tmp_path, monkeypatch):
    """Write notes under a temporary NOTES_DIR (subdir 309-persona) and reload them."""

    def write(relative, text):
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        reset_notes()
        return path

    monkeypatch.setattr(settings, "notes_dir", str(tmp_path))
    monkeypatch.setattr(settings, "notes_subdir", "309-persona")
    monkeypatch.setattr(settings, "notes_github_repo", "")
    reset_notes()
    yield write
    reset_notes()
