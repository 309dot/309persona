"""Visitor/session management helpers."""

from __future__ import annotations

import logging
from typing import Dict, Optional
from uuid import uuid4

from firebase_admin import firestore

from ..core.firebase import get_firestore_client

logger = logging.getLogger(__name__)
_ephemeral_visitors: Dict[str, Dict[str, str]] = {}


def create_visitor(payload: Dict[str, str]) -> Dict[str, str]:
    """Persist visitor metadata and return the session descriptor."""
    session_id = str(uuid4())

    record = {
        "visitor_name": payload.get("visitor_name", "").strip(),
        "visitor_affiliation": payload.get("visitor_affiliation", "").strip(),
        "visit_ref": payload.get("visit_ref", "").strip(),
        "referrer": payload.get("referrer", "").strip(),
        "session_id": session_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        client = get_firestore_client()
        doc_ref = client.collection("visitors").document(session_id)
        doc_ref.set(record)
    except Exception as exc:
        logger.exception("Failed to persist visitor in Firestore, using ephemeral session: %s", exc)
        _ephemeral_visitors[session_id] = {
            "id": session_id,
            "visitor_name": record["visitor_name"],
            "visitor_affiliation": record["visitor_affiliation"],
            "visit_ref": record["visit_ref"],
            "referrer": record["referrer"],
            "session_id": session_id,
        }

    return record


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
        logger.exception("Failed to fetch visitor from Firestore: %s", exc)
        return _ephemeral_visitors.get(session_id)

