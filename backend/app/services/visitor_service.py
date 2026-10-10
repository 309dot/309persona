"""Visitor/session management helpers."""

from __future__ import annotations

import logging
from typing import Dict, Optional
from uuid import uuid4

from firebase_admin import firestore

from ..core.firebase import get_firestore_client

logger = logging.getLogger(__name__)
_ephemeral_visitors: Dict[str, Dict[str, str]] = {}

# What the visitor picked on the first screen; the label goes into the prompt and the dashboard.
PURPOSE_LABELS = {
    "hiring": "채용 검토",
    "colleague": "함께 일할 동료",
    "designer": "디자이너·후배",
    "browsing": "둘러보기",
}


def purpose_label(value: Optional[str]) -> str:
    return PURPOSE_LABELS.get(value or "", "")


def create_visitor(payload: Dict[str, str]) -> Dict[str, str]:
    """Persist visitor metadata and return the session descriptor."""
    session_id = str(uuid4())

    def clean(value: Optional[str]) -> str:
        return (value or "").strip()

    record = {
        "visitor_name": clean(payload.get("visitor_name", "")),
        "visitor_affiliation": clean(payload.get("visitor_affiliation", "")),
        "visit_ref": clean(payload.get("visit_ref", "")),
        "referrer": clean(payload.get("referrer", "")),
        "visitor_purpose": clean(payload.get("visitor_purpose")),
        "session_id": session_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        client = get_firestore_client()
        doc_ref = client.collection("visitors").document(session_id)
        doc_ref.set(record)
    except Exception as exc:
        logger.warning("Failed to persist visitor in Firestore, using ephemeral session: %s", exc)
        _ephemeral_visitors[session_id] = {
            "id": session_id,
            "visitor_name": record["visitor_name"],
            "visitor_affiliation": record["visitor_affiliation"],
            "visit_ref": record["visit_ref"],
            "referrer": record["referrer"],
            "visitor_purpose": record["visitor_purpose"],
            "session_id": session_id,
        }

    return record


def update_visitor(session_id: str, updates: Dict[str, Optional[str]]) -> Optional[Dict[str, str]]:
    """Update the visitor's name, affiliation or purpose; return the merged record or None if unknown."""
    visitor = get_visitor_by_session(session_id)
    if not visitor:
        return None

    changes = {key: value for key, value in updates.items() if value is not None}
    if not changes:
        return visitor

    if session_id in _ephemeral_visitors:
        _ephemeral_visitors[session_id].update(changes)
        return _ephemeral_visitors[session_id]

    try:
        client = get_firestore_client()
        client.collection("visitors").document(session_id).update(
            {**changes, "updated_at": firestore.SERVER_TIMESTAMP}
        )
    except Exception as exc:
        logger.warning("Failed to update visitor in Firestore: %s", exc)
    return {**visitor, **changes}


def get_visitor_by_session(session_id: str) -> Optional[Dict[str, str]]:
    """Return visitor metadata by session id."""
    if not session_id:
        return None

    if session_id in _ephemeral_visitors:
        return _ephemeral_visitors[session_id]

    try:
        client = get_firestore_client()
        doc = client.collection("visitors").document(session_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        data["id"] = doc.id
        return data
    except Exception as exc:
        logger.warning("Failed to fetch visitor from Firestore: %s", exc)
        return _ephemeral_visitors.get(session_id)

