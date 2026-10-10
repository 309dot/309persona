"""Visitor registration endpoints."""

from fastapi import APIRouter, HTTPException, status

from .. import schemas
from ...services import visitor_service

router = APIRouter()


@router.post("", response_model=schemas.VisitorResponse)
def register_visitor(payload: schemas.VisitorCreate):
    record = visitor_service.create_visitor(payload.model_dump())
    return schemas.VisitorResponse(**record)


@router.patch("/{session_id}", response_model=schemas.VisitorResponse)
def update_visitor(session_id: str, payload: schemas.VisitorUpdate):
    record = visitor_service.update_visitor(session_id, payload.model_dump())
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")
    return schemas.VisitorResponse(**{**record, "session_id": session_id})


