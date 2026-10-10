"""Private Obsidian notes: markdown cleanup, loading from a folder or a GitHub tarball, and their place in the prompt."""

import dataclasses
import io
import tarfile
import unicodedata

import httpx
import pytest

from app.core.config import settings
from app.services import direct_pipeline, knowledge_base, knowledge_document, obsidian_notes
from app.services.obsidian_notes import clean_markdown, get_notes, reset_notes

PROJECT_NOTE = """---
title: 페이히어 디자인 시스템 회고
type: 프로젝트
period: 2022.11–2023.12
role: Senior Product Designer
company: 페이히어
project: P2
portfolio_pages: 6-11
tags: [디자인 시스템, 협업]
aliases: [디자인 시스템 회고]
question: 디자인 시스템을 팀에 정착시킨 방법은?
---
컴포넌트 기준을 먼저 맞추고 [[리뷰 루프]]에 점검을 묶었어요.
==토큰 이름은 개발자와 함께== 정했어요. ^block-1
%%아직 정리 중인 메모%%
"""

STORY_NOTE = """---
type: 사례
tags:
  - 협업
---
# 리뷰 루프
매주 디자이너와 개발자가 같은 화면을 보며 기준을 점검했어요. [[페이히어 디자인 시스템 회고|디자인 시스템]] 이야기와 이어져요.
"""


def test_clean_markdown_unwraps_obsidian_syntax_and_drops_private_bits():
    body = """> [!note] 요약
> 핵심은 ==흐름 단위 정의== 였어요 ^abc123
[[페이히어 디자인 시스템|디자인 시스템]]과 [[회고#배운 점]], [[#이 노트의 제목]]을 봐 주세요.
![[스크린샷.png]] ![도식](images/flow.png)
%%개인 메모
여러 줄%%
<!-- 숨긴 메모 -->
```dataview
TABLE file.name FROM #project
```
연락처 010-1234-5678
메일 someone@example.com, hello@309designlab.com
#디자인시스템 #협업/조율 `#코드속태그` #2024
"""
    text, targets, tags = clean_markdown(body)

    assert "> 요약" in text and "[!note]" not in text
    assert "핵심은 흐름 단위 정의 였어요" in text and "^abc123" not in text
    assert "디자인 시스템과 회고, 이 노트의 제목을 봐 주세요." in text
    assert "스크린샷" not in text and "flow.png" not in text
    assert "개인 메모" not in text and "숨긴 메모" not in text and "TABLE" not in text
    assert "010-1234-5678" not in text and "연락처" not in text
    assert "someone@example.com" not in text and "[이메일 생략]" in text and "hello@309designlab.com" in text
    assert targets == ["페이히어 디자인 시스템", "회고"]
    assert tags == ["디자인시스템", "협업/조율"]


def test_notes_load_from_folder_with_metadata_links_and_skips(notes):
    notes("309-persona/페이히어 디자인 시스템 회고.md", PROJECT_NOTE)
    notes("309-persona/사례/리뷰 루프.md", STORY_NOTE)
    notes("309-persona/쓰는 중.md", "---\ndraft: true\n---\n아직 공개 전")
    notes("309-persona/_템플릿.md", "---\ntype: 프로젝트\n---\n템플릿")
    notes("309-persona/.obsidian/workspace.md", "설정")
    notes("일기/비공개.md", "퍼소나 폴더 밖의 노트")
    # macOS can hand over decomposed Hangul file names.
    notes(unicodedata.normalize("NFD", "309-persona/가치관.md"), "---\ntype: 생각\n---\n문제 정의를 먼저 해요.")

    bundle = get_notes()
    assert bundle.source == "local" and bundle.error is None
    assert bundle.skipped == ("쓰는 중.md",)
    by_title = {note.title: note for note in bundle.notes}
    assert set(by_title) == {"페이히어 디자인 시스템 회고", "리뷰 루프", "가치관"}

    project = by_title["페이히어 디자인 시스템 회고"]
    assert project.id == "N:페이히어-디자인-시스템-회고" and project.kind == "project"
    assert project.text.startswith(
        "(유형: 프로젝트 · 기간: 2022.11–2023.12 · 회사: 페이히어 · 역할: Senior Product Designer · 포트폴리오: 6-11쪽)\n"
    )
    assert "아직 정리 중인 메모" not in project.text and "토큰 이름은 개발자와 함께 정했어요." in project.text
    assert project.links == ("N:리뷰-루프",)
    assert project.tags == ("디자인 시스템", "협업") and project.project == "P2" and project.pages == "6-11"
    assert project.question == "디자인 시스템을 팀에 정착시킨 방법은?"

    story = by_title["리뷰 루프"]
    assert story.kind == "story" and story.links == (project.id,) and story.path == "사례/리뷰 루프.md"
    assert by_title["가치관"].kind == "value" and by_title["가치관"].id == "N:가치관"
    # Projects first, then stories, then values.
    assert [note.kind for note in bundle.notes] == ["project", "story", "value"]


def test_korean_subdir_matches_even_when_decomposed(notes, monkeypatch):
    monkeypatch.setattr(settings, "notes_subdir", "퍼소나")
    notes(unicodedata.normalize("NFD", "퍼소나/노트.md"), "폴더 이름이 분해된 한글이어도 읽혀요.")
    assert [note.title for note in get_notes().notes] == ["노트"]


def test_same_file_name_in_two_folders_gets_distinct_ids(notes):
    notes("309-persona/a/회고.md", "첫 번째 회고")
    notes("309-persona/b/회고.md", "두 번째 회고")
    assert [note.id for note in get_notes().notes] == ["N:회고", "N:회고-2"]


