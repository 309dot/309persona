"""Firebase Auth helpers and FastAPI dependencies."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from .config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def verify_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Validate Firebase ID token and enforce allowlist if configured."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing"
        )

    try:
        decoded = auth.verify_id_token(credentials.credentials)
    except Exception as exc:  # pragma: no cover - firebase errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}"
        ) from exc

    allowed = settings.admin_allowed_emails
    if allowed and decoded.get("email") not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not allowed to access the dashboard",
        )

    return decoded


