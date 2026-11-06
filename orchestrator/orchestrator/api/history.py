"""Chat history endpoints.

Endpoints (registered with prefix=/api in app.py):
  POST  /api/history/all               — list all sessions for a user
  POST  /api/history/conversations     — messages for a hist_id
  PATCH /api/history/{hist_id}/title   — update title
  PATCH /api/history/{hist_id}/pin     — toggle is_pinned
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from orchestrator.config import chat_persistence_enabled
from orchestrator.persistence.db import async_session_scope
from orchestrator.persistence.models import AgentRun, ChatHistory, ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(tags=["history"])


# ── DB dependency ─────────────────────────────────────────────────────────────

async def _get_db() -> AsyncGenerator[AsyncSession, None]:
    if not chat_persistence_enabled():
        raise HTTPException(status_code=503, detail="Database not configured")
    async with async_session_scope() as session:
        yield session


# ── Request schemas ───────────────────────────────────────────────────────────

class HistoryAllRequest(BaseModel):
    user_id: str
    session_id: Optional[str] = None


class ConversationsRequest(BaseModel):
    hist_id: str


class TitleUpdateRequest(BaseModel):
    title: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/history/all")
async def get_all_history(
    body: HistoryAllRequest,
    db: AsyncSession = Depends(_get_db),
):
    """Return all chat sessions for a user, pinned first then newest-first."""
    stmt = (
        select(ChatHistory)
        .where(ChatHistory.user_id == body.user_id)
        .order_by(ChatHistory.is_pinned.desc(), ChatHistory.timestamp.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    items = []
    for row in rows:
        # Extract agent_name from first message's data_sources
        msg_stmt = (
            select(ChatMessage)
            .where(ChatMessage.hist_id == row.hist_id)
            .order_by(ChatMessage.timestamp.asc())
            .limit(1)
        )
        msg_result = await db.execute(msg_stmt)
        first_msg = msg_result.scalar_one_or_none()

        agent_name = None
        if first_msg and first_msg.context:
            # Primary: join via trace_id → agent_runs.agent_name (works for all existing rows)
            trace_id = (
                first_msg.context.get("trace_id")
                or first_msg.context.get("response", {}).get("trace_id")
            )
            if trace_id:
                ar_stmt = (
                    select(AgentRun.agent_name)
                    .where(AgentRun.trace_id == trace_id)
                    .limit(1)
                )
                ar_result = await db.execute(ar_stmt)
                agent_name = ar_result.scalar_one_or_none()

            # Fallback: parse collection field (populated after orchestrator restart)
            if not agent_name:
                resp = first_msg.context.get("response", {})
                collection = resp.get("collection") or ""
                if collection:
                    _DB_PREFIXES = ("mysql_", "postgres_", "sqlite_", "mssql_", "mongodb_", "redis_", "neo4j_", "weaviate_")
                    parts = [p.strip() for p in collection.split(",") if p.strip()]
                    agent_name = next(
                        (p for p in parts
                         if not p.endswith("_mcp") and not any(p.startswith(x) for x in _DB_PREFIXES)),
                        parts[0] if parts else None
                    )

        items.append({
            "hist_id": row.hist_id,
            "title": row.title or "Untitled",
            "dttm": row.timestamp.isoformat() if row.timestamp else None,
            "is_pinned": bool(row.is_pinned),
            "agent_name": agent_name,
        })

    return {"history": {"items": items}}


@router.post("/history/conversations")
async def get_conversations(
    body: ConversationsRequest,
    db: AsyncSession = Depends(_get_db),
):
    """Return all messages for a hist_id, ordered by timestamp."""
    hist_stmt = select(ChatHistory).where(ChatHistory.hist_id == body.hist_id)
    hist_result = await db.execute(hist_stmt)
    hist = hist_result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="History not found")

    msg_stmt = (
        select(ChatMessage)
        .where(ChatMessage.hist_id == body.hist_id)
        .order_by(ChatMessage.timestamp.asc())
    )
    msg_result = await db.execute(msg_stmt)
    messages = msg_result.scalars().all()

    items = [
        {
            "context": msg.context or {},
            "msg_dttm": msg.timestamp.isoformat() if msg.timestamp else None,
        }
        for msg in messages
    ]

    return {
        "conversations": {
            "items": items,
            "user_id": hist.user_id,
            "session_id": hist.session_id,
        }
    }


@router.patch("/history/{hist_id}/title")
async def update_title(
    hist_id: str,
    body: TitleUpdateRequest,
    db: AsyncSession = Depends(_get_db),
):
    """Update the display title of a chat session."""
    stmt = select(ChatHistory).where(ChatHistory.hist_id == hist_id)
    result = await db.execute(stmt)
    hist = result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="History not found")
    hist.title = body.title[:255]
    await db.commit()
    return {"hist_id": hist_id, "title": hist.title}


@router.patch("/history/{hist_id}/pin")
async def toggle_pin(
    hist_id: str,
    db: AsyncSession = Depends(_get_db),
):
    """Toggle is_pinned for a chat session."""
    stmt = select(ChatHistory).where(ChatHistory.hist_id == hist_id)
    result = await db.execute(stmt)
    hist = result.scalar_one_or_none()
    if not hist:
        raise HTTPException(status_code=404, detail="History not found")
    hist.is_pinned = not bool(hist.is_pinned)
    await db.commit()
    return {"hist_id": hist_id, "is_pinned": bool(hist.is_pinned)}
