"""The knowledge base as a graph for the visitor's knowledge map.

Nodes: 309 at the center (PROFILE), projects (P1…), documents (RESUME, NOTES), topics
(T:…, from the knowledge pack's allowed_topics and note tags) and private notes (N:…).
Only titles leave the server, never note text.

`related_nodes()` is a quick word-match guess of what a question is about. It goes out
with the `start` event so the map can light up while the model is still thinking; the
answer's real sources arrive with `done`.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, replace
from functools import lru_cache
from typing import Dict, List, Optional, Sequence, Tuple

from .knowledge_base import get_allowed_topics, load_knowledge_pack
from .knowledge_document import PROJECT_ID_RE, knowledge_sources, notes_in_prompt, render_knowledge_block
from .obsidian_notes import match_key, notes_version
from .question_filter import _load_topic_aliases

logger = logging.getLogger(__name__)

CENTER_ID = "PROFILE"
TOPIC_PREFIX = "T:"
# Too broad to be a place on the map.
GENERIC_TOPICS = {"309", "경력", "프로젝트", "포트폴리오", "커리어"}
# Words too common to tie a question to one project by themselves.
STOPWORDS = {
    "디자인", "프로젝트", "경험", "서비스", "제품", "프로덕트", "관련", "기반", "제작", "솔루션", "플랫폼", "시스템", "구축",
    "ux", "ui",
}
DOC_IDS = {"RESUME", "NOTES"}
WORD_RE = re.compile(r"[가-힣A-Za-z0-9]+")
TITLE_PERIOD_RE = re.compile(r"^(.*?)\s*\(([^)]*\d[^)]*)\)\s*$")
MAX_NODES = 400


@dataclass(frozen=True)
class GraphNode:
    id: str
    label: str
    kind: str  # center | project | doc | topic | note
    group: Optional[str] = None  # note type (project, story, …)
    meta: Optional[str] = None  # project period
    summary: Optional[str] = None  # project impact line from the knowledge pack (public)
    question: Optional[str] = None  # the note's own suggested question
    pages: Optional[str] = None
    terms: Tuple[Tuple[str, int], ...] = ()  # (match key, weight) for related_nodes; not sent out

    def public(self) -> Dict[str, str]:
        data = {"id": self.id, "label": self.label, "kind": self.kind}
        for key in ("group", "meta", "summary", "question", "pages"):
            value = getattr(self, key)
            if value:
                data[key] = value
        return data


@dataclass(frozen=True)
class Graph:
    nodes: Tuple[GraphNode, ...]
    edges: Tuple[Tuple[str, str], ...]

    def public(self) -> Dict[str, object]:
        return {
            "nodes": [node.public() for node in self.nodes],
            "edges": [list(edge) for edge in self.edges],
            "version": notes_version(),
        }


def _words(label: str) -> List[Tuple[str, int]]:
    return [
        (match_key(word), 1)
        for word in WORD_RE.findall(label)
        if len(word) >= 2 and word.lower() not in STOPWORDS
    ]


def _terms(label: str, extra: Sequence[str] = ()) -> Tuple[Tuple[str, int], ...]:
    terms = [(match_key(label), 3), *((match_key(item), 2) for item in extra), *_words(label)]
    best: Dict[str, int] = {}
    for key, weight in terms:
        if key and weight > best.get(key, 0):
            best[key] = weight
    return tuple(best.items())


def _split_title(title: str) -> Tuple[str, Optional[str]]:
    match = TITLE_PERIOD_RE.match(title)
    return (match.group(1).strip(), match.group(2).strip()) if match else (title, None)


def _topic_aliases(topic: str) -> List[str]:
    key = match_key(topic)
    for aliases in _load_topic_aliases().values():
        if any(match_key(alias) == key for alias in aliases):
            return aliases
    return []


def build_graph() -> Graph:
    return _build_graph(notes_version())


@lru_cache(maxsize=2)
def _build_graph(_notes_version: int) -> Graph:
    nodes: Dict[str, GraphNode] = {CENTER_ID: GraphNode(CENTER_ID, "309", "center")}
    edges: List[Tuple[str, str]] = []
    texts: Dict[str, str] = {}

    def link(a: str, b: str) -> None:
        if a != b and a in nodes and b in nodes and (a, b) not in edges and (b, a) not in edges:
            edges.append((a, b))

    pack_projects = load_knowledge_pack().get("projects") or []
    for source in knowledge_sources():
        if PROJECT_ID_RE.match(source.id):
            label, period = _split_title(source.label)
            project = pack_projects[int(source.id[1:]) - 1] if int(source.id[1:]) <= len(pack_projects) else {}
            nodes[source.id] = GraphNode(
                source.id,
                label,
                "project",
                meta=period,
                summary=str(project.get("impact") or "").strip() or None,
                pages=str(project.get("pages") or "").strip() or None,
                terms=_terms(label),
            )
            texts[source.id] = match_key(f"{source.label} {source.text}")
            link(CENTER_ID, source.id)
        elif source.id in DOC_IDS:
            nodes[source.id] = GraphNode(source.id, source.label, "doc")
            link(CENTER_ID, source.id)

    topic_by_key: Dict[str, str] = {}

    def topic(label: str) -> str:
        key = match_key(label)
        if key not in topic_by_key:
            node_id = f"{TOPIC_PREFIX}{label}"
            topic_by_key[key] = node_id
            nodes[node_id] = GraphNode(node_id, label, "topic", terms=_terms(label, _topic_aliases(label)))
        return topic_by_key[key]

    for label in get_allowed_topics():
        if label.strip() and label.strip() not in GENERIC_TOPICS:
            topic(label.strip())

    # A pack topic sits next to the projects whose title or impact mentions it, and the project
    # inherits the topic's words (weakly) so "디자인 시스템 경험" also finds 페이히어 디자인 시스템.
    for node_id in [n for n in nodes if n.startswith(TOPIC_PREFIX)]:
        keys = [key for key, weight in nodes[node_id].terms if weight >= 2]
        for project_id, text in texts.items():
            if any(key in text for key in keys):
                link(node_id, project_id)
                project = nodes[project_id]
                nodes[project_id] = replace(project, terms=project.terms + tuple((key, 1) for key in keys))

    included, _ = notes_in_prompt()
    projects = [node for node in nodes.values() if node.kind == "project"]
    for note in included:
        if len(nodes) >= MAX_NODES:
            logger.warning("knowledge map capped at %d nodes", MAX_NODES)
            break
        nodes[note.id] = GraphNode(
            note.id,
            note.title,
            "note",
            group=note.kind,
            question=note.question,
            pages=note.pages,
            terms=_terms(note.title, [*note.aliases, *note.tags]),
        )
    for note in included:
        if note.id not in nodes:
            continue
        for tag in note.tags:
            link(note.id, topic(tag))
        for target in note.links:
            link(note.id, target)
        if note.project:
            wanted = match_key(note.project)
            project = next(
                (p for p in projects if p.id == note.project or wanted in match_key(p.label) or match_key(p.label) in wanted),
                None,
            )
            if project:
                link(note.id, project.id)

    connected = {node_id for edge in edges for node_id in edge}
    for node_id in nodes:
        if node_id not in connected:
            link(CENTER_ID, node_id)
    return Graph(nodes=tuple(nodes.values()), edges=tuple(edges))


KIND_RANK = {"topic": 0, "project": 1, "note": 2}


def related_nodes(question: str, limit: int = 3) -> List[str]:
    """Ids of the nodes a question most likely touches, best first. Never raises."""
    try:
        key = match_key(question)
        scored = []
        for order, node in enumerate(build_graph().nodes):
            if node.kind not in KIND_RANK:
                continue
            score = max((weight for term, weight in node.terms if term and term in key), default=0)
            if score:
                scored.append((-score, KIND_RANK[node.kind], order, node.id))
        return [node_id for *_, node_id in sorted(scored)[:limit]]
    except Exception:
        logger.exception("related node guess failed")
        return []


def warm_up() -> None:
    """Load the knowledge base, notes included, before the first visitor asks."""
    try:
        render_knowledge_block()
        build_graph()
    except Exception:
        logger.exception("knowledge warm-up failed")
