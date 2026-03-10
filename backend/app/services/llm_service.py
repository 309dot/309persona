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
    reranked = _rerank_chunks(question, rag_chunks)
    return _build_rag_fallback_answer(question, reranked), [c["source"] for c in reranked][:5]


def _rerank_chunks(question: str, chunks: list[dict]) -> list[dict]:
    """Re-rank retrieved chunks by relevance+impact+explainability with light recency bonus."""
    q = (question or "").lower()

    def score(item: dict) -> float:
        base = float(item.get("score", "0") or 0)
        source = str(item.get("source", "")).lower()
        text = str(item.get("text", "")).lower()

        relevance = 0.0
        if any(k in q for k in ["협업", "갈등", "커뮤니케이션"]) and any(k in text for k in ["협업", "조율", "팀", "합의"]):
            relevance += 0.25
        if any(k in q for k in ["전략", "우선순위", "트레이드오프"]) and any(k in text for k in ["우선", "전략", "의사결정", "리스크"]):
            relevance += 0.25
        if any(k in q for k in ["디자인 시스템", "컴포넌트", "토큰"]) and any(k in text for k in ["디자인 시스템", "토큰", "컴포넌트"]):
            relevance += 0.3

        impact = 0.0
        if any(k in text for k in ["단축", "%", "개선", "증가", "감소", "리드타임", "오차", "품질"]):
            impact += 0.2

        explainability = 0.0
        if any(k in text for k in ["프로젝트", "플랫폼", "솔루션", "대시보드"]):
            explainability += 0.12

        recency = 0.0
        if "2024" in text or "2024" in source:
            recency += 0.08
        elif "2023" in text or "2023" in source:
            recency += 0.04

        return base + relevance + impact + explainability + recency

    ranked = sorted(chunks, key=score, reverse=True)
    return ranked[: max(1, settings.rag_top_k)]


def force_intent_answer(question: str, category: Optional[str]) -> tuple[str, list[str]]:
    rag_chunks = retrieve_relevant_chunks(question, top_k=settings.rag_top_k)
    citations = [c["source"] for c in rag_chunks][:5]
    q = (question or "").lower()

    if "디자인 시스템" in q:
        answer = (
            "## 답변\n"
            "네, 디자인 시스템을 실제 프로젝트에서 운영해본 경험이 있어요.\n\n"
            "## 어디서 / 어떻게 했는지\n"
            "3D 모션 데이터 플랫폼과 AI 오디오북 프로젝트에서 공통 컴포넌트 기준을 먼저 정하고, 화면별로 흩어진 패턴을 컴포넌트 단위로 묶어 재사용성을 높였어요.\n"
            "디자인 토큰(색상/타이포/간격)과 상태 규칙을 문서화해서 디자이너-개발자 간 해석 차이를 줄였고, 신규 화면 작업 시 기존 패턴을 우선 적용하도록 워크플로우를 만들었어요.\n\n"
            "## 결과\n"
            "화면 품질 편차가 줄고, 변경 대응 속도가 빨라졌어요.\n"
            "특히 기능 추가나 수정 요청이 들어왔을 때 영향 범위를 빠르게 파악할 수 있어서 협업 효율이 좋아졌어요."
        )
    elif category == "collaboration":
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


