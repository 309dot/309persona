"""Simple in-memory rate limiter keyed by session or IP."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, Optional

from .config import settings


class SlidingWindowLimiter:
    """Keeps timestamps per key to enforce call limits within a time window."""

    def __init__(self, limit: int, window_minutes: int) -> None:
        self.limit = limit
        self.window = timedelta(minutes=window_minutes)
        self._events: Dict[str, Deque[datetime]] = defaultdict(deque)

    def touch(self, key: str) -> bool:
        """Record a hit and return whether it is allowed."""
        now = datetime.now(tz=timezone.utc)
        window_start = now - self.window
        queue = self._events[key]

        while queue and queue[0] < window_start:
            queue.popleft()

        if len(queue) >= self.limit:
            return False

        queue.append(now)
        return True


_session_rate_limiter: Optional[SlidingWindowLimiter] = None


def get_session_rate_limiter() -> SlidingWindowLimiter:
    """Return a cached rate limiter instance."""
    global _session_rate_limiter
    if _session_rate_limiter is None:
        _session_rate_limiter = SlidingWindowLimiter(
            limit=settings.max_session_questions,
            window_minutes=settings.session_window_minutes,
        )
    return _session_rate_limiter


