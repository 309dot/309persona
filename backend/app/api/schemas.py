"""Pydantic models for request/response bodies."""

from __future__ import annotations

import json
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Truncate (not reject) free-text visitor fields so an overlong value can't
# break session creation.
VISITOR_FIELD_LIMITS = {
    "visitor_name": 50,
    "visitor_affiliation": 100,
    "visit_ref": 100,
    "referrer": 500,
}


def _truncate(value: Optional[str], limit: int) -> Optional[str]:
    if value is None:
        return None
    return value.strip()[:limit]


class VisitorCreate(BaseModel):
    visitor_name: str = Field(..., min_length=1)
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None
    referrer: Optional[str] = None

    @field_validator(*VISITOR_FIELD_LIMITS, mode="before")
    @classmethod
    def truncate_fields(cls, value, info):
        return _truncate(value, VISITOR_FIELD_LIMITS[info.field_name]) if isinstance(value, str) else value


class VisitorUpdate(BaseModel):
    visitor_name: Optional[str] = None
    visitor_affiliation: Optional[str] = None

    @field_validator("visitor_name", "visitor_affiliation", mode="before")
    @classmethod
    def truncate_fields(cls, value, info):
        return _truncate(value, VISITOR_FIELD_LIMITS[info.field_name]) if isinstance(value, str) else value


class VisitorResponse(BaseModel):
    session_id: str
    visitor_name: str
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None
    referrer: Optional[str] = None


class HistoryTurn(BaseModel):
    """A previous question and answer from the same chat, sent back by the client."""

    question: str = Field(..., max_length=1000)
    answer: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    question: str = Field(..., min_length=4, max_length=1000)
    history: List[HistoryTurn] = Field(default_factory=list, max_length=10)


class SourceLabel(BaseModel):
    id: str
    label: str


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    blocked: bool = False
    reason: Optional[str] = None
    category: Optional[str] = None
    citations: List[str] = Field(default_factory=list)
    sources: List[SourceLabel] = Field(default_factory=list)
    follow_ups: List[str] = Field(default_factory=list)
    conversation_id: Optional[str] = None
    remaining: Optional[int] = None
    limit: Optional[int] = None


class FeedbackCreate(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    conversation_id: str = Field(..., min_length=1, max_length=64)
    rating: Literal["up", "down"]


class StatPoint(BaseModel):
    label: str
    value: int


class VisitorRecord(BaseModel):
    id: str
    visitor_name: Optional[str] = None
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None
    referrer: Optional[str] = None
    session_id: Optional[str] = None
    created_at: Optional[datetime] = None


class ConversationRecord(BaseModel):
    id: str
    session_id: str
    question: str
    answer: Optional[str] = None
    category: Optional[str] = None
    is_blocked: bool = False
    timestamp: Optional[datetime] = None
    pipeline: Optional[str] = None
    model: Optional[str] = None
    latency_ms: Optional[int] = None
    first_token_ms: Optional[int] = None
    error: Optional[str] = None
    feedback: Optional[str] = None
    sources: List[str] = Field(default_factory=list)


class FunnelStepStat(BaseModel):
    key: str
    label: str
    value: int
    conversion_from_prev: Optional[float] = None


class DashboardKpis(BaseModel):
    total_sessions: int = 0
    visits: int = 0
    avg_questions_per_session: float = 0.0
    blocked_rate: float = 0.0
    readiness_rate: float = 0.0
    failure_rate: float = 0.0
    latency_p50_ms: Optional[int] = None
    first_token_p50_ms: Optional[int] = None
    feedback_up: int = 0
    feedback_down: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


class DashboardStats(BaseModel):
    ref_stats: List[StatPoint]
    referrer_stats: List[StatPoint]
    question_categories: List[StatPoint]
    daily_visits: List[StatPoint]
    latest_visitors: List[VisitorRecord]
    recent_questions: List[ConversationRecord]
    funnel_steps: List[FunnelStepStat] = Field(default_factory=list)
    kpis: DashboardKpis = Field(default_factory=DashboardKpis)


class SessionDetail(BaseModel):
    session_id: str
    visitor: Optional[VisitorRecord] = None
    conversations: List[ConversationRecord]


class FunnelEventCreate(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    event: str = Field(..., pattern=r"^[a-z0-9_]{2,64}$")
    properties: dict = Field(default_factory=dict)

    @field_validator("properties")
    @classmethod
    def limit_properties(cls, value: dict) -> dict:
        if len(value) > 20 or len(json.dumps(value, ensure_ascii=False, default=str)) > 2000:
            raise ValueError("properties must have at most 20 keys and 2000 characters")
        return value


