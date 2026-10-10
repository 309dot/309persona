#!/usr/bin/env python3
"""Copy the persona folder of an Obsidian vault into the private notes repository.

Runs with plain python3 (no packages) on the computer that has the vault:

    python3 backend/scripts/sync_obsidian_notes.py \\
        --vault ~/Obsidian/MyVault --notes-repo ~/code/309persona-notes --push

Only markdown files under <vault>/<folder> are copied, and files deleted from the vault
are deleted from the repository too. Lines that look like contact details or confidential
material are listed so you can check them before they reach the answers. The server reads
the repository (docs/obsidian-notes.md); press "다시 불러오기" in the dashboard afterwards.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

PHONE_RE = re.compile(r"\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
SENSITIVE_RE = re.compile(r"대외비|비공개|기밀|NDA|연봉|주민등록|계좌", re.IGNORECASE)


def markdown_files(root: Path) -> dict[str, Path]:
    files = {}
    for path in root.rglob("*.md"):
        relative = path.relative_to(root)
        if any(part.startswith(".") for part in relative.parts):
            continue  # .obsidian, .trash
        files[relative.as_posix()] = path
    return files


def warnings_for(relative: str, text: str) -> list[str]:
    found = []
    for number, line in enumerate(text.splitlines(), start=1):
        reasons = []
        if PHONE_RE.search(line):
            reasons.append("전화번호(서버에서 줄째 빠짐)")
        emails = [e for e in EMAIL_RE.findall(line) if not e.lower().endswith("309designlab.com")]
        if emails:
            reasons.append("이메일(서버에서 가려짐)")
        if SENSITIVE_RE.search(line):
            reasons.append("민감할 수 있는 단어")
        if reasons:
            found.append(f"  {relative}:{number}  {', '.join(reasons)}  | {line.strip()[:60]}")
    return found


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True, type=Path, help="Obsidian 볼트 폴더")
    parser.add_argument("--notes-repo", required=True, type=Path, help="비공개 노트 저장소를 clone한 폴더")
    parser.add_argument("--folder", default="309-persona", help="볼트와 저장소 안의 폴더 이름 (기본 309-persona)")
    parser.add_argument("--push", action="store_true", help="복사 후 커밋하고 push")
    parser.add_argument("--dry-run", action="store_true", help="바뀔 내용만 보여 주고 아무것도 쓰지 않음")
    args = parser.parse_args()

    source_root = args.vault.expanduser() / args.folder
    repo = args.notes_repo.expanduser()
    target_root = repo / args.folder
    if not source_root.is_dir():
        print(f"볼트에 {args.folder}/ 폴더가 없어요: {source_root}", file=sys.stderr)
        return 1
    if not (repo / ".git").exists():
        print(f"노트 저장소(git clone한 폴더)가 아니에요: {repo}", file=sys.stderr)
        return 1

    source = markdown_files(source_root)
    target = markdown_files(target_root) if target_root.is_dir() else {}
    added, updated, removed, warnings = [], [], [], []
    for relative, path in sorted(source.items()):
        data = path.read_bytes()
        warnings += warnings_for(relative, data.decode("utf-8", errors="replace"))
        existing = target.get(relative)
        if existing is None:
            added.append(relative)
        elif existing.read_bytes() != data:
            updated.append(relative)
        else:
            continue
        if not args.dry_run:
            destination = target_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    for relative in sorted(set(target) - set(source)):
        removed.append(relative)
        if not args.dry_run:
            target[relative].unlink()

    for label, items in (("추가", added), ("수정", updated), ("삭제", removed)):
        for item in items:
            print(f"{label}  {item}")
    print(f"노트 {len(source)}개 · 추가 {len(added)} · 수정 {len(updated)} · 삭제 {len(removed)}")
    if warnings:
        print("\n확인해 볼 줄 (AI가 방문자에게 말할 수 있는 내용인지):")
        print("\n".join(warnings))

    if args.dry_run or not (added or updated or removed):
        return 0
    if args.push:
        git(repo, "add", "-A", "--", args.folder)
        git(repo, "commit", "-m", f"Sync persona notes ({len(added) + len(updated) + len(removed)} changed)")
        git(repo, "push")
        print("\npush 완료. 대시보드의 '지식베이스 → 다시 불러오기'를 누르면 답변에 반영돼요.")
    else:
        print(f"\n{repo}에서 커밋하고 push하거나, --push를 붙여 다시 실행하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
