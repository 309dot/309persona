"""Application level configuration helpers."""

from __future__ import annotations

from functools import lru_cache
import json
from typing import Any, List, Optional, Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def lenient_json_loads(value: Any) -> Any:
    """Return JSON-decoded value, but fall back to original on decode errors."""
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        return value
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        return value


class Settings(BaseSettings):
    """Environment driven configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        json_loads=lenient_json_loads,
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
        default=True,
        description="Route persona answers through OpenClaw answer agent",
    )
    openclaw_answer_agent_id: str = Field(
        default="persona-answer-local",
        description="OpenClaw agent id for persona answers",
    )
    openclaw_answer_timeout_seconds: int = Field(default=70)
    rag_top_k: int = Field(default=4, description="Top K chunks to retrieve for RAG")
    rag_mode: str = Field(default="lexical", description="lexical | hybrid")
    rag_vector_weight: float = Field(default=0.7)
    rag_lexical_weight: float = Field(default=0.3)
    rag_embedding_model: str = Field(default="nomic-embed-text")
    database_url: Optional[str] = Field(default=None)
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
    allowed_origins: List[str] = Field(
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
    max_session_questions: int = Field(default=3)
    session_window_minutes: int = Field(
        default=30, description="Time window for counting rate limited questions"
    )
    analytics_limit: int = Field(
        default=200, description="Max records returned for dashboard lists"
    )
    admin_allowed_emails: List[str] = Field(
        default_factory=list, description="Firebase auth emails allowed to view dashboard"
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_allowed_origins(cls, value: Optional[Union[str, List[str], Any]]):
        """Allow comma-separated strings or JSON arrays."""
        if value is None:
            return value
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed.startswith("["):
                try:
                    parsed = json.loads(trimmed)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in trimmed.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return value

    @field_validator("admin_allowed_emails", mode="before")
    @classmethod
    def split_admin_emails(cls, value: Optional[Union[str, List[str]]]):
        if isinstance(value, str):
            return [email.strip() for email in value.split(",") if email.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Singleton settings accessor."""
    return Settings()


settings = get_settings()

