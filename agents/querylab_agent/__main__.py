"""
Run the agent from the command line.

  cd agents && poetry run python -m querylab_agent
  poetry run python -m querylab_agent "How many users do we have?"

Loads env from agents/.env if present. Uses .agents/ under the agents repo by default.
Set QUERYLAB_AGENTS_LOG_LEVEL=DEBUG for verbose logging.
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

from querylab_agent.env import load_env
from querylab_agent.logging_config import configure_logging

load_env()


def _configure_logging() -> None:
    """Use shared logging config (same as API)."""
    configure_logging(stream=sys.stderr)


def _agents_root() -> Path:
    """Default .agents root: next to the querylab_agent package."""
    p = Path(__file__).resolve().parent
    # querylab_agent/__main__.py -> go up to agents/ then .agents
    if p.name == "querylab_agent":
        return p.parent / ".agents"
    return p / ".agents"


async def _run(question: str | None) -> None:
    _configure_logging()
    log = logging.getLogger("querylab_agent.cli")

    agents_base = os.environ.get("QUERYLAB_AGENTS_ROOT") or str(_agents_root())
    log.info("Agents root: %s", agents_base)
    if not Path(agents_base).exists():
        log.error("Agents root not found: %s. Set QUERYLAB_AGENTS_ROOT or run from the agents repo.", agents_base)
        sys.exit(1)

    from querylab_agent.executor.initializer import initialize_skills_and_agents
    from querylab_agent.llm.factory import get_llm

    base = Path(agents_base)
    
    # Check for Docker-specific MCP config first when DOCKER_RUNNING is set
    docker_running = os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes")
    if docker_running:
        mcp_json = base / "mcp_servers.docker.json"
        if mcp_json.exists():
            log.info("Using Docker MCP registry: %s", mcp_json)
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
    mcp_path = str(mcp_json) if mcp_json.exists() else None
    log.info("Loading LLM and initializing runtime (MCP registry: %s)", mcp_path or "none")
    llm = get_llm()
    runtime = initialize_skills_and_agents(
        agents_base_path=agents_base,
        mcp_registry_path=mcp_path,
        llm=llm,
    )

    names = runtime.list_agent_names()
    if not names:
        log.error("No agents discovered under %s", agents_base)
        sys.exit(1)
    log.info("Discovered agents: %s", names)

    agent_name = names[0]
    skill_types = runtime.list_skill_types(agent_name)
    if not skill_types:
        log.error("Agent %r has no skill types.", agent_name)
        sys.exit(1)
    skill_type = skill_types[0]
    skill_files = runtime.list_skill_files(agent_name, skill_type)
    log.info("Using agent=%r skill_type=%r (skill files: %s)", agent_name, skill_type, [str(p.name) for p in skill_files])

    if not question:
        log.info("No question provided. Usage: python -m querylab_agent \"Your question here\"")
        for n in names:
            log.info("  Agent %r: skills = %s", n, runtime.list_skill_types(n))
        return

    log.info("Creating runner for agent=%r skill_type=%r ...", agent_name, skill_type)
    runner = await runtime.get_runner(agent_name, skill_type)
    if runner is None:
        log.error("Failed to create runner (missing LLM or factory for %s/%s).", agent_name, skill_type)
        sys.exit(1)
    log.info("Invoking agent with question: %s", question[:80] + "..." if len(question) > 80 else question)
    out = await runner.ainvoke({"messages": [("user", question)]})
    log.info("Agent finished.")
    print(out)


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] in ("--api", "-a"):
        # Expose as HTTP API: python -m querylab_agent --api
        import uvicorn
        uvicorn.run(
            "querylab_agent.api:app",
            host=os.environ.get("QUERYLAB_AGENTS_HOST", "0.0.0.0"),
            port=int(os.environ.get("QUERYLAB_AGENTS_PORT", "8000")),
            reload=os.environ.get("QUERYLAB_AGENTS_RELOAD", "").lower() in ("1", "true", "yes"),
        )
        return
    question = None
    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        question = " ".join(sys.argv[1:]).strip()
    asyncio.run(_run(question))


if __name__ == "__main__":
    main()
