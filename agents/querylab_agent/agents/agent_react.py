"""
Agent-level ReAct: one ReAct agent per agent name whose tools are the skill runners.

When skill_type is omitted in /ask, this agent is used; it routes by choosing which skill tool to call.
System prompt comes from AGENT.md when present.
"""
import logging
from typing import Any, List, Optional

from querylab_agent.agents.time_context import current_date_context

logger = logging.getLogger(__name__)


def _format_runner_output(out: Any) -> str:
    """Extract a string from runner.ainvoke() result (e.g. last message content)."""
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


def _build_sub_source_catalog(sub_sources: list, skill_type: str = None,
                               allowed_skills: list = None) -> str:
    """Build a routing hint string filtered to the current skill type.

    Falls back to PascalCase convention; overrides with allowed_skills for edge cases
    like evolus_agent whose sub-source name is lowercase but vector-only."""
    has_sql = skill_type in ("query_sql", "sql") or (
        allowed_skills and any("sql" in s.lower() for s in allowed_skills)
    )
    has_vec = skill_type in ("query_vector", "vector") or (
        allowed_skills and any("vector" in s.lower() for s in allowed_skills)
    )
    force_vector = has_vec and not has_sql

    sql = [] if force_vector else [s for s in sub_sources if s[:1].islower()]
    vec = ([s for s in sub_sources if not s[:1].islower()]
           + ([s for s in sub_sources if s[:1].islower()] if force_vector else []))

    if skill_type in ("query_sql", "sql") and not force_vector:
        return f"SQL sources available: {', '.join(sql)}" if sql else ""
    if skill_type in ("query_vector", "vector") or force_vector:
        return f"Vector collections available: {', '.join(vec)}" if vec else ""
    parts = []
    if sql:
        parts.append(f"SQL: {', '.join(sql)}")
    if vec:
        parts.append(f"Vector: {', '.join(vec)}")
    return " | ".join(parts)


def _make_skill_tool(
    skill_type: str,
    runner: Any,
    description: str,
) -> Any:
    """Wrap a skill runner as a LangChain tool (async). Propagates run config for LangSmith nesting."""
    from langchain_core.tools import StructuredTool
    from langchain_core.runnables.config import ensure_config

    async def _invoke(query: str) -> str:
        config = ensure_config()
        # Propagate sub-source restriction set by the orchestrator so the skill runner
        # respects the user's selection even after the router simplifies the query.
        sel_subs = (config.get("metadata") or {}).get("selected_sub_sources", "")
        if sel_subs:
            sub_list = [s.strip() for s in sel_subs.split(",") if s.strip()]

            # Filter to only sub-sources relevant to this skill type so a SQL agent
            # never sees vector collection names and vice versa.
            # Guard: if all sub-sources are lowercase but skill is vector (e.g. evolus_agent
            # whose sub-source "evolus" is lowercase but has no SQL MCP), include all.
            if skill_type in ("query_sql", "sql"):
                relevant = [s for s in sub_list if s[:1].islower()]
                if not relevant:
                    return "No SQL sub-sources in the user's selection — skipping this skill."
            elif skill_type in ("query_vector", "vector"):
                pascal = [s for s in sub_list if not s[:1].islower()]
                relevant = pascal if pascal else sub_list
            else:
                relevant = sub_list

            if relevant:
                if len(relevant) > 1:
                    ordered = ", ".join(relevant)
                    query = (
                        f"[USER RESTRICTION — overrides all source coverage rules]: "
                        f"You MUST query ALL of these sub-sources in order: {ordered}. "
                        f"Make a separate tool call for each sub-source. "
                        f"Do NOT stop after the first sub-source even if it returns no results — "
                        f"continue to the next sub-source. "
                        f"Only after querying every sub-source should you synthesize a final answer "
                        f"from whatever was found across all of them. "
                        f"Do NOT query any sub-source not in this list.\n---\n{query}"
                    )
                else:
                    query = (
                        f"[USER RESTRICTION — overrides all source coverage rules]: "
                        f"ONLY query sub-source: {relevant[0]}. "
                        f"Do NOT query any other collection or database table.\n---\n{query}"
                    )
        else:
            # No user restriction — inject sub-source catalog so skill sub-agents
            # can self-route and fall back if the first source returns nothing.
            agent_sub_sources = (config.get("metadata") or {}).get("agent_sub_sources", [])
            agent_allowed_skills = (config.get("metadata") or {}).get("agent_allowed_skills", [])
            if agent_sub_sources:
                catalog = _build_sub_source_catalog(
                    agent_sub_sources, skill_type, agent_allowed_skills
                )
                if catalog:
                    query = (
                        f"[AVAILABLE SOURCES — self-route based on the question]: {catalog}\n"
                        f"Pick the most relevant sub-source(s) for the question. "
                        f"If the first sub-source returns no relevant results, try the next most relevant one. "
                        f"Only report 'no data found' after trying all relevant sub-sources.\n"
                        f"---\n{query}"
                    )
        config = {**config, "recursion_limit": 25}
        out = await runner.ainvoke(
            {"messages": [("user", query)]},
            config=config,
        )
        return _format_runner_output(out)

    return StructuredTool.from_function(
        name=skill_type,
        description=description or f"Run the {skill_type} skill for the user.",
        coroutine=_invoke,
    )


