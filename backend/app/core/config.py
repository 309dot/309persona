"""Application level configuration helpers."""

from __future__ import annotations

from functools import lru_cache
from typing import List, Optional, Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment driven configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "309 Interview Agent API"
    environment: str = Field(default="local")
    openai_api_key: str = Field(default="", description="OpenAI API Key")
    openai_model: str = Field(default="gpt-4o-mini")
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
    def split_allowed_origins(cls, value: Optional[Union[str, List[str]]]):
        """Allow comma separated env values."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
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

