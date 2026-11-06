"""
Runtime ReAct agent for non-predefined skill types.

When a skill type has no registered runner factory (e.g. custom_skill), we build
a ReAct agent with tools = MCP tools from the skill's .md and system prompt from
skill config (description, purpose, when_to_use, agent_instructions).
"""
from typing import Any, List

from querylab_agent.skills.loader import SkillConfig


def _system_prompt_from_skill_config(skill_config: SkillConfig) -> str:
    """Build system prompt for runtime ReAct from skill config (no MCP required in .md)."""
    parts = []
    if skill_config.description:
        parts.append(skill_config.description)
    ctx = skill_config.prompt_context()
    if ctx:
        parts.append(ctx)
    if skill_config.agent_instructions:
        parts.append(f"Instructions: {skill_config.agent_instructions}")
    return "\n\n".join(parts) if parts else "Use the available tools to fulfill the user request."


def create_runtime_react_agent(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
) -> Any:
    """
    Build a ReAct agent for an unknown skill type: MCP tools only, system prompt from skill config.

    Used when get_skill_runner_factory(skill_type) is None; the skill's .md defines
    mcp_servers and agent_instructions, and we create a generic ReAct with those tools.
    """
    from langchain.agents import create_agent

    system_prompt = _system_prompt_from_skill_config(skill_config)
    return create_agent(
        model=llm,
        tools=mcp_tools or [],
        system_prompt=system_prompt,
    )
