#!/usr/bin/env python3
"""Decide winner variant when enough funnel samples are accumulated."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

from app.core.firebase import get_firestore_client


def to_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    return None


def ratio(n: int, d: int) -> float:
    return (n / d) if d else 0.0


def main() -> None:
    days = 7
    min_landing = 100
    since = datetime.now(timezone.utc) - timedelta(days=days)

    client = get_firestore_client()
    docs = client.collection("personaFunnelEvents").stream()

    sessions: Dict[str, Dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    counts: Dict[str, Counter] = defaultdict(Counter)

    for snap in docs:
        d = snap.to_dict() or {}
        created = to_dt(d.get("createdAt"))
        if not created or created < since:
            continue

        variant = str(d.get("variant") or "unknown")
        event = str(d.get("event") or "")
        session_id = str(d.get("sessionId") or "")
        if not event:
            continue

        counts[variant][event] += 1
        if session_id:
            sessions[variant][event].add(session_id)

    out = []
    out.append(f"# Funnel Winner Decision ({datetime.now().date().isoformat()})")
    out.append("")

    if not sessions:
        out.append("- 상태: 데이터 없음")
        out.append("- 조치: 계속 수집 후 재실행")
    else:
        scored = []
        for variant in sorted(sessions.keys()):
            landing = len(sessions[variant].get("landing_view", set()))
            first_submit = len(sessions[variant].get("first_submit", set()))
            first_answer = len(sessions[variant].get("first_answer_rendered", set()))
            conv = ratio(first_submit, landing)
            completion = ratio(first_answer, first_submit)
            scored.append((variant, landing, first_submit, first_answer, conv, completion))

        out.append("## Variant Scores")
        for variant, landing, first_submit, first_answer, conv, completion in scored:
            out.append(
                f"- {variant}: landing={landing}, first_submit={first_submit}, first_answer={first_answer}, conversion={conv*100:.1f}%, completion={completion*100:.1f}%"
            )

        eligible = [s for s in scored if s[1] >= min_landing]
        out.append("")
        if not eligible:
            out.append(f"- 상태: 표본 부족 (최소 landing {min_landing} 미달)")
            out.append("- 조치: 계속 수집")
        else:
            eligible.sort(key=lambda x: (x[4], x[5]), reverse=True)
            winner = eligible[0]
            out.append(f"- 상태: winner 확정 가능")
            out.append(f"- Winner: {winner[0]}")
            out.append("- 다음 실험 2개:")
            out.append("  1) input_focus→first_submit 구간 카피/버튼 위치 미세 최적화")
            out.append("  2) 첫 답변 생성시간 단축(체감 로딩 개선 포함)")

    out_path = Path(__file__).resolve().parents[1] / ".." / "docs" / "funnel-winner-latest.md"
    out_path = out_path.resolve()
    out_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"saved: {out_path}")


if __name__ == "__main__":
    main()
