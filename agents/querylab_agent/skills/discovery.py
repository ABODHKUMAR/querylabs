"""
Agent and skill discovery from the default .agents directory.

Layout (default location):
  .agents/
    <agent_name>/              e.g. domain, sales, hr (each top-level dir = one agent)
      AGENT.md                 optional agent instruction file (planning; no MCP required)
      <skill_type_dir>/        predefined: query_sql, query_vector; or any subdir with at least one .md
        *.md                   any .md file = one skill instance (each with its own MCP)

Predefined skill-type dirs: query_sql, query_vector. Any other subdir that contains at least
one .md file is also treated as a skill type (skill_type = dir name) and gets a runtime ReAct runner.
"""
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Default root for agent definitions: .agents under the agents package/project root.
_DEFAULT_AGENTS_ROOT_NAME = ".agents"

# Known skill-type directory names under each agent. Only these dirs are considered as skills.
SKILL_DIR_QUERY_SQL = "query_sql"
SKILL_DIR_QUERY_VECTOR = "query_vector"
KNOWN_SKILL_DIR_NAMES: Tuple[str, ...] = (SKILL_DIR_QUERY_SQL, SKILL_DIR_QUERY_VECTOR)

# Agent-level instruction file (planning; no MCP required). Same format as SKILL.md.
AGENT_INSTRUCTION_FILENAME = "AGENT.md"


def get_default_agents_root(reference_path: Optional[Path] = None) -> Path:
    """
    Return the default .agents root path.

    - If reference_path is given and has a parent containing .agents, use that.
    - Else if running under agents/ (e.g. agents/querylab_agent/...), use agents/.agents.
    - Else use cwd/.agents.
    """
    if reference_path is not None:
        ref = Path(reference_path).resolve()
        # Walk up to find a directory that contains .agents
        for parent in [ref] + list(ref.parents):
            agents_dir = parent / _DEFAULT_AGENTS_ROOT_NAME
            if agents_dir.is_dir():
                return agents_dir
    # Default: .agents next to the querylab_agent package (e.g. agents/.agents)
    try:
        import querylab_agent
        pkg = Path(querylab_agent.__file__).resolve().parent
        return pkg.parent / _DEFAULT_AGENTS_ROOT_NAME
    except Exception:
        pass
    return Path.cwd() / _DEFAULT_AGENTS_ROOT_NAME


def list_agents(base_path: Optional[Path] = None) -> List[str]:
    """
    List agent names: top-level directories under .agents that are dirs.

    Returns:
        List of agent names (e.g. ["domain", "sales"]).
    """
    root = base_path if base_path is not None else get_default_agents_root()
    if not root.is_dir():
        return []
    return [p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")]


def list_skill_dirs_for_agent(
    agent_name: str,
    base_path: Optional[Path] = None,
) -> List[Path]:
    """
    List skill-type directories for an agent. Includes:
    - Predefined: query_sql, query_vector (if present).
    - Any other subdir that contains at least one .md file (skill_type = dir name; runtime ReAct).

    Returns:
        List of paths to skill-type dirs (e.g. [.agents/domain/query_sql, .agents/domain/query_vector, .agents/domain/my_skill]).
    """
    root = base_path if base_path is not None else get_default_agents_root()
    agent_dir = root / agent_name
    if not agent_dir.is_dir():
        return []
    skill_dirs = []
    for p in agent_dir.iterdir():
        if not p.is_dir() or p.name.startswith("."):
            continue
        if p.name in KNOWN_SKILL_DIR_NAMES:
            skill_dirs.append(p)
        else:
            # Any subdir with at least one .md is a skill type (runtime ReAct)
            if list_skill_files_in_skill_dir(p):
                skill_dirs.append(p)
    return sorted(skill_dirs, key=lambda x: x.name)


def get_agent_instruction_path(agent_name: str, base_path: Optional[Path] = None) -> Optional[Path]:
    """
    Path to the agent instruction file (AGENT.md) for this agent, if it exists.

    Returns:
        Path to .agents/<agent_name>/AGENT.md, or None if not present.
    """
    root = base_path if base_path is not None else get_default_agents_root()
    agent_dir = root / agent_name
    if not agent_dir.is_dir():
        return None
    path = agent_dir / AGENT_INSTRUCTION_FILENAME
    return path if path.is_file() else None


def list_skill_files_in_skill_dir(skill_dir_path: Path) -> List[Path]:
    """
    List all .md files in a skill-type dir. Each .md file is one skill instance (e.g. one SQL skill
    with its own MCP). Multiple .md files = multiple skills of that type for the agent.

    Returns:
        List of paths to .md files (sorted by name).
    """
    if not skill_dir_path.is_dir():
        return []
    return sorted(
        [p for p in skill_dir_path.iterdir() if p.is_file() and p.suffix.lower() == ".md"],
        key=lambda x: x.name,
    )


def discover_agents_and_skills(
    base_path: Optional[Path] = None,
) -> List[Tuple[str, List[Path]]]:
    """
    Discover all agents and their skill-type dirs (query_sql, query_vector only).

    Returns:
        List of (agent_name, [skill_dir_path, ...]) for each agent that has at least one
        known skill-type dir. Each skill_dir_path is e.g. .agents/domain/query_sql.
    """
    root = base_path if base_path is not None else get_default_agents_root()
    result = []
    for agent_name in list_agents(root):
        skill_dirs = list_skill_dirs_for_agent(agent_name, root)
        if skill_dirs:
            result.append((agent_name, skill_dirs))
    return result


def get_skills_root(agents_base_path: Path) -> Path:
    """
    Return the .skills/ directory that is a sibling of .agents/.
    E.g. if agents_base_path is /project/agents/.agents, returns /project/agents/.skills.
    Does not require the directory to exist.
    """
    return agents_base_path.parent / ".skills"


def list_skills_from_skills_root(skills_root: Path) -> List[Path]:
    """
    List all .md files in the flat .skills/ shared skill library.
    Each .md file is one generic skill (e.g. query_sql.md, query_vector.md).
    Returns sorted list of .md file paths, or empty list if directory does not exist.
    """
    if not skills_root.exists() or not skills_root.is_dir():
        return []
    return sorted(
        [p for p in skills_root.iterdir() if p.is_file() and p.suffix.lower() == ".md"],
        key=lambda x: x.name,
    )


def discover_agents_and_skill_files(
    base_path: Optional[Path] = None,
) -> List[Tuple[str, Dict[str, List[Path]]]]:
    """
    Discover all agents and, per agent, all skill files (.md) per skill type.

    Returns:
        List of (agent_name, {skill_type: [path_to_md, ...], ...}) for each agent that has
        at least one .md file in a known skill-type dir. E.g. ("domain", {"query_sql": [path1, path2], "query_vector": [path1]}).
    """
    root = base_path if base_path is not None else get_default_agents_root()
    result = []
    for agent_name in list_agents(root):
        skill_dirs = list_skill_dirs_for_agent(agent_name, root)
        if not skill_dirs:
            continue
        by_type: Dict[str, List[Path]] = {}
        for skill_dir in skill_dirs:
            files = list_skill_files_in_skill_dir(skill_dir)
            if files:
                by_type[skill_dir.name] = files
        if by_type:
            result.append((agent_name, by_type))
    return result
