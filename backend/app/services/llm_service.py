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
    q = question.lower()
    if any(k in q for k in ["협업", "커뮤니케이션", "갈등"]):
        schema = "## 협업 스타일\n## 구체적 상황\n## 결과와 교훈"
    elif any(k in q for k in ["우선순위", "전략", "트레이드오프"]):
        schema = "## 판단 프레임워크\n## 적용 사례\n## 트레이드오프"
    elif any(k in q for k in ["채용", "강점", "경력"]):
        schema = "## 핵심 강점\n## 근거 사례\n## 팀에 기대할 수 있는 점"
    else:
        schema = "## 맥락\n## 문제 정의 과정\n## 해결과 결과"

    return (
        f"{category_text}\n"
        f"방문자 정보: {visitor_meta or '익명 방문자'}\n"
        f"질문: {question.strip()}\n\n"
        "작성 규칙:\n"
        "- 이 질문은 309의 경력/프로젝트 범위 내 질문으로 간주하고 답변한다.\n"
        "- 차단 문구(예: '이 서비스는 309의 경력 관련 질문만 응답합니다.')를 그대로 반복하지 않는다.\n"
        f"- 아래 구조를 사용한다: {schema}\n"
        "- 말투는 '했습니다/입니다'보다 자연스러운 '했어요/그래요' 톤을 우선 사용한다.\n"
        "- 이력서/포트폴리오 기반 사례를 최소 2개 포함한다.\n"
        "- 7~12문장 범위로 구체적으로 작성한다."
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
        return "질문 의도는 이해했지만, 현재 지식베이스 근거가 부족해요. 프로젝트명/관심 포인트를 알려주시면 더 정확히 답할게요."

    q = question.lower()
    banned = ["존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 ai", "적용 규칙", "행동 모드"]
    cleaned = []
    for c in rag_chunks:
        txt = (c.get("text") or "").replace("\n", " ").strip()
        low = txt.lower()
        if not txt or any(b in low for b in banned):
            continue
        cleaned.append(txt)

    evidence_1 = cleaned[0][:120] if len(cleaned) > 0 else "프로젝트 문제를 빠르게 구조화한 경험"
    evidence_2 = cleaned[1][:120] if len(cleaned) > 1 else "실행 흐름을 단순화해 팀 의사결정 속도를 높인 경험"

    if "협업" in q or "커뮤니케이션" in q or "갈등" in q:
        summary = "협업 이슈에서는 먼저 의사결정 기준을 맞추고, 커뮤니케이션 비용을 줄이는 접근이 강점이에요."
        style_line = "특히 역할 경계가 겹치는 구간에서 쟁점을 문서화해 팀 해석을 한 방향으로 맞췄어요."
        case_line = "다기능 팀과 일할 때 우선순위 기준(사용자 영향/비즈니스 영향/개발 난이도)을 명시해 합의 속도를 끌어올렸어요."
        impact = "결과적으로 회의 횟수 대비 결정 품질이 높아지고, 실행으로 넘어가는 리드타임이 줄었어요."
        hiring = "협업 밀도가 높은 조직에서 커뮤니케이션 마찰을 줄이고, 합의-실행 전환을 빠르게 만드는 역할을 기대할 수 있어요."
    elif "우선순위" in q or "전략" in q:
        summary = "우선순위 질문에서는 사용자 가치와 실행 난이도를 동시에 보는 균형 감각이 강점이에요."
        style_line = "아이디어 자체보다 '지금 풀어야 하는 문제'를 먼저 고정한 뒤 로드맵을 설계하는 편이에요."
        case_line = "AI 오디오북 프로젝트에서 기능을 문제 크기·사용자 임팩트·개발 비용 기준으로 재정렬해 실행 순서를 다시 짰어요."
        impact = "핵심 기능 출시가 앞당겨졌고, 팀 집중도가 올라가면서 릴리즈 품질도 안정됐어요."
        hiring = "초기 제품이나 방향 전환 구간에서, 제한된 리소스로도 우선순위 정렬과 실행 속도를 동시에 만들 수 있어요."
    else:
        summary = "질문 맥락에서 309의 강점은 복잡한 요구사항을 구조화하고 실행 가능한 플로우로 빠르게 전환하는 점이에요."
        style_line = "문제를 정의할 때 사용자 흐름과 비즈니스 목표를 같은 프레임에 올려 판단하는 편이에요."
        case_line = "3D 모션 데이터 플랫폼에서 업로드-판매-정산 흐름을 재설계해 사용자 마찰과 내부 핸드오프 비용을 줄였어요."
        impact = "문제정의 → 실행 → 검증 루프를 짧게 돌리면서 의사결정 품질과 속도를 함께 올렸어요."
        hiring = "불확실한 요구사항이 많은 환경에서도, 제품 방향을 실행 가능한 태스크로 빠르게 전환하는 역할을 할 수 있어요."

    return (
        "## 핵심요약\n"
        f"{summary}\n"
        f"{style_line}\n\n"
        "## 사례 (PAR)\n"
        f"- Problem: {evidence_1}\n"
        f"- Action: {case_line}\n"
        f"- Result: {impact}\n"
        f"- 추가 근거: {evidence_2}\n\n"
        "## 채용 관점 기대효과\n"
        f"{hiring}"
    )


def _is_low_quality_answer(answer: str) -> bool:
    if not answer:
        return True
    if len(answer.strip()) < 120:
        return True
    if "## 핵심요약" in answer and "## 사례 (PAR)" not in answer:
        return True
    repetitive_markers = [
        "디자인 관점과 제품 전략 관점을 함께 보면서",
        "입사 후에도 불확실한 요구사항을 빠르게 정리하고",
    ]
    marker_hits = sum(1 for m in repetitive_markers if m in answer)
    return marker_hits >= 2 and len(answer) < 520


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> tuple[str, list[str]]:
    """Generate persona answer via OpenClaw agent first, then OpenAI-compatible fallback."""
    lowered_q = question.lower()

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
        return build_rag_rescue_answer(question, category)
    if "경력 관련 질문만 응답" in answer or settings.blocked_message in answer:
        answer = _build_rag_fallback_answer(question, rag_chunks)

    bad_phrases = ["존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 AI"]
    if any(p in answer for p in bad_phrases):
        answer = _build_rag_fallback_answer(question, rag_chunks)

    repetitive_phrases = [
        "디자인 관점과 제품 전략 관점을 함께 보면서 방향성과 실행력을 동시에 끌어올리는",
        "입사 후에도 불확실한 요구사항을 빠르게 정리하고",
    ]
    if sum(1 for p in repetitive_phrases if p in answer) >= 2:
        answer = _build_rag_fallback_answer(question, rag_chunks)

    if _is_low_quality_answer(answer):
        answer = _build_rag_fallback_answer(question, rag_chunks)

    is_rescue_style = "## 사례 (PAR)\n- Problem:" in answer
    if (settings.answer_quality_mode or "balanced").lower() == "quality" and _is_low_quality_answer(answer) and not is_rescue_style:
        retry_payload = user_payload + "\n\n추가 지시: 직전 답변과 표현이 겹치지 않게 작성하고, 질문의 핵심 키워드를 직접 언급해 주세요. 이력/포트폴리오 기반 사례를 최소 2개로 구체화해 주세요."
        retry = _complete_with_model(client, settings.openai_model, system_prompt, retry_payload)
        retry_text = (retry.choices[0].message.content or "").strip()
        if retry_text:
            answer = retry_text

    citations = [c["source"] for c in rag_chunks][:5]
    return answer, citations


