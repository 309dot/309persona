"""Score answer pipelines on the golden questions.

Run from backend/ with the LLM settings in .env.local (calls the real model):
    uv run python -m evals.run --pipeline both
    uv run python -m evals.run --pipeline direct --only quick-impact,follow-payhere

Questions go through the same prompt-injection filter as /api/chat, then the
pipeline. Results are written to evals/results/ (gitignored).
"""

from __future__ import annotations

import argparse
import json
import statistics
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services import chat_runner, question_filter
from app.services.direct_pipeline import HistoryTurn

from .checks import run_checks

EVAL_DIR = Path(__file__).resolve().parent
VISITOR = {"id": "eval", "visitor_name": "채용 담당자"}


def load_items(only: Optional[List[str]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    items = [json.loads(line) for line in (EVAL_DIR / "golden.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    if only:
        items = [item for item in items if item["id"] in only]
    return items[:limit] if limit else items


def answer_item(pipeline: str, item: Dict[str, Any]) -> Dict[str, Any]:
    started = time.monotonic()
    first_token: List[float] = []

    def on_delta(_text: str) -> None:
        if not first_token:
            first_token.append(time.monotonic())

    allowed, category, rejection = question_filter.validate_question(item["question"])
    record: Dict[str, Any] = {"id": item["id"], "type": item.get("type"), "question": item["question"]}
    if not allowed:
        record.update(answer=rejection or settings.blocked_message, blocked=True)
    else:
        turn = chat_runner.Turn(
            session_id="eval",
            question=item["question"],
            ip="eval",
            visitor=VISITOR,
            history=[HistoryTurn(**turn) for turn in item.get("history", [])],
            category=category,
        )
        try:
            result = chat_runner.generate(pipeline, turn, on_delta, threading.Event())
            record.update(
                answer=result.answer,
                blocked=False,
                sources=result.sources,
                follow_ups=result.follow_ups,
                topic=result.topic,
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
            )
        except Exception as exc:  # recorded as a failed item, the run continues
            record.update(answer="", blocked=False, error=f"{type(exc).__name__}: {exc}")
    record["latency_ms"] = int((time.monotonic() - started) * 1000)
    record["first_token_ms"] = int((first_token[0] - started) * 1000) if first_token else None
    record.update(run_checks(item, record["answer"], record["blocked"]))
    if record.get("error"):
        record["checks"] = {name: False for name in record["checks"]}
    return record


def summarize(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    per_check: Dict[str, List[bool]] = {}
    for record in records:
        for name, value in record["checks"].items():
            if value is not None:
                per_check.setdefault(name, []).append(bool(value))
    all_values = [value for values in per_check.values() for value in values]
    latencies = [r["latency_ms"] for r in records if not r["blocked"] and not r.get("error")]
    first_tokens = [r["first_token_ms"] for r in records if r.get("first_token_ms") is not None]

    def p50(values: List[int]) -> Optional[int]:
        return int(statistics.median(values)) if values else None

    return {
        "items": len(records),
        "items_passed": sum(1 for r in records if all(v is not False for v in r["checks"].values())),
        "check_pass_rate": round(sum(all_values) / len(all_values), 3) if all_values else None,
        "per_check": {name: round(sum(values) / len(values), 3) for name, values in sorted(per_check.items())},
        "errors": sum(1 for r in records if r.get("error")),
        "latency_p50_ms": p50(latencies),
        "first_token_p50_ms": p50(first_tokens),
        "prompt_tokens": sum(r.get("prompt_tokens") or 0 for r in records),
        "completion_tokens": sum(r.get("completion_tokens") or 0 for r in records),
    }


def run(pipeline: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    records = []
    for index, item in enumerate(items, start=1):
        record = answer_item(pipeline, item)
        failed = [name for name, value in record["checks"].items() if value is False]
        print(f"[{pipeline}] {index:>2}/{len(items)} {item['id']:<20} {'ok' if not failed else 'FAIL ' + ','.join(failed)}")
        records.append(record)
    return {"pipeline": pipeline, "model": settings.openai_model, "summary": summarize(records), "records": records}


def print_summary(results: List[Dict[str, Any]]) -> None:
    names = sorted({name for result in results for name in result["summary"]["per_check"]})
    header = f"{'':<22}" + "".join(f"{r['pipeline']:>12}" for r in results)
    print("\n" + header)
    rows = [("check_pass_rate", lambda s: s["check_pass_rate"]), ("items_passed", lambda s: f"{s['items_passed']}/{s['items']}")]
    rows += [(name, lambda s, n=name: s["per_check"].get(n)) for name in names]
    rows += [(key, lambda s, k=key: s[k]) for key in ("errors", "latency_p50_ms", "first_token_p50_ms", "prompt_tokens", "completion_tokens")]
    for label, getter in rows:
        print(f"{label:<22}" + "".join(f"{str(getter(r['summary'])):>12}" for r in results))


def main() -> None:
    parser = argparse.ArgumentParser(description="309persona answer pipeline evals")
    parser.add_argument("--pipeline", choices=["legacy", "direct", "both"], default="both")
    parser.add_argument("--only", help="comma-separated item ids")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", default=str(EVAL_DIR / "results"))
    args = parser.parse_args()

    items = load_items(args.only.split(",") if args.only else None, args.limit)
    pipelines = ["legacy", "direct"] if args.pipeline == "both" else [args.pipeline]
    results = [run(pipeline, items) for pipeline in pipelines]
    print_summary(results)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    for result in results:
        path = out_dir / f"{stamp}-{result['pipeline']}.json"
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"saved {path}")


if __name__ == "__main__":
    main()
