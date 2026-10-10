"""Application level configuration helpers."""

from __future__ import annotations

from functools import lru_cache
import json
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
    use_openclaw_agent: bool = Field(
        default=False,
        description="Route persona answers through OpenClaw answer agent",
    )
    openclaw_answer_agent_id: str = Field(
        default="persona-answer-local",
        description="OpenClaw agent id for persona answers",
    )
    openclaw_answer_timeout_seconds: int = Field(default=70)
    llm_timeout_seconds: float = Field(default=45, description="Timeout for a single LLM request")
    llm_max_retries: int = Field(default=1, description="SDK-level retries on connection errors")
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

