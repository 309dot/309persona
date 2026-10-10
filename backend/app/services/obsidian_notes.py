"""Private Obsidian notes as knowledge sources (docs/obsidian-notes.md).

Notes come as raw Obsidian markdown from a folder (NOTES_DIR) or a private GitHub
repository (NOTES_GITHUB_REPO + NOTES_GITHUB_TOKEN) and are cleaned here, so the sync
on the author's computer only copies files. Nothing is written to disk.

Each note becomes a source with id `N:<slug>`. Front matter (Obsidian properties) gives
its title, type, period, role, portfolio pages and a question for the knowledge map;
`draft: true` or `persona: false` leaves a note out, as do files and folders starting
with `_` or `.` (templates, .obsidian).
"""

from __future__ import annotations

import io
import itertools
import logging
import re
import tarfile
import threading
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

import httpx
import yaml

from ..core.config import settings
from .redaction import redact_contacts

logger = logging.getLogger(__name__)

NOTE_PREFIX = "N:"
# Obsidian `type` property → note kind. Unknown values become "note".
KIND_ALIASES = {
    "project": "project", "프로젝트": "project",
    "story": "story", "이야기": "story", "에피소드": "story", "사례": "story",
    "career": "career", "경력": "career",
    "value": "value", "가치관": "value", "생각": "value",
    "skill": "skill", "역량": "skill", "스킬": "skill",
}
KIND_ORDER = ("project", "career", "story", "value", "skill", "note")  # kept first when notes exceed the budget
KIND_LABELS = {"project": "프로젝트", "career": "경력", "story": "사례", "value": "생각", "skill": "역량", "note": "노트"}
MAX_NOTE_BYTES = 200_000
MAX_TARBALL_BYTES = 30_000_000
RETRY_FAILED_AFTER_SECONDS = 300
GITHUB_API = "https://api.github.com"

FRONTMATTER_RE = re.compile(r"\A﻿?---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.DOTALL)
GENERATED_BLOCK_RE = re.compile(r"^(```|~~~)[ \t]*(?:dataview|dataviewjs|query|tasks|base)\b.*?^\1[ \t]*$", re.DOTALL | re.MULTILINE)
OBSIDIAN_COMMENT_RE = re.compile(r"%%.*?%%", re.DOTALL)
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
EMBED_RE = re.compile(r"!\[\[[^\]]*\]\]")
MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
WIKILINK_RE = re.compile(r"\[\[([^\]|#^]*)(?:[#^]([^\]|]*))?(?:\|([^\]]*))?\]\]")
CALLOUT_RE = re.compile(r"^([ \t]*>+[ \t]*)\[![^\]]+\][+-]?[ \t]*", re.MULTILINE)
HIGHLIGHT_RE = re.compile(r"==([^=\n]+)==")
BLOCK_ID_RE = re.compile(r"[ \t]+\^[A-Za-z0-9-]+[ \t]*$", re.MULTILINE)
INLINE_TAG_RE = re.compile(r"(?:(?<=\s)|^)#([^\s#.,:;!?()\[\]{}<>\"'`~=+*|\\]+)", re.MULTILINE)
CODE_RE = re.compile(r"```.*?```|`[^`\n]*`", re.DOTALL)
BLANK_LINES_RE = re.compile(r"\n{3,}")


@dataclass(frozen=True)
class Note:
    id: str  # N:<slug>, the source id the model cites
    title: str
    kind: str
    text: str  # cleaned body under a one-line metadata header, as the model reads it
    path: str  # inside the notes folder
    links: Tuple[str, ...] = ()  # ids of other loaded notes this one links to
    tags: Tuple[str, ...] = ()
    aliases: Tuple[str, ...] = ()
    project: Optional[str] = None  # knowledge pack project it belongs to: "P2" or a project title
    question: Optional[str] = None  # suggested visitor question on the knowledge map
    pages: Optional[str] = None  # portfolio PDF pages, e.g. "6-11"


@dataclass(frozen=True)
class NotesBundle:
    notes: Tuple[Note, ...] = ()
    source: str = "none"  # none | local | github
    loaded_at: float = 0.0
    error: Optional[str] = None
    skipped: Tuple[str, ...] = ()  # paths left out: drafts, templates, oversized or unreadable files
    version: int = 0  # changes on every load; caches built from the notes key on it


def nfc(value: Any) -> str:
    """macOS may hand over decomposed Hangul (NFD); everything is compared in NFC."""
    return unicodedata.normalize("NFC", str(value)).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^\w-]+", "-", nfc(value).lower())
    return re.sub(r"-{2,}", "-", slug).strip("-_") or "note"


def match_key(value: str) -> str:
    """Spacing- and case-insensitive key: "디자인 시스템" and "디자인시스템" meet."""
    return re.sub(r"[\s_\-/]+", "", nfc(value).lower())


def split_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    try:
        data = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        data = {}
    return (data if isinstance(data, dict) else {}), text[match.end() :]


