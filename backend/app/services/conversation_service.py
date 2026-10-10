"""Conversation logging and analytics helpers."""

from __future__ import annotations

import logging
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

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
    **metrics: Any,
) -> Optional[str]:
    """Persist a conversation entry and return its document id.

    `metrics` carries pipeline, model, latency_ms, first_token_ms, token counts,
    sources, follow_ups and error (a code when the answer failed).
    """
    try:
        client = get_firestore_client()
        _, ref = client.collection("conversations").add(
            {
                "session_id": session_id,
                "visitor_id": visitor_id,
                "question": question,
                "answer": answer,
                "category": category,
                "is_blocked": is_blocked,
                **{key: value for key, value in metrics.items() if value is not None},
                "timestamp": firestore.SERVER_TIMESTAMP,
            }
        )
        return ref.id
    except Exception as exc:
        logger.warning("Failed to persist conversation log: %s", exc)
        return None


def record_feedback(session_id: str, conversation_id: str, rating: str) -> bool:
    """Store a visitor's 👍/👎 on one of their own answers. False if it isn't theirs or can't be saved."""
    try:
        client = get_firestore_client()
        ref = client.collection("conversations").document(conversation_id)
        snap = ref.get()
        if not snap.exists or (snap.to_dict() or {}).get("session_id") != session_id:
            return False
        ref.update({"feedback": rating, "feedback_at": firestore.SERVER_TIMESTAMP})
        return True
    except Exception as exc:
        logger.warning("Failed to record feedback: %s", exc)
        return False


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
                # Top-level so reports can group by experiment variant without
                # digging into properties.
                "variant": (properties or {}).get("variant"),
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


def fetch_session_conversations(session_id: str) -> List[Dict]:
    """All logged questions of one chat session, oldest first."""
    client = get_firestore_client()
    # Equality filter only: ordering in Python avoids needing a composite index.
    snapshots = client.collection("conversations").where(filter=FieldFilter("session_id", "==", session_id)).stream()
    rows = []
    for snap in snapshots:
        doc = snap.to_dict() or {}
        doc["id"] = snap.id
        rows.append(doc)
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    rows.sort(key=lambda row: row.get("timestamp") if isinstance(row.get("timestamp"), datetime) else oldest)
    return rows


# Funnel stages counted per visit (funnel events are keyed by the per-tab visit id).
FUNNEL_STAGES = [
    ("landing_view", "방문"),
    ("chat_input_started", "대화창 입력"),
    ("first_answer_rendered", "첫 답변 확인"),
    ("profile_submitted", "프로필 등록"),
    ("five_questions_reached", "5회 질문 달성"),
    ("proposal_email_sent", "제안하기 클릭"),
]


def _build_funnel_steps_from_events(client) -> List[Dict]:
    snapshots = (
        client.collection("funnel_events")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(settings.analytics_limit * 10)
        .stream()
    )

    stage_sessions: Dict[str, set] = {key: set() for key, _ in FUNNEL_STAGES}
    for snap in snapshots:
        data = snap.to_dict() or {}
        session_id = data.get("session_id")
        event = data.get("event")
        if not session_id or event not in stage_sessions:
            continue
        stage_sessions[event].add(session_id)

    steps: List[Dict] = []
    prev_value = None
    for key, label in FUNNEL_STAGES:
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


def _median(values: List[float]) -> Optional[int]:
    return int(statistics.median(values)) if values else None


def _build_kpis(conversations: List[Dict], visitors_count: int, visits: int) -> Dict:
    by_session: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "blocked": 0})
    answered: List[Dict] = []
    failures = 0
    for row in conversations:
        if row.get("error"):
            # Failed answers were refunded to the visitor; they are not questions asked.
            failures += 1
            continue
        session_id = row.get("session_id") or ""
        if not session_id:
            continue
        by_session[session_id]["total"] += 1
        if row.get("is_blocked"):
            by_session[session_id]["blocked"] += 1
        else:
            answered.append(row)

    total_questions = sum(item["total"] for item in by_session.values())
    blocked_questions = sum(item["blocked"] for item in by_session.values())
    active_sessions = len(by_session)
    readiness_sessions = sum(1 for item in by_session.values() if item["total"] >= 2 and item["blocked"] == 0)

    def numbers(key: str) -> List[float]:
        return [row[key] for row in answered if isinstance(row.get(key), (int, float))]

    denominator_sessions = visitors_count or active_sessions
    return {
        "total_sessions": visitors_count,
        "visits": visits,
        "avg_questions_per_session": round(total_questions / active_sessions, 2) if active_sessions else 0.0,
        "blocked_rate": _safe_ratio(blocked_questions, total_questions),
        "readiness_rate": _safe_ratio(readiness_sessions, denominator_sessions),
        "failure_rate": _safe_ratio(failures, len(answered) + failures),
        "latency_p50_ms": _median(numbers("latency_ms")),
        "first_token_p50_ms": _median(numbers("first_token_ms")),
        "feedback_up": sum(1 for row in answered if row.get("feedback") == "up"),
        "feedback_down": sum(1 for row in answered if row.get("feedback") == "down"),
        "prompt_tokens": int(sum(numbers("prompt_tokens"))),
        "completion_tokens": int(sum(numbers("completion_tokens"))),
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
        referrer = (data.get("referrer") or "").strip()
        if referrer:
            try:
                referrer_counter[urlparse(referrer).netloc or "direct"] += 1
            except ValueError:
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
        if not doc.get("is_blocked") and not doc.get("error")
    )

    try:
        funnel_steps = _build_funnel_steps_from_events(client)
    except Exception as exc:
        logger.warning("Failed to build funnel steps: %s", exc)
        funnel_steps = []
    visits = next((step["value"] for step in funnel_steps if step["key"] == "landing_view"), 0)

    kpis = _build_kpis(conversation_docs, visitors_count=len(latest_visitors), visits=visits)

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