def test_notes_join_the_prompt_the_legacy_chunks_and_source_labels(notes):
    notes("309-persona/페이히어 디자인 시스템 회고.md", PROJECT_NOTE)
    notes("309-persona/사례/리뷰 루프.md", STORY_NOTE)

    block = knowledge_document.render_knowledge_block()
    assert '<source id="N:페이히어-디자인-시스템-회고" title="페이히어 디자인 시스템 회고">' in block
    assert "매주 디자이너와 개발자가" in direct_pipeline.build_system_prompt()
    assert "N:리뷰-루프" in direct_pipeline.parse_meta('{"sources": ["N:리뷰-루프", "N:없음"]}')["sources"]

    chunks = [source for source, _, _ in knowledge_base.build_rag_chunks()]
    assert "note:리뷰-루프#1" in chunks
    assert knowledge_document.label_sources(["note:리뷰-루프#1", "N:페이히어-디자인-시스템-회고"]) == [
        {"id": "N:리뷰-루프", "label": "리뷰 루프"},
        {"id": "N:페이히어-디자인-시스템-회고", "label": "페이히어 디자인 시스템 회고"},
    ]


def test_notes_past_the_budget_are_left_out_lowest_priority_first(notes, monkeypatch):
    notes("309-persona/프로젝트.md", "---\ntype: project\n---\n" + "가" * 300)
    notes("309-persona/메모.md", "메모 " + "나" * 300)
    monkeypatch.setattr(settings, "notes_max_chars", 400)

    included, left_out = knowledge_document.notes_in_prompt()
    assert [note.title for note in included] == ["프로젝트"] and [note.title for note in left_out] == ["메모"]
    status = knowledge_document.knowledge_status()
    assert status["notes_left_out"] == 1
    assert [(note["title"], note["included"]) for note in status["notes"]] == [("프로젝트", True), ("메모", False)]
    assert "N:메모" not in knowledge_document.render_knowledge_block()


def test_missing_folder_or_token_is_reported_not_raised(notes, monkeypatch):
    monkeypatch.setattr(settings, "notes_dir", "/nonexistent/notes")
    reset_notes()
    assert get_notes().notes == () and "NOTES_DIR" in get_notes().error

    monkeypatch.setattr(settings, "notes_github_repo", "309dot/persona-notes")
    monkeypatch.setattr(settings, "notes_github_token", "")
    reset_notes()
    assert get_notes().source == "github" and "NOTES_GITHUB_TOKEN" in get_notes().error
    # The rest of the knowledge base still works.
    assert "<source id=\"P2\"" in knowledge_document.render_knowledge_block()


def test_a_failed_load_is_retried_after_a_while(notes, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "notes_dir", "/nonexistent/notes")
    reset_notes()
    failed = get_notes()
    assert failed.error

    # The folder appears (say GitHub was down); the failure is not retried right away.
    (tmp_path / "309-persona").mkdir()
    (tmp_path / "309-persona" / "노트.md").write_text("다시 읽혔어요.", encoding="utf-8")
    monkeypatch.setattr(settings, "notes_dir", str(tmp_path))
    assert get_notes() is failed

    monkeypatch.setattr(obsidian_notes, "_bundle", dataclasses.replace(failed, loaded_at=1.0))
    assert [note.title for note in get_notes().notes] == ["노트"]


def _tarball(files):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as archive:
        for name, text in files.items():
            raw = text.encode("utf-8")
            info = tarfile.TarInfo(f"309dot-persona-notes-abc1234/{name}")
            info.size = len(raw)
            archive.addfile(info, io.BytesIO(raw))
    return data.getvalue()


@pytest.fixture
def github(monkeypatch):
    """Answer GitHub's tarball endpoint (and its codeload redirect) from memory."""
    requests = []

    def install(files, status=200):
        def handler(request):
            requests.append(request)
            if request.url.host == "api.github.com":
                if status != 200:
                    return httpx.Response(status, json={"message": "Not Found"})
                return httpx.Response(302, headers={"Location": "https://codeload.github.com/309dot/persona-notes/tar.gz/main?token=tmp"})
            return httpx.Response(200, content=_tarball(files))

        real_client = httpx.Client
        monkeypatch.setattr(
            obsidian_notes.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
        )
        return requests

    monkeypatch.setattr(settings, "notes_dir", "")
    monkeypatch.setattr(settings, "notes_github_repo", "309dot/persona-notes")
    monkeypatch.setattr(settings, "notes_github_token", "github_pat_test")
    monkeypatch.setattr(settings, "notes_github_ref", "main")
    monkeypatch.setattr(settings, "notes_subdir", "309-persona")
    reset_notes()
    yield install
    reset_notes()


def test_notes_load_from_a_private_github_repo(github):
    requests = github({"309-persona/리뷰 루프.md": STORY_NOTE, "README.md": "저장소 설명", "309-persona/_t.md": "템플릿"})

    bundle = get_notes()
    assert bundle.source == "github" and bundle.error is None
    assert [note.title for note in bundle.notes] == ["리뷰 루프"]
    api, codeload = requests
    assert api.url.path == "/repos/309dot/persona-notes/tarball/main"
    assert api.headers["Authorization"] == "Bearer github_pat_test"
    # The token is not sent along to the redirect target.
    assert "Authorization" not in codeload.headers


def test_github_errors_name_what_to_check(github):
    github({}, status=404)
    error = get_notes().error
    assert "404" in error and "309dot/persona-notes" in error and "github_pat_test" not in error