def _build_router_system_prompt(
    agent_instruction_config: Optional[Any],
    skill_names: List[str],
    skill_descriptions: List[str],
) -> str:
    """Build a routing-focused system prompt that excludes agent_instructions.

    The master router only needs to know WHICH skill to call, not HOW to execute
    SQL queries or search Weaviate — those details belong to skill sub-agents.
    Keeping agent_instructions out of the router prevents SQL tools from being
    triggered for non-SQL questions.
    """
    parts: list[str] = [current_date_context()]
    if agent_instruction_config is not None:
        if getattr(agent_instruction_config, "description", None):
            parts.append(agent_instruction_config.description)
        if getattr(agent_instruction_config, "purpose", None):
            parts.append(f"Purpose: {agent_instruction_config.purpose}")
        if getattr(agent_instruction_config, "when_to_use", None):
            parts.append(f"When to use: {agent_instruction_config.when_to_use}")

    skill_lines = "\n".join(
        f"  - {name}: {desc}"
        for name, desc in zip(skill_names, skill_descriptions)
    )
    parts.append(
        f"## Skills available\n{skill_lines}\n\n"
        "## Routing rules (follow strictly)\n"
        "- query_sql → only when the question requires structured data: metrics, counts, "
        "KPIs, revenue, time-series, or any answer that needs rows from a SQL database.\n"
        "- query_vector → only when the question requires document retrieval: strategy memos, "
        "executive communications, product notes, market intelligence, or qualitative content.\n"
        "- Call BOTH tools only when the question explicitly needs quantitative data AND "
        "document context in the same answer.\n"
        "- Call NO tool when the question is conversational, is a greeting, asks for an "
        "explanation from general knowledge, or can be answered without live data — "
        "respond directly instead."
    )
    return "\n\n".join(parts)


async def create_agent_runner(
    agent_name: str,
    agent_def: Any,
    skill_runners: List[Any],
    skill_descriptions: List[str],
    llm: Any,
    agent_instruction_config: Optional[Any],
) -> Any:
    """
    Build the main agent ReAct whose tools are the skill runners.

    Args:
        agent_name: Agent name (for logging).
        agent_def: AgentDefinition for this agent.
        skill_runners: List of runnables (one per skill type), same order as agent_def.skill_names.
        skill_descriptions: Short description per skill for the tool.
        llm: LLM for the main agent.
        agent_instruction_config: From load_agent_instruction_file (AGENT.md), or None.

    Returns:
        ReAct agent (create_agent) with tools = skill tools, system_prompt from agent instructions.
    """
    from langchain.agents import create_agent

    skill_names = list(agent_def.skill_names)
    if len(skill_runners) != len(skill_names) or len(skill_descriptions) != len(skill_names):
        logger.warning("Mismatch: skill_names=%r runners=%d descriptions=%d", skill_names, len(skill_runners), len(skill_descriptions))
    tools = []
    for i, st in enumerate(skill_names):
        runner = skill_runners[i] if i < len(skill_runners) else None
        desc = skill_descriptions[i] if i < len(skill_descriptions) else None
        if runner is not None:
            tools.append(_make_skill_tool(st, runner, desc or ""))
    if not tools:
        logger.warning("No skill tools for agent %r", agent_name)
        return None
    all_tools = tools
    system_prompt = _build_router_system_prompt(
        agent_instruction_config,
        skill_names,
        [skill_descriptions[i] if i < len(skill_descriptions) else "" for i in range(len(skill_names))],
    )

    tool_names = [getattr(t, 'name', '?') for t in all_tools]
    logger.info("Building agent-level ReAct for %r: %d skill tools: %s", agent_name, len(all_tools), tool_names)

    return create_agent(
        model=llm,
        tools=all_tools,
        system_prompt=system_prompt,
    )
