"""Application level configuration helpers."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def split_list(value: Any) -> Any:
    """Accept a comma-separated string or a JSON array string for list settings."""
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if trimmed.startswith("["):
        try:
            parsed = json.loads(trimmed)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    return [item.strip() for item in trimmed.split(",") if item.strip()]


class Settings(BaseSettings):
    """Environment driven configuration."""

    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "309 Interview Agent API"
    environment: str = Field(default="local")
    openai_api_key: str = Field(default="", description="LLM API Key (OpenAI or OpenAI-compatible)")
    openai_model: str = Field(default="qwen3:32b")
    openai_fallback_model: str = Field(default="qwen3:32b")
    openai_base_url: str = Field(
        default="http://127.0.0.1:11434/v1",
        description="OpenAI-compatible base URL (e.g. Ollama /v1)",
    )
    answer_pipeline: str = Field(
        default="legacy",
        description="legacy: retrieval + quality-gate retries; direct: one streamed call with the full "
        "knowledge base (docs/upgrade-plan-2026-10.md Phase 3). Switch after comparing both with evals/",
    )
    llm_timeout_seconds: float = Field(default=45, description="Timeout for a single LLM request")
    llm_max_retries: int = Field(default=1, description="SDK-level retries on connection errors")
    llm_temperature: float = Field(default=0.4, description="direct pipeline sampling temperature")
    llm_max_output_tokens: int = Field(default=1200, description="direct pipeline answer + metadata budget")
    llm_stream_usage: bool = Field(
        default=True, description="Ask for token usage in streamed responses (stream_options.include_usage)"
    )
    llm_reasoning_effort: str = Field(
        default="",
        description="Sent as reasoning_effort when set (e.g. low for Gemini). Thinking tokens count toward "
        "llm_max_output_tokens on most providers, so raise that too. Empty: not sent",
    )
    chat_history_turns: int = Field(default=3, description="Previous Q&A pairs sent back to the model")
    answer_time_budget_seconds: float = Field(
        default=90, description="Skip optional quality retries once an answer has taken this long"
    )
    rag_top_k: int = Field(default=4, description="Top K chunks to retrieve for RAG")
    rag_mode: str = Field(default="lexical", description="lexical | hybrid")
    rag_vector_weight: float = Field(default=0.7)
    rag_lexical_weight: float = Field(default=0.3)
    rag_embedding_model: str = Field(default="nomic-embed-text")
    database_url: Optional[str] = Field(default=None)
    answer_quality_mode: str = Field(default="quality", description="fast | balanced | quality")
    knowledge_pack_path: str = Field(
        default="../knowledge_base/309_knowledge_pack.json",
        description="Path to the 309 knowledge base JSON file",
    )
    # Private Obsidian notes (docs/obsidian-notes.md): a local folder, or a private GitHub repo read with a token.
    notes_dir: str = Field(default="", description="Local folder of Obsidian notes (development and tests)")
    notes_github_repo: str = Field(default="", description="owner/repo of the private notes repository")
    notes_github_token: str = Field(default="", description="Fine-grained token with read access to that repo")
    notes_github_ref: str = Field(default="main")
    notes_subdir: str = Field(default="", description="Folder inside the repo or notes_dir to read; empty: all")
    notes_max_chars: int = Field(
        default=60000, description="Note text added to the direct prompt; notes past this are left out"
    )
    firebase_credentials_path: Optional[str] = Field(
        default=None, description="Path to Firebase service account JSON file"
    )
    firebase_credentials_json: Optional[str] = Field(
        default=None, description="Inline JSON for Firebase credentials"
    )
    allowed_origins: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://www.309designlab.com",
            "https://309designlab.com",
        ]
    )
    allowed_origin_regex: str = Field(
        default=r"^https://([a-z0-9-]+\.)?309designlab\.com$|^http://(localhost|127\.0\.0\.1)(:\d+)?$",
        description="Regex fallback for CORS origins",
    )
    blocked_message: str = Field(
        default="이 서비스는 309의 경력 관련 질문만 응답합니다."
    )
    max_session_questions: int = Field(default=5)
    session_window_minutes: int = Field(
        default=30, description="Time window for counting rate limited questions"
    )
    max_ip_questions: int = Field(default=30, description="Questions per client IP per ip_window_minutes")
    max_ip_sessions: int = Field(default=20, description="New chat sessions per client IP per ip_window_minutes")
    ip_window_minutes: int = Field(default=60)
    trusted_proxy_hops: int = Field(
        default=1,
        description="Proxies in front of the app that append to X-Forwarded-For (Render: 1). "
        "0 ignores the header and uses the socket address",
    )
    analytics_limit: int = Field(
        default=200, description="Max records returned for dashboard lists"
    )
    admin_allowed_emails: Annotated[List[str], NoDecode] = Field(
        default_factory=list,
        description="Firebase auth emails allowed to view dashboard. Empty means nobody.",
    )
    admin_require_email_verified: bool = Field(
        default=False, description="Also require email_verified on the admin's Firebase token"
    )

    @field_validator("allowed_origins", "admin_allowed_emails", mode="before")
    @classmethod
    def parse_list(cls, value: Any) -> Any:
        return split_list(value)


@lru_cache
def get_settings() -> Settings:
    """Singleton settings accessor."""
    return Settings()


settings = get_settings()

