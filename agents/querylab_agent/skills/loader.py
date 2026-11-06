"""
Load skill configuration from SKILL.md (full document).

Parses:
- Frontmatter: name, description, skill_type, mcp_servers, agent_instructions
- Body sections: Purpose, When to use, Inputs, Outputs, Agent instructions

All of these are exposed on SkillConfig and can drive prompts, routing, and validation.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import re

from querylab_agent.skills.discovery import AGENT_INSTRUCTION_FILENAME

# Optional: use PyYAML if available for full frontmatter
try:
    import yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False

# Section headers we parse from the body (case-insensitive match)
_BODY_SECTIONS = ("Purpose", "When to use", "Inputs", "Outputs", "Agent instructions")


class AgentInstructionConfig:
    """
    Agent-level instruction config from AGENT.md (same format as SKILL.md but MCP not required).
    Used as system prompt / planning context for the main agent ReAct.
    """

    def __init__(
        self,
        name: str,
        description: str = "",
        purpose: Optional[str] = None,
        when_to_use: Optional[str] = None,
        agent_instructions: Optional[str] = None,
        allowed_skills: Optional[List[str]] = None,
        allowed_mcp_servers: Optional[List[str]] = None,
    ):
        self.name = name
        self.description = description or ""
        self.purpose = (purpose or "").strip() or None
        self.when_to_use = (when_to_use or "").strip() or None
        self.agent_instructions = (agent_instructions or "").strip() or None
        # Phase 2: policy-mode fields — agent declares which generic skills it uses
        # and which MCP servers it is allowed to connect to.
        self.allowed_skills: List[str] = list(allowed_skills or [])
        self.allowed_mcp_servers: List[str] = list(allowed_mcp_servers or [])

    def system_prompt(self) -> str:
        """Build system prompt for the agent-level ReAct from description, purpose, when_to_use, agent_instructions."""
        parts = []
        if self.description:
            parts.append(self.description)
        if self.purpose:
            parts.append(f"Purpose: {self.purpose}")
        if self.when_to_use:
            parts.append(f"When to use: {self.when_to_use}")
        if self.agent_instructions:
            parts.append(f"Agent instructions: {self.agent_instructions}")
        return "\n\n".join(parts) if parts else ""


class SkillConfig:
    """
    Full configuration loaded from a skill's .md file.

    Frontmatter: name, description, skill_type, mcp_servers (names or full config), agent_instructions.
    Body sections: Purpose, When to use, Inputs, Outputs, Agent instructions, MCP servers (optional).
    User can add MCP server details in the skill file only (no separate JSON): use mcp_servers as
    a list of config objects in frontmatter, or a ## MCP servers section with YAML/JSON block.
    """

    def __init__(
        self,
        name: str,
        description: str = "",
        skill_type: Optional[str] = None,
        mcp_servers: Optional[List[str]] = None,
        mcp_servers_config: Optional[List[Dict[str, Any]]] = None,
        agent_instructions: Optional[str] = None,
        purpose: Optional[str] = None,
        when_to_use: Optional[str] = None,
        inputs_summary: Optional[str] = None,
        outputs_summary: Optional[str] = None,
        skill_dir: Optional[Path] = None,
        raw_frontmatter: Optional[Dict[str, Any]] = None,
        raw_body: Optional[str] = None,
        requires_mcp_type: Optional[str] = None,
    ):
        self.name = name
        self.description = description or ""
        self.skill_type = (skill_type or "").strip() or None
        self.mcp_servers = list(mcp_servers) if mcp_servers else []
        self.mcp_servers_config = list(mcp_servers_config) if mcp_servers_config else None
        self.agent_instructions = (agent_instructions or "").strip() or None
        self.purpose = (purpose or "").strip() or None
        self.when_to_use = (when_to_use or "").strip() or None
        self.inputs_summary = (inputs_summary or "").strip() or None
        self.outputs_summary = (outputs_summary or "").strip() or None
        self.skill_dir = skill_dir
        self.raw_frontmatter = raw_frontmatter or {}
        self.raw_body = raw_body or ""
        # Phase 1: generic skills declare what MCP type they need (e.g. "sql", "vector")
        # Agents bind specific MCP servers at runtime by matching this type to the registry.
        self.requires_mcp_type: Optional[str] = (requires_mcp_type or "").strip() or None

    def __repr__(self) -> str:
        return f"SkillConfig(name={self.name!r}, skill_type={self.skill_type!r}, requires_mcp_type={self.requires_mcp_type!r}, mcp_servers={self.mcp_servers})"

    def get_mcp_configs(self, name_resolver: Optional[Any] = None) -> List[Dict[str, Any]]:
        """
        Return list of MCP server config dicts for this skill.
        If the user added mcp-server details in the .md (mcp_servers_config), use that;
        else resolve mcp_servers names via name_resolver (e.g. from external JSON).
        """
        if self.mcp_servers_config:
            return [dict(c) for c in self.mcp_servers_config]
        if name_resolver and self.mcp_servers:
            return name_resolver(self.mcp_servers)
        return []

    def prompt_context(self) -> str:
        """
        Build a single block for the agent system prompt from description, purpose, when_to_use.
        Use this so the agent sees the full skill concept.
        """
        parts = []
        if self.description:
            parts.append(f"Description: {self.description}")
        if self.purpose:
            parts.append(f"Purpose: {self.purpose}")
        if self.when_to_use:
            parts.append(f"When to use: {self.when_to_use}")
        return "\n".join(parts) if parts else ""


def _parse_frontmatter(content: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """Extract YAML frontmatter between --- and ---. Returns (frontmatter_dict, rest_of_content)."""
    if not content.strip().startswith("---"):
        return None, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None, content
    fm_text = parts[1].strip()
    body = parts[2].strip()
    if _HAS_YAML:
        try:
            fm = yaml.safe_load(fm_text)
            return (fm if isinstance(fm, dict) else {}), body
        except Exception:
            pass
    # Fallback: minimal parsing for common keys
    fm = {}
    for line in fm_text.splitlines():
        m = re.match(r"^(\w+):\s*(.+)$", line.strip())
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val.startswith("[") and val.endswith("]"):
                fm[key] = [x.strip().strip('"\'') for x in val[1:-1].split(",")]
            elif val.startswith('"') or val.startswith("'"):
                fm[key] = val[1:-1].replace("\\n", "\n")
            else:
                fm[key] = val
    return fm, body


def _extract_section(body: str, section_title: str) -> Optional[str]:
    """Extract content of a ## Section title from body (up to next ## or end)."""
    # Match ## Title or ## Title (optional suffix) - allow flexible spacing and case
    escaped = re.escape(section_title)
    pattern = rf"^##\s+{escaped}(?:\s+\([^)]*\))?\s*$(.*?)(?=^##\s|\Z)"
    m = re.search(pattern, body, re.MULTILINE | re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None


def _parse_body_sections(body: str) -> Dict[str, Optional[str]]:
    """Parse standard sections from SKILL.md body."""
    return {
        "purpose": _extract_section(body, "Purpose"),
        "when_to_use": _extract_section(body, "When to use"),
        "inputs_summary": _extract_section(body, "Inputs"),
        "outputs_summary": _extract_section(body, "Outputs"),
        "agent_instructions": _extract_section(body, "Agent instructions"),
        "mcp_servers": _extract_section(body, "MCP servers"),
    }


def _parse_mcp_servers_from_section(section_content: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    """Parse ## MCP servers section: YAML or JSON block. Returns list of server config dicts or None."""
    if not section_content or not section_content.strip():
        return None
    text = section_content.strip()
    # Try to find a fenced code block (```yaml, ```json, ```)
    code_match = re.search(r"^```(?:yaml|yml|json)?\s*\n(.*?)```", text, re.DOTALL)
    if code_match:
        text = code_match.group(1).strip()
    if _HAS_YAML:
        try:
            data = yaml.safe_load(text)
            if isinstance(data, list):
                return [c for c in data if isinstance(c, dict) and (c.get("name") or c.get("server_name"))]
            if isinstance(data, dict):
                return [{**v, "name": v.get("name", k)} for k, v in data.items() if isinstance(v, dict)]
        except Exception:
            pass
    try:
        import json
        data = json.loads(text)
        if isinstance(data, list):
            return [c for c in data if isinstance(c, dict) and (c.get("name") or c.get("server_name"))]
        if isinstance(data, dict):
            return [{**v, "name": v.get("name", k)} for k, v in data.items() if isinstance(v, dict)]
    except Exception:
        pass
    return None


def _normalize_mcp_servers_from_frontmatter(raw: Any) -> Tuple[List[str], Optional[List[Dict[str, Any]]]]:
    """
    Parse mcp_servers from frontmatter. Can be list of names (strings) or list of config objects.
    Returns (names_list, config_list or None). If config_list is set, names are derived from configs.
    """
    if not raw:
        return [], None
    if isinstance(raw, list):
        names: List[str] = []
        configs: List[Dict[str, Any]] = []
        for item in raw:
            if isinstance(item, str):
                name = item.strip()
                if name and not name.startswith("#"):
                    names.append(name)
            elif isinstance(item, dict):
                n = item.get("name") or item.get("server_name")
                if n:
                    configs.append({**item, "name": str(n)})
                    names.append(str(n))
        if configs:
            return names, configs
        return names, None
    if isinstance(raw, dict):
        configs = [{**v, "name": v.get("name", k)} for k, v in raw.items() if isinstance(v, dict)]
        names = [c["name"] for c in configs]
        return names, configs if configs else None
    return [], None


def load_skill_config(skill_dir: str | Path) -> SkillConfig:
    """
    Load skill configuration from skill_dir/SKILL.md.

    Expects SKILL.md with optional frontmatter:
      ---
      name: query_sql
      description: ...
      mcp_servers:
        - postgres_sales
        - snowflake_analytics
      agent_instructions: |
        Use only tables from the sales schema.
      ---

    Also supports ## Agent instructions in the body as fallback.

    Returns:
        SkillConfig with name, description, mcp_servers, agent_instructions.
    """
    path = Path(skill_dir) if isinstance(skill_dir, str) else skill_dir
    if path.is_file():
        skill_path = path
        skill_dir = path.parent
    else:
        skill_path = path / "SKILL.md"
        skill_dir = path

    if not skill_path.exists():
        return SkillConfig(name=path.name, skill_dir=skill_dir)

    content = skill_path.read_text(encoding="utf-8")
    frontmatter, body = _parse_frontmatter(content)
    body_sections = _parse_body_sections(body)

    name = path.name
    description = ""
    skill_type: Optional[str] = None
    mcp_servers: List[str] = []
    agent_instructions: Optional[str] = None
    requires_mcp_type: Optional[str] = None

    if frontmatter:
        name = frontmatter.get("name", name)
        description = frontmatter.get("description", "") or ""
        skill_type = frontmatter.get("skill_type") or None
        if isinstance(skill_type, str):
            skill_type = skill_type.strip() or None
        raw_servers = frontmatter.get("mcp_servers")
        mcp_servers, mcp_servers_config = _normalize_mcp_servers_from_frontmatter(raw_servers)
        if not mcp_servers_config and raw_servers and isinstance(raw_servers, str):
            mcp_servers = [s.strip() for s in raw_servers.split(",") if s.strip()]
        # Phase 1: generic skills declare required MCP type instead of hardcoding a server
        requires_mcp_type = frontmatter.get("requires_mcp_type") or None
        if isinstance(requires_mcp_type, str):
            requires_mcp_type = requires_mcp_type.strip() or None
    else:
        mcp_servers_config = None

    if frontmatter:
        agent_instructions = frontmatter.get("agent_instructions") or None
        if isinstance(agent_instructions, str):
            agent_instructions = agent_instructions.strip() or None

    if not agent_instructions and body_sections.get("agent_instructions"):
        agent_instructions = body_sections["agent_instructions"]

    # If skill_type not in frontmatter, infer from dir name (e.g. query_sql -> sql)
    if not skill_type and path.name.startswith("query_"):
        skill_type = path.name.replace("query_", "", 1)

    # Optional: ## MCP servers in body (YAML/JSON block) – user adds mcp-server details in .md
    mcp_from_body = _parse_mcp_servers_from_section(body_sections.get("mcp_servers"))
    if mcp_from_body:
        mcp_servers_config = mcp_from_body
        mcp_servers = [c.get("name", "") for c in mcp_from_body if c.get("name")]

    return SkillConfig(
        name=name,
        description=description,
        skill_type=skill_type,
        mcp_servers=mcp_servers,
        mcp_servers_config=mcp_servers_config,
        agent_instructions=agent_instructions,
        purpose=body_sections.get("purpose"),
        when_to_use=body_sections.get("when_to_use"),
        inputs_summary=body_sections.get("inputs_summary"),
        outputs_summary=body_sections.get("outputs_summary"),
        skill_dir=skill_dir,
        raw_frontmatter=frontmatter or {},
        raw_body=body,
        requires_mcp_type=requires_mcp_type,
    )


def load_agent_instruction_file(agent_dir_path: str | Path) -> Optional[AgentInstructionConfig]:
    """
    Load agent-level instruction config from agent_dir/AGENT.md.

    Same format as SKILL.md (frontmatter + body sections Purpose, When to use, Agent instructions).
    MCP servers are not required; this file is for agent-level planning only.

    Returns None if AGENT.md does not exist.
    """
    path = Path(agent_dir_path) if isinstance(agent_dir_path, str) else agent_dir_path
    if path.is_file():
        instruction_path = path
    else:
        instruction_path = path / AGENT_INSTRUCTION_FILENAME
    if not instruction_path.exists():
        return None
    content = instruction_path.read_text(encoding="utf-8")
    frontmatter, body = _parse_frontmatter(content)
    body_sections = _parse_body_sections(body)
    name = path.name if path.is_dir() else path.parent.name
    description = ""
    purpose = body_sections.get("purpose")
    when_to_use = body_sections.get("when_to_use")
    agent_instructions = body_sections.get("agent_instructions")
    if frontmatter:
        name = frontmatter.get("name", name)
        description = (frontmatter.get("description") or "") or ""
        if frontmatter.get("purpose"):
            purpose = frontmatter.get("purpose") or purpose
        if frontmatter.get("when_to_use"):
            when_to_use = frontmatter.get("when_to_use") or when_to_use
        if frontmatter.get("agent_instructions"):
            agent_instructions = frontmatter.get("agent_instructions") or agent_instructions
    # Phase 2: parse policy-mode fields
    allowed_skills: List[str] = []
    allowed_mcp_servers: List[str] = []
    if frontmatter:
        raw_skills = frontmatter.get("allowed_skills") or []
        raw_mcps = frontmatter.get("allowed_mcp_servers") or []
        if isinstance(raw_skills, str):
            raw_skills = [s.strip() for s in raw_skills.split(",") if s.strip()]
        if isinstance(raw_mcps, str):
            raw_mcps = [s.strip() for s in raw_mcps.split(",") if s.strip()]
        allowed_skills = [str(s) for s in raw_skills if s]
        allowed_mcp_servers = [str(s) for s in raw_mcps if s]

    return AgentInstructionConfig(
        name=name,
        description=description,
        purpose=purpose,
        when_to_use=when_to_use,
        agent_instructions=agent_instructions,
        allowed_skills=allowed_skills,
        allowed_mcp_servers=allowed_mcp_servers,
    )
