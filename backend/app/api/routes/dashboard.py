"""Dashboard data endpoints."""

from typing import List

from fastapi import APIRouter, Depends, Query

from .. import schemas
from ...core.auth import verify_admin
from ...services import conversation_service

router = APIRouter()


@router.get(
    "/stats",
    response_model=schemas.DashboardStats,
    dependencies=[Depends(verify_admin)],
)
def get_dashboard_stats():
    stats = conversation_service.build_dashboard_stats()
    return schemas.DashboardStats(**stats)


@router.get(
    "/logs",
    response_model=List[schemas.ConversationRecord],
    dependencies=[Depends(verify_admin)],
)
def get_recent_logs(limit: int = Query(50, ge=1, le=200)):
    logs = conversation_service.fetch_recent_conversations(limit=limit)
    return [schemas.ConversationRecord(**log) for log in logs]


