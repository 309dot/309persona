"""Direct pipeline pieces that don't need an LLM: stream parsing, metadata, sources, prompts."""

import pytest
from starlette.requests import Request

from app.core import rate_limiter
from app.core.config import settings
from app.services import direct_pipeline
from app.services.direct_pipeline import META_MARKER, HistoryTurn, StreamParser, parse_meta
from app.services.knowledge_document import knowledge_sources, label_sources, render_knowledge_block


def run_parser(chunks):
    parser = StreamParser()
    shown = "".join(parser.feed(chunk) for chunk in chunks)
    tail, answer, meta = parser.finish()
    return shown + tail, answer, meta


def test_parser_hides_metadata_split_across_chunks():
    chunks = ["디자인 시스템은 ", "페이히어에서 만들었어요.\n<<<", "META>>>\n", '{"sources": ["P2"], ', '"topic": "design_system"}']
    shown, answer, meta = run_parser(chunks)
    assert shown.strip() == answer == "디자인 시스템은 페이히어에서 만들었어요."
    assert "<<<" not in shown and "META" not in shown
    assert parse_meta(meta)["sources"] == ["P2"]


def test_parser_drops_think_block_and_leading_whitespace():
    shown, answer, _ = run_parser(["<thi", "nk>\n내부 추론", "</think>\n\n", "  안녕하세요", ", 309예요."])
    assert shown == answer == "안녕하세요, 309예요."


def test_parser_without_metadata_streams_everything():
    shown, answer, meta = run_parser(["협업 ", "사례를 ", "말씀드릴게요. <<", "끝"])
    assert shown == answer == "협업 사례를 말씀드릴게요. <<끝"
    assert meta == ""


def test_parser_unfinished_think_block_yields_nothing():
    assert run_parser(["<think>생각만 하다가", " 끝남"]) == ("", "", "")


def test_parse_meta_filters_unknown_values():
    meta = parse_meta(
        '```json\n{"sources": ["P1", "NOPE", "P1", "RESUME"], "follow_ups": ["하나?", "", "둘?", "셋?", "넷?"], "topic": "weather"}\n```'
    )
    assert meta == {"sources": ["P1", "RESUME"], "follow_ups": ["하나?", "둘?", "셋?"], "topic": None}
    assert parse_meta("not json") == {"sources": [], "follow_ups": [], "topic": None}
    assert parse_meta('["a"]')["sources"] == []


def test_knowledge_block_has_every_source_and_no_phone_numbers():
    block = render_knowledge_block()
    ids = [source.id for source in knowledge_sources()]
    assert ids[0] == "PROFILE" and "RESUME" in ids and "NOTES" in ids
    for source_id in ids:
        assert f'id="{source_id}"' in block
    assert "010-" not in block
    assert "본 문서는 서비스 내 AI" not in block


def test_label_sources_maps_legacy_and_direct_ids():
    p2 = next(s for s in knowledge_sources() if s.id == "P2")
    labels = label_sources(["doc:resume#8", f"project:{p2.label}", "P2", "pack:summary", "doc:unknown#1", "RESUME"])
    assert labels == [
        {"id": "RESUME", "label": "이력서"},
        {"id": "P2", "label": p2.label},
        {"id": "PROFILE", "label": "프로필 요약"},
    ]


def test_system_prompt_is_stable_and_complete():
    prompt = direct_pipeline.build_system_prompt()
    assert "[[" not in prompt
    assert META_MARKER in prompt and "<knowledge>" in prompt
    assert prompt == direct_pipeline.build_system_prompt()


def test_messages_keep_recent_history_and_visitor(monkeypatch):
    monkeypatch.setattr(settings, "chat_history_turns", 2)
    history = [HistoryTurn(question=f"질문{i}", answer=f"답변{i}") for i in range(4)]
    messages = direct_pipeline.build_messages("그 프로젝트에서 어려웠던 점은?", {"visitor_name": "김리크루터"}, history)
    assert [m["role"] for m in messages] == ["system", "user", "assistant", "user", "assistant", "user"]
    assert messages[1]["content"] == "질문2" and messages[4]["content"] == "답변3"
    assert messages[-1]["content"].startswith("(방문자: 김리크루터)")
    monkeypatch.setattr(settings, "chat_history_turns", 0)
    assert len(direct_pipeline.build_messages("질문", {}, history)) == 2


def _request(headers=None, host="10.0.0.9"):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (host, 1234)})


@pytest.mark.parametrize(
    ("hops", "forwarded", "expected"),
    [
        (1, "203.0.113.7", "203.0.113.7"),
        (1, "1.2.3.4, 203.0.113.7", "203.0.113.7"),  # client-supplied entry on the left is ignored
        (2, "1.2.3.4, 203.0.113.7, 10.1.1.1", "203.0.113.7"),
        (0, "203.0.113.7", "10.0.0.9"),
        (1, "", "10.0.0.9"),
    ],
)
def test_client_ip_uses_trusted_proxy_hops(monkeypatch, hops, forwarded, expected):
    monkeypatch.setattr(settings, "trusted_proxy_hops", hops)
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    assert rate_limiter.client_ip(_request(headers)) == expected


def test_limiter_release_gives_back_the_last_hit():
    limiter = rate_limiter.SlidingWindowLimiter(limit=2, window_minutes=1)
    assert limiter.touch("k") and limiter.touch("k") and not limiter.touch("k")
    limiter.release("k")
    assert limiter.remaining("k") == 1
