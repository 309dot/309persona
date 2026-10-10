"""Event ingestion endpoints."""

from fastapi import APIRouter

from ...services import conversation_service
from .. import schemas

router = APIRouter()


@router.post("/funnel")
def ingest_funnel_event(payload: schemas.FunnelEventCreate):
    conversation_service.log_funnel_event(
        session_id=payload.session_id,
        event=payload.event,
        properties=payload.properties or {},
    )
    return {"ok": True}
