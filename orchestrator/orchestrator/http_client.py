"""
Shared httpx singleton client for the orchestrator.

Lifecycle is managed by app.py lifespan — do not import this at module level
from app.py itself (circular import). All other modules can import freely.
"""
from __future__ import annotations

import httpx

_http: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return the process-wide httpx client. Always available after lifespan startup."""
    if _http is None:
        raise RuntimeError("httpx singleton not initialised — lifespan not started")
    return _http


def set_http_client(client: httpx.AsyncClient | None) -> None:
    global _http
    _http = client
