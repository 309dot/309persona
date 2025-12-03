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
    highlights = "\n".join(
        f"- {item.get('title')}: {item.get('impact')}"
        for item in pack.get("projects", [])
    )

    return (
        f"=== 309 SUMMARY ===\n{summary}\n\n"
        f"=== COLLABORATION STYLE ===\n{collaboration}\n\n"
        f"=== VALUES & DECISION FRAMEWORK ===\n{philosophy}\n\n"
        f"=== PROJECT HIGHLIGHTS ===\n{highlights}\n"
    )


def get_allowed_topics() -> list[str]:
    """Return pre-defined allowed question categories."""
    pack = load_knowledge_pack()
    topics = pack.get("allowed_topics", [])
    if isinstance(topics, list):
        return topics
    if isinstance(topics, str):
        return [item.strip() for item in topics.split(",") if item.strip()]
    return []