def _prop(data: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


def _text_prop(data: Dict[str, Any], *keys: str) -> Optional[str]:
    value = _prop(data, *keys)
    if value is None or isinstance(value, (dict, list)):
        return None
    return nfc(value) or None


def _list_prop(data: Dict[str, Any], *keys: str) -> List[str]:
    value = _prop(data, *keys)
    if value is None:
        return []
    items = value if isinstance(value, list) else re.split(r"[,\n]", str(value))
    return [nfc(item).lstrip("#") for item in items if nfc(item).lstrip("#")]


def clean_markdown(body: str) -> Tuple[str, List[str], List[str]]:
    """Plain prose for the model from an Obsidian note body.

    Returns (text, link targets, inline tags). Wikilinks become their text, embeds,
    comments and generated query blocks go, callout markers and highlights are unwrapped.
    """
    text = GENERATED_BLOCK_RE.sub("", body)
    text = OBSIDIAN_COMMENT_RE.sub("", text)
    text = HTML_COMMENT_RE.sub("", text)
    text = EMBED_RE.sub("", text)
    text = MARKDOWN_IMAGE_RE.sub("", text)

    targets: List[str] = []

    def unlink(match: re.Match[str]) -> str:
        target, heading, alias = (part.strip() if part else "" for part in match.groups())
        if target:
            targets.append(target)
        return alias or target or heading

    text = WIKILINK_RE.sub(unlink, text)
    text = CALLOUT_RE.sub(r"\1", text)
    text = HIGHLIGHT_RE.sub(r"\1", text)
    text = BLOCK_ID_RE.sub("", text)
    tags = [nfc(tag) for tag in INLINE_TAG_RE.findall(CODE_RE.sub(" ", text)) if not tag.isdigit()]
    text = redact_contacts(text)
    text = BLANK_LINES_RE.sub("\n\n", text).strip()
    return text, targets, tags


def _header(kind: str, props: Dict[str, Any]) -> str:
    parts = [f"유형: {KIND_LABELS[kind]}"]
    for label, keys in (
        ("기간", ("period", "기간")),
        ("회사", ("company", "회사", "소속")),
        ("역할", ("role", "역할")),
        ("포트폴리오", ("portfolio_pages", "pages", "포트폴리오")),
    ):
        value = _text_prop(props, *keys)
        if value:
            parts.append(f"{label}: {value}{'쪽' if label == '포트폴리오' and value[-1:].isdigit() else ''}")
    return "(" + " · ".join(parts) + ")"


@dataclass
class _Draft:
    path: str
    title: str
    slug: str
    kind: str
    body: str
    targets: List[str]
    tags: List[str]
    aliases: List[str]
    props: Dict[str, Any]


def _parse(path: str, raw: bytes) -> Optional[_Draft]:
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    props, body = split_frontmatter(content)
    if props.get("draft") is True or props.get("초안") is True or props.get("persona") is False:
        return None
    stem = nfc(PurePosixPath(path).stem)
    title = _text_prop(props, "title", "제목") or stem
    kind = KIND_ALIASES.get(str(_text_prop(props, "type", "유형") or "").lower(), "note")
    text, targets, inline_tags = clean_markdown(body)
    if not text:
        return None
    tags = list(dict.fromkeys(_list_prop(props, "tags", "tag", "태그") + inline_tags))
    aliases = _list_prop(props, "aliases", "alias", "별칭")
    slug = slugify(_text_prop(props, "id") or stem)
    return _Draft(path, title, slug, kind, text, targets, tags, aliases, props)


def build_notes(files: Iterable[Tuple[str, Optional[bytes]]]) -> Tuple[Tuple[Note, ...], Tuple[str, ...]]:
    """Notes from (path, content) pairs; content None marks a file that was too large to read."""
    drafts: List[_Draft] = []
    skipped: List[str] = []
    for path, raw in sorted(files, key=lambda item: item[0]):
        draft = _parse(path, raw) if raw is not None else None
        if draft is None:
            skipped.append(path)
        else:
            drafts.append(draft)

    taken: Dict[str, int] = {}
    ids: List[str] = []
    for draft in drafts:
        count = taken.get(draft.slug, 0) + 1
        taken[draft.slug] = count
        ids.append(f"{NOTE_PREFIX}{draft.slug}" + (f"-{count}" if count > 1 else ""))

    # Obsidian links by file name, path, title or alias.
    lookup: Dict[str, str] = {}
    for note_id, draft in zip(ids, drafts):
        for name in (draft.title, PurePosixPath(draft.path).stem, draft.path.removesuffix(".md"), *draft.aliases):
            lookup.setdefault(match_key(name), note_id)

    notes = []
    for note_id, draft in zip(ids, drafts):
        links = []
        for target in draft.targets:
            linked = lookup.get(match_key(target)) or lookup.get(match_key(PurePosixPath(target).name))
            if linked and linked != note_id and linked not in links:
                links.append(linked)
        notes.append(
            Note(
                id=note_id,
                title=draft.title,
                kind=draft.kind,
                text=f"{_header(draft.kind, draft.props)}\n{draft.body}",
                path=draft.path,
                links=tuple(links),
                tags=tuple(draft.tags),
                aliases=tuple(draft.aliases),
                project=_text_prop(draft.props, "project", "프로젝트"),
                question=_text_prop(draft.props, "question", "질문"),
                pages=_text_prop(draft.props, "portfolio_pages", "pages", "포트폴리오"),
            )
        )
    notes.sort(key=lambda note: (KIND_ORDER.index(note.kind), note.path))
    return tuple(notes), tuple(skipped)


def _wanted(relative: PurePosixPath) -> Optional[str]:
    """The path below NOTES_SUBDIR, or None for files outside it, hidden or template files."""
    # Compare in NFC: a Korean folder name may arrive decomposed from macOS.
    relative = PurePosixPath(nfc(relative.as_posix()))
    subdir = PurePosixPath(nfc(settings.notes_subdir.strip("/ "))) if settings.notes_subdir.strip() else None
    if subdir is not None:
        try:
            relative = relative.relative_to(subdir)
        except ValueError:
            return None
    if relative.suffix.lower() != ".md" or any(part.startswith((".", "_")) for part in relative.parts):
        return None
    return nfc(relative.as_posix())


def _read_local(folder: Path) -> Iterator[Tuple[str, Optional[bytes]]]:
    if not folder.is_dir():
        raise FileNotFoundError(f"NOTES_DIR 폴더가 없어요: {folder}")
    for path in folder.rglob("*.md"):
        wanted = _wanted(PurePosixPath(path.relative_to(folder).as_posix()))
        if wanted:
            yield wanted, path.read_bytes() if path.stat().st_size <= MAX_NOTE_BYTES else None


def _download_tarball(repo: str, token: str, ref: str) -> bytes:
    url = f"{GITHUB_API}/repos/{repo}/tarball/{ref}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    buffer = bytearray()
    # GitHub redirects to a short-lived codeload URL; httpx drops the token on that cross-host hop.
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        with client.stream("GET", url, headers=headers) as response:
            if response.status_code in (401, 403, 404):
                raise PermissionError(
                    f"GitHub가 {response.status_code}로 응답했어요. 저장소 이름({repo})·브랜치({ref})와 토큰 권한을 확인해 주세요."
                )
            response.raise_for_status()
            for chunk in response.iter_bytes():
                buffer.extend(chunk)
                if len(buffer) > MAX_TARBALL_BYTES:
                    raise ValueError("노트 저장소가 30MB를 넘어요. 마크다운 노트만 올려 주세요.")
    return bytes(buffer)


def _read_github(repo: str, token: str, ref: str) -> Iterator[Tuple[str, Optional[bytes]]]:
    data = _download_tarball(repo, token, ref)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            parts = PurePosixPath(member.name).parts[1:]  # the archive root is <owner>-<repo>-<sha>/
            if not parts:
                continue
            wanted = _wanted(PurePosixPath(*parts))
            if not wanted:
                continue
            if member.size > MAX_NOTE_BYTES:
                yield wanted, None
                continue
            handle = archive.extractfile(member)
            if handle is not None:
                yield wanted, handle.read()


_lock = threading.Lock()
_bundle: Optional[NotesBundle] = None
_loads = itertools.count(1)


def load_notes() -> NotesBundle:
    repo = settings.notes_github_repo.strip()
    folder = settings.notes_dir.strip()
    source = "github" if repo else "local" if folder else "none"
    version = next(_loads)
    if source == "none":
        return NotesBundle(loaded_at=time.time(), version=version)
    try:
        if source == "github":
            token = settings.notes_github_token.strip()
            if not token:
                raise PermissionError("NOTES_GITHUB_TOKEN이 비어 있어요.")
            files = list(_read_github(repo, token, settings.notes_github_ref.strip() or "main"))
        else:
            files = list(_read_local(Path(folder).expanduser()))
        notes, skipped = build_notes(files)
    except Exception as exc:
        logger.exception("notes could not be loaded from %s", source)
        return NotesBundle(source=source, loaded_at=time.time(), error=f"{type(exc).__name__}: {exc}", version=version)
    logger.info("loaded %d notes from %s (%d skipped)", len(notes), source, len(skipped))
    return NotesBundle(notes=notes, source=source, loaded_at=time.time(), skipped=skipped, version=version)


def get_notes() -> NotesBundle:
    """Notes loaded once per process; a failed load is retried after a few minutes."""
    global _bundle
    bundle = _bundle
    if bundle is not None and not (bundle.error and time.time() - bundle.loaded_at > RETRY_FAILED_AFTER_SECONDS):
        return bundle
    with _lock:
        if _bundle is None or _bundle is bundle:
            _bundle = load_notes()
        return _bundle


def notes_version() -> int:
    return get_notes().version


def reset_notes() -> None:
    """Forget loaded notes; waits for a load in progress so it can't land afterwards."""
    global _bundle
    with _lock:
        _bundle = None
