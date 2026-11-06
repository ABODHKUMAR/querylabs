"""Agent-run persistence API.

Endpoints (registered with prefix=/api in app.py):
  POST /api/internal/runs          — ingest one run row (called by agents service)
  GET  /api/runs                   — list with filters
  GET  /api/runs/summary/agents    — per-agent aggregates
  GET  /api/runs/{trace_id}        — single run detail
  POST /api/feedback               — update feedback on a run
"""
from __future__ import annotations

import logging
from datetime import datetime
from statistics import quantiles
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orchestrator.config import chat_persistence_enabled
from orchestrator.persistence.db import async_session_scope
from orchestrator.persistence.models import AgentRun

logger = logging.getLogger(__name__)
router = APIRouter(tags=["runs"])


# ── DB dependency ─────────────────────────────────────────────────────────────

async def _get_db() -> AsyncGenerator[AsyncSession, None]:
    if not chat_persistence_enabled():
        raise HTTPException(status_code=503, detail="Database not configured")
    async with async_session_scope() as session:
        yield session


# ── Request / response schemas ────────────────────────────────────────────────

class AgentRunIn(BaseModel):
    trace_id: str
    task_id: str
    user_id: str
    org_id: Optional[str] = None
    session_id: str
    agent_name: str
    skill_name: Optional[str] = None
    skill_type: Optional[str] = None
    mcp_server: Optional[str] = None
    outcome: str
    tool_calls: int = 0
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    estimated_cost_usd: Optional[float] = None
    duration_ms: Optional[int] = None
    error_type: Optional[str] = None
    question_snippet: Optional[str] = None


class FeedbackIn(BaseModel):
    trace_id: str
    rating: str  # "up" | "down"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _run_to_dict(r: AgentRun) -> dict:
    return {
        "id": r.id,
        "trace_id": r.trace_id,
        "task_id": r.task_id,
        "user_id": r.user_id,
        "org_id": r.org_id,
        "session_id": r.session_id,
        "agent_name": r.agent_name,
        "skill_name": r.skill_name,
        "skill_type": r.skill_type,
        "mcp_server": r.mcp_server,
        "outcome": r.outcome,
        "tool_calls": r.tool_calls,
        "prompt_tokens": r.prompt_tokens,
        "completion_tokens": r.completion_tokens,
        "total_tokens": r.total_tokens,
        "estimated_cost_usd": r.estimated_cost_usd,
        "duration_ms": r.duration_ms,
        "error_type": r.error_type,
        "question_snippet": r.question_snippet,
        "feedback": r.feedback,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _p95(vals: list[int]) -> Optional[float]:
    if not vals:
        return None
    if len(vals) == 1:
        return float(vals[0])
    return float(quantiles(sorted(vals), n=100)[94])


# ── Endpoints — NOTE: summary route must be registered before {trace_id} ──────

@router.post("/internal/runs", status_code=201)
async def ingest_run(
    body: AgentRunIn,
    db: AsyncSession = Depends(_get_db),
):
    run = AgentRun(**body.model_dump())
    db.add(run)
    await db.flush()
    return {"id": run.id}


@router.get("/runs")
async def list_runs(
    agent_name: Optional[str] = None,
    outcome: Optional[str] = None,
    user_id: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(_get_db),
):
    stmt = select(AgentRun)
    if agent_name:
        stmt = stmt.where(AgentRun.agent_name == agent_name)
    if outcome:
        stmt = stmt.where(AgentRun.outcome == outcome)
    if user_id:
        stmt = stmt.where(AgentRun.user_id == user_id)
    if from_date:
        stmt = stmt.where(AgentRun.created_at >= from_date)
    if to_date:
        stmt = stmt.where(AgentRun.created_at <= to_date)
    stmt = stmt.order_by(AgentRun.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return [_run_to_dict(r) for r in result.scalars().all()]


@router.get("/runs/summary/agents")
async def runs_summary(db: AsyncSession = Depends(_get_db)):
    agg_stmt = select(
        AgentRun.agent_name,
        func.count().label("total_runs"),
        func.avg(AgentRun.duration_ms).label("avg_duration_ms"),
        func.avg(AgentRun.tool_calls).label("avg_tool_calls"),
        func.max(AgentRun.created_at).label("last_run_at"),
        func.sum(case((AgentRun.outcome == "success", 1), else_=0)).label("success_count"),
    ).group_by(AgentRun.agent_name)
    agg_result = await db.execute(agg_stmt)
    rows = agg_result.all()

    dur_result = await db.execute(
        select(AgentRun.agent_name, AgentRun.duration_ms).where(AgentRun.duration_ms.isnot(None))
    )
    durations: dict[str, list[int]] = {}
    for agent, ms in dur_result:
        durations.setdefault(agent, []).append(ms)

    return [
        {
            "agent_name": r.agent_name,
            "total_runs": r.total_runs,
            "success_rate": round(r.success_count / r.total_runs * 100, 1) if r.total_runs else 0.0,
            "avg_duration_ms": round(float(r.avg_duration_ms or 0), 1),
            "p95_duration_ms": _p95(durations.get(r.agent_name, [])),
            "avg_tool_calls": round(float(r.avg_tool_calls or 0), 2),
            "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
        }
        for r in rows
    ]


@router.get("/runs/{trace_id}")
async def get_run(trace_id: str, db: AsyncSession = Depends(_get_db)):
    result = await db.execute(select(AgentRun).where(AgentRun.trace_id == trace_id))
    run = result.scalars().first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_to_dict(run)


@router.get("/runs/{trace_id}/spans")
async def get_run_spans(trace_id: str, db: AsyncSession = Depends(_get_db)):
    result = await db.execute(select(AgentRun).where(AgentRun.trace_id == trace_id))
    run = result.scalars().first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    total = run.duration_ms or 100
    skill_label = run.skill_name or run.skill_type or "skill"
    agent_label = run.agent_name or "agent"
    outcome = run.outcome or "success"
    skill_duration = max(total - 30, 1)

    return [
        {"name": "HTTP Ingress",                      "start_offset_ms": 0,           "duration_ms": 5,              "status": "success",  "error": None},
        {"name": f"Agent Router ({agent_label})",     "start_offset_ms": 5,           "duration_ms": 10,             "status": "success",  "error": None},
        {"name": f"Skill Invoke ({skill_label})",     "start_offset_ms": 15,          "duration_ms": skill_duration, "status": outcome,    "error": None},
        {"name": "Agent Run Summary",                 "start_offset_ms": total - 15,  "duration_ms": 15,             "status": outcome,    "error": run.error_type},
    ]


@router.post("/feedback")
async def post_feedback(body: FeedbackIn, db: AsyncSession = Depends(_get_db)):
    if body.rating not in ("up", "down"):
        raise HTTPException(status_code=422, detail="rating must be 'up' or 'down'")
    result = await db.execute(select(AgentRun).where(AgentRun.trace_id == body.trace_id))
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    run.feedback = body.rating
    return {"ok": True}
