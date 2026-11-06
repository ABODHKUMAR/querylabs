"""
Executor / initializer: discover agents and skill files from .agents, then create skills per agent.

Supports two modes (backward-compatible):

OLD MODE (nested .md files):
  .agents/<agent>/query_sql/<skill>.md  — skill has mcp_servers hardcoded in frontmatter.

NEW POLICY MODE (Phase 2):
  .agents/<agent>/AGENT.md             — declares allowed_skills + allowed_mcp_servers.
  .skills/<skill>.md                   — generic skill with requires_mcp_type (no hardcoded URL).
  MCP binding resolved at runtime by matching requires_mcp_type to allowed_mcp_servers in registry.
  Agent-specific DB/collection context lives in AGENT.md agent_instructions and is merged with
  the generic skill instructions at runner creation time.

The policy mode is activated automatically when AGENT.md has allowed_skills field.
Old agents without allowed_skills continue to use the nested discovery path unchanged.
"""
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

from querylab_agent.mcp.config import load_mcp_registry_from_json, make_mcp_config_resolver
from querylab_agent.mcp.tools import create_mcp_tools_async
from querylab_agent.skills.discovery import (
    discover_agents_and_skill_files,
    discover_agents_and_skills,
    get_default_agents_root,
    get_skills_root,
    list_agents,
    list_skill_dirs_for_agent,
    list_skill_files_in_skill_dir,
)
from querylab_agent.skills.loader import SkillConfig, load_agent_instruction_file, load_skill_config
from querylab_agent.skills.runner_factory import get_skill_runner_factory

from querylab_agent.agents.agent_react import create_agent_runner as build_agent_level_react
from querylab_agent.agents.runtime_react import create_runtime_react_agent
from querylab_agent.a2a.registry import get_registry
from querylab_agent.a2a.messages import A2ARequest, A2AResponse, ResponseStatus

# Module-level dict tracking delegation registry failures — persists for process lifetime.
# Populated during initialize_skills_and_agents(); read by /ready endpoint.
_REGISTRY_FAILURES: Dict[str, str] = {}


def _format_result(out: Any) -> str:
    """Extract text from runner.ainvoke() result for use in A2AResponse."""
    if out is None:
        return "No response."
    if isinstance(out, str):
        return out
    if isinstance(out, dict):
        messages = out.get("messages") or out.get("output") or []
        if messages:
            last = messages[-1]
            if hasattr(last, "content"):
                return str(last.content) if last.content else "Done."
            if isinstance(last, (list, tuple)) and len(last) >= 2:
                return str(last[1]) if last[1] else "Done."
            if isinstance(last, dict) and "content" in last:
                return str(last["content"]) if last["content"] else "Done."
    return str(out)


class AgentDefinition:
    """
    One agent: name, skill files per type (.md paths), and loaded SkillConfig per file.

    policy_mode=True  → new decoupled path: skills come from .skills/, MCP binding injected.
    policy_mode=False → old nested path: skills nested inside agent dir (backward compat).
    """

    def __init__(
        self,
        agent_name: str,
        skill_files: Dict[str, List[Path]],
        skill_configs: Dict[str, List[SkillConfig]],
        base_path: Optional[Path] = None,
        allowed_skills: Optional[List[str]] = None,
        allowed_mcp_servers: Optional[List[str]] = None,
        policy_mode: bool = False,
    ):
        self.agent_name = agent_name
        self.skill_files = dict(skill_files)
        self.skill_configs = dict(skill_configs)
        self.base_path = base_path or get_default_agents_root()
        # Phase 2: policy-mode fields
        self.allowed_skills: List[str] = list(allowed_skills or [])
        self.allowed_mcp_servers: List[str] = list(allowed_mcp_servers or [])
        self.policy_mode: bool = policy_mode

    @property
    def skill_names(self) -> List[str]:
        """Skill names available for this agent.
        Policy mode: returns allowed_skills from AGENT.md.
        Legacy mode: returns skill-type dir names (e.g. ['query_sql', 'query_vector']).
        """
        if self.policy_mode and self.allowed_skills:
            return list(self.allowed_skills)
        return list(self.skill_files.keys())

    def get_skill_dir(self, skill_type: str) -> Optional[Path]:
        """Parent dir of the first .md file for this skill type (e.g. .agents/domain/query_sql)."""
        paths = self.skill_files.get(skill_type)
        if not paths:
            return None
        return paths[0].parent

    def get_skill_config(self, skill_type: str, index: int = 0) -> Optional[SkillConfig]:
        """First (or index-th) SkillConfig for this skill type."""
        configs = self.skill_configs.get(skill_type)
        if not configs or index < 0 or index >= len(configs):
            return None
        return configs[index]

    def get_skill_configs(self, skill_type: str) -> List[SkillConfig]:
        """All SkillConfigs for this skill type (one per .md file)."""
        return list(self.skill_configs.get(skill_type, []))

    def get_skill_file_paths(self, skill_type: str) -> List[Path]:
        """All .md file paths for this skill type."""
        return list(self.skill_files.get(skill_type, []))


