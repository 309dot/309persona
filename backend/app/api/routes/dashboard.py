"""Dashboard data endpoints."""

from typing import List

from fastapi import APIRouter, Depends, Query

from ...core.auth import verify_admin
from ...services import conversation_service, knowledge_document, visitor_service
from .. import schemas

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


@router.get(
    "/knowledge",
    response_model=schemas.KnowledgeStatus,
    dependencies=[Depends(verify_admin)],
)
def get_knowledge_status():
    """Which private notes the answers can use right now, and why others were left out."""
    return schemas.KnowledgeStatus(**knowledge_document.knowledge_status())


@router.post(
    "/knowledge/reload",
    response_model=schemas.KnowledgeStatus,
    dependencies=[Depends(verify_admin)],
)
def reload_knowledge():
    """Fetch the notes again after a sync, without a redeploy."""
    knowledge_document.reload_knowledge()
    return schemas.KnowledgeStatus(**knowledge_document.knowledge_status())


@router.get(
    "/sessions/{session_id}",
    response_model=schemas.SessionDetail,
    dependencies=[Depends(verify_admin)],
)
def get_session_detail(session_id: str):
    """One visitor's whole conversation, for reading answers in context."""
    visitor = visitor_service.get_visitor_by_session(session_id)
    conversations = conversation_service.fetch_session_conversations(session_id)
    return schemas.SessionDetail(
        session_id=session_id,
        visitor=schemas.VisitorRecord(**{**visitor, "id": visitor.get("id", session_id)}) if visitor else None,
        conversations=[schemas.ConversationRecord(**row) for row in conversations],
    )
