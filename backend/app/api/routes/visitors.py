"""Visitor registration endpoints."""

from fastapi import APIRouter

from .. import schemas
from ...services import visitor_service

router = APIRouter()


@router.post("", response_model=schemas.VisitorResponse)
def register_visitor(payload: schemas.VisitorCreate):
    record = visitor_service.create_visitor(payload.model_dump())
    return schemas.VisitorResponse(**record)


