"""
Structured JSON (or text) logging with request-scoped context.

Context fields: trace_id, span_id, user_id, session_id — merged into every log line when set.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("log_trace_id", default="")
span_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("log_span_id", default="")
user_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("log_user_id", default="")
session_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("log_session_id", default="")
# task_id is the A2A task_id that flows from orchestrator → agent → skill → MCP tool.
# In our system task_id == trace_id (the A2A task_id doubles as trace_id). Kept separate
# so logs can be grepped by either name and the semantic is explicit.
task_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("log_task_id", default="")

SERVICE_NAME = "orchestrator"


def set_trace_context(trace_id: str, span_id: str = "") -> None:
    trace_id_var.set(trace_id or "")
    span_id_var.set(span_id or "")


def set_task_id(task_id: str) -> None:
    """Set the A2A task_id for the current request context (propagated to every log line)."""
    task_id_var.set(task_id or "")


def set_user_context(user_id: str = "", session_id: str = "") -> None:
    user_id_var.set(user_id or "")
    session_id_var.set(session_id or "")


def reset_request_context() -> None:
    trace_id_var.set("")
    span_id_var.set("")
    user_id_var.set("")
    session_id_var.set("")
    task_id_var.set("")


def get_log_context() -> dict[str, str]:
    return {
        "trace_id": trace_id_var.get(),
        "span_id": span_id_var.get(),
        "user_id": user_id_var.get(),
        "session_id": session_id_var.get(),
        "task_id": task_id_var.get(),
    }


class ContextFilter(logging.Filter):
    """Inject context vars into LogRecord so formatters can read them."""

    def filter(self, record: logging.LogRecord) -> bool:
        ctx = get_log_context()
        for k, v in ctx.items():
            if not hasattr(record, k) or getattr(record, k) in (None, ""):
                setattr(record, k, v or "")
        if not hasattr(record, "service") or not getattr(record, "service"):
            record.service = SERVICE_NAME
        for k in ("route", "method", "event", "error_type", "task_id"):
            if not hasattr(record, k):
                setattr(record, k, "")
        if not getattr(record, "route", None):
            record.route = "-"
        if getattr(record, "user_id", None) is None:
            record.user_id = ""
        if not getattr(record, "trace_id", None):
            record.trace_id = ""
        if not getattr(record, "task_id", None):
            record.task_id = ""
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line for log aggregation."""

    _EXTRA_KEYS = (
        "task_id",
        "trace_id",
        "span_id",
        "user_id",
        "session_id",
        "service",
        "route",
        "method",
        "duration_ms",
        "error_type",
        "event",
        "status_code",
        "client_ip_hash",
        "client_ip_truncated",
        "user_id_hash",
        "outcome",
        "detail",
        "interval_sec",
        "mode",
        "tool_calls",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "estimated_cost_usd",
        "agent_name",
        "skill_name",
        "skill_type",
        "mcp_server",
        "agents_api_url",
        "a2a_status",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in self._EXTRA_KEYS:
            val = getattr(record, key, None)
            if val is not None and val != "":
                payload[key] = val
        if record.exc_info and record.exc_info[0]:
            payload.setdefault("error_type", record.exc_info[0].__name__)
        return json.dumps(payload, default=str)


def _log_format() -> str:
    return (os.environ.get("ORCHESTRATOR_LOG_FORMAT") or "text").strip().lower()


def _build_formatter(fmt: str) -> logging.Formatter:
    if fmt == "json":
        return JsonFormatter()
    return logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s | trace_id=%(trace_id)s user=%(user_id)s route=%(route)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def configure_structured_logging(service: str = SERVICE_NAME) -> None:
    """Call once at process start (orchestrator app).

    Logs always go to stderr. If ORCHESTRATOR_LOG_FILE is set, the same records are also
    written to a rotating file (UTF-8).
    """
    global SERVICE_NAME
    SERVICE_NAME = service

    level_name = os.environ.get("ORCHESTRATOR_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    fmt = _log_format()
    formatter = _build_formatter(fmt)
    ctx_filter = ContextFilter()

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(formatter)
    stderr_handler.addFilter(ctx_filter)
    root.addHandler(stderr_handler)

    log_file = (os.environ.get("ORCHESTRATOR_LOG_FILE") or "").strip()
    if log_file:
        path = Path(log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        max_bytes = int(os.environ.get("ORCHESTRATOR_LOG_FILE_MAX_BYTES", "10485760") or "10485760")
        backups = int(os.environ.get("ORCHESTRATOR_LOG_FILE_BACKUP_COUNT", "5") or "5")
        file_handler = RotatingFileHandler(
            path,
            maxBytes=max_bytes,
            backupCount=backups,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(ContextFilter())
        root.addHandler(file_handler)

    apply_package_log_levels(level)


def apply_package_log_levels(base_level: int) -> None:
    """Tune third-party noise in production."""
    logging.getLogger("orchestrator").setLevel(base_level)
    if base_level > logging.DEBUG:
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    else:
        logging.getLogger("httpx").setLevel(logging.DEBUG)
        logging.getLogger("httpcore").setLevel(logging.INFO)


def log_extra(**kwargs: Any) -> dict[str, Any]:
    """Build logging extra= dict with non-empty values only."""
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}
