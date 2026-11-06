"""
HTTP API for the agent runtime.

Run with:
  cd agents && poetry run uvicorn querylab_agent.api:app --reload
  poetry run python -m querylab_agent --api

Loads env from agents/.env if present. Set LANGCHAIN_TRACING_V2=true and LANGSMITH_API_KEY for LangSmith (see .env.example).
Set QUERYLAB_AGENTS_LOG_LEVEL=DEBUG for verbose logging.
Set QUERYLAB_AGENTS_LOG_FORMAT=json for structured logs.
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from querylab_agent.a2a.discovery import get_agent_card as _get_agent_card
from querylab_agent.a2a.messages import A2ARequest, A2AResponse, ResponseStatus
from querylab_agent.env import load_env
from querylab_agent.exception_handlers import register_exception_handlers
from querylab_agent.llm_observability import extract_tool_events, log_agent_invocation_summary, summarize_run
from querylab_agent.logging_config import configure_logging
from querylab_agent.observability_middleware import ObservabilityMiddleware
from querylab_agent.structured_logging import log_extra, set_task_id, set_trace_context
from querylab_agent.skills.runner_factory import wrap_runner_for_logging

load_env()
configure_logging()

logger = logging.getLogger(__name__)


def _agents_root() -> Path:
    p = Path(__file__).resolve().parent
    if p.name == "querylab_agent":
        return p.parent / ".agents"
    return p / ".agents"


def _extract_sub_source_restriction(task: str) -> str:
    """Return comma-separated allowed sub-sources from the orchestrator-injected restriction header.

    The orchestrator prepends a block starting with '[MANDATORY USER SUB-SOURCE RESTRICTION'
    and containing 'ONLY use these sub-sources: <csv>'.  Returns '' when absent.
    """
    marker = "ONLY use these sub-sources: "
    if "[MANDATORY USER SUB-SOURCE RESTRICTION" not in task:
        return ""
    idx = task.find(marker)
    if idx == -1:
        return ""
    end = task.find("\n", idx)
    return task[idx + len(marker): end if end != -1 else len(task)].strip()


def _get_runtime():
    from querylab_agent.executor.initializer import initialize_skills_and_agents
    from querylab_agent.llm.factory import get_llm

    agents_base = os.environ.get("QUERYLAB_AGENTS_ROOT") or str(_agents_root())
    base = Path(agents_base)
    
    # Check for Docker-specific MCP config first when DOCKER_RUNNING is set
    docker_running = os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes")
    if docker_running:
        mcp_json = base / "mcp_servers.docker.json"
        if mcp_json.exists():
            logger.info("Using Docker MCP registry: %s", mcp_json)
        else:
            mcp_json = base / "mcp_servers.json"
    else:
        mcp_json = base / "mcp_servers.json"
    
    if not mcp_json.exists():
        mcp_json = base / "mcp_servers.example.json"
    if not mcp_json.exists():
        mcp_json = base.parent / "mcp_servers.json"
    if not mcp_json.exists():
        mcp_json = base.parent / "mcp_servers.example.json"
    llm = get_llm()
    return initialize_skills_and_agents(
        agents_base_path=agents_base,
        mcp_registry_path=str(mcp_json) if mcp_json.exists() else None,
        llm=llm,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    agents_root = os.environ.get("QUERYLAB_AGENTS_ROOT") or str(_agents_root())
    if not Path(agents_root).exists():
        logger.warning("Agents root not found: %s — runtime not loaded; /agents and /ask will return 503", agents_root)
        yield
        return
    logger.info("Loading runtime (agents_root=%s)", agents_root)
    app.state.runtime = _get_runtime()
    names = app.state.runtime.list_agent_names()
    logger.info("Runtime ready: %d agent(s) %s", len(names), names)
    yield
    app.state.runtime = None
    logger.info("Runtime shut down")


app = FastAPI(
    title="Query Labs Agents API",
    description="Ask questions via discovered agents and skills (e.g. SQL ReAct).",
    lifespan=lifespan,
)

register_exception_handlers(app)
app.add_middleware(ObservabilityMiddleware)


def _safe_json_value(obj: Any) -> Any:
    """Recursively convert obj to a JSON-serializable structure.

    Non-serializable leaves are replaced with their str() representation so
    json.dumps never raises TypeError inside the SSE event_generator.
    """
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {str(k): _safe_json_value(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_json_value(v) for v in obj]
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def _format_runner_output(out: Any) -> str:
    """Extract a human-readable string from a runner.ainvoke() result."""
    if out is None:
        return "No response."
    if isinstance(out, str):
        return out
    if isinstance(out, dict):
        messages = out.get("messages") or out.get("output") or []
        if messages:
            last = messages[-1] if messages else None
            if last is not None:
                if hasattr(last, "content"):
                    return str(last.content) if last.content else "Done."
                if isinstance(last, (list, tuple)) and len(last) >= 2:
                    return str(last[1]) if last[1] else "Done."
                if isinstance(last, dict) and "content" in last:
                    return str(last["content"]) if last["content"] else "Done."
        return str(out)
    return str(out)


def _extract_artifacts(out: Any) -> List[Dict[str, Any]]:
    """
    Scan agent output messages for tool results (e.g. SQL execute results) and
    return them as structured artifacts for the A2AResponse.
    """
    artifacts: List[Dict[str, Any]] = []
    if not isinstance(out, dict):
        return artifacts
    messages = out.get("messages") or []
    for msg in messages:
        # LangChain ToolMessage has type == "tool"
        msg_type = getattr(msg, "type", None) or (msg.get("type") if isinstance(msg, dict) else None)
        if msg_type != "tool":
            continue
        content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else None)
        if not content:
            continue
        # Try to parse JSON-encoded tabular data (SQL results are often JSON arrays)
        try:
            data = json.loads(content) if isinstance(content, str) else content
            # Unwrap MCP execute_sql wrapper: {"status": "success", "results": [...]}
            if isinstance(data, dict):
                inner = data.get("results") or data.get("data") or data.get("rows")
                data = inner if isinstance(inner, list) else []
            if isinstance(data, list) and data and isinstance(data[0], dict):
                logger.debug("_extract_artifacts: table artifact extracted (%d rows)", len(data))
                artifacts.append({"type": "table", "data": data})
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    logger.debug("_extract_artifacts: %d artifact(s) extracted", len(artifacts))
    return artifacts


def _extract_skill_from_router_output(out: Any, skill_types: List[str]) -> Optional[str]:
    """Find which skill tool the agent_router actually called.

    Inspects AIMessage.tool_calls in the output messages for a name that
    matches a known skill type.  Falls back to the only skill when the agent
    has exactly one — avoids inference for single-skill agents like evolus.
    """
    if isinstance(out, dict):
        for msg in (out.get("messages") or []):
            for tc in (getattr(msg, "tool_calls", None) or []):
                name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                if name and name in skill_types:
                    return name
    if len(skill_types) == 1:
        return skill_types[0]
    return None


def _get_runtime_or_raise(request: Any) -> Any:
    runtime = getattr(request.app.state, "runtime", None)
    if runtime is None:
        raise HTTPException(
            status_code=503,
            detail="Runtime not initialized. Set QUERYLAB_AGENTS_ROOT so that .agents exists.",
        )
    return runtime


@app.get("/agents")
async def list_agents(request: Request):
    """List discovered agent names."""
    runtime = _get_runtime_or_raise(request)
    names = runtime.list_agent_names()
    logger.info("GET /agents -> %d agents", len(names))
    return {"agents": names}


@app.get("/agents/{agent_name}/skills")
async def list_skills(agent_name: str, request: Request):
    """List skill types for an agent."""
    runtime = _get_runtime_or_raise(request)
    agent = runtime.get_agent(agent_name)
    if not agent:
        logger.warning("GET /agents/%s/skills -> 404 not found", agent_name)
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")
    skills = runtime.list_skill_types(agent_name)
    logger.info("GET /agents/%s/skills -> %s", agent_name, skills)
    return {"agent": agent_name, "skills": skills}


@app.post("/ask", response_model=A2AResponse)
async def ask(body: A2ARequest, request: Request):
    """
    A2A endpoint: send a task to an agent/skill.

    Request (A2ARequest):
      - task_id: unique id (used as trace_id)
      - task: the user question / task description
      - context: optional dict with agent_name, skill_type, span_id, parent_span_id
      - constraints: optional dict (e.g. time_budget_ms)

    Response (A2AResponse):
      - task_id, status (success|partial|failed), result, sources, artifacts, error

    When context.skill_type is omitted the agent-level ReAct routes to the best skill.
    When context.skill_type is set that skill runner is called directly.
    """
    runtime = _get_runtime_or_raise(request)
    names = runtime.list_agent_names()
    if not names:
        logger.error("POST /ask: no agents discovered")
        raise HTTPException(status_code=503, detail="No agents discovered")

    # Routing: agent_name and skill_type come from context
    ctx = body.context or {}
    agent_name = ctx.get("agent_name") or names[0]
    skill_type: Optional[str] = ctx.get("skill_type")
    span_id: Optional[str] = ctx.get("span_id")
    parent_span_id: Optional[str] = ctx.get("parent_span_id")

    # task_id doubles as trace_id; honour X-Request-ID header as fallback
    trace_id: str = body.task_id or request.headers.get("X-Request-ID", "")

    # Propagate task_id/trace_id into context vars so every downstream log line
    # (skill, MCP tool call, etc.) carries the same identifier automatically.
    set_trace_context(trace_id)
    set_task_id(trace_id)

    if agent_name not in names:
        logger.warning("POST /ask: agent %r not found", agent_name)
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")
    skill_types = runtime.list_skill_types(agent_name)
    if not skill_types:
        logger.warning("POST /ask: agent %r has no skills", agent_name)
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} has no skills")

    question = body.task
    question_preview = question[:80] + "..." if len(question) > 80 else question

    # Extract user sub-source restriction injected by the orchestrator (if any).
    # This is passed through to skill tools via trace_config metadata so they
    # enforce the restriction even after the router strips the constraint header.
    _sel_subs = _extract_sub_source_restriction(question)

    # Collect sources from the agent's allowed MCP servers (best-effort).
    # Policy-mode agents: allowed_mcp_servers is set explicitly.
    # Legacy agents: derive from skill-config mcp_servers field if present.
    agent_def = runtime.get_agent(agent_name)
    sources: List[str] = list(getattr(agent_def, "allowed_mcp_servers", []))
    if not sources and agent_def is not None and not getattr(agent_def, "policy_mode", False):
        # Legacy mode: extract MCP server names from skill configs
        for stype in getattr(agent_def, "skill_names", []):
            for cfg in agent_def.get_skill_configs(stype):
                mcp_names = getattr(cfg, "mcp_servers", []) or []
                sources.extend(mcp_names)
        sources = list(dict.fromkeys(sources))  # deduplicate, preserve order

    if skill_type is None:
        # --- Agent-level router: agent picks which skill to call ---
        logger.info(
            "POST /ask agent_router agent=%r question=%r trace_id=%r span_id=%r",
            agent_name,
            question_preview,
            trace_id,
            span_id,
        )
        runner = await runtime.get_agent_runner(agent_name, request_id=trace_id)
        if runner is None:
            logger.error("POST /ask: failed to create agent runner for %r", agent_name)

            log_agent_invocation_summary(
                trace_id=trace_id,
                agent_name=agent_name,
                skill_type="agent",
                out={},
                success=False,
            )
            return A2AResponse(
                task_id=body.task_id,
                status=ResponseStatus.FAILED,
                error="Failed to create agent runner (e.g. missing LLM)",
            )
        # Wrap runner for structured skill-invoke logging (start/end + duration_ms)
        runner = wrap_runner_for_logging(runner, skill_name="agent_router", agent_name=agent_name, task_id=trace_id)
        _agent_card = _get_agent_card(agent_name) or {}
        meta: dict = {
            "mode": "agent_router",
            "agent_name": agent_name,
            "task_id": trace_id,
        }
        if span_id:
            meta["span_id"] = span_id
        if parent_span_id:
            meta["parent_span_id"] = parent_span_id
        if _sel_subs:
            # Propagate to skill tools via ensure_config() in _make_skill_tool._invoke
            meta["selected_sub_sources"] = _sel_subs
        # Always pass agent sub-sources and allowed skills so skill tools can self-route
        # when no user restriction is active (the common path for orchestrator-driven queries).
        meta["agent_sub_sources"] = _agent_card.get("sub_sources") or []
        meta["agent_allowed_skills"] = _agent_card.get("allowed_skills") or []
        trace_config = {
            "run_name": f"agent_router:{agent_name}",
            "tags": ["agent", "router", agent_name],
            "recursion_limit": 25,
            "metadata": meta,
        }
        try:
            # Build messages; inject a system-level override when a restriction is active
            # so the router also enforces it at tool-call selection time.
            _invoke_messages: list = [("user", question)]
            if _sel_subs:
                _invoke_messages = [
                    ("system",
                     f"[USER DATA RESTRICTION]: The user has pre-selected these sub-sources to query: {_sel_subs}. "
                     f"You MUST call at least one skill tool to answer this question — "
                     f"do not respond directly or ask for clarification. "
                     f"Query ONLY the listed sub-sources.")
                ] + _invoke_messages
            out = await runner.ainvoke(
                {"messages": _invoke_messages},
                config=trace_config,
            )
            usage, n_tools, cost = summarize_run(out, model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
            log_agent_invocation_summary(
                trace_id=trace_id,
                agent_name=agent_name,
                skill_type="agent",
                out=out,
                success=True,
            )
            logger.info("POST /ask agent_router agent=%r -> success", agent_name)
            used_skill = _extract_skill_from_router_output(out, skill_types)
            _tool_events = extract_tool_events(out.get("messages", []))
            return A2AResponse(
                task_id=body.task_id,
                status=ResponseStatus.SUCCESS,
                result=_format_runner_output(out),
                sources=sources,
                artifacts=_extract_artifacts(out),
                skill_name=used_skill,
                skill_type=used_skill,
                tool_calls=n_tools,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                total_tokens=usage.get("total_tokens"),
                estimated_cost_usd=cost,
                tool_events=_tool_events or None,
            )
        except asyncio.TimeoutError:
            logger.warning("POST /ask agent_router agent=%r -> timeout", agent_name)
            log_agent_invocation_summary(
                trace_id=trace_id, agent_name=agent_name, skill_type="agent", out={}, success=False
            )
            return A2AResponse(
                task_id=body.task_id,
                status=ResponseStatus.PARTIAL,
                sources=sources,
                error="Agent timed out — partial result",
            )
        except Exception as exc:
            logger.error("POST /ask agent_router agent=%r -> error: %s", agent_name, exc, exc_info=True)
            log_agent_invocation_summary(
                trace_id=trace_id, agent_name=agent_name, skill_type="agent", out={}, success=False
            )
            return A2AResponse(
                task_id=body.task_id,
                status=ResponseStatus.FAILED,
                sources=sources,
                error=str(exc),
            )

    # --- Skill-level runner: direct skill call ---
    if skill_type not in skill_types:
        logger.warning("POST /ask: skill %r not found for agent %r", skill_type, agent_name)
        raise HTTPException(status_code=404, detail=f"Skill {skill_type!r} not found for agent {agent_name!r}")

    logger.info(
        "POST /ask skill agent=%r skill_type=%r question=%r trace_id=%r span_id=%r",
        agent_name,
        skill_type,
        question_preview,
        trace_id,
        span_id,
    )
    runner = await runtime.get_runner(agent_name, skill_type, request_id=trace_id)
    if runner is None:
        logger.error("POST /ask: failed to create runner for %r / %r", agent_name, skill_type)
        log_agent_invocation_summary(
            trace_id=trace_id, agent_name=agent_name, skill_type=skill_type, out={}, success=False
        )
        return A2AResponse(
            task_id=body.task_id,
            status=ResponseStatus.FAILED,
            error="Failed to create skill runner (e.g. missing LLM)",
            skill_name=skill_type,
            skill_type=skill_type,
        )
    # Wrap runner for structured skill-invoke logging (start/end + duration_ms)
    runner = wrap_runner_for_logging(runner, skill_name=skill_type, agent_name=agent_name, task_id=trace_id)
    meta_skill: dict = {"agent_name": agent_name, "skill_type": skill_type, "task_id": trace_id}
    if span_id:
        meta_skill["span_id"] = span_id
    if parent_span_id:
        meta_skill["parent_span_id"] = parent_span_id
    if _sel_subs:
        meta_skill["selected_sub_sources"] = _sel_subs
    trace_config = {
        "run_name": f"skill:{agent_name}:{skill_type}",
        "tags": ["skill", agent_name, skill_type],
        "recursion_limit": 25,
        "metadata": meta_skill,
    }
    try:
        # Prepend restriction directly into the skill runner's question (no router intermediary here)
        _skill_question = question
        if _sel_subs:
            _skill_question = (
                f"[USER RESTRICTION — overrides all source coverage rules]: "
                f"ONLY query sub-sources: {_sel_subs}. Do NOT query any others.\n---\n{question}"
            )
        out = await runner.ainvoke(
            {"messages": [("user", _skill_question)]},
            config=trace_config,
        )
        usage, n_tools, cost = summarize_run(out, model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
        log_agent_invocation_summary(
            trace_id=trace_id,
            agent_name=agent_name,
            skill_type=skill_type,
            out=out,
            success=True,
        )
        logger.info("POST /ask skill agent=%r skill_type=%r -> success", agent_name, skill_type)
        _tool_events = extract_tool_events(out.get("messages", []))
        return A2AResponse(
            task_id=body.task_id,
            status=ResponseStatus.SUCCESS,
            result=_format_runner_output(out),
            sources=sources,
            artifacts=_extract_artifacts(out),
            skill_name=skill_type,
            skill_type=skill_type,
            tool_calls=n_tools,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            estimated_cost_usd=cost,
            tool_events=_tool_events or None,
        )
    except asyncio.TimeoutError:
        logger.warning("POST /ask skill agent=%r skill_type=%r -> timeout", agent_name, skill_type)
        log_agent_invocation_summary(
            trace_id=trace_id, agent_name=agent_name, skill_type=skill_type, out={}, success=False
        )
        return A2AResponse(
            task_id=body.task_id,
            status=ResponseStatus.PARTIAL,
            sources=sources,
            error="Skill timed out — partial result",
            skill_name=skill_type,
            skill_type=skill_type,
        )
    except Exception as exc:
        logger.error(
            "POST /ask skill agent=%r skill_type=%r -> error: %s", agent_name, skill_type, exc, exc_info=True
        )
        log_agent_invocation_summary(
            trace_id=trace_id, agent_name=agent_name, skill_type=skill_type, out={}, success=False
        )
        return A2AResponse(
            task_id=body.task_id,
            status=ResponseStatus.FAILED,
            sources=sources,
            error=str(exc),
            skill_name=skill_type,
            skill_type=skill_type,
        )


@app.post("/a2a/stream")
async def stream_agent_execution(body: A2ARequest, request: Request) -> EventSourceResponse:
    """
    Streaming A2A endpoint. Emits tool_start / tool_end SSE events as the agent
    runs, then a final 'done' event carrying the complete A2AResponse JSON.
    Falls back gracefully: if the runner is unavailable the 'done' event carries
    a failed A2AResponse so the caller degrades to the sync /ask path.
    """
    runtime = _get_runtime_or_raise(request)
    names = runtime.list_agent_names()
    if not names:
        raise HTTPException(status_code=503, detail="No agents discovered")

    ctx = body.context or {}
    agent_name = ctx.get("agent_name") or names[0]
    skill_type: Optional[str] = ctx.get("skill_type")
    span_id: Optional[str] = ctx.get("span_id")
    parent_span_id: Optional[str] = ctx.get("parent_span_id")

    trace_id: str = body.task_id or request.headers.get("X-Request-ID", "")
    set_trace_context(trace_id)
    set_task_id(trace_id)

    if agent_name not in names:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")

    skill_types = runtime.list_skill_types(agent_name)
    if not skill_types:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} has no skills")

    question = body.task
    _sel_subs_stream = _extract_sub_source_restriction(question)
    agent_def = runtime.get_agent(agent_name)
    sources: List[str] = list(getattr(agent_def, "allowed_mcp_servers", []))

    # Choose runner: skill-level when skill_type provided, agent-level otherwise
    if skill_type and skill_type in skill_types:
        runner = await runtime.get_runner(agent_name, skill_type, request_id=trace_id)
        run_label = f"skill:{agent_name}:{skill_type}"
        run_tags = ["skill", agent_name, skill_type]
        meta: dict = {"agent_name": agent_name, "skill_type": skill_type, "task_id": trace_id}
    else:
        runner = await runtime.get_agent_runner(agent_name, request_id=trace_id)
        skill_type = None
        run_label = f"agent_router:{agent_name}"
        run_tags = ["agent", "router", agent_name]
        meta = {"mode": "agent_router", "agent_name": agent_name, "task_id": trace_id}

    if span_id:
        meta["span_id"] = span_id
    if parent_span_id:
        meta["parent_span_id"] = parent_span_id
    if _sel_subs_stream:
        meta["selected_sub_sources"] = _sel_subs_stream
    if skill_type is None:
        # Pass agent card metadata for self-routing in the agent router path.
        _agent_card_stream = _get_agent_card(agent_name) or {}
        meta["agent_sub_sources"] = _agent_card_stream.get("sub_sources") or []
        meta["agent_allowed_skills"] = _agent_card_stream.get("allowed_skills") or []

    trace_config = {
        "run_name": run_label,
        "tags": run_tags,
        "recursion_limit": 25,
        "metadata": meta,
    }

    # Build the initial messages, injecting a system override when a restriction is active.
    _stream_messages: list = [("user", question)]
    if _sel_subs_stream:
        _stream_messages = [
            ("system",
             f"[USER DATA RESTRICTION]: The user has pre-selected these sub-sources to query: {_sel_subs_stream}. "
             f"You MUST call at least one skill tool to answer this question — "
             f"do not respond directly or ask for clarification. "
             f"Query ONLY the listed sub-sources.")
        ] + _stream_messages

    async def event_generator():
        seq = 0
        tool_events_collected: list = []
        pending: dict = {}   # run_id → {tool, args, seq}
        root_run_id = None
        final_out = None

        try:
            async for event in runner.astream_events(
                {"messages": _stream_messages},
                config=trace_config,
                version="v2",
            ):
                etype = event.get("event", "")
                run_id = event.get("run_id")
                parent_ids = event.get("parent_ids") or []

                # Track root run_id (first chain_start with no parent)
                if root_run_id is None and not parent_ids and etype == "on_chain_start":
                    root_run_id = run_id

                if etype == "on_tool_start":
                    seq += 1
                    tool_name = event.get("name", "")
                    args = (event.get("data") or {}).get("input") or {}
                    # Store raw args for pending; safe_args is JSON-safe for SSE
                    safe_args = _safe_json_value(args)
                    pending[run_id] = {"tool": tool_name, "args": args, "seq": seq}
                    yield {
                        "event": "tool_start",
                        "data": json.dumps({"tool": tool_name, "args": safe_args, "seq": seq, "run_id": run_id}),
                    }

                elif etype == "on_tool_end":
                    call = pending.pop(run_id, {})
                    tool_name = call.get("tool") or event.get("name", "")
                    raw = str((event.get("data") or {}).get("output", ""))
                    te: dict = {
                        "tool": tool_name,
                        "args": _safe_json_value(call.get("args", {})),
                        "result": raw[:500],
                        "truncated": len(raw) > 500,
                        "seq": call.get("seq", seq),
                    }
                    if tool_name in ("generate_sql", "MCP_generate_sql"):
                        try:
                            parsed_sql = json.loads(raw)
                            if sql_str := parsed_sql.get("sql_query", ""):
                                te["sql"] = sql_str
                        except Exception:
                            pass
                    tool_events_collected.append(te)
                    yield {"event": "tool_end", "data": json.dumps(te)}

                elif etype == "on_chain_end" and run_id == root_run_id:
                    final_out = (event.get("data") or {}).get("output")

        except Exception as exc:
            logger.error("POST /a2a/stream agent=%r error: %s", agent_name, exc, exc_info=True)
            err_resp = A2AResponse(
                task_id=body.task_id,
                status=ResponseStatus.FAILED,
                sources=sources,
                error=str(exc)[:300],
            )
            yield {"event": "done", "data": err_resp.model_dump_json()}
            return

        # Build final A2AResponse from the root chain output
        answer = _format_runner_output(final_out) if final_out is not None else ""
        artifacts = _extract_artifacts(final_out) if final_out is not None else []
        _tool_events_posthoc = extract_tool_events(
            (final_out or {}).get("messages", []) if isinstance(final_out, dict) else []
        )
        from querylab_agent.llm_observability import summarize_run
        usage, n_tools, cost = summarize_run(
            final_out if final_out is not None else {},
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        )
        used_skill = None
        if skill_type is None and final_out is not None:
            used_skill = _extract_skill_from_router_output(final_out, skill_types)

        final_resp = A2AResponse(
            task_id=body.task_id,
            status=ResponseStatus.SUCCESS if answer else ResponseStatus.PARTIAL,
            result=answer,
            sources=sources,
            artifacts=artifacts,
            skill_name=used_skill or skill_type,
            skill_type=used_skill or skill_type,
            tool_calls=n_tools,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            estimated_cost_usd=cost,
            tool_events=_tool_events_posthoc or tool_events_collected or None,
        )
        log_agent_invocation_summary(
            trace_id=trace_id,
            agent_name=agent_name,
            skill_type=skill_type or "agent",
            out=final_out or {},
            success=bool(answer),
        )
        yield {"event": "done", "data": final_resp.model_dump_json()}

    return EventSourceResponse(event_generator())


@app.get("/health")
async def health():
    logger.debug("GET /health")
    return {"status": "ok", "service": "querylab-agents"}


@app.get("/ready")
async def ready(request: Request):
    """
    Readiness: runtime loaded, at least one agent, MCP registry object present (may be empty).
    """
    from querylab_agent.executor.initializer import _REGISTRY_FAILURES
    runtime = getattr(request.app.state, "runtime", None)
    checks: dict[str, Any] = {
        "runtime_loaded": runtime is not None,
        "agents_discovered": False,
        "mcp_registry_present": False,
    }
    if runtime is not None:
        names = runtime.list_agent_names()
        checks["agents_discovered"] = len(names) > 0
        checks["agent_count"] = len(names)
        checks["mcp_registry_present"] = hasattr(runtime, "mcp_registry")
        checks["mcp_server_count"] = len(getattr(runtime, "mcp_registry", {}) or {})
        checks["agents_registered"] = len(names) - len(_REGISTRY_FAILURES)
        checks["failed_agents"] = dict(_REGISTRY_FAILURES)
    ok = bool(runtime and checks["agents_discovered"])
    status = "degraded" if _REGISTRY_FAILURES else ("ready" if ok else "not_ready")
    body = {"ready": ok, "status": status, "checks": checks}
    return JSONResponse(status_code=200 if ok else 503, content=body)


# ---- A2A protocol discovery (Agent Cards) ----

def _agents_base_path() -> Optional[Path]:
    root = os.environ.get("QUERYLAB_AGENTS_ROOT") or str(_agents_root())
    p = Path(root)
    return p if p.exists() else None


def _base_url(request: Any) -> str:
    """Prefer Host header or env for base URL."""
    base = os.environ.get("QUERYLAB_AGENTS_BASE_URL", "").strip()
    if base:
        return base.rstrip("/")
    host = getattr(request, "headers", None) and request.headers.get("host")
    if host:
        return f"http://{host}"
    return "http://localhost:8000"


@app.get("/agents/cards")
async def list_agent_cards(request: Request):
    """
    A2A discovery: list all Agent Cards (from .agents file-based discovery).
    Uses a2a-sdk types; each card includes skills derived from skill .md files.
    """
    from querylab_agent.a2a.discovery import discover_agent_cards

    base = _agents_base_path()
    if not base:
        return {"cards": []}
    cards = discover_agent_cards(base_path=base, base_url=_base_url(request))
    # discover_agent_cards now returns plain dicts (includes allowed_skills, allowed_mcp_servers)
    return {"cards": cards}


@app.get("/agents/{agent_name}/card")
async def get_agent_card(agent_name: str, request: Request):
    """
    A2A discovery: return one Agent Card for the given agent name.
    """
    from querylab_agent.a2a.discovery import get_agent_card as get_card

    base = _agents_base_path()
    if not base:
        raise HTTPException(status_code=503, detail="Agents root not configured")
    card = get_card(agent_name=agent_name, base_path=base, base_url=_base_url(request))
    if not card:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name!r} not found")
    return card  # already a dict


@app.get("/mcp/registry")
async def list_mcp_registry(request: Request, type: Optional[str] = None):
    """
    List all registered MCP servers from the central registry.
    Optional query param ?type=sql|vector|search|file filters by server type.
    """
    from querylab_agent.mcp.config import filter_servers_by_type, get_all_servers

    runtime = _get_runtime_or_raise(request)
    registry: dict = getattr(runtime, "mcp_registry", {}) or {}
    if type:
        servers = filter_servers_by_type(registry, type)
    else:
        servers = get_all_servers(registry)
    logger.info("GET /mcp/registry type=%r -> %d servers", type, len(servers))
    return {"servers": servers, "count": len(servers)}


def _skills_root() -> Optional[Path]:
    """Return the .skills/ directory path (sibling of .agents/) if it exists."""
    agents_root = os.environ.get("QUERYLAB_AGENTS_ROOT") or str(_agents_root())
    skills_path = Path(agents_root).parent / ".skills"
    return skills_path if skills_path.exists() else None


@app.get("/skills")
async def list_skills(request: Request):
    """
    List all generic skills from the shared .skills/ library.
    Skills here are decoupled from agents — any agent can reference them by name.
    """
    from querylab_agent.skills.loader import load_skill_config

    skills_root = _skills_root()
    if not skills_root:
        logger.warning("GET /skills: .skills/ directory not found")
        return {"skills": [], "count": 0}
    skills = []
    for md_file in sorted(skills_root.glob("*.md")):
        try:
            cfg = load_skill_config(md_file)
            skills.append({
                "name": cfg.name,
                "description": cfg.description,
                "requires_mcp_type": getattr(cfg, "requires_mcp_type", None),
            })
        except Exception as e:
            logger.warning("GET /skills: failed to load %s: %s", md_file.name, e)
    logger.info("GET /skills -> %d skills", len(skills))
    return {"skills": skills, "count": len(skills)}


@app.get("/.well-known/agent.json")
async def well_known_agent(request: Request):
    """
    A2A standard discovery: single Agent Card at /.well-known/agent.json.
    Returns the first discovered agent's card when multiple exist.
    """
    from querylab_agent.a2a.discovery import discover_agent_cards

    base = _agents_base_path()
    if not base:
        raise HTTPException(status_code=404, detail="No agents configured")
    cards = discover_agent_cards(base_path=base, base_url=_base_url(request))
    if not cards:
        raise HTTPException(status_code=404, detail="No agents discovered")
    return cards[0]  # already a dict (discover_agent_cards returns List[Dict])
