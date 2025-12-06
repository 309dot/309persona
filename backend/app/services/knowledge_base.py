"""Utility helpers for accessing the 309 knowledge base."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from ..core.config import settings


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
    extra_documents = load_extra_documents()

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
        extra_documents,
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


def get_allowed_topics() -> list[str]:
    """Return pre-defined allowed question categories."""
    pack = load_knowledge_pack()
    topics = pack.get("allowed_topics", [])
    if isinstance(topics, list):
        return topics
    if isinstance(topics, str):
        return [item.strip() for item in topics.split(",") if item.strip()]
    return []


