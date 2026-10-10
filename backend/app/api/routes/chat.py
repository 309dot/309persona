"""Chat endpoints: JSON (/api/chat), Server-Sent Events (/api/chat/stream) and answer feedback."""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ...core.rate_limiter import client_ip
from ...services import chat_runner, conversation_service
from ...services.direct_pipeline import HistoryTurn
from .. import schemas

router = APIRouter()

# Comment lines keep proxies from closing the connection while the model is slow to start.
PING_SECONDS = 15
SESSION_NOT_FOUND = "세션을 찾을 수 없습니다."


def _prepare(payload: schemas.ChatRequest, request: Request) -> chat_runner.Turn:
    history = [HistoryTurn(question=item.question, answer=item.answer) for item in payload.history]
    try:
        return chat_runner.prepare_turn(payload.session_id, payload.question, history, client_ip(request))
    except chat_runner.SessionNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=SESSION_NOT_FOUND) from exc


@router.post("", response_model=schemas.ChatResponse)
def ask_question(payload: schemas.ChatRequest, request: Request):
    """Whole answer in one response. Kept for clients that don't stream."""
    turn = _prepare(payload, request)
    if turn.blocked:
        return schemas.ChatResponse(session_id=payload.session_id, **turn.blocked)

    events: List[Tuple[str, Dict[str, Any]]] = []
    chat_runner.run_turn(turn, lambda event, data: events.append((event, data)), threading.Event())
    event, data = events[-1]
    if event == "error":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=data)
    return schemas.ChatResponse(session_id=payload.session_id, **data)


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


async def _event_stream(turn: chat_runner.Turn) -> AsyncIterator[str]:
    if turn.blocked:
        yield _sse("blocked", turn.blocked)
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Optional[Tuple[str, Dict[str, Any]]]] = asyncio.Queue()
    cancel = threading.Event()

    def emit(event: str, data: Dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (event, data))

    def produce() -> None:
        try:
            chat_runner.run_turn(turn, emit, cancel)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, produce)
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=PING_SECONDS)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                continue
            if item is None:
                break
            yield _sse(*item)
    finally:
        # Client went away (or we finished): stop reading from the model.
        cancel.set()


@router.post("/stream")
async def ask_question_stream(payload: schemas.ChatRequest, request: Request):
    """Answer as Server-Sent Events: start, delta…, then done | error (or a single blocked)."""
    turn = await run_in_threadpool(_prepare, payload, request)
    return StreamingResponse(
        _event_stream(turn),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/feedback")
def submit_feedback(payload: schemas.FeedbackCreate):
    saved = conversation_service.record_feedback(payload.session_id, payload.conversation_id, payload.rating)
    if not saved:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="답변을 찾을 수 없습니다.")
    return {"ok": True}
