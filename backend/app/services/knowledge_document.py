"""The whole knowledge base as one prompt block, with ids the model cites as sources.

The direct pipeline injects all of it instead of retrieving chunks: the fact
documents are small (about 20 KB), so retrieval mostly adds ways to miss.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Iterable, List

from .knowledge_base import load_fact_documents, load_knowledge_pack

PROJECT_ID_RE = re.compile(r"^P\d+$")

# Readable names for the fact documents in knowledge_base/309files/.
DOC_SOURCES = {
    "resume": ("RESUME", "이력서"),
    "resume_context_for_ai": ("NOTES", "경력 요약 노트"),
}


@dataclass(frozen=True)
class KnowledgeSource:
    id: str
    label: str
    text: str


def _doc_source(stem: str) -> tuple[str, str]:
    return DOC_SOURCES.get(stem, (re.sub(r"[^A-Z0-9]+", "_", stem.upper()).strip("_"), stem))


@lru_cache
def knowledge_sources() -> tuple[KnowledgeSource, ...]:
    pack = load_knowledge_pack()
    sources: List[KnowledgeSource] = []

    profile = "\n".join(
        str(pack.get(key, "")).strip() for key in ("summary", "collaboration_style", "values") if pack.get(key)
    )
    if profile:
        sources.append(KnowledgeSource("PROFILE", "프로필 요약", profile))

    projects = pack.get("projects") if isinstance(pack.get("projects"), list) else []
    for index, project in enumerate(projects, start=1):
        title = str(project.get("title", "")).strip() or f"프로젝트 {index}"
        body = "\n".join(
            str(project.get(key, "")).strip() for key in ("impact", "description") if project.get(key)
        )
        sources.append(KnowledgeSource(f"P{index}", title, body))

    for stem, content in load_fact_documents():
        source_id, label = _doc_source(stem)
        sources.append(KnowledgeSource(source_id, label, content))
    return tuple(sources)


@lru_cache
def render_knowledge_block() -> str:
    parts = ["<knowledge>"]
    for source in knowledge_sources():
        parts.append(f'<source id="{source.id}" title="{source.label}">\n{source.text}\n</source>')
    parts.append("</knowledge>")
    return "\n".join(parts)


def source_ids() -> set[str]:
    return {source.id for source in knowledge_sources()}


def _resolve(raw: str) -> str | None:
    """Map a direct-pipeline id or a legacy citation (project:/doc:/pack:) to a source id."""
    raw = raw.strip()
    by_id: Dict[str, KnowledgeSource] = {source.id: source for source in knowledge_sources()}
    if raw in by_id:
        return raw
    if raw.startswith("pack:"):
        return "PROFILE" if "PROFILE" in by_id else None
    if raw.startswith("project:"):
        title = raw.removeprefix("project:").strip()
        return next((s.id for s in knowledge_sources() if PROJECT_ID_RE.match(s.id) and s.label == title), None)
    if raw.startswith("doc:"):
        stem = raw.removeprefix("doc:").split("#", 1)[0]
        source_id, _ = _doc_source(stem)
        return source_id if source_id in by_id else None
    return None


def label_sources(raw_sources: Iterable[str], limit: int = 4) -> List[Dict[str, str]]:
    """Deduplicated {id, label} pairs for the answer's source chips, in citation order."""
    labels = {source.id: source.label for source in knowledge_sources()}
    seen: List[str] = []
    for raw in raw_sources:
        source_id = _resolve(str(raw))
        if source_id and source_id not in seen:
            seen.append(source_id)
    return [{"id": source_id, "label": labels[source_id]} for source_id in seen[:limit]]
