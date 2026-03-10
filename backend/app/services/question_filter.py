"""Question classifier with concept-level topic inference."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple

from ..core.config import settings
from .knowledge_base import get_allowed_topics

BANNED_MESSAGE = settings.blocked_message
OUT_OF_SCOPE_MESSAGE = (
    f"{settings.blocked_message} 프로덕트/UX/경력 맥락으로 다시 질문해 주세요."
)

BANNED_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"규칙(을)? 무시",
    r"탈옥",
    r"jailbreak",
    r"system prompt",
    r"시스템 프롬프트",
    r"시스템 메시지",
    r"프롬프트를 알려",
    r"guardrail",
    r"가드레일",
]

QUESTION_CATEGORIES = {
    "career": ["경력", "career", "이력", "resume", "프로필", "background", "강점", "핵심 역량"],
    "projects": ["프로젝트", "case study", "product", "project", "문제 정의", "성과", "임팩트"],
    "collaboration": ["협업", "communication", "team", "stakeholder", "커뮤니케이션", "조율", "갈등"],
    "process": ["프로세스", "workflow", "방법론", "process", "우선순위", "실행 방식"],
    "decision": ["의사결정", "decision", "trade-off", "트레이드오프", "판단 기준", "기준"],
    "design_system": ["디자인 시스템", "design system", "컴포넌트", "토큰", "component library"],
}

TOPIC_TO_CATEGORY = {
    "design_system": "design_system",
    "collaboration": "collaboration",
    "prioritization": "decision",
    "project_experience": "projects",
    "career_summary": "career",
}


@lru_cache
def _load_topic_aliases() -> dict[str, list[str]]:
    alias_path = Path(__file__).resolve().parents[3] / "knowledge_base" / "topic_aliases.json"
    if not alias_path.exists():
        return {}
    try:
        data = json.loads(alias_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    cleaned: dict[str, list[str]] = {}
    for key, values in data.items():
        if isinstance(values, list):
            cleaned[str(key)] = [str(v).strip().lower() for v in values if str(v).strip()]
    return cleaned


def _normalize(text: str) -> str:
    lowered = text.strip().lower()
    return re.sub(r"\s+", " ", lowered)


def _extract_concepts(text: str) -> list[str]:
    normalized = _normalize(text)
    tokens = re.findall(r"[가-힣a-zA-Z][가-힣a-zA-Z0-9_-]{1,}", normalized)
    stop = {"있나요", "있어", "있는", "경험", "관련", "알려줘", "뭐야", "무엇", "혹시", "해주세요", "해줘"}
    return [t for t in tokens if t not in stop]


def _alias_similarity(question: str, alias: str) -> float:
    q = _normalize(question)
    a = _normalize(alias)
    if a in q:
        return 1.0
    q_tokens = set(_extract_concepts(q))
    a_tokens = set(_extract_concepts(a))
    if not q_tokens or not a_tokens:
        return 0.0
    inter = len(q_tokens & a_tokens)
    if inter == 0:
        return 0.0
    return inter / max(1, len(a_tokens))


def infer_topic(question: str) -> Optional[str]:
    aliases = _load_topic_aliases()
    if not aliases:
        return None
    best_topic = None
    best_score = 0.0
    for topic, topic_aliases in aliases.items():
        score = max((_alias_similarity(question, alias) for alias in topic_aliases), default=0.0)
        if score > best_score:
            best_topic, best_score = topic, score
    if best_score >= 0.4:
        return best_topic
    return None


def detect_category(question: str) -> Optional[str]:
    lowered = _normalize(question)

    inferred_topic = infer_topic(lowered)
    if inferred_topic:
        return TOPIC_TO_CATEGORY.get(inferred_topic, inferred_topic)

    for category, keywords in QUESTION_CATEGORIES.items():
        if any(keyword in lowered for keyword in keywords):
            return category

    for topic in get_allowed_topics():
        if topic.lower() in lowered:
            return topic

    return None


def validate_question(question: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Return (allowed, category, rejection_reason)."""
    lowered = _normalize(question)

    if not lowered:
        return False, None, "질문이 비어 있습니다."

    for pattern in BANNED_PATTERNS:
        if re.search(pattern, lowered, flags=re.IGNORECASE):
            return False, None, BANNED_MESSAGE

    category = detect_category(lowered)

    # Reject less, infer more: unless it's explicitly banned, keep conversation flowing.
    if not category:
        return True, "general", None

    return True, category, None
