"""In-memory sliding-window rate limits keyed by session id or client IP.

State lives in the process: it resets on deploy and is not shared between
instances. That is enough for a single Render instance; a shared store
(Firestore/Redis) is needed before running more than one (plan Phase 3).
"""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Deque, Dict, Optional

from starlette.requests import Request

from .config import settings


class SlidingWindowLimiter:
    """Keeps timestamps per key to enforce call limits within a time window."""

    def __init__(self, limit: int, window_minutes: int) -> None:
        self.limit = limit
        self.window = timedelta(minutes=window_minutes)
        self._events: Dict[str, Deque[datetime]] = defaultdict(deque)
        self._lock = Lock()

    def _recent(self, key: str, now: datetime) -> Deque[datetime]:
        queue = self._events[key]
        window_start = now - self.window
        while queue and queue[0] < window_start:
            queue.popleft()
        return queue

    def touch(self, key: str) -> bool:
        """Record a hit and return whether it is allowed."""
        with self._lock:
            now = datetime.now(tz=timezone.utc)
            queue = self._recent(key, now)
            if len(queue) >= self.limit:
                return False
            queue.append(now)
            return True

    def release(self, key: str) -> None:
        """Give back the latest hit, e.g. when the answer failed and the visitor retries."""
        with self._lock:
            queue = self._events.get(key)
            if queue:
                queue.pop()

    def remaining(self, key: str) -> int:
        """Hits still allowed for `key` in the current window."""
        with self._lock:
            queue = self._recent(key, datetime.now(tz=timezone.utc))
            return max(0, self.limit - len(queue))

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


_limiters: Dict[str, SlidingWindowLimiter] = {}


def _get(name: str, limit: int, window_minutes: int) -> SlidingWindowLimiter:
    limiter = _limiters.get(name)
    if limiter is None:
        limiter = _limiters[name] = SlidingWindowLimiter(limit=limit, window_minutes=window_minutes)
    return limiter


def get_session_rate_limiter() -> SlidingWindowLimiter:
    """Questions per chat session (the number the visitor sees)."""
    return _get("session", settings.max_session_questions, settings.session_window_minutes)


def get_ip_question_limiter() -> SlidingWindowLimiter:
    """Questions per client IP, so new sessions can't be used to bypass the session limit."""
    return _get("ip_questions", settings.max_ip_questions, settings.ip_window_minutes)


def get_ip_session_limiter() -> SlidingWindowLimiter:
    """New chat sessions per client IP."""
    return _get("ip_sessions", settings.max_ip_sessions, settings.ip_window_minutes)


def reset_all() -> None:
    for limiter in _limiters.values():
        limiter.reset()
    _limiters.clear()


def client_ip(request: Optional[Request]) -> str:
    """Client address behind `trusted_proxy_hops` proxies.

    Each trusted proxy appends the address it received the request from to
    X-Forwarded-For, so the client is the N-th entry from the right. Entries
    further left are client-supplied and can be spoofed.
    """
    if request is None:
        return "unknown"
    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    if hops > 0 and forwarded:
        parts = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"
