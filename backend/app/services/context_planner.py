from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RetrievalPlan:
    intent: str
    memory_sources: list[str]
    output_mode: str
    need_actionable_steps: bool


def classify_intent(question: str) -> str:
    q = (question or "").lower()
    if any(k in q for k in ["왜", "이렇게 설계", "의사결정", "결정"]):
        return "decision_reasoning"
    if any(k in q for k in ["다음", "뭘 해야", "할 일", "우선순위"]):
        return "next_actions"
    if any(k in q for k in ["면접", "어떻게 답", "자기소개", "강점"]):
        return "interview_answering"
    if any(k in q for k in ["설정", "붙였", "openclaw", "render", "vercel", "firebase"]):
        return "setup_reference"
    return "general_analysis"


def build_retrieval_plan(question: str) -> RetrievalPlan:
    intent = classify_intent(question)
    if intent == "decision_reasoning":
        return RetrievalPlan(intent, ["project", "decision", "working"], "narrative", True)
    if intent == "next_actions":
        return RetrievalPlan(intent, ["working", "project", "decision"], "actionable", True)
    if intent == "interview_answering":
        return RetrievalPlan(intent, ["identity", "project", "reference"], "concise_structured", True)
    if intent == "setup_reference":
        return RetrievalPlan(intent, ["reference", "project", "working"], "instructional", True)
    return RetrievalPlan(intent, ["project", "working", "reference"], "narrative", False)


def compose_context_sections(plan: RetrievalPlan, rag_chunks: list[dict]) -> str:
    by_type: dict[str, list[str]] = {k: [] for k in ["identity", "project", "working", "decision", "failure", "reference"]}
    for c in rag_chunks:
        source = str(c.get("source", "")).lower()
        text = str(c.get("text", "")).strip()
        if not text:
            continue
        target = "reference"
        if source.startswith("project:"):
            target = "project"
        elif source.startswith("history:") or source.startswith("working:"):
            target = "working"
        elif source.startswith("decision:"):
            target = "decision"
        elif source.startswith("failure:"):
            target = "failure"
        elif source.startswith("identity:"):
            target = "identity"
        by_type[target].append(text)

    ordered = []
    for src in plan.memory_sources:
        if by_type.get(src):
            ordered.append(f"[{src}] {by_type[src][0][:220]}")
    if by_type.get("failure"):
        ordered.append(f"[failure] {by_type['failure'][0][:220]}")

    if not ordered:
        return ""
    return "\n".join(ordered)
