"""
Orchestrator FastAPI app: data_sources (agent card names) + query/stream.

Run:
  cd orchestrator && poetry run uvicorn orchestrator.app:app --host 0.0.0.0 --port 8082 --reload
  poetry run python -m orchestrator

Requires agents service running (QUERYLAB_AGENTS_API_URL, default http://localhost:8000).
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

# Load `.env` before any other orchestrator imports (same pattern as querylab_sql settings).
import orchestrator.settings  # noqa: F401

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from orchestrator.audit import log_rate_limited
from orchestrator.auth_routes import legacy_auth_router, router as auth_router
from orchestrator.canary import run_canary_loop
from orchestrator.config import QUERYLAB_AGENTS_API_URL
from orchestrator.http_client import set_http_client
from orchestrator.agents_workspace import router as agents_workspace_router
from orchestrator.data_sources import router as data_sources_router
from orchestrator.exception_handlers import register_exception_handlers
from orchestrator.health_ready import router as health_router
from orchestrator.middleware import CorrelationIdMiddleware
from orchestrator.observability_middleware import ObservabilityMiddleware
from orchestrator.plan_routes import router as plan_router
from orchestrator.query_stream import router as query_stream_router
from orchestrator.api.runs import router as runs_router
from orchestrator.api.history import router as history_router
from orchestrator.settings_routes import router as settings_router
from orchestrator.rate_limit import limiter
from orchestrator.structured_logging import configure_structured_logging

configure_structured_logging()
logger = logging.getLogger("orchestrator")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────────────────────
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=5.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
    )
    set_http_client(client)
    logger.info(
        "orchestrator_started",
        extra={"event": "startup", "agents_api_url": QUERYLAB_AGENTS_API_URL},
    )
    interval = int(os.getenv("ORCHESTRATOR_CANARY_INTERVAL_SEC", "0") or "0")
    if interval > 0:
        asyncio.create_task(run_canary_loop())

    yield

    # ── shutdown ─────────────────────────────────────────────────────────────
    await client.aclose()
    set_http_client(None)
    logger.info("orchestrator_stopped", extra={"event": "shutdown"})


app = FastAPI(
    title="Query Labs Orchestrator",
    description="Orchestration over agents API: GET /data_sources (agent card names), POST /query/stream (same SSE as querylab_sql v3)",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    log_rate_limited(route=request.url.path, client_host=request.client.host if request.client else None)
    return _rate_limit_exceeded_handler(request, exc)


# Register generic handlers first; RateLimitExceeded is an HTTPException subclass — register after so it wins.
register_exception_handlers(app)
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

# Outermost last: Correlation -> Observability -> CORS -> SlowAPI -> routes
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(CorrelationIdMiddleware)

app.include_router(health_router)
app.include_router(data_sources_router, prefix="/api", tags=["data_sources"])
app.include_router(agents_workspace_router, prefix="/api", tags=["agent_workspace"])
app.include_router(legacy_auth_router, prefix="/api")  # POST /api/login, /api/logout (querylab_sql–compatible)
app.include_router(plan_router, prefix="/api/v3", tags=["plan"])
app.include_router(query_stream_router, prefix="/api/v3", tags=["query"])
app.include_router(query_stream_router, prefix="/api", tags=["query-legacy"])
app.include_router(auth_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api", tags=["runs"])
app.include_router(history_router, prefix="/api", tags=["history"])
app.include_router(settings_router, prefix="/api", tags=["settings"])


@app.get("/")
async def root():
    return {
        "service": "querylab-orchestrator",
        "agents_api_url": QUERYLAB_AGENTS_API_URL,
        "endpoints": {
            "health": "GET /health — liveness",
            "ready": "GET /ready — readiness (agents + DB when persistence on)",
            "data_sources": "GET /api/data_source/",
            "query_stream": "POST /api/v3/query/stream — JWT + X-Request-ID",
            "auth_login": "POST /api/login or POST /api/v1/auth/login",
            "auth_logout": "POST /api/logout or POST /api/v1/auth/logout",
            "agent_workspace": "GET/POST /api/workspace/agents — JWT; edit .agents from UI",
            "agent_workspace_generate": "POST /api/workspace/generate — LLM draft AGENT.md / skill .md",
            "settings_connections": "GET /api/settings/connection/all",
            "settings_llm": "GET /api/settings/llm/all",
            "settings_tokens": "GET /api/settings/daily_tokens",
        },
    }
