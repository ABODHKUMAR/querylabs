"""
OpenAI Vector ReAct agent: document retrieval directly against OpenAI's native vector
store API (client.vector_stores.search) — no MCP server involved.

Used for data sources whose documents live in an OpenAI-managed vector store rather
than the shared Weaviate collection reachable via weaviate_mcp. Vector store ID and
API key are resolved per-agent from env vars: VECTOR_STORE_ID_<AGENT>,
OPENAI_API_KEY_<AGENT> (falls back to the shared OPENAI_API_KEY).
"""
import logging
import os
from typing import Any, List, Optional

from querylab_agent.skills.loader import SkillConfig

logger = logging.getLogger(__name__)


def _agent_env_suffix(agent_name: Optional[str]) -> str:
    """Derive the env var suffix for an agent name, e.g. 'radium_agent' -> 'RADIUM'."""
    name = (agent_name or "").strip().upper()
    if name.endswith("_AGENT"):
        name = name[: -len("_AGENT")]
    return name


def _default_system_prompt(skill_config: SkillConfig) -> str:
    """Build system prompt from SKILL.md: description, purpose, when_to_use, agent_instructions."""
    base = """You are a document search assistant. Use the retrieve_from_openai_vector_store tool to search the vector store and answer from the retrieved content.

WORKFLOW:
1. Call retrieve_from_openai_vector_store FIRST with the user's question (or a reformulated search query).
2. Summarize or answer from the retrieved documents. Base your answer only on retrieved content.
3. If no documents are found, do NOT fabricate an answer — say so clearly.

RULES:
- Always call the retrieval tool before answering.
- Keep answers grounded in the retrieved text and cite source file names when available.
"""
    skill_context = skill_config.prompt_context()
    if skill_context:
        base = base.rstrip() + "\n\n--- Skill (from SKILL.md) ---\n" + skill_context + "\n"
    if skill_config.agent_instructions:
        base = base.rstrip() + "\n\n--- Instructions ---\n" + skill_config.agent_instructions.strip() + "\n"
    return base


def create_openai_vector_react_agent(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    agent_name: Optional[str] = None,
    **kwargs: Any,
) -> Any:
    """
    Build a ReAct agent whose only tool searches an OpenAI-native vector store directly.

    No MCP tools are used (mcp_tools is ignored); the retrieval tool calls OpenAI's
    vector store search endpoint using this agent's own vector store ID and API key.
    """
    from langchain.agents import create_agent
    from langchain_core.tools import tool
    from openai import AsyncOpenAI

    suffix = _agent_env_suffix(agent_name)
    vector_store_id = os.environ.get(f"VECTOR_STORE_ID_{suffix}") if suffix else None
    api_key = (os.environ.get(f"OPENAI_API_KEY_{suffix}") if suffix else None) or os.environ.get("OPENAI_API_KEY")

    if not vector_store_id:
        logger.warning(
            "No VECTOR_STORE_ID_%s configured for OpenAI vector agent (agent=%r); retrieval will fail.",
            suffix, agent_name,
        )
    if not api_key:
        logger.warning(
            "No OpenAI API key configured for OpenAI vector agent (agent=%r); retrieval will fail.",
            agent_name,
        )

    client = AsyncOpenAI(api_key=api_key) if api_key else None

    @tool
    async def retrieve_from_openai_vector_store(query: str, max_results: int = 10) -> str:
        """Search the OpenAI vector store for documents relevant to the query and return their content with source file names."""
        if client is None or not vector_store_id:
            return "ERROR: Vector store is not configured (missing vector store ID or API key)."
        try:
            result = await client.vector_stores.search(
                vector_store_id=vector_store_id,
                query=query,
                max_num_results=max_results,
                ranking_options={"ranker": "auto", "score_threshold": 0.7},
            )
        except Exception as exc:
            logger.error("OpenAI vector store search failed: %s", exc)
            return f"ERROR: Vector store search failed: {exc}"

        chunks: List[str] = []
        sources: set = set()
        for row in getattr(result, "data", None) or []:
            filename = getattr(row, "filename", None) or "Unknown"
            for part in getattr(row, "content", None) or []:
                text = getattr(part, "text", None)
                if text and text.strip():
                    chunks.append(text.strip())
                    sources.add(filename)

        if not chunks:
            return "No relevant documents were found in the vector store for this query."

        body = "\n\n---\n\n".join(chunks)
        source_list = "\n".join(sorted(sources))
        return f"{body}\n\nSOURCE FILES\n{source_list}"

    logger.info(
        "Building OpenAI Vector ReAct agent: skill=%r agent=%r vector_store_configured=%s",
        skill_config.name, agent_name, bool(vector_store_id and api_key),
    )

    system_prompt = _default_system_prompt(skill_config)
    return create_agent(
        model=llm,
        tools=[retrieve_from_openai_vector_store],
        system_prompt=system_prompt,
    )
