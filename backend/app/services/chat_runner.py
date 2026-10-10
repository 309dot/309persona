"""One visitor question end to end: limits, filter, answer pipeline, logging.

Both /api/chat (JSON) and /api/chat/stream (SSE) run the same steps; the runner
reports progress through `emit(event, data)`:

    start       {remaining, limit, related}  related: knowledge map node ids guessed from the question
    delta       {text}
    answer_end  {}  answer text complete, metadata still coming (direct pipeline only)
    done        {answer, citations, sources, follow_ups, category, conversation_id, remaining, limit}
    error       {code, message, retryable, remaining, limit}

A question refused before reaching the model (limits, prompt-injection filter)
comes back from `prepare_turn` as `Turn.blocked` instead.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

from ..core.config import settings
from ..core.rate_limiter import get_ip_question_limiter, get_session_rate_limiter
from . import conversation_service, direct_pipeline, knowledge_graph, llm_service, question_filter, visitor_service
from .direct_pipeline import HistoryTurn, PipelineResult
from .knowledge_document import label_sources

logger = logging.getLogger(__name__)

Emit = Callable[[str, Dict[str, Any]], None]

SESSION_LIMIT_MESSAGE = "세션당 허용된 질문 수를 초과했습니다. 새 세션으로 다시 시도해 주세요."
IP_LIMIT_MESSAGE = "같은 네트워크에서 짧은 시간에 질문이 많이 들어왔어요. 잠시 후 다시 시도해 주세요."
FAILURE_MESSAGE = "지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요."
# Legacy pipeline: the model sometimes echoes the refusal line instead of answering.
LEGACY_REFUSAL_ECHO = "경력 관련 질문만 응답"


class SessionNotFound(Exception):
    pass


@dataclass
class Turn:
    session_id: str
    question: str
    ip: str
    visitor: Dict[str, Any]
    history: List[HistoryTurn] = field(default_factory=list)
    category: Optional[str] = None
    blocked: Optional[Dict[str, Any]] = None


def _quota(turn: Turn) -> Dict[str, int]:
    limiter = get_session_rate_limiter()
    return {"remaining": limiter.remaining(turn.session_id), "limit": limiter.limit}


def _log(turn: Turn, answer: str, *, blocked: bool, **metrics: Any) -> Optional[str]:
    return conversation_service.log_conversation(
        session_id=turn.session_id,
        visitor_id=turn.visitor.get("id", turn.session_id),
        question=turn.question,
        answer=answer,
        category=turn.category,
        is_blocked=blocked,
        **metrics,
    )


def _block(turn: Turn, reason: str) -> Turn:
    _log(turn, reason, blocked=True)
    turn.blocked = {
        "answer": reason,
        "reason": reason,
        "blocked": True,
        "category": turn.category,
        "citations": [],
        "sources": [],
        "follow_ups": [],
        **_quota(turn),
    }
    return turn


def prepare_turn(session_id: str, question: str, history: Sequence[HistoryTurn], ip: str) -> Turn:
    """Look up the session and apply limits and the injection filter before any LLM work."""
    visitor = visitor_service.get_visitor_by_session(session_id)
    if not visitor:
        raise SessionNotFound(session_id)
    turn = Turn(session_id=session_id, question=question, ip=ip, visitor=visitor, history=list(history))

    session_limiter, ip_limiter = get_session_rate_limiter(), get_ip_question_limiter()
    if session_limiter.remaining(session_id) <= 0:
        return _block(turn, SESSION_LIMIT_MESSAGE)
    if ip_limiter.remaining(ip) <= 0:
        return _block(turn, IP_LIMIT_MESSAGE)
    session_limiter.touch(session_id)
    ip_limiter.touch(ip)

    allowed, category, rejection = question_filter.validate_question(question)
    turn.category = category
    if not allowed:
        return _block(turn, rejection or settings.blocked_message)
    return turn


def current_pipeline() -> str:
    return "direct" if settings.answer_pipeline == "direct" else "legacy"


def generate(
    pipeline: str,
    turn: Turn,
    on_delta: Callable[[str], None],
    cancel: threading.Event,
    on_answer_end: Optional[Callable[[], None]] = None,
) -> PipelineResult:
    """Run one answer pipeline. Raises on LLM errors. Also used by evals/ to compare pipelines."""
    if pipeline == "direct":
        return direct_pipeline.stream_answer(
            turn.question, turn.visitor, turn.history, on_delta, cancel, on_answer_end
        )

    answer, citations, model = llm_service.generate_persona_answer(turn.question, turn.category, turn.visitor)
    if LEGACY_REFUSAL_ECHO in (answer or ""):
        answer, citations = llm_service.build_rag_rescue_answer(turn.question, turn.category)
    answer = (answer or "").strip()
    if answer:
        on_delta(answer)
    return PipelineResult(answer=answer, sources=list(citations), topic=turn.category, model=model)


def _refund(turn: Turn) -> None:
    get_session_rate_limiter().release(turn.session_id)
    get_ip_question_limiter().release(turn.ip)


def run_turn(turn: Turn, emit: Emit, cancel: threading.Event) -> None:
    """Generate the answer for a prepared, unblocked turn and report it through `emit`."""
    pipeline = current_pipeline()
    # A guess from the question's words, so the knowledge map can light up before the answer.
    emit("start", {**_quota(turn), "related": knowledge_graph.related_nodes(turn.question)})
    started = time.monotonic()
    first_token_ms: Optional[int] = None

    def on_delta(text: str) -> None:
        nonlocal first_token_ms
        if first_token_ms is None:
            first_token_ms = int((time.monotonic() - started) * 1000)
        emit("delta", {"text": text})

    def fail(code: str) -> None:
        # The visitor didn't get an answer, so the question doesn't count.
        _refund(turn)
        _log(turn, "", blocked=False, pipeline=pipeline, error=code, latency_ms=int((time.monotonic() - started) * 1000))
        emit("error", {"code": code, "message": FAILURE_MESSAGE, "retryable": True, **_quota(turn)})

    try:
        result = generate(pipeline, turn, on_delta, cancel, lambda: emit("answer_end", {}))
    except Exception as exc:
        logger.exception("answer generation failed (%s pipeline): %s", pipeline, exc)
        fail("llm_unavailable")
        return

    latency_ms = int((time.monotonic() - started) * 1000)
    if cancel.is_set():
        _log(turn, result.answer, blocked=False, pipeline=pipeline, error="client_disconnected", latency_ms=latency_ms)
        return
    if not result.answer.strip():
        fail("empty_answer")
        return

    if pipeline == "direct":
        turn.category = result.topic or "general"
    sources = label_sources(result.sources)
    conversation_id = _log(
        turn,
        result.answer,
        blocked=False,
        pipeline=pipeline,
        model=result.model,
        latency_ms=latency_ms,
        first_token_ms=first_token_ms,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        sources=[source["id"] for source in sources],
        follow_ups=result.follow_ups,
    )
    emit(
        "done",
        {
            "answer": result.answer.strip(),
            "blocked": False,
            "category": turn.category,
            "citations": result.sources[:5],
            "sources": sources,
            "follow_ups": result.follow_ups,
            "conversation_id": conversation_id,
            **_quota(turn),
        },
    )
