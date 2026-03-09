"""Chat endpoints for question/answer workflow."""

import logging

from fastapi import APIRouter, HTTPException, status

from .. import schemas
from ...core.config import settings
from ...core.rate_limiter import get_session_rate_limiter
from ...services import (
    conversation_service,
    llm_service,
    question_filter,
    visitor_service,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=schemas.ChatResponse)
def ask_question(payload: schemas.ChatRequest):
    visitor = visitor_service.get_visitor_by_session(payload.session_id)
    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다."
        )

    limiter = get_session_rate_limiter()
    if not limiter.touch(payload.session_id):
        reason = "세션당 허용된 질문 수를 초과했습니다. 새 세션으로 다시 시도해 주세요."
        conversation_service.log_conversation(
            session_id=payload.session_id,
            visitor_id=visitor.get("id", payload.session_id),
            question=payload.question,
            answer=reason,
            category=None,
            is_blocked=True,
        )
        return schemas.ChatResponse(
            session_id=payload.session_id,
            answer=reason,
            blocked=True,
            reason=reason,
            category=None,
        )

    allowed, category, rejection = question_filter.validate_question(payload.question)
    if not allowed:
        conversation_service.log_conversation(
            session_id=payload.session_id,
            visitor_id=visitor.get("id", payload.session_id),
            question=payload.question,
            answer=rejection or settings.blocked_message,
            category=category,
            is_blocked=True,
        )
        return schemas.ChatResponse(
            session_id=payload.session_id,
            answer=rejection or settings.blocked_message,
            blocked=True,
            reason=rejection or settings.blocked_message,
            category=category,
        )

    try:
        answer, citations = llm_service.generate_persona_answer(payload.question, category, visitor)
    except Exception as exc:
        logger.exception("persona answer generation failed: %s", exc)
        fallback = "지금 답변 엔진 연결이 잠시 불안정합니다. 잠시 후 다시 시도해 주세요."
        conversation_service.log_conversation(
            session_id=payload.session_id,
            visitor_id=visitor.get("id", payload.session_id),
            question=payload.question,
            answer=fallback,
            category=category,
            is_blocked=True,
        )
        return schemas.ChatResponse(
            session_id=payload.session_id,
            answer=fallback,
            blocked=True,
            reason=fallback,
            category=category,
            citations=[],
        )

    conversation_service.log_conversation(
        session_id=payload.session_id,
        visitor_id=visitor.get("id", payload.session_id),
        question=payload.question,
        answer=answer,
        category=category,
        is_blocked=False,
    )

    return schemas.ChatResponse(
        session_id=payload.session_id,
        answer=answer,
        blocked=False,
        reason=None,
        category=category,
        citations=citations,
    )


