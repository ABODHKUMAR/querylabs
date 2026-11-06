"""
Base skill interface: stateless, input -> output.

Skills are invoked by agents; they use MCP for data/connections as documented
in each skill's SKILL.md.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseSkill(ABC):
    """
    Stateless skill: one input, one output. No side effects, no shared state.
    MCP connections used by the skill are documented in the skill's SKILL.md.
    """

    @property
    def name(self) -> str:
        """Skill id used in agent SKILL.md (e.g. 'query_sql')."""
        raise NotImplementedError

    @abstractmethod
    async def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the skill. inputs and return value are skill-specific.
        Caller (agent) passes context (user_id, session_id, etc.) in inputs if needed.
        """
        pass
