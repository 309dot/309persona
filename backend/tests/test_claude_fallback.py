"""Claude as the last fallback (claude_client.py): order, request shape, both pipelines. No network."""

from types import SimpleNamespace

import pytest

from app.core.config import Settings, settings
from app.services import claude_client, direct_pipeline, llm_service

ANSWER = "페이히어에서 컴포넌트와 토큰을 다시 정의해 디자인 작업 시간을 3.5일에서 1.3일로 줄였어요."
META = '{"sources": ["P2"], "follow_ups": ["개발자와는 어떻게 맞췄나요?"], "topic": "design_system"}'
# Legacy answer that the quality gates send back for two retries (see test_answer_quality.test_retry_budget).
MEDIUM = ("페이히어에서 디자인 시스템 토큰과 컴포넌트 기준을 다시 세웠어요. " * 4) + (
    "\n- 토큰 정리\n- 컴포넌트 기준\n- 리뷰 루프\n- 문서화\n- 운영 점검"
)
USAGE = SimpleNamespace(input_tokens=40, cache_read_input_tokens=9000, cache_creation_input_tokens=0, output_tokens=180)


class FakeClaudeStream:
    def __init__(self, parts, stop_reason):
        self.parts = parts
        self.final = SimpleNamespace(stop_reason=stop_reason, stop_details=None, usage=USAGE)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def text_stream(self):
        yield from self.parts

    def get_final_message(self):
        return self.final


class FakeOpenAIStream:
    """Writes `parts`, then loses the connection."""

    def __init__(self, parts):
        self.parts = parts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        for part in self.parts:
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=part))], usage=None)
        raise ConnectionError("model went away")


@pytest.fixture
def claude(monkeypatch):
    """Turn Claude on with a fake client. `calls` collects the request arguments."""
    calls = []
    state = {"parts": [ANSWER, "\n<<<META>>>\n", META], "text": ANSWER, "stop_reason": "end_turn", "error": None}

    def stream(**kwargs):
        calls.append(kwargs)
        if state["error"]:
            raise state["error"]
        return FakeClaudeStream(state["parts"], state["stop_reason"])

    def create(**kwargs):
        calls.append(kwargs)
        if state["error"]:
            raise state["error"]
        # Thinking comes back as its own block before the text (its text omitted by default).
        content = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=state["text"])]
        return SimpleNamespace(content=content, stop_reason=state["stop_reason"], stop_details=None, usage=USAGE)

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    client = SimpleNamespace(messages=SimpleNamespace(stream=stream, create=create))
    monkeypatch.setattr(claude_client, "get_client", lambda: client)
    return SimpleNamespace(calls=calls, state=state)


def openai_client(create):
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def openai_down(**_kwargs):
    raise ConnectionError("gemini down")


def ask(client):
    session_id = client.post("/api/visitors", json={"visitor_name": "QA"}).json()["session_id"]
    return client.post("/api/chat", json={"session_id": session_id, "question": "디자인 시스템 경험 알려줘"})


def test_model_chain(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "openai_fallback_model", "")
    # No Claude key: the OpenAI-compatible endpoint as before (local Ollama needs no key).
    assert llm_service.model_chain() == [("openai", settings.openai_model)]

    # Claude key but no OpenAI key: Claude alone, no doomed call to a local endpoint first.
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    assert llm_service.model_chain() == [("claude", settings.anthropic_model)]

    monkeypatch.setattr(settings, "openai_api_key", "gemini-key")
    monkeypatch.setattr(settings, "openai_fallback_model", "backup-model")
    assert llm_service.model_chain() == [
        ("openai", settings.openai_model),
        ("openai", "backup-model"),
        ("claude", settings.anthropic_model),
    ]


