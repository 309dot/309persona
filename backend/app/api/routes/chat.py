"""Chat endpoints for question/answer workflow."""

import logging
from typing import List, Optional

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
    limiter = get_session_rate_limiter()

    def respond(
        answer: str,
        category: Optional[str],
        *,
        blocked: bool = False,
        reason: Optional[str] = None,
        citations: Optional[List[str]] = None,
    ) -> schemas.ChatResponse:
        return schemas.ChatResponse(
            session_id=payload.session_id,
            answer=answer,
            blocked=blocked,
            reason=reason,
            category=category,
            citations=citations or [],
            remaining=limiter.remaining(payload.session_id),
            limit=limiter.limit,
        )

    try:
        visitor = visitor_service.get_visitor_by_session(payload.session_id)
        if not visitor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다."
            )

        def log(answer: str, category: Optional[str], blocked: bool) -> None:
            conversation_service.log_conversation(
                session_id=payload.session_id,
                visitor_id=visitor.get("id", payload.session_id),
                question=payload.question,
                answer=answer,
                category=category,
                is_blocked=blocked,
            )

        if not limiter.touch(payload.session_id):
            reason = "세션당 허용된 질문 수를 초과했습니다. 새 세션으로 다시 시도해 주세요."
            log(reason, None, True)
            return respond(reason, None, blocked=True, reason=reason)

        allowed, category, rejection = question_filter.validate_question(payload.question)
        if not allowed:
            message = rejection or settings.blocked_message
            log(message, category, True)
            return respond(message, category, blocked=True, reason=message)

        try:
            answer, citations = llm_service.generate_persona_answer(payload.question, category, visitor)
            if "경력 관련 질문만 응답" in (answer or "") and category:
                logger.warning("fallback phrase detected in non-blocked path; forcing rag rescue answer")
                answer, citations = llm_service.build_rag_rescue_answer(payload.question, category)
        except Exception as exc:
            logger.exception("persona answer generation failed: %s", exc)
            answer, citations = llm_service.build_rag_rescue_answer(payload.question, category)
            log(answer, category, False)
            return respond(answer, category, citations=citations)

        if "경력 관련 질문만 응답" in (answer or ""):
            answer, citations = llm_service.build_rag_rescue_answer(payload.question, category)

        log(answer, category, False)
        return respond(answer, category, citations=citations)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("chat endpoint unexpected error: %s", exc)
        # Never leak 500 to user-facing chat; degrade gracefully.
        return respond(
            "잠시 응답 품질 점검 중이에요. 지금 질문은 받아두었고, 같은 질문을 한 번만 다시 보내주시면 안정적으로 답할게요.",
            "general",
        )
