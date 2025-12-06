"""Utility helpers for accessing the 309 knowledge base."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

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


def get_allowed_topics() -> list[str]:
    """Return pre-defined allowed question categories."""
    pack = load_knowledge_pack()
    topics = pack.get("allowed_topics", [])
    if isinstance(topics, list):
        return topics
    if isinstance(topics, str):
        return [item.strip() for item in topics.split(",") if item.strip()]
    return []


