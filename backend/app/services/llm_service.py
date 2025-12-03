"""Wrapper around OpenAI to keep persona responses consistent."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

from openai import OpenAI

from ..core.config import settings
from .knowledge_base import build_context_block

_openai_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """Lazy initialize the OpenAI client."""
    global _openai_client
    if _openai_client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


@lru_cache
def load_system_prompt() -> str:
    """Load persona system prompt template."""
    prompt_path = (
        Path(__file__).resolve().parent.parent / "prompts" / "system_prompt.txt"
    )
    with prompt_path.open(encoding="utf-8") as prompt_file:
        return prompt_file.read().strip()


def build_user_payload(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> str:
    """Compose the user-facing payload that guides the answer."""
    visitor_meta = ", ".join(
        filter(
            None,
            [
                visitor.get("visitor_name"),
                visitor.get("visitor_affiliation"),
                visitor.get("visit_ref"),
            ],
        )
    )
    category_text = f"질문 카테고리: {category or 'general'}"
    return (
        f"{category_text}\n"
        f"방문자 정보: {visitor_meta or '익명 방문자'}\n"
        f"질문: {question.strip()}"
    )


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> str:
    """Call OpenAI with persona/system prompts and the knowledge base."""
    client = get_openai_client()
    context_block = build_context_block()
    system_prompt = load_system_prompt().format(knowledge_block=context_block)
    user_payload = build_user_payload(question, category, visitor)

    try:
        completion = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.35,
            max_tokens=600,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": user_payload,
                },
            ],
        )
    except Exception as exc:  # pragma: no cover - upstream error
        raise RuntimeError(f"OpenAI API error: {exc}") from exc

    message = completion.choices[0].message
    return message.content or settings.blocked_message


