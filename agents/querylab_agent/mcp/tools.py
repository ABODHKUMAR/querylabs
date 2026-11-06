"""
Create LangChain tools from MCP server configs.

Used by the light SQL ReAct agent: discovery (get_schema, get_table_details)
and execution (execute_sql) come from these MCP tools. Configs are resolved
from SKILL.md mcp_servers via the caller's MCP registry.

Phase 5 — Observability: each tool's _arun is wrapped with a timing logger that
emits a structured log entry:
  {event: mcp_tool_call, tool, mcp_server, duration_ms, task_id, outcome}
"""
import asyncio
import functools
import logging
import time
from typing import Any, Dict, List, Optional

from querylab_agent.structured_logging import log_extra

logger = logging.getLogger(__name__)

try:
    from langchain_core.tools import BaseTool
except ImportError:
    BaseTool = None  # type: ignore


async def create_mcp_tools_async(
    mcp_configs: List[Dict[str, Any]],
    request_id: Optional[str] = None,
    tool_name_prefix: str = "MCP_",
) -> List[Any]:
    """
    Create LangChain tools from MCP server configs (list of dicts).
    Each config must have: name, transport, and either (command, args) for stdio or url for sse/http.
    Returns list of tools; discovery/execute tools are whatever the MCP servers expose.
    """
    if BaseTool is None:
        return []
    if not mcp_configs:
        return []

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        return []

    server_configs = {}
    for c in mcp_configs:
        name = c.get("name") or c.get("server_name")
        if not name:
            continue
        cfg = {}
        if c.get("transport") == "stdio":
            cfg = {"transport": "stdio", "command": c.get("command"), "args": c.get("args") or [], "env": c.get("env") or {}}
            if request_id:
                logger.info("MCP stdio server %r request_id=%s", name, request_id)
        elif c.get("transport") in ("sse", "http", "websocket", "streamable_http"):
            # langchain_mcp_adapters expects "streamable_http" for HTTP MCP servers (not "http")
            transport = c["transport"]
            if transport == "http":
                transport = "streamable_http"
            cfg = {"transport": transport, "url": c.get("url")}
            headers = dict(c.get("headers") or {})
            if request_id:
                headers["X-Request-ID"] = request_id
            if headers:
                cfg["headers"] = headers
        if cfg:
            server_configs[name] = cfg

    if not server_configs:
        logger.warning("No valid MCP server configs (names: %s)", [c.get("name") or c.get("server_name") for c in mcp_configs])
        return []

    server_names = list(server_configs.keys())
    logger.info("Connecting to MCP servers: %s request_id=%s", server_names, request_id or "-")

    try:
        client = MultiServerMCPClient(server_configs)
        all_tools = await asyncio.wait_for(client.get_tools(), timeout=8.0)
    except asyncio.TimeoutError:
        logger.warning("MCP servers %s timed out after 8s — skipping all", server_names)
        all_tools = []
    except Exception as exc:
        logger.warning("MCP client failed for %s: %s — skipping all", server_names, exc)
        all_tools = []
    logger.info("MCP tools received: %d from %s request_id=%s", len(all_tools), server_names, request_id or "-")

    result = []
    for tool in all_tools:
        if tool_name_prefix and not getattr(tool, "name", "").startswith(tool_name_prefix):
            tool.name = f"{tool_name_prefix}{tool.name}"
        tool = _wrap_tool_with_logging(tool, server_names=server_names, request_id=request_id)
        result.append(tool)
    return result


# ---------------------------------------------------------------------------
# Phase 5 — MCP tool call observability
# ---------------------------------------------------------------------------

def _wrap_tool_with_logging(tool: Any, server_names: List[str], request_id: Optional[str]) -> Any:
    """
    Wrap a LangChain tool's ``_arun`` method so every invocation emits a
    structured log entry with timing:

      event=mcp_tool_call  tool=MCP_execute_sql  mcp_server=mysql_beat
      duration_ms=142  task_id=abc123  outcome=success|error
    """
    original_arun = getattr(tool, "_arun", None)
    if original_arun is None:
        return tool  # not an async tool — skip

    tool_name: str = getattr(tool, "name", "unknown_tool")
    mcp_server_str: str = ",".join(server_names) if server_names else "unknown"

    @functools.wraps(original_arun)
    async def _timed_arun(*args: Any, **kwargs: Any) -> Any:
        t0 = time.monotonic()
        try:
            result = await original_arun(*args, **kwargs)
            duration_ms = int((time.monotonic() - t0) * 1000)
            logger.info(
                "mcp_tool_call tool=%r mcp_server=%r duration_ms=%d outcome=success request_id=%s",
                tool_name, mcp_server_str, duration_ms, request_id or "-",
                extra=log_extra(
                    event="mcp_tool_call",
                    tool=tool_name,
                    mcp_server=mcp_server_str,
                    duration_ms=duration_ms,
                    task_id=request_id or "",
                    outcome="success",
                ),
            )
            return result
        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            logger.error(
                "mcp_tool_call tool=%r mcp_server=%r duration_ms=%d outcome=error error=%s request_id=%s",
                tool_name, mcp_server_str, duration_ms, exc, request_id or "-",
                extra=log_extra(
                    event="mcp_tool_call",
                    tool=tool_name,
                    mcp_server=mcp_server_str,
                    duration_ms=duration_ms,
                    task_id=request_id or "",
                    outcome="error",
                    error_type=type(exc).__name__,
                ),
            )
            raise

    tool._arun = _timed_arun
    return tool


def create_mcp_tools_sync(
    mcp_configs: List[Dict[str, Any]],
    request_id: Optional[str] = None,
    tool_name_prefix: str = "MCP_",
) -> List[Any]:
    """Sync wrapper for create_mcp_tools_async. Use when no event loop is running."""
    return asyncio.run(create_mcp_tools_async(mcp_configs, request_id, tool_name_prefix))
