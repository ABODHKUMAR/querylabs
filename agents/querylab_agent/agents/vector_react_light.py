"""
Light Vector ReAct agent: document retrieval via MCP only (e.g. weaviate_mcp retrieve_docs_from_collection).

No in-code retrieval; skill config (SKILL.md) drives which MCP servers and instructions.
Mirrors sql_react_light pattern: create_agent with mcp_tools and system prompt from skill config.
"""
import logging
from typing import Any, List

logger = logging.getLogger(__name__)

from querylab_agent.skills.loader import SkillConfig


def _default_system_prompt(skill_config: SkillConfig) -> str:
    """Build system prompt from SKILL.md: description, purpose, when_to_use, agent_instructions."""
    base = """You are a document search assistant. Use the available MCP tools to retrieve documents from vector collections.

WORKFLOW:
1. Call the MCP retrieval tool FIRST to search the vector collection. The runtime prefixes MCP tool names with `MCP_`, so the tool is typically:
   - `MCP_retrieve_docs_from_collection` (from the weaviate_mcp server)
   - (fallback: any tool whose description indicates it retrieves docs from a vector collection)
2. Summarize or answer from the retrieved documents. If the user asks a question, base your answer on the retrieved content.
3. If no documents are found from a sub-source, do NOT stop. Proceed immediately to the next sub-source in the restriction list.
4. After querying every sub-source listed in the USER RESTRICTION, synthesize a final answer from all results found. Only report "no documents found" if every listed sub-source was tried and returned nothing.

RULES:
- Always call the retrieval tool FIRST when the user asks for documents or information from a collection.
- If a tool named `retrieve_docs_from_collection` is referenced in instructions, call `MCP_retrieve_docs_from_collection` instead (tool-name prefixing).
- Use the collection name specified in the skill or asked by the user.
- Keep answers grounded in the retrieved text.
- CRITICAL — MULTI-SOURCE COVERAGE: If the query contains a [USER RESTRICTION] listing multiple sub-sources (e.g. "sub-sources: A, B, C"), you MUST call the retrieval tool once per sub-source. An empty result from sub-source A is NOT a reason to stop — call the tool again for sub-source B, then C. Only after all listed sub-sources have been queried should you form your final answer.

SELF-ROUTING MODE (when query contains [AVAILABLE SOURCES] instead of [USER RESTRICTION]):
- Read the [AVAILABLE SOURCES] list to see which Vector collections this agent has.
- Pick the collection whose name best matches the question's domain
  (e.g., "KYC" → ForgeKYCAMLReports, "exec memo" → AvaniExecMemos, "resort" → MVWResortReports).
- Query the best-matching collection first.
- If it returns no results or irrelevant documents, try the next most relevant Vector collection.
- After trying all reasonably relevant collections, synthesize from all results found.
- Only report "no documents found" after every relevant collection has been tried.
"""
    skill_context = skill_config.prompt_context()
    if skill_context:
        base = base.rstrip() + "\n\n--- Skill (from SKILL.md) ---\n" + skill_context + "\n"
    if skill_config.agent_instructions:
        base = base.rstrip() + "\n\n--- Instructions ---\n" + skill_config.agent_instructions.strip() + "\n"
    return base


def create_vector_react_agent(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    **kwargs: Any,
) -> Any:
    """
    Build a Vector ReAct agent from skill config and MCP tools (factory-style).

    Used by the skill runner factory: caller provides SkillConfig (from .md) and
    pre-created MCP tools (e.g. weaviate_mcp's retrieve_docs_from_collection).
    Data retrieval is MCP-only; no direct Weaviate client in the agent.
    """
    from langchain.agents import create_agent

    all_tools = mcp_tools or []
    logger.info(
        "Building Vector ReAct agent: skill=%r mcp_tools=%d total_tools=%d",
        skill_config.name,
        len(mcp_tools or []),
        len(all_tools),
    )
    
    if not all_tools:
        logger.warning(
            "No MCP tools provided for Vector ReAct agent (skill=%r). "
            "Agent may not function properly without retrieval tools. "
            "Check that mcp_servers are configured in skill.md and MCP server is running.",
            skill_config.name
        )
    
    system_prompt = _default_system_prompt(skill_config)
    return create_agent(
        model=llm,
        tools=all_tools,
        system_prompt=system_prompt,
    )
