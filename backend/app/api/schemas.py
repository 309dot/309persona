"""Pydantic models for request/response bodies."""

from __future__ import annotations

from datetime import datetime
import json
from typing import List, Optional

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


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    question: str = Field(..., min_length=4, max_length=1000)


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    blocked: bool = False
    reason: Optional[str] = None
    category: Optional[str] = None
    citations: List[str] = Field(default_factory=list)
    remaining: Optional[int] = None
    limit: Optional[int] = None


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


class FunnelStepStat(BaseModel):
    key: str
    label: str
    value: int
    conversion_from_prev: Optional[float] = None


class DashboardKpis(BaseModel):
    total_sessions: int = 0
    avg_questions_per_session: float = 0.0
    blocked_rate: float = 0.0
    readiness_rate: float = 0.0


class DashboardStats(BaseModel):
    ref_stats: List[StatPoint]
    referrer_stats: List[StatPoint]
    question_categories: List[StatPoint]
    daily_visits: List[StatPoint]
    latest_visitors: List[VisitorRecord]
    recent_questions: List[ConversationRecord]
    funnel_steps: List[FunnelStepStat] = Field(default_factory=list)
    kpis: DashboardKpis = Field(default_factory=DashboardKpis)


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


