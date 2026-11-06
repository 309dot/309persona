"""The portfolio site's case studies (knowledge_base/web_cases.md): one source per case in both pipelines."""

import re
from pathlib import Path

from app.core.config import settings
from app.services import direct_pipeline, knowledge_base, knowledge_document

CASES_FILE = Path(settings.knowledge_pack_path).resolve().parent / knowledge_base.WEB_CASES_FILE


def test_every_case_in_the_file_is_a_source_with_its_page():
    cases = knowledge_base.load_web_cases()
    headings = re.findall(r"(?m)^## ", CASES_FILE.read_text(encoding="utf-8"))
    assert len(cases) == len(headings) >= 10
    for case_id, title, text in cases:
        assert case_id.startswith("W:") and title and not title[0].isdigit()
        assert f"- URL: https://www.309designlab.com/work/{case_id.removeprefix('W:')}\n" in text
    assert ("W:o-yoga", "O-YOGA 웹사이트 리뉴얼") in [(case_id, title) for case_id, title, _ in cases]


def test_cases_join_the_direct_prompt_without_the_file_header():
    block = knowledge_document.render_knowledge_block()
    assert '<source id="W:o-yoga" title="O-YOGA 웹사이트 리뉴얼">' in block
    assert "버튼 60개가 모두 사이트 밖으로" in block
    assert "런타임이 읽지 않는다" not in block  # the header above the first case
    assert direct_pipeline.parse_meta('{"sources": ["W:o-yoga", "W:nope"]}')["sources"] == ["W:o-yoga"]


def test_legacy_chunks_name_their_case_and_cite_it():
    chunks = {source: text for source, text, _ in knowledge_base.build_rag_chunks()}
    oyoga = [source for source in chunks if source.startswith("doc:web_cases/o-yoga#")]
    assert oyoga and all(chunks[source].startswith("[O-YOGA 웹사이트 리뉴얼] 2026.10 — 2026.11\n") for source in oyoga)
    # Every chunk carries its case's period, which most paragraphs never mention.
    headers = {
        case_id.removeprefix("W:"): f"[{title}] {knowledge_base.CASE_PERIOD_RE.search(text).group(1).strip()}"
        for case_id, title, text in knowledge_base.load_web_cases()
    }
    for source, text in chunks.items():
        if source.startswith("doc:web_cases/"):
            assert text.split("\n", 1)[0] == headers[source.removeprefix("doc:web_cases/").split("#")[0]]
    # Published text, not instructions: the paragraph that mentions a "금지 목록" stays.
    assert any("제품 UI용 금지 목록" in chunks[source] for source in oyoga)
    assert knowledge_document.label_sources([oyoga[0], "W:korail", "doc:web_cases/nope#1"]) == [
        {"id": "W:o-yoga", "label": "O-YOGA 웹사이트 리뉴얼"},
        {"id": "W:korail", "label": "코레일 피복관리 시스템"},
    ]
