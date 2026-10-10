#!/usr/bin/env python3
"""Generate 309persona first-message conversion report from Firestore events.

Run (needs Firebase credentials):
  cd backend && ./.venv/bin/python scripts/funnel_report.py --days 7
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Any, Dict, Iterable, Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Written by the backend (/api/events/funnel). The older client-side
# personaFunnelEvents collection is no longer written.
COLLECTION = "funnel_events"

SessionsByVariant = Dict[str, Dict[str, set[str]]]
CountsByVariant = Dict[str, Counter]


def to_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    return None


def safe_div(a: int, b: int) -> float:
    return (a / b) if b else 0.0


def collect(events: Iterable[Dict[str, Any]], since: datetime) -> Tuple[SessionsByVariant, CountsByVariant]:
    """Group event sessions and counts by experiment variant."""
    sessions: SessionsByVariant = defaultdict(lambda: defaultdict(set))
    counts: CountsByVariant = defaultdict(Counter)
    for d in events:
        created = to_dt(d.get("timestamp"))
        if not created or created < since:
            continue
        event = str(d.get("event") or "")
        if not event:
            continue
        variant = str(d.get("variant") or (d.get("properties") or {}).get("variant") or "unknown")
        session_id = str(d.get("session_id") or "")
        counts[variant][event] += 1
        if session_id:
            sessions[variant][event].add(session_id)
    return sessions, counts


def load_events(since: datetime) -> list[Dict[str, Any]]:
    from google.cloud.firestore_v1.base_query import FieldFilter

    from app.core.firebase import get_firestore_client

    client = get_firestore_client()
    query = client.collection(COLLECTION).where(filter=FieldFilter("timestamp", ">=", since))
    return [snap.to_dict() or {} for snap in query.stream()]


def main() -> None:
    parser = argparse.ArgumentParser(description="309persona funnel report")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    by_variant_sessions, by_variant = collect(load_events(since), since)

    print(f"# 309persona Funnel Report ({args.days}d)\n")
    if not by_variant:
        print("No funnel data found.")
        return

    for variant, counts in sorted(by_variant.items()):
        sess = by_variant_sessions[variant]
        landing = len(sess.get("landing_view", set()))
        first_submit = len(sess.get("first_submit", set()))
        first_answer = len(sess.get("first_answer_rendered", set()))
        input_focus = len(sess.get("chat_input_started", set()))
        quick_click = counts.get("quick_question_clicked", 0)

        print(f"## Variant: {variant}")
        print(f"- Sessions (landing): {landing}")
        print(f"- Input focus sessions: {input_focus}")
        print(f"- First submit sessions: {first_submit}")
        print(f"- First answer sessions: {first_answer}")
        print(f"- Quick question clicks: {quick_click}")
        print(f"- First-message conversion: {safe_div(first_submit, landing)*100:.1f}%")
        print(f"- Submit→Answer completion: {safe_div(first_answer, first_submit)*100:.1f}%")
        print(f"- Landing→Input focus: {safe_div(input_focus, landing)*100:.1f}%")
        print()


if __name__ == "__main__":
    main()
