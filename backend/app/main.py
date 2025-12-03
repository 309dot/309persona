"""FastAPI entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .core.config import settings
from .core.firebase import get_firestore_client

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    # Ensure firebase initializes at boot to catch credential errors early.
    get_firestore_client()


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "app": settings.app_name}


app.include_router(api_router, prefix="/api")


