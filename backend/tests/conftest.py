"""Shared fixtures. Tests run without Firebase credentials or an LLM."""

import os

# Force the no-Firebase path even if .env.local holds real credentials,
# so tests never write to the production Firestore.
os.environ["FIREBASE_CREDENTIALS_PATH"] = ""
os.environ["FIREBASE_CREDENTIALS_JSON"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import rate_limiter  # noqa: E402
from app.main import app  # noqa: E402


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
