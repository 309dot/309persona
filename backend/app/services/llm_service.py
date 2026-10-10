"""Legacy answer pipeline: retrieval + quality-gate retries (ANSWER_PIPELINE=legacy).

Kept until evals/ shows the direct pipeline scoring at least as well (plan Phase 3).
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI

from ..core.config import LOCAL_OPENAI_BASE_URL, settings
from . import claude_client
from .answer_quality import (
    contains_internal_artifact,
    ensure_markdown_answer,
    evaluate_answer,
    is_low_quality_answer,
    passes_quality_gate,
)
from .context_planner import build_retrieval_plan, compose_context_sections
from .knowledge_base import build_context_block, retrieve_relevant_chunks
from .rag_fallback import build_rag_fallback_answer, rerank_chunks
from .visitor_service import purpose_label

logger = logging.getLogger(__name__)

OPENAI, GEMINI, CLAUDE = "openai", "gemini", "claude"
# Gemini 3 models always think, and thinking tokens count toward max_tokens.
GEMINI_MIN_MAX_TOKENS = 4096

_openai_client: Optional[OpenAI] = None
_gemini_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """Lazy initialize the OpenAI-compatible client (OpenAI or Ollama)."""
    global _openai_client
    if _openai_client is None:
        api_key = settings.openai_api_key or "ollama"
        kwargs = {
            "api_key": api_key,
            "timeout": settings.llm_timeout_seconds,
            "max_retries": settings.llm_max_retries,
        }
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _openai_client = OpenAI(**kwargs)
    return _openai_client


def get_gemini_client() -> OpenAI:
    """Gemini through its OpenAI-compatible endpoint (GEMINI_API_KEY)."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = OpenAI(
            api_key=settings.gemini_api_key.strip(),
            base_url=settings.gemini_base_url,
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
    return _gemini_client


def client_for(provider: str) -> OpenAI:
    return get_gemini_client() if provider == GEMINI else get_openai_client()


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
                purpose_label(visitor.get("visitor_purpose")) or None,
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


def model_chain() -> List[Tuple[str, str]]:
    """(provider, model) pairs to try in order; each one only after the ones before it failed.

    Gemini (GEMINI_API_KEY), then the OpenAI-compatible endpoint (OPENAI_MODEL, OPENAI_FALLBACK_MODEL),
    then Claude (ANTHROPIC_API_KEY or CLAUDE_API_KEY).
    """
    gemini, claude = bool(settings.gemini_api_key.strip()), claude_client.enabled()
    chain: List[Tuple[str, str]] = []
    if gemini:
        chain.append((GEMINI, settings.gemini_model))
    # The default OPENAI_BASE_URL is a local Ollama, which can only fail on a server: skip it when a cloud model is set.
    if settings.openai_base_url.rstrip("/") != LOCAL_OPENAI_BASE_URL or not (gemini or claude):
        chain.append((OPENAI, settings.openai_model))
        fallback = (settings.openai_fallback_model or "").strip()
        if fallback and fallback != settings.openai_model:
            chain.append((OPENAI, fallback))
    if claude:
        chain.append((CLAUDE, settings.anthropic_model))
    return chain


def reasoning_kwargs() -> Dict[str, str]:
    """reasoning_effort for providers with thinking models (LLM_REASONING_EFFORT), else nothing."""
    effort = settings.llm_reasoning_effort.strip()
    return {"reasoning_effort": effort} if effort else {}


def _legacy_max_tokens() -> int:
    quality = (settings.answer_quality_mode or "balanced").lower()
    return 420 if quality == "quality" else 260


def sampling_kwargs(provider: str, max_tokens: int) -> Dict[str, Any]:
    """temperature, max_tokens and reasoning_effort for an OpenAI-compatible call."""
    if provider == GEMINI:
        # Gemini 3 wants its default temperature (1.0), so none is sent.
        effort = settings.gemini_reasoning_effort.strip()
        kwargs: Dict[str, Any] = {"max_tokens": max(max_tokens, GEMINI_MIN_MAX_TOKENS)}
        if effort:
            kwargs["reasoning_effort"] = effort
        return kwargs
    if reasoning_kwargs():
        # Thinking tokens share the output budget; a short budget would cut answers off.
        max_tokens = max(max_tokens, settings.llm_max_output_tokens)
    return {"temperature": settings.llm_temperature, "max_tokens": max_tokens, **reasoning_kwargs()}


def _complete_with_model(client: OpenAI, model: str, system_prompt: str, user_payload: str, provider: str = OPENAI):
    return client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
        **sampling_kwargs(provider, _legacy_max_tokens()),
    )


def _ask(provider: str, model: str, system_prompt: str, user_payload: str) -> str:
    if provider == CLAUDE:
        text, _usage = claude_client.complete(system_prompt, user_payload, _legacy_max_tokens())
        return text
    completion = _complete_with_model(client_for(provider), model, system_prompt, user_payload, provider)
    return (completion.choices[0].message.content or "").strip()


