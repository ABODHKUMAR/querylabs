"""
Light SQL ReAct agent: generate_sql, fix_sql, evaluate only.
Discovery and execution come from MCP; skill config (SKILL.md) drives which MCP and instructions.
"""
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

from querylab_agent.agents.sql_react_light_tools import create_light_sql_tools
from querylab_agent.agents.time_context import current_date_context
from querylab_agent.mcp.tools import create_mcp_tools_async
from querylab_agent.skills.loader import SkillConfig, load_skill_config


def _default_system_prompt(skill_config: SkillConfig) -> str:
    """Build system prompt from SKILL.md: workflow + full skill context (description, purpose, when_to_use) + agent_instructions."""
    base = current_date_context() + """

You are a SQL analyst. Discovery and execution are done via MCP tools.

WORKFLOW (single sub-source):
1. Call get_schema (or MCP_get_schema) FIRST to get schema and sample data.
2. Call generate_sql with the user question and relevant_schema_details from step 1.
3. Call execute_sql (or MCP_execute_sql) to run the generated query.
4. If execution fails, use fix_sql with the error message and schema_context, then retry execute_sql.
5. Optionally use evaluate_query to check quality before execution.

WORKFLOW (multiple sub-sources — when the query contains a [USER RESTRICTION] listing more than one sub-source):
1. Repeat the single sub-source workflow for EACH sub-source listed in the USER RESTRICTION, one at a time.
2. If a sub-source returns no rows or an error, do NOT stop — proceed to the next sub-source.
3. After querying every listed sub-source, synthesize a final answer from all results found. Only report "no data found" if every sub-source was tried and returned nothing.

RULES:
- Use only SELECT queries.
- Pass schema output from get_schema into generate_sql as relevant_schema_details.
- For fix_sql and evaluate_query, pass schema as schema_context.
- CRITICAL — MULTI-SOURCE COVERAGE: If the query contains a [USER RESTRICTION] listing multiple sub-sources, run the full get_schema → generate_sql → execute_sql cycle for each sub-source independently. An empty result set or error from one sub-source is NOT a terminal condition — continue to the next sub-source in the list.

SELF-ROUTING MODE (when query contains [AVAILABLE SOURCES] instead of [USER RESTRICTION]):
- Read the [AVAILABLE SOURCES] list to see which SQL databases this agent has.
- Query the SQL database most relevant to the question.
- If it returns no rows, try any other SQL sources listed under "SQL sources available".
- Only report "no data found" after all available SQL sources have been tried.
"""
    skill_context = skill_config.prompt_context()
    if skill_context:
        base = base.rstrip() + "\n\n--- Skill (from SKILL.md) ---\n" + skill_context + "\n"
    if skill_config.agent_instructions:
        base = base.rstrip() + "\n\n--- Instructions ---\n" + skill_config.agent_instructions.strip() + "\n"
    return base


def create_sql_react_agent(
    skill_config: SkillConfig,
    mcp_tools: List[Any],
    llm: Any,
    db_type: str = "postgres",
    db_constraints: Optional[str] = None,
) -> Any:
    """
    Build a SQL ReAct agent from skill config and MCP tools (factory-style).

    Used by the skill runner factory: caller provides SkillConfig (from .md) and
    pre-created MCP tools; this returns the ReAct agent. In-code tools:
    generate_sql, fix_sql, evaluate_query; discovery/execute come from mcp_tools.
    """
    from langchain.agents import create_agent

    light_tools = create_light_sql_tools(llm, db_type=db_type, db_constraints=db_constraints)
    all_tools = light_tools + (mcp_tools or [])
    
    # Log tool details for debugging
    light_names = [getattr(t, 'name', '?') for t in light_tools]
    mcp_names = [getattr(t, 'name', '?') for t in (mcp_tools or [])]
    logger.info(
        "SQL Agent tools: skill=%r | light=%s | mcp=%s | total=%d",
        skill_config.name, light_names, mcp_names, len(all_tools)
    )
    
    if len(mcp_tools or []) == 0:
        logger.error(" NO MCP TOOLS! Agent won't be able to access database. Check MCP server availability.")
    
    system_prompt = _default_system_prompt(skill_config)
    return create_agent(
        model=llm,
        tools=all_tools,
        system_prompt=system_prompt,
    )
##

async def create_sql_react_agent_from_skill(
    skill_dir: Union[str, Path],
    llm: Any,
    mcp_config_resolver: Callable[[List[str]], Any],
    db_type: str = "MySQL",
    db_constraints: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Any:
    """
    Build a SQL ReAct agent from a skill directory and MCP configs.

    1. Reads skill_dir/SKILL.md for name, mcp_servers, agent_instructions.
    2. Resolves MCP configs via mcp_config_resolver(skill_config.mcp_servers).
    3. Creates in-code tools: generate_sql, fix_sql, evaluate_query.
    4. Creates MCP tools (discovery + execute) from resolved configs.
    5. Builds system prompt from template + agent_instructions from SKILL.md.
    6. Returns a ReAct agent (create_agent from langchain).

    Args:
        skill_dir: Path to skill directory containing SKILL.md (e.g. skills/query_sql).
        llm: LangChain-compatible LLM.
        mcp_config_resolver: Callable that takes list of MCP server names and returns
            list of MCP config dicts (name, transport, command/url, args, etc.).
        db_type: Database type for generate_sql/fix_sql prompts.
        db_constraints: Optional DB constraints string.
        request_id: Optional request id for MCP logging.

    Returns:
        ReAct agent (invoke with messages).
    """
    skill_config = load_skill_config(skill_dir)
    mcp_configs = skill_config.get_mcp_configs(mcp_config_resolver)
    if isinstance(mcp_configs, list) and mcp_configs and hasattr(mcp_configs[0], "model_dump"):
        mcp_configs = [c.model_dump() for c in mcp_configs]
    mcp_tools = await create_mcp_tools_async(mcp_configs or [], request_id=request_id)
    return create_sql_react_agent(
        skill_config=skill_config,
        mcp_tools=mcp_tools,
        llm=llm,
        db_type=db_type,
        db_constraints=db_constraints,
    )


class LightSQLReActAgent:
    """
    Light SQL ReAct agent: only generate_sql, fix_sql, evaluate_query in-code;
    discovery and execution come from MCP. Configuration is read from SKILL.md
    (mcp_servers, agent_instructions).
    """

    def __init__(
        self,
        skill_dir: Union[str, Path],
        llm: Any,
        mcp_config_resolver: Callable[[List[str]], Any],
        db_type: str = "postgres",
        db_constraints: Optional[str] = None,
    ):
        self.skill_dir = Path(skill_dir) if isinstance(skill_dir, str) else skill_dir
        self.llm = llm
        self.mcp_config_resolver = mcp_config_resolver
        self.db_type = db_type
        self.db_constraints = db_constraints
        self._agent: Optional[Any] = None
        self._skill_config: Optional[SkillConfig] = None

    @property
    def skill_config(self) -> SkillConfig:
        if self._skill_config is None:
            self._skill_config = load_skill_config(self.skill_dir)
        return self._skill_config

    async def _get_agent(self, request_id: Optional[str] = None) -> Any:
        if self._agent is None:
            self._agent = await create_sql_react_agent_from_skill(
                self.skill_dir,
                self.llm,
                self.mcp_config_resolver,
                db_type=self.db_type,
                db_constraints=self.db_constraints,
                request_id=request_id,
            )
        return self._agent

    async def invoke(self, user_question: str, request_id: Optional[str] = None) -> Dict[str, Any]:
        agent = await self._get_agent(request_id)
        return await agent.ainvoke({"messages": [("user", user_question)]})
