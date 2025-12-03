"""Pydantic models for request/response bodies."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class VisitorCreate(BaseModel):
    visitor_name: str = Field(..., min_length=1)
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None


class VisitorResponse(BaseModel):
    session_id: str
    visitor_name: str
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=8)
    question: str = Field(..., min_length=4)


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    blocked: bool = False
    reason: Optional[str] = None
    category: Optional[str] = None


class StatPoint(BaseModel):
    label: str
    value: int


class VisitorRecord(BaseModel):
    id: str
    visitor_name: Optional[str] = None
    visitor_affiliation: Optional[str] = None
    visit_ref: Optional[str] = None
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


class DashboardStats(BaseModel):
    ref_stats: List[StatPoint]
    question_categories: List[StatPoint]
    daily_visits: List[StatPoint]
    latest_visitors: List[VisitorRecord]
    recent_questions: List[ConversationRecord]


