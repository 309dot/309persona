"""Model chain (llm_service.model_chain): Gemini, the OpenAI-compatible endpoint, then Claude. No network."""

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
    """Writes `parts`; then either loses the connection or ends with a usage chunk."""

    def __init__(self, parts, fail=False, usage=None):
        self.parts, self.fail, self.usage = parts, fail, usage

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        for part in self.parts:
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=part))], usage=None)
        if self.fail:
            raise ConnectionError("model went away")
        yield SimpleNamespace(choices=[], usage=self.usage)


def openai_client(create):
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def openai_down(**_kwargs):
    raise ConnectionError("openai down")


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


@pytest.fixture
def gemini(monkeypatch):
    """Turn Gemini on with a fake OpenAI-compatible client. `calls` collects the request arguments."""
    calls = []
    state = {"parts": [ANSWER, "\n<<<META>>>\n", META], "text": ANSWER, "error": None}

    def create(**kwargs):
        calls.append(kwargs)
        if state["error"]:
            raise state["error"]
        if kwargs.get("stream"):
            return FakeOpenAIStream(state["parts"], usage=SimpleNamespace(prompt_tokens=8000, completion_tokens=300))
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=state["text"]))])

    monkeypatch.setattr(settings, "gemini_api_key", "AQ.test-key")
    monkeypatch.setattr(llm_service, "get_gemini_client", lambda: openai_client(create))
    return SimpleNamespace(calls=calls, state=state)


@pytest.fixture
def remote_openai(monkeypatch):
    """An OpenAI-compatible endpoint set explicitly (not the local Ollama default)."""
    monkeypatch.setattr(settings, "openai_base_url", "https://llm.example/v1")
    monkeypatch.setattr(settings, "openai_api_key", "remote-key")


def ask(client):
    session_id = client.post("/api/visitors", json={"visitor_name": "QA"}).json()["session_id"]
    return client.post("/api/chat", json={"session_id": session_id, "question": "디자인 시스템 경험 알려줘"})


def test_model_chain(monkeypatch):
    monkeypatch.setattr(settings, "openai_fallback_model", "")
    # No cloud key: the local OpenAI-compatible endpoint (Ollama) as before.
    assert llm_service.model_chain() == [("openai", settings.openai_model)]

    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    assert llm_service.model_chain() == [("claude", settings.anthropic_model)]

    # Render as configured: an unused OPENAI_API_KEY with no OPENAI_BASE_URL, plus Gemini and Claude keys.
    # The local default endpoint can only fail there, so it is skipped.
    monkeypatch.setattr(settings, "openai_api_key", "sk-proj-unused")
    monkeypatch.setattr(settings, "gemini_api_key", "AQ.test-key")
    assert llm_service.model_chain() == [("gemini", settings.gemini_model), ("claude", settings.anthropic_model)]

    monkeypatch.setattr(settings, "openai_base_url", "https://llm.example/v1")
    monkeypatch.setattr(settings, "openai_fallback_model", "backup-model")
    assert llm_service.model_chain() == [
        ("gemini", settings.gemini_model),
        ("openai", settings.openai_model),
        ("openai", "backup-model"),
        ("claude", settings.anthropic_model),
    ]


def test_key_names_as_written_on_render(monkeypatch):
    """Env names are case-insensitive, and CLAUDE_API_KEY works as well as ANTHROPIC_API_KEY."""
    for name in ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("claude_API_KEY", "sk-ant-test")
    monkeypatch.setenv("Gemini_api_key", "AQ.test-key")
    parsed = Settings(_env_file=None)
    assert (parsed.anthropic_api_key, parsed.gemini_api_key) == ("sk-ant-test", "AQ.test-key")
    assert Settings.model_fields["gemini_model"].default == "gemini-3.5-flash-lite"


def test_gemini_client_uses_the_gemini_endpoint(monkeypatch):
    monkeypatch.setattr(llm_service, "_gemini_client", None)
    monkeypatch.setattr(settings, "gemini_api_key", "AQ.test-key")
    gemini_client = llm_service.get_gemini_client()
    assert str(gemini_client.base_url).startswith("https://generativelanguage.googleapis.com/v1beta/openai")
    assert gemini_client.api_key == "AQ.test-key"


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


def test_direct_answers_with_gemini(client, db, gemini, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    res = ask(client)
    assert res.status_code == 200, res.text
    assert res.json()["answer"] == ANSWER and [s["id"] for s in res.json()["sources"]] == ["P2"]

    request = gemini.calls[0]
    assert request["model"] == settings.gemini_model and request["stream"] is True
    # Gemini 3 keeps its default temperature, always thinks (thinking shares max_tokens),
    # and stream_options is not documented on its OpenAI-compatible endpoint.
    assert "temperature" not in request and "stream_options" not in request
    assert request["reasoning_effort"] == "low" and request["max_tokens"] >= llm_service.GEMINI_MIN_MAX_TOKENS

    stored = db.docs("conversations")[-1]
    assert stored["model"] == settings.gemini_model
    assert (stored["prompt_tokens"], stored["completion_tokens"]) == (8000, 300)


def test_direct_gemini_down_goes_straight_to_claude(client, db, gemini, claude, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    monkeypatch.setattr(settings, "openai_api_key", "sk-proj-unused")  # no OPENAI_BASE_URL, as on Render
    monkeypatch.setattr(llm_service, "get_openai_client", lambda: pytest.fail("the local default endpoint was called"))
    gemini.state["error"] = ConnectionError("gemini down")
    res = ask(client)
    assert res.status_code == 200, res.text
    assert res.json()["answer"] == ANSWER
    assert len(gemini.calls) == 1 and len(claude.calls) == 1
    assert db.docs("conversations")[-1]["model"] == settings.anthropic_model


def test_direct_switches_to_claude_before_the_first_token(client, db, claude, remote_openai, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    tried = []

    def create(model, messages, provider="openai"):
        tried.append(model)
        raise ConnectionError("openai down")

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


def test_direct_does_not_switch_after_the_answer_started(client, db, claude, remote_openai, monkeypatch):
    monkeypatch.setattr(settings, "answer_pipeline", "direct")
    monkeypatch.setattr(
        direct_pipeline, "_create_stream", lambda model, messages, provider="openai": FakeOpenAIStream([ANSWER[:20]], fail=True)
    )
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


def test_legacy_answers_and_retries_on_gemini(gemini, claude):
    gemini.state["text"] = MEDIUM
    answer, _citations, model = llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
    assert answer and model == settings.gemini_model
    # The first answer and both quality retries go to the model that answered.
    assert len(gemini.calls) == 3 and claude.calls == []
    assert all("temperature" not in call and call["reasoning_effort"] == "low" for call in gemini.calls)
    assert gemini.calls[0]["max_tokens"] >= llm_service.GEMINI_MIN_MAX_TOKENS


def test_legacy_answers_and_retries_on_claude(claude, remote_openai, monkeypatch):
    monkeypatch.setattr(llm_service, "get_openai_client", lambda: openai_client(openai_down))
    claude.state["text"] = MEDIUM
    answer, _citations, model = llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
    assert answer and model == settings.anthropic_model
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


def test_legacy_raises_when_every_model_fails(gemini, claude, remote_openai, monkeypatch):
    monkeypatch.setattr(llm_service, "get_openai_client", lambda: openai_client(openai_down))
    gemini.state["error"] = ConnectionError("gemini down")
    claude.state["error"] = ConnectionError("anthropic down")
    with pytest.raises(RuntimeError, match="gemini down.*openai down.*anthropic down"):
        llm_service.generate_persona_answer("디자인 시스템 경험 알려줘", "design_system", {})