def _sanitize_evidence_text(text: str) -> str:
    t = (text or "").replace("\n", " ").strip()
    t = re.sub(r"#+\s*\d+\.?\s*", "", t)
    t = re.sub(r"#+\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _contains_internal_artifact(text: str) -> bool:
    low = (text or "").lower()
    bad_markers = [
        "resume context",
        "rag retrieved context",
        "질문 템플릿",
        "답변 규칙",
        "적용 규칙",
        "행동 모드",
        "## 8.",
        "## 5.",
    ]
    return any(m in low for m in bad_markers)


def _build_rag_fallback_answer(question: str, rag_chunks: list[dict]) -> str:
    if not rag_chunks:
        return "질문 의도는 이해했지만 현재 지식베이스 근거가 부족해요. 프로젝트명이나 상황을 조금만 더 주시면 정확도를 높여서 답할게요."

    q = question.lower()
    banned = ["존재하지 않는 경력", "시스템 프롬프트", "가드레일", "핵심 컨텍스트", "본 문서는 서비스 내 ai", "적용 규칙", "행동 모드", "질문 템플릿", "resume context", "rag retrieved context", "problem-action-result", "par)"]
    cleaned = []
    for c in rag_chunks:
        txt = _sanitize_evidence_text(c.get("text") or "")
        low = txt.lower()
        if not txt or any(b in low for b in banned) or _contains_internal_artifact(txt):
            continue
        cleaned.append(txt)

    evidence_1 = cleaned[0][:140] if len(cleaned) > 0 else "프로젝트 문제를 빠르게 구조화한 경험"
    evidence_2 = cleaned[1][:140] if len(cleaned) > 1 else "실행 흐름을 단순화해 팀 의사결정 속도를 높인 경험"

    if "협업" in q or "커뮤니케이션" in q or "갈등" in q:
        return (
            f"협업 질문이라면 핵심은 기준을 먼저 맞추는 방식이에요. {evidence_1} 같은 상황에서 저는 우선순위 기준을 합의하고, 역할과 결정을 바로 실행 단위로 나눠 조율했어요. "
            f"그 결과 해석 차이와 재작업이 줄었고, 결정에서 실행으로 넘어가는 속도가 안정적으로 빨라졌어요. 추가 근거로 {evidence_2}도 같은 패턴을 보여줘요."
        )

    if "우선순위" in q or "전략" in q or "트레이드오프" in q:
        return (
            f"우선순위 판단은 사용자 임팩트·비즈니스 효과·구현 복잡도를 같이 보면서 정해요. {evidence_1} 같은 맥락에서 매력적인 부가 기능보다 핵심 흐름을 먼저 고정했고, "
            f"실행 과정에서 검증 루프를 짧게 가져가 릴리즈 리스크를 줄였어요. 비슷한 접근은 {evidence_2}에서도 반복됐어요."
        )

    return (
        f"질문과 가장 맞는 근거는 {evidence_1} 쪽이에요. 이 맥락에서 문제를 구조화하고 우선순위를 재정렬해 실행 흐름을 단순화했어요. "
        f"또 {evidence_2} 사례에서도 같은 방식으로 결과를 냈고, 공통적으로 속도와 품질을 같이 개선했다는 점이 확인돼요."
    )


def _is_low_quality_answer(answer: str) -> bool:
    if not answer:
        return True
    text = answer.strip()
    if len(text) < 120:
        return True
    repetitive_markers = [
        "디자인 관점과 제품 전략 관점을 함께 보면서",
        "입사 후에도 불확실한 요구사항을 빠르게 정리하고",
        "## 핵심요약",
        "## 사례 (PAR)",
        "## 채용 관점 기대효과",
    ]
    marker_hits = sum(1 for m in repetitive_markers if m in text)
    return marker_hits >= 3 and len(text) < 560


def generate_persona_answer(
    question: str,
    category: Optional[str],
    visitor: Dict[str, str],
) -> tuple[str, list[str]]:
    """Generate persona answer via OpenClaw agent first, then OpenAI-compatible fallback."""
    lowered_q = question.lower()

    base_context = build_context_block()
    rag_chunks = retrieve_relevant_chunks(question, top_k=max(settings.rag_top_k, 8))
    rag_chunks = _rerank_chunks(question, rag_chunks)
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
    if any(p in answer for p in bad_phrases) or _contains_internal_artifact(answer):
        answer = _build_rag_fallback_answer(question, rag_chunks)

    repetitive_phrases = [
        "디자인 관점과 제품 전략 관점을 함께 보면서 방향성과 실행력을 동시에 끌어올리는",
        "핵심은 기준을 먼저 맞추는 방식이에요",
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