def load_agent_definition(
    agent_name: str,
    base_path: Optional[Path] = None,
) -> Optional[AgentDefinition]:
    """
    Load one agent: find known skill-type dirs (query_sql, query_vector), load each .md file.

    Returns:
        AgentDefinition with skill_files and skill_configs (one config per .md), or None.
    """
    root = base_path if base_path is not None else get_default_agents_root()
    skill_dirs = list_skill_dirs_for_agent(agent_name, root)
    if not skill_dirs:
        return None

    skill_files: Dict[str, List[Path]] = {}
    skill_configs: Dict[str, List[SkillConfig]] = {}
    for skill_dir in skill_dirs:
        files = list_skill_files_in_skill_dir(skill_dir)
        if not files:
            continue
        skill_files[skill_dir.name] = files
        skill_configs[skill_dir.name] = [load_skill_config(p) for p in files]

    if not skill_files:
        return None
    return AgentDefinition(
        agent_name=agent_name,
        skill_files=skill_files,
        skill_configs=skill_configs,
        base_path=root,
    )


def build_agents_from_dot_agents(
    base_path: Optional[Path] = None,
) -> List[AgentDefinition]:
    """
    Discover all agents from .agents and return one AgentDefinition per agent.

    For each agent:
    - If AGENT.md has allowed_skills → policy mode (Phase 2 decoupled path).
    - Otherwise → old nested discovery (backward compat).

    Also discovers pure policy agents that have AGENT.md with allowed_skills but no nested
    skill dirs (i.e. they only appear via AGENT.md, not via discover_agents_and_skill_files).
    """
    root = base_path or get_default_agents_root()
    agents: List[AgentDefinition] = []
    seen_names: set = set()

    # 1. Walk all agent directories
    for agent_dir in sorted(root.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith("."):
            continue
        agent_name = agent_dir.name
        seen_names.add(agent_name)

        # Check for policy mode via AGENT.md
        instruction = load_agent_instruction_file(agent_dir)
        if instruction and instruction.allowed_skills:
            logger.info(
                "Agent %r: policy mode (allowed_skills=%r, allowed_mcp_servers=%r)",
                agent_name, instruction.allowed_skills, instruction.allowed_mcp_servers,
            )
            agents.append(AgentDefinition(
                agent_name=agent_name,
                skill_files={},
                skill_configs={},
                base_path=root,
                allowed_skills=instruction.allowed_skills,
                allowed_mcp_servers=instruction.allowed_mcp_servers,
                policy_mode=True,
            ))
            continue

        # Legacy mode: discover nested skill dirs
        skill_dirs = list_skill_dirs_for_agent(agent_name, root)
        if not skill_dirs:
            logger.debug("Agent %r: no skill dirs found, skipping", agent_name)
            continue
        skill_files: Dict[str, List[Path]] = {}
        skill_configs_map: Dict[str, List[SkillConfig]] = {}
        for skill_dir in skill_dirs:
            files = list_skill_files_in_skill_dir(skill_dir)
            if files:
                skill_files[skill_dir.name] = files
                skill_configs_map[skill_dir.name] = [load_skill_config(p) for p in files]
        if skill_files:
            logger.info("Agent %r: legacy mode (skill_types=%r)", agent_name, list(skill_files.keys()))
            agents.append(AgentDefinition(
                agent_name=agent_name,
                skill_files=skill_files,
                skill_configs=skill_configs_map,
                base_path=root,
                policy_mode=False,
            ))

    return agents


async def create_sql_react_agent_for_skill(
    skill_file_path: Path,
    llm: Any,
    mcp_config_resolver: Callable[[List[str]], Any],
    db_type: str = "postgres",
    db_constraints: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Any:
    """
    Create a SQL ReAct agent for one skill file (.md). Uses the skill runner factory
    (config from .md + MCP tools from that skill's MCP config).
    """
    config = load_skill_config(skill_file_path)
    factory = get_skill_runner_factory(config.skill_type or "query_sql") or get_skill_runner_factory("query_sql")
    if not factory:
        return None
    mcp_configs = config.get_mcp_configs(mcp_config_resolver)
    if isinstance(mcp_configs, list) and mcp_configs and hasattr(mcp_configs[0], "model_dump"):
        mcp_configs = [c.model_dump() for c in mcp_configs]
    mcp_tools = await create_mcp_tools_async(mcp_configs or [], request_id=request_id)
    return factory(config, mcp_tools, llm, db_type=db_type, db_constraints=db_constraints)


async def create_skill_runner(
    agent_def: AgentDefinition,
    skill_type: str,
    llm: Any,
    mcp_config_resolver: Callable[[List[str]], Any],
    skill_file_path: Optional[Path] = None,
    request_id: Optional[str] = None,
    **kwargs: Any,
) -> Any:
    """
    Create the runner for a skill from .md and its MCP tools via the skill runner factory.

    Resolves MCP config from the skill's .md (or name_resolver), creates MCP tools,
    then calls the registered factory for this skill_type (e.g. query_sql -> SQL ReAct).
    """
    paths = agent_def.get_skill_file_paths(skill_type)
    if not paths:
        logger.warning("No skill files for agent=%r skill_type=%r", agent_def.agent_name, skill_type)
        return None
    path = skill_file_path if skill_file_path is not None else paths[0]
    try:
        idx = next(i for i, p in enumerate(paths) if p.resolve() == path.resolve())
    except StopIteration:
        logger.warning("Skill file path %s not in list for agent=%r skill_type=%r", path, agent_def.agent_name, skill_type)
        return None
    config = agent_def.get_skill_config(skill_type, idx)
    if not config:
        logger.warning("No skill config for agent=%r skill_type=%r index=%d", agent_def.agent_name, skill_type, idx)
        return None
    logger.info("Skill config: name=%r skill_type=%r file=%s", config.name, config.skill_type or skill_type, path.name)
    st = (config.skill_type or skill_type).strip().lower() or skill_type.lower()
    factory = get_skill_runner_factory(st) or get_skill_runner_factory(skill_type)
    mcp_configs = config.get_mcp_configs(mcp_config_resolver)
    if isinstance(mcp_configs, list) and mcp_configs and hasattr(mcp_configs[0], "model_dump"):
        mcp_configs = [c.model_dump() for c in mcp_configs]
    mcp_tools = await create_mcp_tools_async(mcp_configs or [], request_id=request_id)
    logger.info("Creating runner: skill=%r MCP configs=%d MCP tools=%d", config.name, len(mcp_configs or []), len(mcp_tools))
    if factory:
        return factory(config, mcp_tools, llm, request_id=request_id, **kwargs)
    # No predefined factory: runtime ReAct with MCP tools + skill instructions
    if llm is None:
        logger.warning("No LLM provided; cannot create runtime ReAct for skill_type=%r", skill_type)
        return None
    logger.info("Using runtime ReAct for skill_type=%r", skill_type)
    return create_runtime_react_agent(config, mcp_tools, llm)


# ---------------------------------------------------------------------------
# Phase 2: Policy-mode helpers
# ---------------------------------------------------------------------------

def _resolve_mcp_for_skill(
    skill_config: SkillConfig,
    allowed_mcp_servers: List[str],
    mcp_registry: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Match a skill's requires_mcp_type to the agent's allowed_mcp_servers in the registry.

    E.g. skill requires_mcp_type="sql" + allowed_mcp_servers=["mysql_revenue", "weaviate_mcp"]
    → returns [mcp_registry["mysql_revenue"]] (only the sql-type server).

    Returns empty list when requires_mcp_type is None or "none".
    """
    requires_type = getattr(skill_config, "requires_mcp_type", None)
    if not requires_type or requires_type.strip().lower() == "none":
        return []
    matched = [
        mcp_registry[name]
        for name in allowed_mcp_servers
        if name in mcp_registry and mcp_registry[name].get("type") == requires_type
    ]
    logger.debug(
        "_resolve_mcp_for_skill: skill=%r requires_type=%r allowed=%r -> matched=%r",
        skill_config.name, requires_type, allowed_mcp_servers, [m.get("name") for m in matched],
    )
    return matched


def _build_merged_skill_config(
    generic_config: SkillConfig,
    agent_instruction_config: Optional[Any],
) -> SkillConfig:
    """
    Merge generic skill instructions (.skills/*.md) with agent-specific context (AGENT.md).

    The agent's agent_instructions are appended after the generic ones so they act as
    specialisation hints (table names, collection names, DB quirks, etc.).
    Returns a shallow copy of generic_config with merged agent_instructions.
    """
    import copy
    merged = copy.copy(generic_config)
    if agent_instruction_config and getattr(agent_instruction_config, "agent_instructions", None):
        generic_instr = generic_config.agent_instructions or ""
        agent_instr = agent_instruction_config.agent_instructions
        merged.agent_instructions = f"{generic_instr}\n\n{agent_instr}".strip()
    return merged


async def _create_policy_skill_runner(
    skill_name: str,
    skills_root: Path,
    agent_instruction_config: Optional[Any],
    allowed_mcp_servers: List[str],
    mcp_registry: Dict[str, Any],
    llm: Any,
    request_id: Optional[str] = None,
) -> Any:
    """
    Build a skill runner using the Phase 2 policy-mode path:
      1. Load generic SkillConfig from .skills/<skill_name>.md
      2. Merge with agent-specific instructions from AGENT.md
      3. Resolve MCP tools by matching requires_mcp_type to allowed_mcp_servers
      4. Call the registered skill runner factory with merged config + injected tools
    """
    skill_file = skills_root / f"{skill_name}.md"
    if not skill_file.exists():
        logger.warning("Policy skill file not found: %s (skill=%r)", skill_file, skill_name)
        return None

    generic_config = load_skill_config(skill_file)
    merged_config = _build_merged_skill_config(generic_config, agent_instruction_config)
    mcp_configs = _resolve_mcp_for_skill(merged_config, allowed_mcp_servers, mcp_registry)
    mcp_tools = await create_mcp_tools_async(mcp_configs, request_id=request_id)

    logger.info(
        "Policy runner: skill=%r mcp_type=%r servers_matched=%d tools=%d",
        skill_name,
        getattr(merged_config, "requires_mcp_type", None),
        len(mcp_configs),
        len(mcp_tools),
    )

    # Try skill_name first (e.g. "query_sql"), then skill_type from config
    factory = (
        get_skill_runner_factory(skill_name)
        or get_skill_runner_factory(generic_config.skill_type or "")
    )
    agent_name = agent_instruction_config.name if agent_instruction_config else None
    if factory:
        return factory(merged_config, mcp_tools, llm, agent_name=agent_name)

    # Fallback: runtime ReAct with MCP tools + merged instructions
    logger.info("No registered factory for skill=%r, using runtime ReAct", skill_name)
    return create_runtime_react_agent(merged_config, mcp_tools, llm)


# ---------------------------------------------------------------------------

def initialize_skills_and_agents(
    agents_base_path: Optional[Union[str, Path]] = None,
    mcp_registry_path: Optional[Union[str, Path]] = None,
    mcp_registry_dict: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    llm: Optional[Any] = None,
) -> "SkillsAndAgentsRuntime":
    """
    Initialise skills/tools/agents based on what is present under .agents, and optionally
    load MCP server config from JSON so that tools from MCP are available when a skill
    mentions mcp_servers in its .md.

    Args:
        agents_base_path: Path to .agents root. If None, uses default (next to querylab_agent package).
        mcp_registry_path: Path to a JSON file containing MCP server configs (list or dict keyed by name).
        mcp_registry_dict: Alternatively, pass the registry as a dict/list directly.
        llm: Optional LLM instance for creating runners (e.g. SQL ReAct agent). Can be set later.

    Returns:
        SkillsAndAgentsRuntime with .agents, .mcp_registry, .mcp_config_resolver, .llm, and .get_runner().
    """
    base = Path(agents_base_path) if agents_base_path is not None else get_default_agents_root()
    if mcp_registry_path is not None:
        mcp_registry = load_mcp_registry_from_json(mcp_registry_path)
        logger.info("Loaded MCP registry from %s (%d servers)", mcp_registry_path, len(mcp_registry))
    elif mcp_registry_dict is not None:
        mcp_registry = load_mcp_registry_from_json(mcp_registry_dict)
        logger.info("Loaded MCP registry from dict (%d servers)", len(mcp_registry))
    else:
        mcp_registry = {}
        logger.debug("No MCP registry provided")
    mcp_resolver = make_mcp_config_resolver(mcp_registry)
    agents_list = build_agents_from_dot_agents(base)
    logger.info("Built %d agent(s) from %s: %s", len(agents_list), base, [a.agent_name for a in agents_list])
    runtime = SkillsAndAgentsRuntime(
        agents=agents_list,
        agents_base_path=base,
        mcp_registry=mcp_registry,
        mcp_config_resolver=mcp_resolver,
        llm=llm,
    )

    # Register each master agent as a callable in the global AgentRegistry.
    # Handlers are async and lazily build the runner on each invocation (no delegation
    # tool injected — depth guard prevents circular A2A loops).
    global _REGISTRY_FAILURES
    _REGISTRY_FAILURES.clear()
    reg = get_registry()
    for agent_def in runtime.agents:
        _name = agent_def.agent_name
        try:
            async def _handler(
                request: A2ARequest,
                _n: str = _name,
                _rt: "SkillsAndAgentsRuntime" = runtime,
            ) -> A2AResponse:
                runner = await _rt.get_agent_runner(_n)
                if runner is None:
                    return A2AResponse(
                        task_id=request.task_id,
                        status=ResponseStatus.FAILED,
                        error=f"Runner unavailable for agent '{_n}'",
                    )
                out = await runner.ainvoke({"messages": [("user", request.task)]})
                return A2AResponse(
                    task_id=request.task_id,
                    status=ResponseStatus.SUCCESS,
                    result=_format_result(out),
                )

            reg.register(_name, _handler, overwrite=True)
            logger.info("Registered %s in agent registry", _name)
        except Exception as exc:
            _REGISTRY_FAILURES[_name] = str(exc)
            logger.warning("Failed to register %s in agent registry: %s", _name, exc)

    total = len(runtime.agents)
    failed = len(_REGISTRY_FAILURES)
    logger.info("Delegation registry: %d/%d agents registered", total - failed, total)
    if _REGISTRY_FAILURES:
        logger.warning("Agents unavailable for delegation: %s", list(_REGISTRY_FAILURES.keys()))

    return runtime


class SkillsAndAgentsRuntime:
    """
    Runtime after initialisation: discovered agents and optional MCP registry (from JSON).
    Use .get_runner(agent_name, skill_type, ...) to create the skill/tool/agent for a given
    skill; MCP tools are attached when the skill's .md mentions mcp_servers and those names
    exist in the registry.
    """

    def __init__(
        self,
        agents: List[AgentDefinition],
        agents_base_path: Path,
        mcp_registry: Dict[str, Dict[str, Any]],
        mcp_config_resolver: Callable[[List[str]], List[Dict[str, Any]]],
        llm: Optional[Any] = None,
    ):
        self.agents = list(agents)
        self.agents_base_path = agents_base_path
        self.mcp_registry = dict(mcp_registry)
        self.mcp_config_resolver = mcp_config_resolver
        self.llm = llm
        self._agent_by_name: Dict[str, AgentDefinition] = {a.agent_name: a for a in agents}

    def list_agent_names(self) -> List[str]:
        """Agent names that are present (discovered from .agents)."""
        return [a.agent_name for a in self.agents]

    def get_agent(self, agent_name: str) -> Optional[AgentDefinition]:
        """Get AgentDefinition by name."""
        return self._agent_by_name.get(agent_name)

    def list_skill_types(self, agent_name: str) -> List[str]:
        """Skill types present for this agent (e.g. query_sql, query_vector)."""
        agent = self.get_agent(agent_name)
        return list(agent.skill_names) if agent else []

    def list_skill_files(self, agent_name: str, skill_type: str) -> List[Path]:
        """Skill file paths (.md) for this agent and skill type."""
        agent = self.get_agent(agent_name)
        if not agent:
            return []
        return agent.get_skill_file_paths(skill_type)

    async def get_agent_runner(
        self,
        agent_name: str,
        llm: Optional[Any] = None,
        request_id: Optional[str] = None,
    ) -> Any:
        """
        Create and return the agent-level ReAct runner (skills as tools) for the given agent.

        Policy mode (Phase 2): loads generic skills from .skills/, merges agent instructions,
        resolves MCP by type from allowed_mcp_servers.
        Legacy mode: uses nested .md skill files as before.

        Returns:
            ReAct agent whose tools are the skill runners, or None if no LLM or no skills.
        """
        agent = self.get_agent(agent_name)
        if not agent:
            return None
        model = llm if llm is not None else self.llm
        if model is None:
            return None
        skill_names = list(agent.skill_names)
        if not skill_names:
            return None

        agent_instruction_config = load_agent_instruction_file(self.agents_base_path / agent_name)
        skill_runners: List[Any] = []
        skill_descriptions: List[str] = []

        # ---- Phase 2: policy-mode path ----
        if agent.policy_mode:
            skills_root = get_skills_root(self.agents_base_path)
            for skill_name in skill_names:
                runner = await _create_policy_skill_runner(
                    skill_name=skill_name,
                    skills_root=skills_root,
                    agent_instruction_config=agent_instruction_config,
                    allowed_mcp_servers=agent.allowed_mcp_servers,
                    mcp_registry=self.mcp_registry,
                    llm=model,
                    request_id=request_id,
                )
                skill_file = skills_root / f"{skill_name}.md"
                cfg = load_skill_config(skill_file) if skill_file.exists() else None
                desc = (cfg.description or "") if cfg else f"Run {skill_name} skill."
                skill_runners.append(runner)
                skill_descriptions.append(desc[:200])

        # ---- Legacy path (unchanged) ----
        else:
            for skill_type in skill_names:
                runner = await create_skill_runner(
                    agent_def=agent,
                    skill_type=skill_type,
                    llm=model,
                    mcp_config_resolver=self.mcp_config_resolver,
                    skill_file_path=None,
                    request_id=request_id,
                )
                config = agent.get_skill_config(skill_type)
                desc = (config.description or (config.prompt_context() if config else "")) if config else ""
                skill_runners.append(runner)
                skill_descriptions.append(desc[:200] if desc else f"Run {skill_type}.")

        if not any(skill_runners):
            logger.warning("No skill runners created for agent %r", agent_name)
            return None
        return await build_agent_level_react(
            agent_name=agent_name,
            agent_def=agent,
            skill_runners=skill_runners,
            skill_descriptions=skill_descriptions,
            llm=model,
            agent_instruction_config=agent_instruction_config,
        )

    async def get_runner(
        self,
        agent_name: str,
        skill_type: str,
        skill_file_path: Optional[Union[str, Path]] = None,
        llm: Optional[Any] = None,
        request_id: Optional[str] = None,
    ) -> Any:
        """
        Create and return the runner (skill/tool/agent) for the given agent and skill type.

        Policy mode (Phase 2): loads generic skill from .skills/, merges agent instructions,
        resolves MCP by type from allowed_mcp_servers in registry.
        Legacy mode: uses nested .md skill files (backward compat).

        Args:
            agent_name: Agent name (must be present).
            skill_type: e.g. query_sql, query_vector.
            skill_file_path: Optional specific .md file (legacy only).
            llm: Override runtime LLM for this call.
            request_id: Optional request id for MCP logging.

        Returns:
            The runner (e.g. ReAct agent for query_sql), or None if not available.
        """
        agent = self.get_agent(agent_name)
        if not agent:
            return None
        model = llm if llm is not None else self.llm
        if model is None:
            return None

        # ---- Phase 2: policy-mode path ----
        if agent.policy_mode:
            if skill_type not in agent.allowed_skills:
                logger.warning(
                    "get_runner: skill_type=%r not in allowed_skills=%r for agent=%r",
                    skill_type, agent.allowed_skills, agent_name,
                )
                return None
            agent_instruction_config = load_agent_instruction_file(self.agents_base_path / agent_name)
            skills_root = get_skills_root(self.agents_base_path)
            return await _create_policy_skill_runner(
                skill_name=skill_type,
                skills_root=skills_root,
                agent_instruction_config=agent_instruction_config,
                allowed_mcp_servers=agent.allowed_mcp_servers,
                mcp_registry=self.mcp_registry,
                llm=model,
                request_id=request_id,
            )

        # ---- Legacy path (unchanged) ----
        path = Path(skill_file_path) if skill_file_path is not None else None
        return await create_skill_runner(
            agent_def=agent,
            skill_type=skill_type,
            llm=model,
            mcp_config_resolver=self.mcp_config_resolver,
            skill_file_path=path,
            request_id=request_id,
        )
