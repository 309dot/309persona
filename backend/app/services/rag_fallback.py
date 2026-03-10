from __future__ import annotations

from .answer_quality import contains_internal_artifact
from .answer_sanitize import compact_evidence, sanitize_evidence_text


def rerank_chunks(question: str, chunks: list[dict], top_k: int) -> list[dict]:
    q = (question or "").lower()

    def score(item: dict) -> float:
        base = float(item.get("score", "0") or 0)
        source = str(item.get("source", "")).lower()
        text = str(item.get("text", "")).lower()

        relevance = 0.0
        if any(k in q for k in ["협업", "갈등", "커뮤니케이션"]) and any(k in text for k in ["협업", "조율", "팀", "합의"]):
            relevance += 0.25
        if any(k in q for k in ["전략", "우선순위", "트레이드오프"]) and any(k in text for k in ["우선", "전략", "의사결정", "리스크"]):
            relevance += 0.25
        if any(k in q for k in ["디자인 시스템", "컴포넌트", "토큰"]) and any(k in text for k in ["디자인 시스템", "토큰", "컴포넌트"]):
            relevance += 0.3

        impact = 0.2 if any(k in text for k in ["단축", "%", "개선", "증가", "감소", "리드타임", "오차", "품질"]) else 0.0
        explainability = 0.12 if any(k in text for k in ["프로젝트", "플랫폼", "솔루션", "대시보드"]) else 0.0

        recency = 0.0
        if "2024" in text or "2024" in source:
            recency += 0.08
        elif "2023" in text or "2023" in source:
            recency += 0.04

        return base + relevance + impact + explainability + recency

    ranked = sorted(chunks, key=score, reverse=True)
    return ranked[: max(1, top_k)]


def build_rag_fallback_answer(question: str, rag_chunks: list[dict]) -> str:
    if not rag_chunks:
        return (
            "질문 의도는 이해했지만 지금 가진 근거가 부족해요. "
            "프로젝트명이나 궁금한 관점(협업/전략/성과/디자인 시스템)을 한 줄로 알려주면, "
            "맥락에 맞춰 자연스럽게 다시 풀어볼게요."
        )

    q = question.lower()
    banned = [
        "존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 ai",
        "적용 규칙", "행동 모드", "질문 템플릿", "resume context", "rag retrieved context", "problem-action-result", "par)",
        "프로젝트 설명 템플릿", "형식:", "구조:", "1)", "2)", "3)", "4)", "5)",
    ]
    cleaned = []
    for c in rag_chunks:
        txt = sanitize_evidence_text(c.get("text") or "")
        low = txt.lower()
        if not txt or any(b in low for b in banned) or contains_internal_artifact(txt):
            continue
        cleaned.append(txt)

    evidence_1 = compact_evidence(cleaned[0], 92) if len(cleaned) > 0 else "프로젝트 문제를 빠르게 구조화한 경험"
    evidence_2 = compact_evidence(cleaned[1], 92) if len(cleaned) > 1 else "실행 흐름을 단순화해 팀 의사결정 속도를 높인 경험"

    if "최근" in q and any(k in q for k in ["2년", "프로젝트", "핵심"]):
        return (
            "최근 2년 기준으로 임팩트가 큰 사례만 압축해서 말하면 두 축이에요. "
            f"첫째는 {evidence_1} 쪽으로, 공통 컴포넌트/토큰 기준을 다시 세워 설계-개발 사이클 자체를 줄인 케이스였어요. "
            f"둘째는 {evidence_2} 쪽으로, 흩어진 화면 규칙을 한 기준으로 묶어 재작업을 줄인 케이스였고요. "
            "두 사례에서 공통으로 한 일은 문제를 흐름 단위로 다시 정의하고, 결정을 곧바로 작업 단위로 연결한 거였어요. "
            "그래서 결과도 비슷하게 나왔어요. 속도는 빨라지고, 변경 대응 시 품질 흔들림은 줄어드는 방향으로 수렴했습니다."
        )

    if "디자인 시스템" in q or "컴포넌트" in q or "토큰" in q:
        return (
            f"있어요. 대표적으로 {evidence_1} 사례에서 디자인 토큰과 컴포넌트 기준을 재정의해 화면별 편차를 줄였고, "
            f"{evidence_2} 사례에서는 패턴을 공통 규칙으로 묶어 신규 화면 작업 시 재사용률을 올렸어요. "
            "제가 집중한 건 예쁜 문서가 아니라 운영되는 기준이었어요. 상태 규칙까지 문서화하고, 리뷰 루프에 강제 연결해 디자이너/개발자 해석 차이를 줄였습니다. "
            "그 결과 설계-개발 리드타임이 단축됐고, 변경 요청이 들어와도 영향 범위를 빠르게 판단할 수 있게 됐어요."
        )

    if "협업" in q or "커뮤니케이션" in q or "갈등" in q:
        return (
            "협업 이슈를 풀 때 제가 가장 먼저 하는 건 사람을 설득하는 게 아니라 기준을 맞추는 일이었어요. "
            "요구사항이 자주 바뀌는 상황일수록 합의 기준을 문서화하고, 회의에서 정한 결정을 바로 실행 단위로 연결해야 팀이 흔들리지 않더라고요. "
            f"실제로 {evidence_1} 같은 사례에서 우선순위를 다시 합의한 뒤 담당·일정·검증 기준을 바로 고정했고, "
            f"{evidence_2}에서도 같은 방식으로 갈등을 줄였어요. 결과적으로 해석 차이와 재작업이 줄고, 결정에서 실행으로 넘어가는 속도가 안정적으로 빨라졌어요."
        )

    if "우선순위" in q or "전략" in q or "트레이드오프" in q:
        return (
            "우선순위를 정할 때는 '좋아 보이는 기능'보다 사용자 가치와 비즈니스 효과, 구현 복잡도를 같이 봤어요. "
            "핵심 시나리오를 먼저 고정해 팀의 집중도를 만들고, 부가 기능은 검증 이후 단계로 미루는 식으로 리스크를 관리했어요. "
            f"예를 들어 {evidence_1}에서 요청사항을 문제 단위로 다시 분류해 순서를 재정렬했고, "
            f"{evidence_2}에서도 핵심 흐름과 확장 흐름을 분리해 출시 지연 가능성을 낮췄어요. "
            "이 방식 덕분에 품질을 크게 해치지 않으면서 실행 속도를 끌어올릴 수 있었고, 팀 내 커뮤니케이션 비용도 함께 줄었어요."
        )

    return (
        f"핵심만 말하면 {evidence_1}과 {evidence_2} 두 사례에서 같은 패턴이 반복됐어요. "
        "먼저 문제를 흐름 단위로 다시 정의하고, 그다음 결정을 바로 실행 단위로 바꿔서 팀이 같은 기준으로 움직이게 만들었습니다. "
        "이 순서를 지키면 초반 속도만 빨라지는 게 아니라, 운영 단계에서 변경 요청이 들어왔을 때도 품질을 유지한 채 대응 속도를 낼 수 있었어요."
    )
