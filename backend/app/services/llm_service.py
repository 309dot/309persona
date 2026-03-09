"""Wrapper around OpenAI to keep persona responses consistent."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import subprocess
from typing import Dict, Optional

from openai import OpenAI

from ..core.config import settings
from .knowledge_base import build_context_block, retrieve_relevant_chunks

_openai_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """Lazy initialize the OpenAI-compatible client (OpenAI or Ollama)."""
    global _openai_client
    if _openai_client is None:
        api_key = settings.openai_api_key or "ollama"
        kwargs = {"api_key": api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _openai_client = OpenAI(**kwargs)
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
        f"질문: {question.strip()}\n\n"
        "작성 규칙:\n"
        "- 이 질문은 309의 경력/프로젝트 범위 내 질문으로 간주하고 답변한다.\n"
        "- 차단 문구(예: '이 서비스는 309의 경력 관련 질문만 응답합니다.')를 그대로 반복하지 않는다.\n"
        "- 핵심요약 2~3문장 + 실제 사례 1개(PAR) + 채용관점 기대효과 1문장으로 답한다.\n"
        "- 최대 6문장 이내로 간결하게 작성한다."
    )


def _complete_with_model(client: OpenAI, model: str, system_prompt: str, user_payload: str):
    return client.chat.completions.create(
        model=model,
        temperature=0.35,
        max_tokens=160,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
    )


def _complete_with_openclaw_agent(system_prompt: str, user_payload: str) -> str:
    prompt = (
        "당신은 309persona 답변 전용 에이전트다. 아래 system prompt와 user payload를 따라 짧고 정확하게 답하라. "
        "가능하면 4~6문장 이내로 요약하라.\n\n"
        f"[SYSTEM PROMPT]\n{system_prompt}\n\n"
        f"[USER PAYLOAD]\n{user_payload}\n"
    )
    result = subprocess.run(
        [
            "openclaw",
            "agent",
            "--agent",
            settings.openclaw_answer_agent_id,
            "--message",
            prompt,
            "--json",
            "--thinking",
            "off",
            "--timeout",
            str(settings.openclaw_answer_timeout_seconds),
        ],
        capture_output=True,
        text=True,
        timeout=settings.openclaw_answer_timeout_seconds,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "openclaw agent failed")
    output = (result.stdout or "").strip()
    if not output:
        raise RuntimeError("empty answer from openclaw agent")
    try:
        payload = json.loads(output)
        text = (
            payload.get("response")
            or payload.get("message")
            or payload.get("text")
            or (payload.get("result", {}).get("payloads", [{}])[0].get("text") if isinstance(payload.get("result"), dict) else "")
            or ""
        )
        if text:
            return str(text).strip()
    except Exception:
        pass
    return output


def build_rag_rescue_answer(question: str, category: Optional[str] = None) -> tuple[str, list[str]]:
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    return _build_rag_fallback_answer(question, rag_chunks), [c["source"] for c in rag_chunks][:5]


def _build_rag_fallback_answer(question: str, rag_chunks: list[dict]) -> str:
    if not rag_chunks:
        return "질문 의도는 이해했지만, 현재 지식베이스 근거가 부족합니다. 프로젝트명/관심 포인트를 알려주시면 정확히 답변하겠습니다."
    bullets = []
    for c in rag_chunks[:2]:
        txt = (c.get("text") or "").replace("\n", " ").strip()
        if txt:
            bullets.append(txt[:140])
    joined = " / ".join(bullets)
    return (
        "핵심요약: 최근 프로젝트는 문제를 구조화하고 실행 흐름을 단순화해 성과를 만든 접근이 일관됩니다. "
        f"근거: {joined}. "
        "채용 관점: 복잡한 요구사항을 빠르게 정리해 실행 가능한 제품 전략으로 전환하는 역량을 기대할 수 있습니다."
    )


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> tuple[str, list[str]]:
    """Generate persona answer via OpenClaw agent first, then OpenAI-compatible fallback."""
    base_context = build_context_block()
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    rag_hits = "\n".join(
        f"- [{c['source']}] (score={c['score']}) {c['text']}" for c in rag_chunks
    )
    knowledge_block = (
        f"{base_context[:8000]}\n\n=== RAG RETRIEVED CONTEXT ===\n{rag_hits}" if rag_hits else base_context[:8000]
    )
    system_prompt = load_system_prompt().format(knowledge_block=knowledge_block)
    user_payload = build_user_payload(question, category, visitor)

    if settings.use_openclaw_agent:
        try:
            answer = _complete_with_openclaw_agent(system_prompt, user_payload)
            citations = [c["source"] for c in rag_chunks][:5]
            return answer, citations
        except Exception:
            pass

    client = get_openai_client()
    completion = None
    primary_error: Exception | None = None
    try:
        completion = _complete_with_model(client, settings.openai_model, system_prompt, user_payload)
    except Exception as exc:  # pragma: no cover
        primary_error = exc
        fallback = (settings.openai_fallback_model or "").strip()
        if not fallback or fallback == settings.openai_model:
            raise RuntimeError(f"OpenAI API error (primary): {exc}") from exc
        try:
            completion = _complete_with_model(client, fallback, system_prompt, user_payload)
        except Exception as fallback_exc:  # pragma: no cover
            raise RuntimeError(
                f"OpenAI API error (primary={settings.openai_model}, fallback={fallback}): {primary_error} | {fallback_exc}"
            ) from fallback_exc

    message = completion.choices[0].message
    answer = (message.content or "").strip()
    if not answer:
        raise RuntimeError("empty model output")
    if "경력 관련 질문만 응답" in answer or settings.blocked_message in answer:
        answer = _build_rag_fallback_answer(question, rag_chunks)
    citations = [c["source"] for c in rag_chunks][:5]
    return answer, citations


