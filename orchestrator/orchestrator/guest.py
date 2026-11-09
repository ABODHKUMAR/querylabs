"""Credential-less guest sessions.

Rules (product requirement):
  * A guest session is valid for 10 minutes.
  * The same origin may start at most 3 guest sessions.
  * Origin is the browser ``Origin`` header (``Referer`` host as fallback, then
    client IP). The origin is also the guest identity: every guest session from
    one origin maps to the same stable guest user id.

State is intentionally process-local: the orchestrator runs as a single
container/worker, and a redeploy resets the counters.
"""
from __future__ import annotations

import hashlib
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from urllib.parse import urlsplit

from fastapi import Request

GUEST_MAX_SESSIONS = int(os.getenv("ORCHESTRATOR_GUEST_MAX_SESSIONS", "3") or "3")
GUEST_SESSION_MINUTES = int(os.getenv("ORCHESTRATOR_GUEST_SESSION_MINUTES", "10") or "10")


class GuestLimitExceeded(Exception):
    """Raised when an origin has used all of its guest sessions."""

    def __init__(self, origin: str, limit: int) -> None:
        self.origin = origin
        self.limit = limit
        super().__init__(f"Guest session limit reached for origin {origin}")


@dataclass(frozen=True)
class GuestSession:
    user_id: str
    origin: str
    expires_at: datetime
    expires_in_seconds: int
    sessions_used: int
    sessions_remaining: int


_lock = threading.Lock()
# origin -> number of guest sessions issued for that origin
_sessions_used: Dict[str, int] = {}


def _normalize_origin(value: Optional[str]) -> Optional[str]:
    """Return ``scheme://host[:port]`` for an Origin/Referer value, else None."""
    if not value:
        return None
    raw = value.strip()
    if not raw or raw.lower() == "null":
        return None
    parts = urlsplit(raw)
    if not parts.scheme or not parts.netloc:
        # Referer may be just a host; Origin should include a scheme.
        if "://" in raw:
            return None
        return f"http://{raw.lower()}"
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}"


def resolve_origin(request: Request) -> str:
    """Stable origin key: Origin header, then Referer, then client IP."""
    for header in ("origin", "referer"):
        origin = _normalize_origin(request.headers.get(header))
        if origin:
            return origin
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    client_host = forwarded or (request.client.host if request.client else "unknown")
    return f"ip://{client_host}"


def guest_user_id(origin: str) -> str:
    """Stable per-origin guest identity, e.g. ``guest_1a2b3c4d5e6f``."""
    digest = hashlib.sha256(origin.encode("utf-8")).hexdigest()[:12]
    return f"guest_{digest}"


def start_guest_session(origin: str) -> GuestSession:
    """Reserve a guest session for ``origin`` or raise GuestLimitExceeded."""
    user_id = guest_user_id(origin)
    with _lock:
        used = _sessions_used.get(origin, 0)
        if used >= GUEST_MAX_SESSIONS:
            raise GuestLimitExceeded(origin, GUEST_MAX_SESSIONS)
        used += 1
        _sessions_used[origin] = used
        remaining = GUEST_MAX_SESSIONS - used
    expires_in_seconds = GUEST_SESSION_MINUTES * 60
    return GuestSession(
        user_id=user_id,
        origin=origin,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds),
        expires_in_seconds=expires_in_seconds,
        sessions_used=used,
        sessions_remaining=remaining,
    )


def reset_guest_sessions() -> None:
    """Clear the per-origin counters (tests / local debugging only)."""
    with _lock:
        _sessions_used.clear()
