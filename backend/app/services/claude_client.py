"""Claude (Anthropic API): the last fallback after the OpenAI-compatible models.

Set ANTHROPIC_API_KEY to turn it on. It is tried only when every OPENAI_* model
failed before writing anything, in both pipelines.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

import anthropic

from ..core.config import settings

# Adaptive thinking is on by default on current Claude models and its tokens count
# toward max_tokens, so the answer budget leaves room for it.
MIN_MAX_TOKENS = 4096

Usage = Tuple[Optional[int], Optional[int]]  # (prompt tokens, completion tokens)

_client: Optional[anthropic.Anthropic] = None


class ClaudeRefusal(RuntimeError):
    """The model declined to answer (stop_reason "refusal")."""


def enabled() -> bool:
    return bool(settings.anthropic_api_key.strip())


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        kwargs: Dict[str, Any] = {
            "api_key": settings.anthropic_api_key.strip(),
            "timeout": settings.llm_timeout_seconds,
            "max_retries": settings.llm_max_retries,
        }
        if settings.anthropic_base_url:
            kwargs["base_url"] = settings.anthropic_base_url
        _client = anthropic.Anthropic(**kwargs)
    return _client


def request_kwargs(messages: List[Dict[str, str]], max_tokens: Optional[int] = None) -> Dict[str, Any]:
    """Messages API arguments from OpenAI-style messages ([system, user, assistant, …, user]).

    No temperature: Claude Haiku 5.5 rejects non-default sampling values. The system
    prompt is the same on every request, so it is marked for prompt caching.
    """
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    kwargs: Dict[str, Any] = {
        "model": settings.anthropic_model,
        "max_tokens": max(max_tokens or settings.llm_max_output_tokens, MIN_MAX_TOKENS),
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
    }
    if system:
        kwargs["system"] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    effort = settings.anthropic_effort.strip()
    if effort:
        kwargs["output_config"] = {"effort": effort}
    return kwargs


def _usage(message: Any) -> Usage:
    usage = getattr(message, "usage", None)
    if usage is None:
        return None, None
    # input_tokens excludes the cached part; count everything the model read.
    prompt = sum(
        getattr(usage, name, None) or 0
        for name in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")
    )
    return prompt, getattr(usage, "output_tokens", None)


def _check_refusal(message: Any) -> None:
    if getattr(message, "stop_reason", None) == "refusal":
        details = getattr(message, "stop_details", None)
        raise ClaudeRefusal(f"declined ({getattr(details, 'category', None) or 'no category'})")


def stream(messages: List[Dict[str, str]], on_text: Callable[[str], None], should_stop: Callable[[], bool]) -> Usage:
    """Stream one reply, handing each text delta to `on_text`. Raises on API errors and refusals."""
    with get_client().messages.stream(**request_kwargs(messages)) as response:
        for text in response.text_stream:
            if should_stop():
                return None, None
            on_text(text)
        final = response.get_final_message()
    _check_refusal(final)
    return _usage(final)


def complete(system_prompt: str, user_payload: str, max_tokens: int) -> Tuple[str, Usage]:
    """One non-streamed reply (legacy pipeline)."""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_payload}]
    message = get_client().messages.create(**request_kwargs(messages, max_tokens))
    _check_refusal(message)
    text = "".join(block.text for block in message.content if block.type == "text")
    return text.strip(), _usage(message)
