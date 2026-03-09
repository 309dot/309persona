"""FastAPI entrypoint."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import settings
from .core.firebase import get_firestore_client

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    # Try Firebase early, but don't crash local deployment when credentials are absent.
    try:
        get_firestore_client()
    except Exception as exc:
        logger.warning("Firebase init skipped at startup: %s", exc)


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "app": settings.app_name}


app.include_router(api_router, prefix="/api")


