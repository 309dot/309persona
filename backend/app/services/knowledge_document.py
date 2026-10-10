"""The whole knowledge base as one prompt block, with ids the model cites as sources.

The direct pipeline injects all of it instead of retrieving chunks: the fact
documents are small (about 20 KB), so retrieval mostly adds ways to miss.
Private Obsidian notes (obsidian_notes.py) join as `N:<slug>` sources up to
NOTES_MAX_CHARS; everything here is rebuilt when the notes are reloaded.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, List

from ..core.config import settings
from .knowledge_base import load_fact_documents, load_knowledge_pack
from .obsidian_notes import NOTE_PREFIX, Note, get_notes, notes_version, reset_notes

logger = logging.getLogger(__name__)

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


def notes_in_prompt() -> tuple[tuple[Note, ...], tuple[Note, ...]]:
    """(notes included, notes left out) under NOTES_MAX_CHARS, in priority order."""
    included: List[Note] = []
    left_out: List[Note] = []
    used = 0
    for note in get_notes().notes:
        if used + len(note.text) <= settings.notes_max_chars:
            included.append(note)
            used += len(note.text)
        else:
            left_out.append(note)
    return tuple(included), tuple(left_out)


def knowledge_sources() -> tuple[KnowledgeSource, ...]:
    return _knowledge_sources(notes_version())


@lru_cache(maxsize=2)
def _knowledge_sources(_notes_version: int) -> tuple[KnowledgeSource, ...]:
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
        lines = [str(project.get(key, "")).strip() for key in ("impact", "description") if project.get(key)]
        if project.get("pages"):
            # Lets the answer point to the right pages of the portfolio PDF.
            lines.append(f"(포트폴리오 {str(project['pages']).strip()}쪽)")
        sources.append(KnowledgeSource(f"P{index}", title, "\n".join(lines)))

    for stem, content in load_fact_documents():
        source_id, label = _doc_source(stem)
        sources.append(KnowledgeSource(source_id, label, content))

    included, left_out = notes_in_prompt()
    sources.extend(KnowledgeSource(note.id, note.title, note.text) for note in included)
    if left_out:
        logger.warning("%d notes left out of the prompt (NOTES_MAX_CHARS=%d)", len(left_out), settings.notes_max_chars)
    return tuple(sources)


def render_knowledge_block() -> str:
    return _render_knowledge_block(notes_version())


@lru_cache(maxsize=2)
def _render_knowledge_block(_notes_version: int) -> str:
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
    if raw.startswith("note:"):  # legacy retrieval chunk of a note
        source_id = NOTE_PREFIX + raw.removeprefix("note:").split("#", 1)[0]
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


def reload_knowledge() -> None:
    """Fetch the notes again (dashboard button); prompt, retrieval chunks and graph follow the new version."""
    reset_notes()
    get_notes()


def knowledge_status() -> Dict[str, Any]:
    bundle = get_notes()
    included, left_out = notes_in_prompt()
    included_ids = {note.id for note in included}
    return {
        "source": bundle.source,
        "loaded_at": bundle.loaded_at or None,
        "error": bundle.error,
        "notes": [
            {
                "id": note.id,
                "title": note.title,
                "kind": note.kind,
                "path": note.path,
                "chars": len(note.text),
                "included": note.id in included_ids,
                "links": len(note.links),
            }
            for note in bundle.notes
        ],
        "skipped": list(bundle.skipped),
        "notes_chars": sum(len(note.text) for note in included),
        "notes_left_out": len(left_out),
        "notes_max_chars": settings.notes_max_chars,
        "prompt_chars": len(render_knowledge_block()),
    }
