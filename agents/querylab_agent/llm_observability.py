"""Extract LLM usage and tool-call stats from LangGraph/LangChain runner output."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _messages_from_output(out: Any) -> List[Any]:
    if isinstance(out, dict) and "messages" in out:
        return list(out["messages"] or [])
    return []


def extract_token_usage(out: Any) -> dict[str, Optional[int]]:
    """Best-effort token_usage from last AIMessage.response_metadata."""
    messages = _messages_from_output(out)
    for m in reversed(messages):
        meta = getattr(m, "response_metadata", None) or {}
        if not isinstance(meta, dict):
            continue
        tu = meta.get("token_usage")
        if isinstance(tu, dict) and tu:
            return {
                "prompt_tokens": tu.get("prompt_tokens"),
                "completion_tokens": tu.get("completion_tokens"),
                "total_tokens": tu.get("total_tokens"),
            }
    return {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}


def count_tool_events(messages: List[Any]) -> int:
    """ToolMessage count + tool_calls on AIMessages."""
    n = 0
    for m in messages:
        tn = type(m).__name__
        if tn == "ToolMessage":
            n += 1
            continue
        tcalls = getattr(m, "tool_calls", None)
        if tcalls:
            n += len(tcalls)
    return n


def extract_tool_events(messages: list) -> list[dict]:
    """Extract ordered tool call/result pairs from LangChain message chain."""
    import json as _json
    events: list[dict] = []
    pending: dict[str, dict] = {}  # call_id → {tool, args}

    for msg in (messages or []):
        tool_calls_attr = getattr(msg, "tool_calls", None)
        if tool_calls_attr:
            for tc in tool_calls_attr:
                pending[tc["id"]] = {"tool": tc["name"], "args": tc.get("args", {})}

        call_id = getattr(msg, "tool_call_id", None)
        if call_id and call_id in pending:
            call = pending.pop(call_id)
            raw = msg.content if isinstance(msg.content, str) else str(msg.content)
            event: dict = {
                "tool": call["tool"],
                "args": call["args"],
                "result": raw[:500],
                "truncated": len(raw) > 500,
            }
            if call["tool"] == "generate_sql":
                try:
                    parsed = _json.loads(raw)
                    if sql := parsed.get("sql_query", ""):
                        event["sql"] = sql
                except Exception:
                    pass
            events.append(event)

    return events


def estimate_cost_usd(
    *,
    prompt_tokens: Optional[int],
    completion_tokens: Optional[int],
    model: str = "",
) -> Optional[float]:
    """Rough cost from env overrides (USD per 1M tokens)."""
    if prompt_tokens is None and completion_tokens is None:
        return None
    p = float(os.getenv("QUERYLAB_LLM_PRICE_INPUT_PER_MILLION", "0") or "0")
    c = float(os.getenv("QUERYLAB_LLM_PRICE_OUTPUT_PER_MILLION", "0") or "0")
    if p <= 0 and c <= 0:
        m = (model or os.getenv("OPENAI_MODEL", "")).lower()
        if "gpt-4o-mini" in m:
            p, c = 0.15, 0.60
        elif "gpt-4o" in m:
            p, c = 2.50, 10.0
        else:
            return None
    pt = prompt_tokens or 0
    ct = completion_tokens or 0
    return round((pt * p + ct * c) / 1_000_000, 6)


def summarize_run(
    out: Any,
    *,
    model: Optional[str] = None,
) -> Tuple[dict[str, Optional[int]], int, Optional[float]]:
    usage = extract_token_usage(out)
    msgs = _messages_from_output(out)
    tools = count_tool_events(msgs)
    cost = estimate_cost_usd(
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        model=model or "",
    )
    return usage, tools, cost


def _schedule_persist_run(payload: dict) -> None:
    """Fire-and-forget POST to orchestrator. Never raises."""
    async def _post() -> None:
        try:
            import httpx
            base = os.getenv("QUERYLAB_ORCHESTRATOR_URL", "").rstrip("/")
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(f"{base}/api/internal/runs", json=payload)
        except Exception as exc:
            logger.debug("run persistence skipped (non-fatal): %s", exc)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_post())
    except RuntimeError:
        pass  # No running event loop — skip silently


def log_agent_invocation_summary(
    *,
    trace_id: Optional[str],
    agent_name: str,
    skill_type: str,
    out: Any,
    success: bool,
    retry_count: int = 0,
    task_id: Optional[str] = None,
    user_id: str = "",
    org_id: Optional[str] = None,
    session_id: str = "",
    skill_name: Optional[str] = None,
    mcp_server: Optional[str] = None,
    duration_ms: Optional[int] = None,
    error_type: Optional[str] = None,
    question_snippet: Optional[str] = None,
) -> None:
    """Structured log after /ask runner completes."""
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    usage, tool_calls, cost = summarize_run(out, model=model)
    from querylab_agent.structured_logging import log_extra

    extra = log_extra(
        event="agent_run",
        outcome="success" if success else "failure",
        trace_id=trace_id or "",
        agent_name=agent_name,
        skill_type=skill_type,
        tool_calls=tool_calls,
        prompt_tokens=usage.get("prompt_tokens"),
        completion_tokens=usage.get("completion_tokens"),
        total_tokens=usage.get("total_tokens"),
        estimated_cost_usd=cost,
        detail=f"retries={retry_count}" if retry_count else None,
    )
    if success:
        logger.info("agent_invocation_complete", extra=extra)
    else:
        logger.warning("agent_invocation_failed", extra=extra)

    if os.getenv("QUERYLAB_PERSIST_RUNS", "").lower() == "true":
        _schedule_persist_run({
            "trace_id": trace_id or "",
            "task_id": task_id or trace_id or "",
            "user_id": user_id,
            "org_id": org_id,
            "session_id": session_id,
            "agent_name": agent_name,
            "skill_name": skill_name,
            "skill_type": skill_type,
            "mcp_server": mcp_server,
            "outcome": "success" if success else "failed",
            "tool_calls": tool_calls,
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
            "estimated_cost_usd": cost,
            "duration_ms": duration_ms,
            "error_type": error_type,
            "question_snippet": question_snippet,
        })