def test_claude_request_shape():
    history = [direct_pipeline.HistoryTurn("디자인 시스템 경험 알려줘", ANSWER)]
    messages = direct_pipeline.build_messages("그 프로젝트에서 어려웠던 점은?", {}, history)
    kwargs = claude_client.request_kwargs(messages)
    assert kwargs["model"] == settings.anthropic_model
    assert Settings.model_fields["anthropic_model"].default == "claude-haiku-5-5"
    # The knowledge base prompt is the same on every request, so it is cached.
    assert kwargs["system"] == [{"type": "text", "text": messages[0]["content"], "cache_control": {"type": "ephemeral"}}]
    assert [m["role"] for m in kwargs["messages"]] == ["user", "assistant", "user"]
    assert kwargs["output_config"] == {"effort": settings.anthropic_effort}
    assert Settings.model_fields["anthropic_effort"].default == "low"
    # Thinking tokens count toward max_tokens.
    assert kwargs["max_tokens"] >= claude_client.MIN_MAX_TOKENS
    # Claude Haiku 5.5 rejects non-default sampling values.
    assert not {"temperature", "top_p", "top_k"} & kwargs.keys()


def test_direct_switches_to_claude_before_the_first_token(client, db, claude, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    monkeypatch.setattr(settings, "openai_api_key", "gemini-key")
    tried = []

    def create(model, messages):
        tried.append(model)
        raise ConnectionError("gemini down")

    monkeypatch.setattr(direct_pipeline, "_create_stream", create)
    res = ask(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == ANSWER and [s["id"] for s in body["sources"]] == ["P2"]
    assert body["follow_ups"] == ["개발자와는 어떻게 맞췄나요?"]
    assert tried == [settings.openai_model] and len(claude.calls) == 1

    stored = db.docs("conversations")[-1]
    assert stored["model"] == settings.anthropic_model
    # Cached prompt tokens count as prompt tokens.
    assert (stored["prompt_tokens"], stored["completion_tokens"]) == (9040, 180)


def test_direct_does_not_switch_after_the_answer_started(client, db, claude, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    monkeypatch.setattr(settings, "openai_api_key", "gemini-key")
    monkeypatch.setattr(direct_pipeline, "_create_stream", lambda model, messages: FakeOpenAIStream([ANSWER[:20]]))
    res = ask(client)
    assert res.status_code == 503 and res.json()["detail"]["code"] == "llm_unavailable"
    assert claude.calls == []


def test_claude_refusal_or_error_is_a_failure(client, db, claude, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    claude.state.update(parts=[], stop_reason="refusal")
    res = ask(client)
    assert res.status_code == 503 and res.json()["detail"]["code"] == "llm_unavailable"

    claude.state.update(error=ConnectionError("anthropic down"))
    res = ask(client)
    assert res.status_code == 503
    assert [doc["error"] for doc in db.docs("conversations")] == ["llm_unavailable", "llm_unavailable"]


def test_legacy_answers_and_retries_on_claude(claude, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "gemini-key")
    monkeypatch.setattr(llm_service, "get_openai_client", lambda: openai_client(openai_down))
    claude.state["text"] = MEDIUM
    answer, _citations, model = llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
    assert answer and model == settings.anthropic_model
    # The first answer and both quality retries go to the model that answered.
    assert len(claude.calls) == 3
    assert all("temperature" not in call for call in claude.calls)


def test_legacy_failed_quality_retry_keeps_the_answer(monkeypatch):
    calls = []

    def create(**kwargs):
        calls.append(kwargs["model"])
        if len(calls) > 1:
            raise ConnectionError("rate limited")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=MEDIUM))])

    monkeypatch.setattr(llm_service, "get_openai_client", lambda: openai_client(create))
    answer, _citations, model = llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
    assert answer and model == settings.openai_model
    assert len(calls) == 3


def test_legacy_raises_when_every_model_fails(claude, monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "gemini-key")
    monkeypatch.setattr(llm_service, "get_openai_client", lambda: openai_client(openai_down))
    claude.state["error"] = ConnectionError("anthropic down")
    with pytest.raises(RuntimeError, match="gemini down.*anthropic down"):
        llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
