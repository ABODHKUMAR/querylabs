"""
A2A protocol discovery: build AgentCard(s) from .agents file-based discovery.

Supports both legacy (nested .md) and policy-mode (Phase 2) agents:
- Legacy: skills derived from nested skill-type dirs (query_sql/*.md, query_vector/*.md).
- Policy: skills derived from AGENT.md allowed_skills + .skills/ shared library.

AgentCard extra fields (allowed_skills, allowed_mcp_servers) are returned alongside
the standard A2A fields so the orchestrator can build its AGENT_REGISTRY.

Performance env keys:
  AGENT_DISCOVERY_TTL   seconds to cache agent card discovery results (default 300)
"""
import os
import threading
import time as _time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from querylab_agent.skills.discovery import discover_agents_and_skill_files, get_skills_root
from querylab_agent.skills.loader import SkillConfig, load_skill_config

# ── Agent discovery TTL cache (Step 9) ────────────────────────────────────────
_DISCOVERY_CACHE_TTL = int(os.getenv("AGENT_DISCOVERY_TTL", "300"))
_discovery_cache: Dict[Tuple[str, str], Tuple[List[Dict], float]] = {}
_discovery_lock = threading.Lock()


def _default_capabilities():
    """Return a minimal AgentCapabilities for our agents."""
    from a2a.types import AgentCapabilities
    return AgentCapabilities()


def _skill_config_to_agent_skill(
    config: SkillConfig,
    skill_type: str,
    skill_id: str,
) -> "AgentSkill":
    from a2a.types import AgentSkill
    description = config.description or config.prompt_context() or f"Skill: {config.name}"
    tags = [skill_type]
    if config.skill_type:
        tags.append(config.skill_type)
    if getattr(config, "requires_mcp_type", None):
        tags.append(f"mcp:{config.requires_mcp_type}")
    return AgentSkill(
        id=skill_id,
        name=config.name,
        description=description.strip() or config.name,
        tags=list(dict.fromkeys(tags)),  # deduplicate, preserve order
        examples=None,
    )


def _load_agent_metadata(agent_path: Path) -> dict:
    """Load agent metadata (full frontmatter) from AGENT.md if it exists."""
    agent_md = agent_path / "AGENT.md"
    if not agent_md.is_file():
        return {}
    try:
        import yaml
        content = agent_md.read_text(encoding="utf-8")
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                frontmatter = yaml.safe_load(parts[1])
                if isinstance(frontmatter, dict):
                    return frontmatter
    except Exception:
        pass
    return {}


def _normalise_list(raw) -> List[str]:
    """Normalise a frontmatter value to a list of strings."""
    if not raw:
        return []
    if isinstance(raw, str):
        return [s.strip() for s in raw.split(",") if s.strip()]
    if isinstance(raw, list):
        return [str(s) for s in raw if s]
    return []


def _discover_agent_cards_live(agents_root: Path, url: str) -> List[Dict]:
    """Run the actual filesystem discovery — no caching."""
    from a2a.types import AgentCard, AgentSkill

    skills_root = get_skills_root(agents_root)
    cards: List[Dict] = []

    agent_dirs = sorted(
        [d for d in agents_root.iterdir() if d.is_dir() and not d.name.startswith(".")],
        key=lambda d: d.name,
    )

    for agent_dir in agent_dirs:
        agent_name = agent_dir.name
        agent_metadata = _load_agent_metadata(agent_dir)
        description = agent_metadata.get("description") or f"Agent '{agent_name}'."

        allowed_skills = _normalise_list(agent_metadata.get("allowed_skills"))
        allowed_mcp_servers = _normalise_list(agent_metadata.get("allowed_mcp_servers"))

        skills: List[AgentSkill] = []

        if allowed_skills:
            # ---- Policy-mode agent: build skills from .skills/ shared library ----
            for skill_name in allowed_skills:
                skill_file = skills_root / f"{skill_name}.md"
                if not skill_file.exists():
                    continue
                config = load_skill_config(skill_file)
                skill_id = f"{agent_name}:{skill_name}"
                skills.append(_skill_config_to_agent_skill(config, skill_name, skill_id))
        else:
            # ---- Legacy mode: skills from nested dirs ----
            from querylab_agent.skills.discovery import list_skill_dirs_for_agent, list_skill_files_in_skill_dir
            skill_dirs = list_skill_dirs_for_agent(agent_name, agents_root)
            for skill_dir in skill_dirs:
                for path in list_skill_files_in_skill_dir(skill_dir):
                    config = load_skill_config(path)
                    skill_id = f"{agent_name}:{skill_dir.name}:{path.stem}"
                    skills.append(_skill_config_to_agent_skill(config, skill_dir.name, skill_id))

        if not skills:
            continue

        agent_card = AgentCard(
            name=agent_name,
            description=description,
            url=f"{url}/ask",
            version="0.1.0",
            default_input_modes=["text/plain"],
            default_output_modes=["text/plain", "application/json"],
            capabilities=_default_capabilities(),
            skills=skills,
            preferred_transport="HTTP+JSON",
        )

        card_dict = agent_card.model_dump(mode="json")
        card_dict["allowed_skills"] = allowed_skills
        card_dict["allowed_mcp_servers"] = allowed_mcp_servers
        card_dict["sub_sources"] = _normalise_list(agent_metadata.get("sub_sources"))
        card_dict["suggested_questions"] = _normalise_list(agent_metadata.get("suggested_questions"))
        display_name = (agent_metadata.get("display_name") or "").strip()
        if display_name:
            card_dict["display_name"] = display_name
        cards.append(card_dict)

    return cards


def discover_agent_cards(
    base_path: Optional[Path] = None,
    base_url: Optional[str] = None,
) -> List[Dict]:
    """
    Discover agents from .agents and return one card dict per agent.

    Returns plain dicts (not AgentCard objects) so we can include extra fields
    (allowed_skills, allowed_mcp_servers) alongside the standard A2A fields.
    The orchestrator reads these extras to build its AGENT_REGISTRY.

    Results are cached in-process for AGENT_DISCOVERY_TTL seconds (default 300).
    """
    url = (base_url or "http://localhost:8000").rstrip("/")
    agents_root = base_path or Path.cwd() / ".agents"
    cache_key = (str(agents_root), url)
    now = _time.monotonic()

    with _discovery_lock:
        if cache_key in _discovery_cache:
            cards, ts = _discovery_cache[cache_key]
            if (now - ts) < _DISCOVERY_CACHE_TTL:
                return cards

    cards = _discover_agent_cards_live(agents_root, url)

    with _discovery_lock:
        _discovery_cache[cache_key] = (cards, _time.monotonic())

    return cards


def get_agent_card(
    agent_name: str,
    base_path: Optional[Path] = None,
    base_url: Optional[str] = None,
) -> Optional[Dict]:
    """Return a single agent card dict for the given agent name, or None if not found."""
    cards = discover_agent_cards(base_path=base_path, base_url=base_url)
    for card in cards:
        if card.get("name") == agent_name:
            return card
    return None
