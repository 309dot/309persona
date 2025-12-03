"""Visitor/session management helpers."""

from __future__ import annotations

from typing import Dict, Optional
from uuid import uuid4

from firebase_admin import firestore

from ..core.firebase import get_firestore_client


def create_visitor(payload: Dict[str, str]) -> Dict[str, str]:
    """Persist visitor metadata and return the session descriptor."""
    client = get_firestore_client()
    session_id = str(uuid4())
    doc_ref = client.collection("visitors").document(session_id)

    record = {
        "visitor_name": payload.get("visitor_name", "").strip(),
        "visitor_affiliation": payload.get("visitor_affiliation", "").strip(),
        "visit_ref": payload.get("visit_ref", "").strip(),
        "session_id": session_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(record)

    return record


def get_visitor_by_session(session_id: str) -> Optional[Dict[str, str]]:
    """Return visitor metadata by session id."""
    if not session_id:
        return None

    client = get_firestore_client()
    doc = client.collection("visitors").document(session_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data

