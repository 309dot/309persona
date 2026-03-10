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
            "## 요약\n"
            "질문 의도는 이해했지만 현재 지식베이스 근거가 부족해요.\n\n"
            "## 확인이 필요한 정보\n"
            "- 프로젝트명 또는 도메인\n"
            "- 궁금한 관점(협업/전략/성과/디자인 시스템)\n"
            "- 원하는 답변 깊이(짧게/자세히)"
        )

    q = question.lower()
    banned = [
        "존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 ai",
        "적용 규칙", "행동 모드", "질문 템플릿", "resume context", "rag retrieved context", "problem-action-result", "par)",
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

    if "협업" in q or "커뮤니케이션" in q or "갈등" in q:
        return (
            "## 요약\n"
            "협업 질문의 핵심은 사람별 선호를 맞추는 게 아니라, 팀이 동일한 기준으로 의사결정하도록 구조를 먼저 만드는 거였어요.\n"
            "특히 요구사항이 빠르게 바뀌는 상황에서는 합의된 기준을 문서화하고, 결정 즉시 실행 단위로 연결하는 방식이 효과적이었어요.\n\n"
            "## 근거 사례\n"
            f"- 사례 1: {evidence_1}\n"
            f"- 사례 2: {evidence_2}\n"
            "- 제가 한 행동 1: 이해관계자별 우선순위 기준(사용자 영향/비즈니스 영향/구현 난이도)을 합의했어요.\n"
            "- 제가 한 행동 2: 회의 결정을 바로 태스크로 분해해서 담당자·마감·검증 기준까지 고정했어요.\n"
            "- 제가 한 행동 3: 충돌 이슈는 감정이 아니라 데이터와 사용자 흐름 기준으로 재정렬했어요.\n\n"
            "## 결과\n"
            "- 팀 간 해석 차이와 재작업 빈도가 줄었고\n"
            "- 결정에서 실행까지 걸리는 시간이 안정적으로 짧아졌어요\n"
            "- 변경 요청이 와도 영향 범위를 빠르게 파악해 대응 속도를 유지했어요."
        )

    if "우선순위" in q or "전략" in q or "트레이드오프" in q:
        return (
            "## 요약\n"
            "우선순위는 '좋아 보이는 기능'이 아니라, 사용자 가치·비즈니스 효과·구현 복잡도 세 축으로 동시에 판단했어요.\n"
            "핵심 시나리오를 먼저 고정해 팀의 집중도를 확보하고, 부가 기능은 검증 이후 단계적으로 붙이는 전략을 사용했어요.\n\n"
            "## 근거 사례\n"
            f"- 사례 1: {evidence_1}\n"
            f"- 사례 2: {evidence_2}\n"
            "- 제가 한 행동 1: 요청사항을 문제 단위로 다시 분류해 우선순위 후보를 재정렬했어요.\n"
            "- 제가 한 행동 2: 핵심 흐름과 확장 흐름을 분리해 릴리즈 리스크를 낮췄어요.\n"
            "- 제가 한 행동 3: 변경 요청은 영향 범위와 회수 가능한 비용까지 같이 계산해 결정했어요.\n\n"
            "## 결과\n"
            "- 출시 지연 가능성을 줄였고\n"
            "- 품질 저하 없이 실행 속도를 끌어올렸고\n"
            "- 팀이 같은 판단 기준으로 움직이면서 커뮤니케이션 비용도 줄였어요."
        )

    return (
        "## 요약\n"
        "질문 의도와 가장 가까운 실제 사례를 기준으로, 문제 정의→실행→결과 흐름으로 풀어서 답할게요.\n"
        "핵심은 모호한 요구를 실행 가능한 단위로 바꾸고, 팀이 같은 기준으로 움직이게 만드는 방식이었어요.\n\n"
        "## 근거 사례\n"
        f"- 사례 1: {evidence_1}\n"
        f"- 사례 2: {evidence_2}\n"
        "- 제가 한 행동 1: 사용자 흐름 기준으로 문제를 재정의하고 우선순위를 다시 설계했어요.\n"
        "- 제가 한 행동 2: 결정사항을 바로 작업 단위로 분해해 담당/일정/검증 기준을 고정했어요.\n"
        "- 제가 한 행동 3: 변경 요청이 들어오면 영향 범위를 빠르게 계산해 리스크를 통제했어요.\n\n"
        "## 결과\n"
        "- 속도와 품질을 동시에 개선했고\n"
        "- 재작업과 커뮤니케이션 비용을 줄였고\n"
        "- 운영 단계에서 변경 대응 시간을 더 짧게 유지할 수 있었어요."
    )
