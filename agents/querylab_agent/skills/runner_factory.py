"""
Skill runner factory: build runnable (e.g. ReAct agent) from .md (SkillConfig) and MCP tools.

SQL ReAct is a skill: its implementation is registered here for skill_type "sql" / "query_sql".
The factory takes the skill's SkillConfig (from the .md file) and the MCP tools already
created from that skill's MCP config, and returns the runner (agent).

Phase 5 — Observability: ``wrap_runner_for_logging()`` wraps the runner returned by any
factory so every ``ainvoke`` emits a structured log entry with timing:

  event=skill_invoke  skill_name=query_sql  agent_name=beat_observability
  status=success|error  duration_ms=834  task_id=abc123
"""
import functools
import logging
import time
from typing import Any, Callable, Dict, List, Optional

from querylab_agent.skills.loader import SkillConfig
from querylab_agent.structured_logging import log_extra

_runner_logger = logging.getLogger(__name__)


# Factory signature: (skill_config, mcp_tools, llm, **kwargs) -> runner (sync or async)
SkillRunnerFactory = Callable[
    [SkillConfig, List[Any], Any],
    Any,
]

_REGISTRY: Dict[str, SkillRunnerFactory] = {}


def register_skill_runner_factory(skill_type: str, factory: SkillRunnerFactory) -> None:
    """Register a factory for a skill type (e.g. 'sql', 'query_sql')."""
    key = (skill_type or "").strip().lower()
    if key:
        _REGISTRY[key] = factory


def get_skill_runner_factory(skill_type: str) -> Optional[SkillRunnerFactory]:
    """Return the registered factory for this skill type, or None."""
    if not skill_type:
        return None
    key = (skill_type or "").strip().lower()
    if key in _REGISTRY:
        return _REGISTRY[key]
    # query_sql -> sql
    if key == "query_sql":
        return _REGISTRY.get("sql")
    return None


_MYSQL_CONSTRAINTS = (
    "Use MySQL syntax only. "
    "Date comparisons: use date range (>= and <), never DATE() in WHERE or :: casts. "
    "Always add LIMIT clause. "
    "Use backticks for identifiers."
)


def _create_sql_react_runner(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    db_type: str = "MySQL",
    db_constraints: Optional[str] = None,
    **kwargs: Any,
) -> Any:
    """Factory for SQL ReAct skill: build agent from .md config and MCP tools."""
    from querylab_agent.agents.sql_react_light import create_sql_react_agent

    # Auto-detect MySQL from MCP server names
    mcp_names = skill_config.mcp_servers or []
    if any("mysql" in n.lower() for n in mcp_names):
        db_type = "MySQL"
        if not db_constraints:
            db_constraints = _MYSQL_CONSTRAINTS

    return create_sql_react_agent(
        skill_config=skill_config,
        mcp_tools=mcp_tools,
        llm=llm,
        db_type=db_type,
        db_constraints=db_constraints,
    )


def _create_vector_react_runner(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    **kwargs: Any,
) -> Any:
    """Factory for Vector ReAct skill: MCP-only retrieval (e.g. weaviate_mcp), build agent from .md and MCP tools."""
    from querylab_agent.agents.vector_react_light import create_vector_react_agent

    return create_vector_react_agent(
        skill_config=skill_config,
        mcp_tools=mcp_tools,
        llm=llm,
        **kwargs,
    )


def _create_openai_vector_react_runner(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    agent_name: Optional[str] = None,
    **kwargs: Any,
) -> Any:
    """Factory for OpenAI Vector ReAct skill: direct OpenAI vector-store search, no MCP server."""
    from querylab_agent.agents.vector_openai_react import create_openai_vector_react_agent

    return create_openai_vector_react_agent(
        skill_config=skill_config,
        mcp_tools=mcp_tools,
        llm=llm,
        agent_name=agent_name,
        **kwargs,
    )


def _register_builtin_factories() -> None:
    """Register built-in skill runner factories (SQL ReAct, Vector ReAct, etc.)."""
    register_skill_runner_factory("sql", _create_sql_react_runner)
    register_skill_runner_factory("query_sql", _create_sql_react_runner)
    register_skill_runner_factory("query_vector", _create_vector_react_runner)
    register_skill_runner_factory("vector", _create_vector_react_runner)
    register_skill_runner_factory("query_vector_openai", _create_openai_vector_react_runner)
    register_skill_runner_factory("vector_openai", _create_openai_vector_react_runner)


_register_builtin_factories()


# ---------------------------------------------------------------------------
# Phase 5 — Skill invocation observability
# ---------------------------------------------------------------------------

def wrap_runner_for_logging(
    runner: Any,
    skill_name: str,
    agent_name: str = "",
    task_id: str = "",
) -> Any:
    """
    Return a thin wrapper around ``runner`` that logs every ``ainvoke`` with timing.

    Emits two structured log lines per invocation:
      - INFO  ``skill_invoke_start`` at call time
      - INFO  ``skill_invoke_end``   on success  (with duration_ms)
      - ERROR ``skill_invoke_end``   on failure  (with duration_ms + error_type)

    Usage in api.py::

        runner = wrap_runner_for_logging(runner, skill_name, agent_name, task_id)
        out = await runner.ainvoke({"messages": [("user", question)]}, config=cfg)
    """
    if runner is None:
        return runner

    original_ainvoke = getattr(runner, "ainvoke", None)
    if original_ainvoke is None:
        return runner  # not an ainvoke-able runner

    @functools.wraps(original_ainvoke)
    async def _timed_ainvoke(input_: Any, **kwargs: Any) -> Any:
        _runner_logger.info(
            "skill_invoke_start skill=%r agent=%r task_id=%s",
            skill_name, agent_name, task_id,
            extra=log_extra(
                event="skill_invoke_start",
                skill_name=skill_name,
                agent_name=agent_name,
                task_id=task_id,
            ),
        )
        t0 = time.monotonic()
        try:
            result = await original_ainvoke(input_, **kwargs)
            duration_ms = int((time.monotonic() - t0) * 1000)
            _runner_logger.info(
                "skill_invoke_end skill=%r agent=%r status=success duration_ms=%d task_id=%s",
                skill_name, agent_name, duration_ms, task_id,
                extra=log_extra(
                    event="skill_invoke_end",
                    skill_name=skill_name,
                    agent_name=agent_name,
                    status="success",
                    duration_ms=duration_ms,
                    task_id=task_id,
                ),
            )
            return result
        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            _runner_logger.error(
                "skill_invoke_end skill=%r agent=%r status=error duration_ms=%d task_id=%s error=%s",
                skill_name, agent_name, duration_ms, task_id, exc,
                extra=log_extra(
                    event="skill_invoke_end",
                    skill_name=skill_name,
                    agent_name=agent_name,
                    status="error",
                    duration_ms=duration_ms,
                    task_id=task_id,
                    error_type=type(exc).__name__,
                ),
            )
            raise

    runner.ainvoke = _timed_ainvoke
    return runner
