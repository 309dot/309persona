"""Aggregate routers exposed by the API."""

from fastapi import APIRouter

from .routes import chat, dashboard, visitors

api_router = APIRouter()
api_router.include_router(visitors.router, prefix="/visitors", tags=["visitors"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])