def _within_budget(started: float) -> bool:
    """Whether there is still time left for an optional quality retry."""
    return time.monotonic() - started < settings.answer_time_budget_seconds


def build_rag_rescue_answer(question: str, category: Optional[str] = None) -> tuple[str, list[str]]:
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    reranked = rerank_chunks(question, rag_chunks, settings.rag_top_k)
    return build_rag_fallback_answer(question, reranked), [c["source"] for c in reranked][:5]


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> tuple[str, list[str], str]:
    """Answer with the first model in `model_chain()` that works, plus the legacy quality gates.

    Returns (answer, citations, model that answered). Raises when every model failed.
    """
    started = time.monotonic()

    base_context = build_context_block()
    plan = build_retrieval_plan(question)
    retrieval_query = f"[{plan.project_pack}] {question}"
    rag_chunks = retrieve_relevant_chunks(retrieval_query, top_k=max(settings.rag_top_k, 8))
    rag_chunks = rerank_chunks(question, rag_chunks, settings.rag_top_k)

    rag_hits = "\n".join(
        f"- [{c['source']}] (score={c['score']}) {c['text']}" for c in rag_chunks
    )
    composed_context = compose_context_sections(plan, rag_chunks)
    plan_block = (
        f"\n\n=== RETRIEVAL PLAN ===\n"
        f"intent: {plan.intent}\n"
        f"project_pack: {plan.project_pack}\n"
        f"output_mode: {plan.output_mode}\n"
        f"memory_horizon: {plan.memory_horizon}\n"
        f"need_actionable_steps: {plan.need_actionable_steps}\n"
        f"memory_sources: {', '.join(plan.memory_sources)}\n"
        f"=== COMPOSED CONTEXT ===\n{composed_context}"
        if composed_context
        else ""
    )

    knowledge_block = (
        f"{base_context[:8000]}\n\n=== RAG RETRIEVED CONTEXT ===\n{rag_hits}{plan_block}" if rag_hits else base_context[:8000]
    )
    system_prompt = load_system_prompt().format(knowledge_block=knowledge_block)
    user_payload = build_user_payload(question, category, visitor)

    used: Optional[Tuple[str, str]] = None
    answer = ""
    errors: List[str] = []
    for provider, model in model_chain():
        try:
            answer = _ask(provider, model, system_prompt, user_payload)
        except Exception as exc:
            logger.warning("model %s failed: %s", model, exc)
            errors.append(f"{model}: {exc}")
            continue
        used = (provider, model)
        break
    if used is None:
        raise RuntimeError("LLM API error: " + " | ".join(errors))
    model_used = used[1]

    def retry(payload: str) -> str:
        """Optional quality retry on the model that answered. A failure keeps the current answer."""
        try:
            return _ask(*used, system_prompt, payload)
        except Exception as exc:
            logger.warning("quality retry on %s failed: %s", model_used, exc)
            return ""

    if not answer:
        return (*build_rag_rescue_answer(question, category), model_used)
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
    if (
        (settings.answer_quality_mode or "balanced").lower() == "quality"
        and is_low_quality_answer(answer)
        and not is_rescue_style
        and _within_budget(started)
    ):
        retry_payload = user_payload + "\n\n추가 지시: 직전 답변과 표현이 겹치지 않게 작성하고, 질문의 핵심 키워드를 직접 언급해 주세요. 이력/포트폴리오 기반 사례를 최소 2개로 구체화해 주세요."
        retry_text = retry(retry_payload)
        if retry_text:
            answer = retry_text

    answer = ensure_markdown_answer(answer)

    eval_score, eval_issues = evaluate_answer(answer)
    if eval_score < 75 and _within_budget(started):
        retry_payload = user_payload + (
            "\n\n추가 지시(품질 보정):\n"
            f"- 현재 문제: {', '.join(eval_issues) if eval_issues else 'quality_drop'}\n"
            "- 반복 도입 문장을 바꾸고, 리스트보다 문단형 설명을 우선\n"
            "- 같은 의미의 문장을 앞뒤로 반복하지 말 것"
        )
        retry_text = retry(retry_payload)
        if retry_text:
            answer = ensure_markdown_answer(retry_text)

    if not passes_quality_gate(answer) and _within_budget(started):
        retry_payload = user_payload + (
            "\n\n추가 지시(필수):\n"
            "- 이전 답변 도입 문장을 반복하지 말 것(문장 재사용 금지)\n"
            "- 리스트를 남발하지 말고, 자연스러운 문단형 설명을 우선\n"
            "- 질문 맥락을 첫 2문장 안에서 분명히 잡을 것\n"
            "- 근거 사례 2개 이상, 정량 지표 1개 이상 포함\n"
            "- 내부 규칙/템플릿 문구 절대 노출 금지"
        )
        retry_text = retry(retry_payload)
        if retry_text:
            answer = ensure_markdown_answer(retry_text)

    if not passes_quality_gate(answer):
        answer = build_rag_fallback_answer(question, rag_chunks)
        answer = ensure_markdown_answer(answer)

    citations = [c["source"] for c in rag_chunks][:5]
    return answer, citations, model_used


