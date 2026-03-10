"""Smoke checks for answer quality/refactor regressions.

Run:
  cd backend && ./.venv/bin/python scripts/answer_quality_smoke_test.py
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.answer_quality import (
    contains_internal_artifact,
    ensure_markdown_answer,
    evaluate_answer,
    passes_quality_gate,
)
from app.services.rag_fallback import build_rag_fallback_answer


def test_internal_artifact_detection() -> None:
    assert contains_internal_artifact("Resume Context should never leak") is True
    assert contains_internal_artifact("정상 답변입니다") is False


def test_markdown_enforcement() -> None:
    raw = "디자인 시스템 경험이 있습니다"
    normalized = ensure_markdown_answer(raw)
    assert normalized == raw


def test_fallback_shape() -> None:
    chunks = [
        {
            "text": "페이히어 디자인 시스템 (2022–2023) 컴포넌트/토큰 재정의로 디자인 작업시간 3.5→1.3일, 개발 4→2.5일로 단축",
            "source": "project:페이히어 디자인 시스템",
            "score": "0.88",
        },
        {
            "text": "디자인 시스템 구축 및 전사적 리뉴얼 주도",
            "source": "extra:98",
            "score": "0.55",
        },
    ]
    answer = build_rag_fallback_answer("디자인 시스템 구축 경험 알려줘", chunks)
    assert "Resume Context" not in answer
    assert "페이히어" in answer or "디자인 시스템" in answer
    assert len(answer) > 120


def test_quality_gate() -> None:
    bad = "짧은 답변"
    assert passes_quality_gate(bad) is False

    good = """## 요약
질문 의도에 맞춰 답변합니다. 이 답변은 구조화된 흐름으로 문제 정의, 실행, 결과를 분명하게 보여줍니다.

## 근거 사례
- 사례 1: 디자인 시스템 도입으로 화면 간 일관성을 확보했고, 컴포넌트 재사용률을 높였습니다.
- 사례 2: 토큰 체계를 정리해 디자이너와 개발자 간 해석 차이를 줄였습니다.
- 행동 1: 기준을 문서화하고 리뷰 루프를 고정했습니다.
- 행동 2: 변경 영향 범위를 사전에 계산하도록 워크플로우를 만들었습니다.

## 결과
- 설계 리드타임이 단축되었습니다.
- 재작업 비율이 감소했습니다.
- QA 커뮤니케이션 비용이 줄었습니다.
- 릴리즈 안정성이 개선되었습니다.
- 운영 중 변경 대응 속도가 향상되었습니다.
- 팀의 의사결정 일관성이 올라갔습니다.
"""
    assert passes_quality_gate(good) is True


def test_evaluator() -> None:
    bad = "질문 의도에 가장 가까운 답변입니다. 질문 의도에 가장 가까운 답변입니다. - a - b - c - d - e"
    score, issues = evaluate_answer(bad)
    assert score < 75
    assert issues


def main() -> None:
    test_internal_artifact_detection()
    test_markdown_enforcement()
    test_fallback_shape()
    test_quality_gate()
    test_evaluator()
    print("answer_quality_smoke_test: PASS")


if __name__ == "__main__":
    main()
