"""Rule-based question classifier to keep the agent on-topic."""

from __future__ import annotations

import re
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
    r"연애상담",
    r"날씨",
    r"lottery",
    r"system prompt",
    r"시스템 프롬프트",
    r"시스템 메시지",
    r"프롬프트를 알려",
    r"guardrail",
    r"가드레일",
]

QUESTION_CATEGORIES = {
    "career": ["경력", "career", "이력", "resume", "프로필", "background"],
    "projects": ["프로젝트", "case study", "product", "feature", "project"],
    "collaboration": ["협업", "communication", "team", "stakeholder"],
    "process": ["프로세스", "workflow", "방법론", "process"],
    "decision": ["의사결정", "decision", "trade-off"],
}


def _normalize(text: str) -> str:
    return text.strip().lower()


def detect_category(question: str) -> Optional[str]:
    lowered = _normalize(question)
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

    if "309" not in lowered:
        category = detect_category(lowered)
        if not category:
            return False, None, OUT_OF_SCOPE_MESSAGE
        return True, category, None

    category = detect_category(lowered) or "general"
    return True, category, None


