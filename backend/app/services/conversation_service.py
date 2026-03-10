"""Conversation logging and analytics helpers."""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional

from firebase_admin import firestore

from ..core.config import settings
from ..core.firebase import get_firestore_client

logger = logging.getLogger(__name__)


def log_conversation(
    session_id: str,
    visitor_id: str,
    question: str,
    answer: str,
    category: Optional[str],
    is_blocked: bool,
) -> None:
    """Persist a conversation entry."""
    try:
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
    except Exception as exc:
        logger.warning("Failed to persist conversation log: %s", exc)


def log_funnel_event(session_id: str, event: str, properties: Optional[Dict] = None) -> None:
    """Persist funnel event for dashboard analytics."""
    if not session_id or not event:
        return
    try:
        client = get_firestore_client()
        client.collection("funnel_events").add(
            {
                "session_id": session_id,
                "event": event,
                "properties": properties or {},
                "timestamp": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception as exc:
        logger.warning("Failed to persist funnel event: %s", exc)


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


def _safe_ratio(numerator: float, denominator: float) -> float:
    if not denominator:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def _build_funnel_steps_from_events(client) -> List[Dict]:
    stage_defs = [
        ("chat_input_started", "대화창 입력"),
        ("profile_submitted", "사용자 프로필 등록"),
        ("five_questions_reached", "5회 질문 달성"),
        ("proposal_email_sent", "이메일 보내기(제안하기)"),
    ]

    snapshots = (
        client.collection("funnel_events")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(settings.analytics_limit * 10)
        .stream()
    )

    stage_sessions: Dict[str, set] = {key: set() for key, _ in stage_defs}
    for snap in snapshots:
        data = snap.to_dict() or {}
        session_id = data.get("session_id")
        event = data.get("event")
        if not session_id or event not in stage_sessions:
            continue
        stage_sessions[event].add(session_id)

    steps: List[Dict] = []
    prev_value = None
    for key, label in stage_defs:
        value = len(stage_sessions[key])
        steps.append(
            {
                "key": key,
                "label": label,
                "value": value,
                "conversion_from_prev": None if prev_value in (None, 0) else _safe_ratio(value, prev_value),
            }
        )
        prev_value = value
    return steps


def _build_kpis(conversations: List[Dict], visitors_count: int) -> Dict:
    by_session: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "blocked": 0})
    for row in conversations:
        session_id = row.get("session_id") or ""
        if not session_id:
            continue
        by_session[session_id]["total"] += 1
        if row.get("is_blocked"):
            by_session[session_id]["blocked"] += 1

    total_questions = sum(item["total"] for item in by_session.values())
    blocked_questions = sum(item["blocked"] for item in by_session.values())
    active_sessions = len(by_session)
    readiness_sessions = sum(1 for item in by_session.values() if item["total"] >= 2 and item["blocked"] == 0)

    denominator_sessions = visitors_count or active_sessions
    return {
        "total_sessions": visitors_count,
        "avg_questions_per_session": round(total_questions / active_sessions, 2) if active_sessions else 0.0,
        "blocked_rate": _safe_ratio(blocked_questions, total_questions),
        "readiness_rate": _safe_ratio(readiness_sessions, denominator_sessions),
    }


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
    referrer_counter = Counter()
    daily_counter = defaultdict(int)
    latest_visitors = []

    for doc in visitor_docs:
        data = doc.to_dict()
        ref = data.get("visit_ref") or "direct"
        ref_counter[ref] += 1

        # Track referrer (HTTP Referer header)
        referrer = data.get("referrer", "").strip()
        if referrer:
            # Extract domain from referrer URL
            try:
                from urllib.parse import urlparse
                parsed = urlparse(referrer)
                domain = parsed.netloc or "direct"
                referrer_counter[domain] += 1
            except Exception:
                referrer_counter["unknown"] += 1
        else:
            referrer_counter["direct"] += 1

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

    try:
        funnel_steps = _build_funnel_steps_from_events(client)
    except Exception as exc:
        logger.warning("Failed to build funnel steps: %s", exc)
        funnel_steps = []

    kpis = _build_kpis(conversation_docs, visitors_count=len(latest_visitors))

    return {
        "ref_stats": [{"label": ref, "value": count} for ref, count in ref_counter.most_common()],
        "referrer_stats": [
            {"label": referrer, "value": count} for referrer, count in referrer_counter.most_common()
        ],
        "question_categories": [
            {"label": cat, "value": count} for cat, count in category_counter.most_common()
        ],
        "daily_visits": [
            {"label": day, "value": count} for day, count in sorted(daily_counter.items())
        ],
        "latest_visitors": latest_visitors,
        "recent_questions": conversation_docs,
        "funnel_steps": funnel_steps,
        "kpis": kpis,
    }


