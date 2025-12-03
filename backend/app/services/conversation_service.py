"""Conversation logging and analytics helpers."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from firebase_admin import firestore

from ..core.config import settings
from ..core.firebase import get_firestore_client


def log_conversation(
    session_id: str,
    visitor_id: str,
    question: str,
    answer: str,
    category: Optional[str],
    is_blocked: bool,
) -> None:
    """Persist a conversation entry."""
    client = get_firestore_client()
    client.collection("conversations").add(
        {
            "session_id": session_id,
            "visitor_id": visitor_id,
            "question": question,
            "answer": answer,
            "category": category,
            "is_blocked": is_blocked,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
    )


def fetch_recent_conversations(limit: Optional[int] = None) -> List[Dict]:
    """Return recent conversation documents."""
    client = get_firestore_client()
    query = (
        client.collection("conversations")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit or settings.analytics_limit)
    )
    snapshots = query.stream()
    results = []
    for snap in snapshots:
        doc = snap.to_dict()
        doc["id"] = snap.id
        results.append(doc)
    return results


def build_dashboard_stats() -> Dict[str, List[Dict]]:
    """Compute high-level analytics for the dashboard."""
    client = get_firestore_client()

    visitor_docs = (
        client.collection("visitors")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(settings.analytics_limit)
        .stream()
    )

    ref_counter = Counter()
    daily_counter = defaultdict(int)
    latest_visitors = []

    for doc in visitor_docs:
        data = doc.to_dict()
        ref = data.get("visit_ref") or "direct"
        ref_counter[ref] += 1

        created_at = data.get("created_at")
        if isinstance(created_at, datetime):
            created_at = created_at.astimezone(timezone.utc)
            day_key = created_at.strftime("%Y-%m-%d")
        else:
            day_key = "unknown"
        daily_counter[day_key] += 1

        data["id"] = doc.id
        latest_visitors.append(data)

    conversation_docs = fetch_recent_conversations(limit=settings.analytics_limit)
    category_counter = Counter(
        doc.get("category") or "general"
        for doc in conversation_docs
        if not doc.get("is_blocked")
    )

    return {
        "ref_stats": [{"label": ref, "value": count} for ref, count in ref_counter.most_common()],
        "question_categories": [
            {"label": cat, "value": count} for cat, count in category_counter.most_common()
        ],
        "daily_visits": [
            {"label": day, "value": count} for day, count in sorted(daily_counter.items())
        ],
        "latest_visitors": latest_visitors,
        "recent_questions": conversation_docs,
    }


