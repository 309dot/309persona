from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


@dataclass
class RetrievalPlan:
    intent: str
    memory_sources: list[str]
    output_mode: str
    need_actionable_steps: bool
    project_pack: str
    memory_horizon: str  # short | mixed | long


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


def infer_project_pack(question: str) -> str:
    q = (question or "").lower()
    if "design library" in q or "designlibrary" in q:
        return "309designlibrary"
    if "309agent" in q or "openclaw" in q:
        return "309agent"
    return "309persona"


def build_retrieval_plan(question: str) -> RetrievalPlan:
    intent = classify_intent(question)
    project_pack = infer_project_pack(question)
    if intent == "decision_reasoning":
        return RetrievalPlan(intent, ["project", "decision", "working"], "narrative", True, project_pack, "mixed")
    if intent == "next_actions":
        return RetrievalPlan(intent, ["working", "project", "decision"], "actionable", True, project_pack, "short")
    if intent == "interview_answering":
        return RetrievalPlan(intent, ["identity", "project", "reference"], "concise_structured", True, project_pack, "long")
    if intent == "setup_reference":
        return RetrievalPlan(intent, ["reference", "project", "working"], "instructional", True, project_pack, "mixed")
    return RetrievalPlan(intent, ["project", "working", "reference"], "narrative", False, project_pack, "mixed")


def _load_latest_record(kind: str, project_pack: str) -> str:
    folder = ROOT / "memory" / ("decisions" if kind == "decision" else "failures")
    if not folder.exists():
        return ""
    files = sorted([p for p in folder.glob("*.json") if p.name != "schema.json"], reverse=True)
    for p in files:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(data.get("project", "")).lower() not in {project_pack.lower(), "309persona", ""}:
            continue
        if kind == "decision":
            return f"{data.get('topic','')}: {data.get('decision','')} (reason: {data.get('reason','')})".strip()
        return f"{data.get('topic','')}: {data.get('symptom','')} -> {data.get('fix','')}".strip()
    return ""


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

    latest_decision = _load_latest_record("decision", plan.project_pack)
    if latest_decision:
        ordered.append(f"[latest_decision] {latest_decision[:220]}")

    latest_failure = _load_latest_record("failure", plan.project_pack)
    if latest_failure:
        ordered.append(f"[latest_failure] {latest_failure[:220]}")

    if not ordered:
        return ""
    return "\n".join(ordered)
