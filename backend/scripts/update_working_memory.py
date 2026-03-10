"""Update memory/working/today.md with recent engineering context.

Run:
  python backend/scripts/update_working_memory.py
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
WORKING_PATH = ROOT / "memory" / "working" / "today.md"


def get_recent_commits(limit: int = 8) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "log", f"-n{limit}", "--pretty=format:%h %s"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]


def render(commits: list[str]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Working Memory (Today)",
        "",
        f"- updated_at: {now}",
        "- active_project: 309persona",
        "- current_goal: memory-type routed RAG + context composer 안정화",
        "- open_issues:",
        "  - answer naturalness(반복 도입문/문장 길이) 추가 개선",
        "  - project pack 라우팅 고도화",
        "- next_actions:",
        "  - working/decision/failure 검색 가중치 튜닝",
        "  - context composer v2(실패 사례 강제 1개 포함)",
        "",
        "## recent_changes",
    ]
    if not commits:
        lines.append("- (no commits found)")
    else:
        lines.extend([f"- {c}" for c in commits])
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    commits = get_recent_commits()
    WORKING_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKING_PATH.write_text(render(commits), encoding="utf-8")
    print(f"updated: {WORKING_PATH}")


if __name__ == "__main__":
    main()
