"""Direct pipeline (ANSWER_PIPELINE=direct): one streamed call with the whole knowledge base.

The model writes the answer, then `<<<META>>>` and a JSON line with the sources it
used, follow-up questions and a topic. The parser streams only the answer part.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence

from ..core.config import settings
from .knowledge_base import load_knowledge_pack
from .knowledge_document import render_knowledge_block, source_ids
from .llm_service import get_openai_client

logger = logging.getLogger(__name__)

META_MARKER = "<<<META>>>"
THINK_OPEN, THINK_CLOSE = "<think>", "</think>"
TOPICS = ("career", "projects", "collaboration", "process", "decision", "design_system", "general", "out_of_scope")
MAX_FOLLOW_UPS = 3


@dataclass
class HistoryTurn:
    question: str
    answer: str


@dataclass
class PipelineResult:
    answer: str
    sources: List[str] = field(default_factory=list)
    follow_ups: List[str] = field(default_factory=list)
    topic: Optional[str] = None
    model: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None


def _pack_lines(value: Any) -> str:
    if isinstance(value, list):
        return "\n".join(f"- {item}" for item in value if str(item).strip())
    return str(value or "").strip()


@lru_cache
def build_system_prompt() -> str:
    template = (Path(__file__).resolve().parent.parent / "prompts" / "persona_direct.txt").read_text(encoding="utf-8")
    pack = load_knowledge_pack()
    return (
        template.replace("[[KNOWLEDGE]]", render_knowledge_block())
        .replace("[[SPEAKING_STYLE]]", _pack_lines(pack.get("speaking_style")))
        .replace("[[GUARDRAILS]]", _pack_lines(pack.get("guardrails")))
        .strip()
    )


def visitor_line(visitor: Dict[str, Any]) -> str:
    name = str(visitor.get("visitor_name") or "").strip()
    affiliation = str(visitor.get("visitor_affiliation") or "").strip()
    return " · ".join(part for part in (name, affiliation) if part) or "익명 방문자"


def build_messages(question: str, visitor: Dict[str, Any], history: Sequence[HistoryTurn]) -> List[Dict[str, str]]:
    # The system prompt is identical for every request, so providers can cache it.
    messages = [{"role": "system", "content": build_system_prompt()}]
    turns = list(history)[-settings.chat_history_turns :] if settings.chat_history_turns > 0 else []
    for turn in turns:
        messages.append({"role": "user", "content": turn.question})
        messages.append({"role": "assistant", "content": turn.answer})
    messages.append({"role": "user", "content": f"(방문자: {visitor_line(visitor)})\n{question.strip()}"})
    return messages


class StreamParser:
    """Turns raw model deltas into visible answer text.

    Drops a leading <think>…</think> block (reasoning models) and holds back
    anything from META_MARKER on, including a partial marker split across deltas.
    """

    def __init__(self) -> None:
        self._raw = ""
        self._start: Optional[int] = None  # where the answer begins in _raw
        self._emitted = 0  # answer characters already handed out
        self._visible = False  # leading whitespace of the answer is skipped
        self.answer_complete = False  # the metadata marker arrived; the rest is metadata

    def feed(self, text: str) -> str:
        self._raw += text
        if self._start is None:
            head = self._raw.lstrip()
            offset = len(self._raw) - len(head)
            if head.startswith(THINK_OPEN):
                close = self._raw.find(THINK_CLOSE, offset)
                if close == -1:
                    return ""
                self._start = close + len(THINK_CLOSE)
            elif THINK_OPEN.startswith(head):
                return ""  # empty so far, or could still become "<think>"
            else:
                self._start = offset
        return self._take(final=False)

    def _region(self) -> str:
        return self._raw[self._start or 0 :] if self._start is not None else ""

    def _take(self, final: bool) -> str:
        region = self._region()
        if not self._visible:
            stripped = region.lstrip()
            if not stripped:
                return ""
            self._emitted = len(region) - len(stripped)
            self._visible = True
        marker = region.find(META_MARKER)
        if marker != -1:
            self.answer_complete = True
        end = marker if marker != -1 else len(region)
        if marker == -1 and not final:
            for size in range(min(len(META_MARKER) - 1, len(region)), 0, -1):
                if META_MARKER.startswith(region[-size:]):
                    end = len(region) - size
                    break
        # Trailing whitespace may sit right before the marker; send it along with the next word.
        end = self._emitted + len(region[self._emitted : end].rstrip())
        if end <= self._emitted:
            return ""
        out = region[self._emitted : end]
        self._emitted = end
        return out

    def finish(self) -> tuple[str, str, str]:
        """Return (text not yet emitted, full answer, raw metadata text)."""
        if self._start is None:
            # Stream ended inside a think block or with no text at all.
            return "", "", ""
        tail = self._take(final=True)
        region = self._region()
        marker = region.find(META_MARKER)
        answer = region[:marker] if marker != -1 else region
        meta = region[marker + len(META_MARKER) :] if marker != -1 else ""
        return tail, answer.strip(), meta


def parse_meta(text: str) -> Dict[str, Any]:
    """Sources, follow-ups and topic from the metadata line; anything malformed is dropped."""
    cleaned = re.sub(r"```(?:json)?", "", text or "")
    start, end = cleaned.find("{"), cleaned.rfind("}")
    data: Any = {}
    if start != -1 and end > start:
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            data = {}
    if not isinstance(data, dict):
        data = {}

    known = source_ids()
    sources = [s for s in data.get("sources", []) if isinstance(s, str) and s in known] if isinstance(data.get("sources"), list) else []
    follow_ups: List[str] = []
    if isinstance(data.get("follow_ups"), list):
        for item in data["follow_ups"]:
            if isinstance(item, str) and item.strip() and len(item.strip()) <= 80 and item.strip() not in follow_ups:
                follow_ups.append(item.strip())
    topic = data.get("topic") if data.get("topic") in TOPICS else None
    return {"sources": list(dict.fromkeys(sources)), "follow_ups": follow_ups[:MAX_FOLLOW_UPS], "topic": topic}


def _create_stream(model: str, messages: List[Dict[str, str]]):
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_output_tokens,
        "stream": True,
    }
    if settings.llm_stream_usage:
        kwargs["stream_options"] = {"include_usage": True}
    return get_openai_client().chat.completions.create(**kwargs)


def stream_answer(
    question: str,
    visitor: Dict[str, Any],
    history: Sequence[HistoryTurn],
    on_delta: Callable[[str], None],
    cancel: threading.Event,
    on_answer_end: Optional[Callable[[], None]] = None,
) -> PipelineResult:
    """Stream one answer. Raises on LLM errors so the caller can report an honest failure.

    `on_answer_end` fires when the answer text is complete and only metadata is left,
    so the visitor can move on while sources and follow-ups are still being written.
    """
    messages = build_messages(question, visitor, history)
    models = [settings.openai_model]
    fallback = (settings.openai_fallback_model or "").strip()
    if fallback and fallback != settings.openai_model:
        models.append(fallback)

    parser = StreamParser()
    usage = None
    model_used = settings.openai_model
    emitted_any = False
    answer_ended = False
    for attempt, model in enumerate(models):
        try:
            with _create_stream(model, messages) as stream:
                model_used = model
                for chunk in stream:
                    if cancel.is_set():
                        break
                    if getattr(chunk, "usage", None):
                        usage = chunk.usage
                    if not chunk.choices:
                        continue
                    text = getattr(chunk.choices[0].delta, "content", None) or ""
                    visible = parser.feed(text) if text else ""
                    if visible:
                        emitted_any = True
                        on_delta(visible)
                    if parser.answer_complete and not answer_ended:
                        answer_ended = True
                        if on_answer_end:
                            on_answer_end()
            break
        except Exception:
            if parser.answer_complete:
                # The answer is whole; only metadata was lost.
                logger.warning("stream ended while writing metadata", exc_info=True)
                break
            # Only fall back while nothing has reached the visitor yet.
            if emitted_any or attempt == len(models) - 1:
                raise
            logger.warning("model %s failed before the first token; trying %s", model, models[attempt + 1])
            parser = StreamParser()

    tail, answer, meta_text = parser.finish()
    if tail:
        on_delta(tail)
    meta = parse_meta(meta_text)
    return PipelineResult(
        answer=answer,
        sources=meta["sources"],
        follow_ups=meta["follow_ups"],
        topic=meta["topic"],
        model=model_used,
        prompt_tokens=getattr(usage, "prompt_tokens", None),
        completion_tokens=getattr(usage, "completion_tokens", None),
    )
