"""Firebase helpers for Firestore + Auth access."""

from __future__ import annotations

import json
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

from .config import settings

_firebase_app: Optional[firebase_admin.App] = None
_firestore_client: Optional[firestore.Client] = None


def _build_credentials() -> credentials.Base:
    """Create firebase credentials from path or inline JSON."""
    if settings.firebase_credentials_path:
        return credentials.Certificate(settings.firebase_credentials_path)

    if settings.firebase_credentials_json:
        data = json.loads(settings.firebase_credentials_json)
        return credentials.Certificate(data)

    raise RuntimeError(
        "Firebase credentials are not configured. "
        "Set FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON."
    )


def init_firebase_app() -> firebase_admin.App:
    """Initialize and cache the firebase app."""
    global _firebase_app
    if _firebase_app is None:
        cred = _build_credentials()
        _firebase_app = firebase_admin.initialize_app(cred)
    return _firebase_app


def get_firestore_client() -> firestore.Client:
    """Return a singleton firestore client."""
    global _firestore_client
    if _firestore_client is None:
        firebase_app = init_firebase_app()
        _firestore_client = firestore.client(firebase_app)
    return _firestore_client


