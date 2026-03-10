"""Wrapper around OpenAI to keep persona responses consistent."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
import subprocess
from typing import Dict, Optional

from openai import OpenAI

from ..core.config import settings
from .answer_quality import (
    contains_internal_artifact,
    ensure_markdown_answer,
    is_low_quality_answer,
    passes_quality_gate,
)
from .knowledge_base import build_context_block, retrieve_relevant_chunks
from .rag_fallback import build_rag_fallback_answer, rerank_chunks

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

    ambiguity_hint = ""
    if (category or "").lower() == "general":
        ambiguity_hint = "- 질문 의도가 모호하면 가장 가까운 주제를 먼저 추론해 답하고, 필요시 첫 문장에 '혹시 ~ 의미하시는 걸까요?'처럼 가볍게 확인한다.\n"

    return (
        f"{category_text}\n"
        f"방문자 정보: {visitor_meta or '익명 방문자'}\n"
        f"질문: {question.strip()}\n\n"
        "작성 규칙:\n"
        "- 이 질문은 309의 경력/프로젝트 범위 내 질문으로 간주하고 답변한다.\n"
        "- 차단 문구(예: '이 서비스는 309의 경력 관련 질문만 응답합니다.')를 그대로 반복하지 않는다.\n"
        "- 고정 템플릿을 강제하지 말고, 질문 의도에 맞게 자연스럽게 구성한다.\n"
        "- 사례 선택은 최신순 단독 기준이 아니라 연관도·임팩트·설명 가능성을 함께 고려한다.\n"
        "- 정량 지표를 포함하되, 같은 지표 반복을 피하고 질문별로 지표 유형을 분산한다.\n"
        "- 행동 동사로 본인 기여를 분명히 쓴다.\n"
        "- 지원 회사 적용 포인트/입사 후 어필 문장은 쓰지 않는다.\n"
        f"{ambiguity_hint}"
        "- 말투는 '했습니다/입니다'보다 자연스러운 '했어요/그래요' 톤을 우선 사용한다.\n"
        "- 이력서/포트폴리오 기반 사례를 최소 2개 포함한다.\n"
        "- 6~11문장 범위에서 밀도 있게 작성한다."
    )


def _complete_with_model(client: OpenAI, model: str, system_prompt: str, user_payload: str):
    quality = (settings.answer_quality_mode or "balanced").lower()
    temperature = 0.45 if quality == "quality" else 0.35
    max_tokens = 420 if quality == "quality" else 260
    return client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
    )


OPENCLAW_AGENT_TEMP_DISABLED = True


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
    reranked = rerank_chunks(question, rag_chunks, settings.rag_top_k)
    return build_rag_fallback_answer(question, reranked), [c["source"] for c in reranked][:5]


def force_intent_answer(question: str, category: Optional[str]) -> tuple[str, list[str]]:
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    citations = [c["source"] for c in rag_chunks][:5]
    return build_rag_fallback_answer(question, rag_chunks), citations


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> tuple[str, list[str]]:
    """Generate persona answer via OpenClaw agent first, then OpenAI-compatible fallback."""
    lowered_q = question.lower()

    base_context = build_context_block()
    rag_chunks = retrieve_relevant_chunks(question, top_k=max(settings.rag_top_k, 8))
    rag_chunks = rerank_chunks(question, rag_chunks, settings.rag_top_k)
    rag_hits = "\n".join(
        f"- [{c['source']}] (score={c['score']}) {c['text']}" for c in rag_chunks
    )
    knowledge_block = (
        f"{base_context[:8000]}\n\n=== RAG RETRIEVED CONTEXT ===\n{rag_hits}" if rag_hits else base_context[:8000]
    )
    system_prompt = load_system_prompt().format(knowledge_block=knowledge_block)
    user_payload = build_user_payload(question, category, visitor)


    if settings.use_openclaw_agent and not OPENCLAW_AGENT_TEMP_DISABLED:
        try:
            answer = _complete_with_openclaw_agent(system_prompt, user_payload)
            if not answer or contains_internal_artifact(answer) or is_low_quality_answer(answer):
                answer = build_rag_fallback_answer(question, rag_chunks)
            answer = ensure_markdown_answer(answer)
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
        return build_rag_rescue_answer(question, category)
    if "경력 관련 질문만 응답" in answer or settings.blocked_message in answer:
        answer = build_rag_fallback_answer(question, rag_chunks)

    bad_phrases = ["존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 AI"]
    if any(p in answer for p in bad_phrases) or contains_internal_artifact(answer):
        answer = build_rag_fallback_answer(question, rag_chunks)

    repetitive_phrases = [
        "디자인 관점과 제품 전략 관점을 함께 보면서 방향성과 실행력을 동시에 끌어올리는",
        "핵심은 기준을 먼저 맞추는 방식이에요",
    ]
    if sum(1 for p in repetitive_phrases if p in answer) >= 2:
        answer = build_rag_fallback_answer(question, rag_chunks)

    if is_low_quality_answer(answer):
        answer = build_rag_fallback_answer(question, rag_chunks)

    is_rescue_style = "## 사례 (PAR)\n- Problem:" in answer
    if (settings.answer_quality_mode or "balanced").lower() == "quality" and is_low_quality_answer(answer) and not is_rescue_style:
        retry_payload = user_payload + "\n\n추가 지시: 직전 답변과 표현이 겹치지 않게 작성하고, 질문의 핵심 키워드를 직접 언급해 주세요. 이력/포트폴리오 기반 사례를 최소 2개로 구체화해 주세요."
        retry = _complete_with_model(client, settings.openai_model, system_prompt, retry_payload)
        retry_text = (retry.choices[0].message.content or "").strip()
        if retry_text:
            answer = retry_text

    answer = ensure_markdown_answer(answer)

    if not passes_quality_gate(answer):
        retry_payload = user_payload + (
            "\n\n추가 지시(필수):\n"
            "- 이전 답변 도입 문장을 반복하지 말 것(문장 재사용 금지)\n"
            "- 리스트를 남발하지 말고, 자연스러운 문단형 설명을 우선\n"
            "- 질문 맥락을 첫 2문장 안에서 분명히 잡을 것\n"
            "- 근거 사례 2개 이상, 정량 지표 1개 이상 포함\n"
            "- 내부 규칙/템플릿 문구 절대 노출 금지"
        )
        retry = _complete_with_model(client, settings.openai_model, system_prompt, retry_payload)
        retry_text = (retry.choices[0].message.content or "").strip()
        if retry_text:
            answer = ensure_markdown_answer(retry_text)

    if not passes_quality_gate(answer):
        answer = build_rag_fallback_answer(question, rag_chunks)
        answer = ensure_markdown_answer(answer)

    citations = [c["source"] for c in rag_chunks][:5]
    return answer, citations


