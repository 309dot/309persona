#!/usr/bin/env python3
"""Monthly usage report from Firestore (visitors, questions, blocked rate).

Feeds the LLM cost estimate and the evaluation question set in
docs/upgrade-plan-2026-10.md (Phase 0).

Run (needs FIREBASE_CREDENTIALS_PATH or FIREBASE_CREDENTIALS_JSON):
  cd backend && ./.venv/bin/python scripts/usage_report.py --months 6
  cd backend && ./.venv/bin/python scripts/usage_report.py --months 6 --export-questions

--export-questions writes distinct visitor questions to reports/ at the repo
root. That folder is gitignored: questions are visitor data, never commit them.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

KST = timezone(timedelta(hours=9))
REPORTS_DIR = ROOT_DIR.parent / "reports"
# The frontend appends this hint to questions without keywords (plan B7).
CONTEXT_HINT_RE = re.compile(r"\s*\(맥락: 이 질문은 309 성백곤의.*?\)\s*$", re.DOTALL)


@dataclass
class MonthStats:
    page_sessions: int = 0
    asking_sessions: set[str] = field(default_factory=set)
    questions: int = 0
    blocked: int = 0
    question_chars: int = 0
    answer_chars: int = 0


def month_start(now: datetime, months: int) -> datetime:
    """First day (KST) of the month `months - 1` months before `now`."""
    local = now.astimezone(KST)
    year, month = local.year, local.month - (months - 1)
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1, tzinfo=KST)


def clean_question(text: str) -> str:
    return CONTEXT_HINT_RE.sub("", text or "").strip()


def summarize(
    visitor_times: Iterable[datetime],
    conversations: Iterable[dict[str, Any]],
) -> dict[str, MonthStats]:
    stats: dict[str, MonthStats] = defaultdict(MonthStats)
    for created_at in visitor_times:
        stats[created_at.astimezone(KST).strftime("%Y-%m")].page_sessions += 1
    for row in conversations:
        ts = row.get("timestamp")
        if not isinstance(ts, datetime):
            continue
        month = stats[ts.astimezone(KST).strftime("%Y-%m")]
        if row.get("session_id"):
            month.asking_sessions.add(row["session_id"])
        if row.get("is_blocked"):
            month.blocked += 1
            continue
        month.questions += 1
        month.question_chars += len(clean_question(row.get("question", "")))
        month.answer_chars += len(row.get("answer") or "")
    return dict(sorted(stats.items()))


def render_table(stats: dict[str, MonthStats]) -> str:
    lines = [
        "| 월 | 페이지 세션 | 질문한 세션 | 질문 | 차단 | 평균 질문 길이 | 평균 답변 길이 |",
        "|---|---|---|---|---|---|---|",
    ]
    total = MonthStats()
    for month, s in stats.items():
        avg_q = s.question_chars // s.questions if s.questions else 0
        avg_a = s.answer_chars // s.questions if s.questions else 0
        lines.append(
            f"| {month} | {s.page_sessions} | {len(s.asking_sessions)} | {s.questions} "
            f"| {s.blocked} | {avg_q}자 | {avg_a}자 |"
        )
        total.page_sessions += s.page_sessions
        total.asking_sessions |= s.asking_sessions
        total.questions += s.questions
        total.blocked += s.blocked
        total.question_chars += s.question_chars
        total.answer_chars += s.answer_chars
    avg_q = total.question_chars // total.questions if total.questions else 0
    avg_a = total.answer_chars // total.questions if total.questions else 0
    lines.append(
        f"| 합계 | {total.page_sessions} | {len(total.asking_sessions)} | {total.questions} "
        f"| {total.blocked} | {avg_q}자 | {avg_a}자 |"
    )
    return "\n".join(lines)


def export_questions(conversations: list[dict[str, Any]], path: Path) -> int:
    seen: set[str] = set()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as out:
        for row in conversations:
            question = clean_question(row.get("question", ""))
            key = re.sub(r"\s+", " ", question).lower()
            if not question or key in seen:
                continue
            seen.add(key)
            ts = row.get("timestamp")
            out.write(
                json.dumps(
                    {
                        "month": ts.astimezone(KST).strftime("%Y-%m") if isinstance(ts, datetime) else None,
                        "question": question,
                        "category": row.get("category"),
                        "blocked": bool(row.get("is_blocked")),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    return len(seen)


def main() -> None:
    parser = argparse.ArgumentParser(description="309persona monthly usage report")
    parser.add_argument("--months", type=int, default=6, help="최근 몇 개월(이번 달 포함)")
    parser.add_argument(
        "--export-questions",
        action="store_true",
        help="중복 제거한 질문을 reports/questions-YYYYMMDD.jsonl로 저장 (커밋 금지)",
    )
    args = parser.parse_args()

    from google.cloud.firestore_v1.base_query import FieldFilter

    from app.core.firebase import get_firestore_client

    since = month_start(datetime.now(timezone.utc), max(1, args.months))
    client = get_firestore_client()

    visitor_times = [
        created_at
        for snap in client.collection("visitors")
        .where(filter=FieldFilter("created_at", ">=", since))
        .select(["created_at"])
        .stream()
        if isinstance(created_at := (snap.to_dict() or {}).get("created_at"), datetime)
    ]
    conversations = [
        snap.to_dict() or {}
        for snap in client.collection("conversations")
        .where(filter=FieldFilter("timestamp", ">=", since))
        .select(["timestamp", "session_id", "is_blocked", "question", "answer", "category"])
        .stream()
    ]

    print(f"기간: {since:%Y-%m-%d} ~ 현재 (KST)")
    print("'페이지 세션'은 페이지 로드마다 생성되는 세션 수라 실제 방문자보다 많다 (계획서 B9).\n")
    print(render_table(summarize(visitor_times, conversations)))

    if args.export_questions:
        path = REPORTS_DIR / f"questions-{datetime.now(KST):%Y%m%d}.jsonl"
        count = export_questions(conversations, path)
        print(f"\n질문 {count}개를 {path}에 저장했습니다. 방문자 데이터이므로 커밋하지 마세요.")


if __name__ == "__main__":
    main()
