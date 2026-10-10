"""Firebase Auth helpers and FastAPI dependencies."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth

from .config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


def verify_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Validate the Firebase ID token and require an allowlisted email."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing"
        )

    try:
        decoded = auth.verify_id_token(credentials.credentials)
    except Exception as exc:  # pragma: no cover - firebase errors
        logger.info("Rejected dashboard token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    allowed = {email.lower() for email in settings.admin_allowed_emails}
    if not allowed:
        logger.warning("ADMIN_ALLOWED_EMAILS is empty; denying dashboard access")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dashboard access is not configured",
        )

    if str(decoded.get("email") or "").lower() not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not allowed to access the dashboard",
        )

    if settings.admin_require_email_verified and not decoded.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Email is not verified"
        )

    return decoded
