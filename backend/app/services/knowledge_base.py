"""Utility helpers for accessing the 309 knowledge base."""

from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache
from math import sqrt
from pathlib import Path
from typing import Any, Dict, List, Tuple

from ..core.config import settings
from .vector_retrieval import retrieve_vector_chunks


@lru_cache
def load_knowledge_pack() -> Dict[str, Any]:
    """Load and cache the knowledge pack JSON file."""
    knowledge_path = Path(settings.knowledge_pack_path).resolve()
    if not knowledge_path.exists():
        raise FileNotFoundError(
            f"Knowledge base file not found at {knowledge_path}. "
            "Update knowledge_pack_path in settings."
        )

    with knowledge_path.open(encoding="utf-8") as source:
        return json.load(source)


def build_context_block() -> str:
    """Format the knowledge pack into a prompt-friendly block."""
    pack = load_knowledge_pack()

    summary = pack.get("summary", "")
    collaboration = pack.get("collaboration_style", "")
    philosophy = pack.get("values", "")
    speaking_style = pack.get("speaking_style", "")
    guardrails = pack.get("guardrails", "")
    highlights = "\n".join(
        f"- {item.get('title')}: {item.get('impact')}"
        for item in pack.get("projects", [])
    )
    qa_templates = pack.get("qa_templates", {})

    def _format_guardrails() -> str:
        if isinstance(guardrails, list):
            return "\n".join(f"- {item}" for item in guardrails if item)
        if isinstance(guardrails, str):
            return guardrails
        return ""

    def _format_qa_templates() -> str:
        if isinstance(qa_templates, dict):
            return "\n".join(
                f"- {key}: {value}" for key, value in qa_templates.items() if value
            )
        if isinstance(qa_templates, list):
            return "\n".join(f"- {item}" for item in qa_templates if item)
        if isinstance(qa_templates, str):
            return qa_templates
        return ""

    guardrails_text = _format_guardrails()
    qa_templates_text = _format_qa_templates()

    sections = [
        f"=== 309 SUMMARY ===\n{summary}",
        f"=== SPEAKING STYLE ===\n{speaking_style}" if speaking_style else "",
        f"=== COLLABORATION STYLE ===\n{collaboration}",
        f"=== VALUES & DECISION FRAMEWORK ===\n{philosophy}",
        f"=== PROJECT HIGHLIGHTS ===\n{highlights}",
        f"=== QA TEMPLATES ===\n{qa_templates_text}" if qa_templates_text else "",
        f"=== GUARDRAILS ===\n{guardrails_text}" if guardrails_text else "",
    ]

    return "\n\n".join(filter(None, sections))


