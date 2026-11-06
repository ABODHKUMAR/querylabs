"""Liveness vs readiness probes."""
import logging
from typing import Any, Dict

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from orchestrator.config import QUERYLAB_AGENTS_API_URL, chat_persistence_enabled
from orchestrator.persistence.db import get_engine

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


async def _check_agents_reachable() -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{QUERYLAB_AGENTS_API_URL}/ready")
            if r.status_code == 200:
                try:
                    data = r.json()
                    if data.get("ready") is True:
                        return True, "agents_ready"
                    return False, f"agents_not_ready:{data!r}"[:120]
                except Exception:
                    return True, "agents_ready_no_json"
            if r.status_code == 404:
                h = await client.get(f"{QUERYLAB_AGENTS_API_URL}/health")
                if h.status_code == 200:
                    return True, "agents_health_fallback"
                return False, f"agents_health_{h.status_code}"
            return False, f"agents_status_{r.status_code}"
    except Exception as e:
        logger.debug("agents ready check failed: %s", e)
        return False, str(e)[:120]


async def _check_db() -> tuple[bool, str]:
    if not chat_persistence_enabled():
        return True, "db_skipped"
    try:
        eng = get_engine()
        if eng is None:
            return False, "db_engine_none"
        from sqlalchemy import text

        async with eng.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True, "db_ok"
    except Exception as e:
        logger.debug("db ready check failed: %s", e)
        return False, str(e)[:120]


@router.get("/health")
async def health_live() -> dict[str, str]:
    """Process is up."""
    return {"status": "ok", "service": "querylab-orchestrator"}


@router.get("/ready")
async def health_ready() -> JSONResponse:
    """
    Ready for traffic: agents API reachable; DB reachable when chat persistence is enabled.
    """
    checks: Dict[str, Any] = {}
    agents_ok, agents_detail = await _check_agents_reachable()
    checks["agents_api"] = {"ok": agents_ok, "detail": agents_detail}
    db_ok, db_detail = await _check_db()
    checks["database"] = {"ok": db_ok, "detail": db_detail}

    all_ok = agents_ok and db_ok
    body = {"ready": all_ok, "checks": checks}
    return JSONResponse(status_code=200 if all_ok else 503, content=body)
