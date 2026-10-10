"""Visitor registration endpoints."""

from fastapi import APIRouter, HTTPException, Request, status

from ...core.rate_limiter import client_ip, get_ip_session_limiter
from ...services import visitor_service
from .. import schemas

router = APIRouter()


@router.post("", response_model=schemas.VisitorResponse)
def register_visitor(payload: schemas.VisitorCreate, request: Request):
    if not get_ip_session_limiter().touch(client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="잠시 후 다시 시도해 주세요.",
        )
    record = visitor_service.create_visitor(payload.model_dump())
    return schemas.VisitorResponse(**record)


@router.patch("/{session_id}", response_model=schemas.VisitorResponse)
def update_visitor(session_id: str, payload: schemas.VisitorUpdate):
    record = visitor_service.update_visitor(session_id, payload.model_dump())
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return schemas.VisitorResponse(**{**record, "session_id": session_id})


