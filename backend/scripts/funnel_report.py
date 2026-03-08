#!/usr/bin/env python3
"""Generate 309persona first-message conversion report from Firestore events."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from app.core.firebase import get_firestore_client


def to_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    return None


def safe_div(a: int, b: int) -> float:
    return (a / b) if b else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(description="309persona funnel report")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    client = get_firestore_client()

    docs = client.collection("personaFunnelEvents").stream()

    by_variant: Dict[str, Counter] = defaultdict(Counter)
    by_variant_sessions: Dict[str, Dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    for snap in docs:
        d = snap.to_dict() or {}
        created = to_dt(d.get("createdAt"))
        if not created or created < since:
            continue

        event = str(d.get("event") or "")
        if not event:
            continue

        variant = str(d.get("variant") or "unknown")
        session_id = str(d.get("sessionId") or "")

        by_variant[variant][event] += 1
        if session_id:
            by_variant_sessions[variant][event].add(session_id)

    print(f"# 309persona Funnel Report ({args.days}d)\n")
    if not by_variant:
        print("No funnel data found.")
        return

    for variant, counts in sorted(by_variant.items()):
        sess = by_variant_sessions[variant]
        landing = len(sess.get("landing_view", set()))
        first_submit = len(sess.get("first_submit", set()))
        first_answer = len(sess.get("first_answer_rendered", set()))
        input_focus = len(sess.get("input_focus", set()))
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
