from __future__ import annotations


BAD_ARTIFACT_MARKERS = [
    "resume context",
    "rag retrieved context",
    "질문 템플릿",
    "답변 규칙",
    "적용 규칙",
    "행동 모드",
    "## 8.",
    "## 5.",
]


def contains_internal_artifact(text: str) -> bool:
    low = (text or "").lower()
    return any(m in low for m in BAD_ARTIFACT_MARKERS)


def ensure_markdown_answer(answer: str) -> str:
    text = (answer or "").strip()
    return text


def passes_quality_gate(answer: str) -> bool:
    text = (answer or "").strip()
    if len(text) < 280:
        return False
    if contains_internal_artifact(text):
        return False
    return True


def evaluate_answer(answer: str) -> tuple[int, list[str]]:
    text = (answer or "").strip()
    score = 100
    issues: list[str] = []

    if len(text) < 260:
        score -= 25
        issues.append("too_short")

    repetitive_openers = [
        "질문 의도에 가장 가까운",
        "핵심은 모호한 요구를",
        "핵심만 말하면",
    ]
    opener_hits = sum(1 for p in repetitive_openers if p in text)
    if opener_hits >= 2:
        score -= 20
        issues.append("repetitive_openers")

    if text.count("- ") >= 5:
        score -= 15
        issues.append("list_heavy")

    if contains_internal_artifact(text):
        score -= 40
        issues.append("internal_artifact")

    return max(score, 0), issues


def is_low_quality_answer(answer: str) -> bool:
    if not answer:
        return True
    text = answer.strip()
    if len(text) < 120:
        return True
    repetitive_markers = [
        "디자인 관점과 제품 전략 관점을 함께 보면서",
        "입사 후에도 불확실한 요구사항을 빠르게 정리하고",
        "## 핵심요약",
        "## 사례 (PAR)",
        "## 채용 관점 기대효과",
    ]
    marker_hits = sum(1 for m in repetitive_markers if m in text)
    return marker_hits >= 3 and len(text) < 560