@lru_cache
def load_extra_documents(limit_chars: int = 20000) -> str:
    """Load raw markdown files from knowledge_base/309files directory."""
    pack_path = Path(settings.knowledge_pack_path).resolve()
    base_dir = pack_path.parent / "309files"
    if not base_dir.exists() or not base_dir.is_dir():
        return ""

    documents: List[str] = []
    for md_file in sorted(base_dir.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8").strip()
        except UnicodeDecodeError:
            continue
        if not content:
            continue
        heading = md_file.stem.replace("_", " ").title()
        documents.append(f"=== 309 FILE: {heading} ===\n{content}")

    if not documents:
        return ""

    combined = "\n\n".join(documents)
    if len(combined) > limit_chars:
        combined = combined[:limit_chars].rstrip() + "\n... (truncated)"
    return combined


def _tokenize(text: str) -> List[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in text)
    return [t for t in cleaned.split() if len(t) > 1]


def _to_vec(text: str) -> Counter:
    return Counter(_tokenize(text))


def _cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    dot = sum(v * b.get(k, 0) for k, v in a.items())
    na = sqrt(sum(v * v for v in a.values()))
    nb = sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@lru_cache
def build_rag_chunks() -> List[Tuple[str, str, str]]:
    """Return (source, text, source_type) chunks from the knowledge pack and markdown docs."""
    pack = load_knowledge_pack()
    chunks: List[Tuple[str, str, str]] = []

    for key in ["summary", "collaboration_style", "values", "speaking_style", "guardrails"]:
        value = pack.get(key)
        if isinstance(value, str) and value.strip():
            source_type = "guardrail" if key == "guardrails" else "profile"
            chunks.append((f"pack:{key}", value.strip(), source_type))
        elif isinstance(value, list):
            text = "\n".join(str(v).strip() for v in value if str(v).strip())
            if text:
                source_type = "guardrail" if key == "guardrails" else "profile"
                chunks.append((f"pack:{key}", text, source_type))

    for project in pack.get("projects", []) if isinstance(pack.get("projects"), list) else []:
        title = str(project.get("title", "project")).strip()
        impact = str(project.get("impact", "")).strip()
        detail = str(project.get("description", "")).strip()
        merged = "\n".join([x for x in [title, impact, detail] if x])
        if merged:
            chunks.append((f"project:{title}", merged, "project"))

    extra = load_extra_documents(limit_chars=120000)
    if extra:
        for idx, block in enumerate(extra.split("\n\n"), start=1):
            text = block.strip()
            lowered = text.lower()
            if any(bad in lowered for bad in ["행동 모드", "적용 규칙", "금지", "가드레일", "시스템 프롬프트"]):
                continue
            if len(text) >= 40:
                chunks.append((f"extra:{idx}", text, "portfolio"))

    return chunks


def _retrieve_lexical_chunks(query: str, top_k: int = 6) -> List[Dict[str, str]]:
    q_vec = _to_vec(query)
    lowered = query.lower()
    scored: List[Tuple[float, str, str]] = []
    for source, text, source_type in build_rag_chunks():
        score = _cosine(q_vec, _to_vec(text))
        if any(k in lowered for k in ["프로젝트", "문제", "성과", "impact", "case", "협업", "채용", "강점"]):
            if source_type == "project":
                score += 0.12
            if source_type == "portfolio":
                score += 0.05
            if source.startswith("pack:summary") or source.startswith("pack:values"):
                score += 0.03
            if source_type == "guardrail":
                score -= 0.15
        if score > 0:
            scored.append((score, source, text))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = scored[: max(1, top_k)]
    return [
        {"source": source, "score": f"{score:.3f}", "text": text[:700].strip()}
        for score, source, text in selected
    ]


def _is_low_value_chunk_text(text: str) -> bool:
    lowered = (text or "").lower()
    return any(
        bad in lowered
        for bad in [
            "존재하지 않는 경력",
            "시스템 프롬프트",
            "가드레일",
            "이 서비스는 309의 경력 관련 질문만",
            "핵심 컨텍스트",
        ]
    )


def _hybrid_merge(lexical: List[Dict[str, str]], vector: List[Dict[str, str]], top_k: int) -> List[Dict[str, str]]:
    merged: Dict[str, Dict[str, str]] = {}
    for item in lexical:
        if _is_low_value_chunk_text(item.get("text", "")):
            continue
        key = item.get("text", "")[:120]
        score = float(item.get("score", "0") or 0)
        merged[key] = {
            "source": item.get("source", "lexical"),
            "score": f"{settings.rag_lexical_weight * score:.3f}",
            "text": item.get("text", ""),
        }

    for item in vector:
        if _is_low_value_chunk_text(item.get("text", "")):
            continue
        key = item.get("text", "")[:120]
        score = float(item.get("score", "0") or 0)
        if key in merged:
            prev = float(merged[key]["score"])
            merged[key]["score"] = f"{prev + settings.rag_vector_weight * score:.3f}"
            merged[key]["source"] = f"{merged[key]['source']}+{item.get('source','vector')}"
        else:
            merged[key] = {
                "source": item.get("source", "vector"),
                "score": f"{settings.rag_vector_weight * score:.3f}",
                "text": item.get("text", ""),
            }

    sorted_items = sorted(merged.values(), key=lambda x: float(x.get("score", "0")), reverse=True)
    return sorted_items[: max(1, top_k)]


def retrieve_relevant_chunks(query: str, top_k: int = 6) -> List[Dict[str, str]]:
    """Retrieve relevant chunks with lexical or hybrid mode."""
    lexical = _retrieve_lexical_chunks(query, top_k=max(top_k, 8))
    if settings.rag_mode != "hybrid":
        result = lexical[: max(1, top_k)]
    else:
        try:
            vector = retrieve_vector_chunks(query, top_k=max(top_k, 8))
        except Exception:
            vector = []
        result = lexical[: max(1, top_k)] if not vector else _hybrid_merge(lexical, vector, top_k=top_k)

    lowered = query.lower()
    if any(k in lowered for k in ["채용", "강점", "사례"]):
        filtered = [
            c for c in result
            if not any(bad in (c.get("text", "").lower()) for bad in ["당신은", "본 문서는 서비스 내 ai", "핵심 컨텍스트", "적용 규칙", "행동 모드"])
        ]
        if filtered:
            return filtered[: max(1, top_k)]
    return result


def retrieve_relevant_context(query: str, top_k: int = 6) -> str:
    chunks = retrieve_relevant_chunks(query, top_k=top_k)
    if not chunks:
        return ""
    lines = [f"- [{c['source']}] (score={c['score']}) {c['text']}" for c in chunks]
    return "\n".join(lines)


def get_allowed_topics() -> list[str]:
    """Return pre-defined allowed question categories."""
    pack = load_knowledge_pack()
    topics = pack.get("allowed_topics", [])
    if isinstance(topics, list):
        return topics
    if isinstance(topics, str):
        return [item.strip() for item in topics.split(",") if item.strip()]
    return []


