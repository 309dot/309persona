#!/usr/bin/env python3
"""Quick smoke test for the 309 persona LLM pipeline."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env")

from app.services import llm_service, question_filter  # noqa: E402
from app.services.knowledge_base import build_context_block  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a sample question through the persona pipeline."
    )
    parser.add_argument(
        "--question",
        default="309이 가장 임팩트 있게 기여한 제품 개선 사례를 알려줘.",
        help="테스트할 질문 문장",
    )
    parser.add_argument("--visitor-name", default="Internal QA", help="방문자 이름 또는 이니셜")
    parser.add_argument("--visitor-affiliation", default="309 Lab", help="방문자 소속/팀 정보")
    parser.add_argument("--visit-ref", default="smoke-test", help="세션 ref 값")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="실제 OpenAI 호출 대신 생성될 페이로드만 출력",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    api_key_set = bool(os.getenv("OPENAI_API_KEY"))
    if not api_key_set:
        print("[경고] OPENAI_API_KEY가 설정되지 않았습니다. .env를 확인해 주세요.")
        if not args.dry_run:
            print("`--dry-run` 옵션으로 프롬프트만 미리 확인할 수 있습니다.")
            sys.exit(1)

    visitor = {
        "visitor_name": args.visitor_name,
        "visitor_affiliation": args.visitor_affiliation,
        "visit_ref": args.visit_ref,
    }

    category = question_filter.detect_category(args.question) or "general"

    if args.dry_run:
        prompt = llm_service.build_user_payload(args.question, category, visitor)
        context = build_context_block()
        print("=== DRY RUN CONTEXT ===")
        print(context)
        print("=== DRY RUN USER PAYLOAD ===")
        print(prompt)
        return

    answer = llm_service.generate_persona_answer(args.question, category, visitor)
    print("=== PERSONA ANSWER ===")
    print(answer)


if __name__ == "__main__":
    main()

