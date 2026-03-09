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


def force_intent_answer(question: str, category: Optional[str]) -> tuple[str, list[str]]:
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    citations = [c["source"] for c in rag_chunks][:5]
    q = (question or "").lower()

    if category == "collaboration":
        answer = (
            "## 협업 스타일\n"
            "협업에서는 먼저 의사결정 기준을 맞추고, 팀이 같은 문제를 바라보게 만드는 데 집중했어요.\n\n"
            "## 구체적 상황\n"
            "3D 모션 데이터 플랫폼에서는 업로드-판매-정산 흐름에서 팀별 해석이 달라 진행이 느렸는데, 단계별 책임과 기준을 문서로 통일했어요.\n"
            "회의 결과를 바로 실행 태스크로 내려서 커뮤니케이션 비용을 줄였어요.\n\n"
            "## 결과와 교훈\n"
            "결정-실행 리드타임이 짧아졌고, 팀 간 전달 손실이 크게 줄었어요.\n"
            "갈등은 사람 문제가 아니라 기준 부재에서 생긴다는 점을 반복적으로 확인했어요."
        )
    elif category in {"process", "decision"} or any(k in q for k in ["우선순위", "전략", "트레이드오프"]):
        answer = (
            "## 판단 프레임워크\n"
            "우선순위는 사용자 임팩트, 비즈니스 효과, 구현 복잡도를 같이 보고 정했어요.\n\n"
            "## 적용 사례\n"
            "AI 오디오북 프로젝트에서 기능 요청이 많았을 때, 핵심 사용자 시나리오를 먼저 고정하고 부가 기능은 뒤로 미뤘어요.\n"
            "덕분에 출시 속도를 지키면서도 품질 리스크를 줄일 수 있었어요.\n\n"
            "## 트레이드오프\n"
            "초기에는 보기 좋은 확장 기능보다 실제 사용 빈도가 높은 핵심 흐름을 우선한 게 가장 큰 선택이었어요."
        )
    elif category == "career":
        answer = (
            "## 핵심 강점\n"
            "- 모호한 요구사항을 실행 가능한 문제로 구조화하는 능력\n"
            "- 디자인 판단과 제품 전략 판단을 한 프레임으로 연결하는 능력\n"
            "- 합의된 방향을 배포 가능한 수준까지 끌고 가는 실행력\n\n"
            "## 근거 사례\n"
            "3D 모션 데이터 플랫폼에서 핵심 거래 흐름을 재설계했고, AI 오디오북 프로젝트에서는 우선순위 체계를 재정의해 팀 집중도를 높였어요.\n\n"
            "## 팀에 기대할 수 있는 점\n"
            "초기 불확실성이 큰 환경에서도 방향 정렬과 실행 속도를 동시에 만들어낼 수 있어요."
        )
    else:
        answer = _build_rag_fallback_answer(question, rag_chunks)

    return answer, citations


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
        return (
            "## 협업 스타일\n"
            "협업 이슈에서는 먼저 의사결정 기준을 맞추고, 역할별 책임을 명확히 나누는 방식으로 접근해요.\n"
            "쟁점을 문서화해서 팀 해석을 한 방향으로 맞추는 편이에요.\n\n"
            "## 구체적 상황\n"
            f"- 상황: {evidence_1}\n"
            "- 대응: 다기능 팀과 일할 때 우선순위 기준(사용자 영향/비즈니스 영향/개발 난이도)을 공개적으로 합의했어요.\n"
            "- 실행: 회의에서 나온 결정을 바로 작업 단위로 쪼개서 담당자와 일정까지 확정했어요.\n\n"
            "## 결과와 교훈\n"
            "팀 간 해석 차이가 줄고, 결정에서 실행으로 넘어가는 시간이 짧아졌어요.\n"
            f"추가 근거: {evidence_2}"
        )
    elif "우선순위" in q or "전략" in q:
        return (
            "## 판단 프레임워크\n"
            "우선순위는 사용자 가치, 비즈니스 임팩트, 구현 복잡도를 함께 보면서 정해요.\n"
            "'좋은 아이디어'보다 '지금 해결할 문제'를 먼저 고정하는 방식을 써요.\n\n"
            "## 적용 사례\n"
            f"- 문제: {evidence_1}\n"
            "- 선택: AI 오디오북 프로젝트에서 기능을 문제 크기·사용자 임팩트·개발 비용 기준으로 재정렬했어요.\n"
            "- 결과: 핵심 기능 출시가 앞당겨졌고, 팀 집중도와 릴리즈 안정성이 함께 좋아졌어요.\n\n"
            "## 트레이드오프\n"
            "초기에 매력적인 부가 기능 일부는 뒤로 미뤘고, 핵심 가치가 검증되는 흐름을 우선했어요."
        )
    elif "채용" in q or "강점" in q or "경력" in q:
        return (
            "## 핵심 강점\n"
            "- 복잡한 요구사항을 구조화해 실행 가능한 흐름으로 전환하는 힘\n"
            "- 디자인 판단과 제품 전략 판단을 한 프레임에서 연결하는 힘\n"
            "- 합의된 결정을 실제 배포 단계까지 끌고 가는 실행 관리력\n\n"
            "## 근거 사례\n"
            "- 3D 모션 데이터 플랫폼에서 업로드-판매-정산 흐름을 재설계해 사용자 마찰을 줄였어요.\n"
            "- AI 오디오북 프로젝트에서 기능 우선순위를 재정렬해 출시 속도와 팀 집중도를 높였어요.\n"
            f"- 추가 근거: {evidence_2}\n\n"
            "## 팀에 기대할 수 있는 점\n"
            "입사 후에도 모호한 요구사항을 빠르게 정리하고, 팀이 공통 기준으로 실행하도록 연결할 수 있어요."
        )

    return (
        "## 맥락\n"
        f"질문의 핵심은 {evidence_1}와 연결돼 있어요.\n\n"
        "## 문제 정의 과정\n"
        "사용자 흐름과 비즈니스 목표를 같은 프레임에 올려서, 어떤 문제를 먼저 풀어야 하는지 정리했어요.\n"
        "정량 데이터와 정성 피드백을 같이 보며 우선순위를 조정했어요.\n\n"
        "## 해결과 결과\n"
        "핵심 플로우를 단순화하고 검증 루프를 짧게 돌려 의사결정 속도와 품질을 함께 올렸어요.\n"
        f"추가 근거: {evidence_2}"
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

    if (settings.answer_quality_mode or "balanced").lower() == "quality":
        citations = [c["source"] for c in rag_chunks][:5]
        return _build_rag_fallback_answer(question, rag_chunks), citations

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


