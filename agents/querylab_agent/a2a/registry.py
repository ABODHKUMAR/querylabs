"""
Agent Registry: maps agent names to callable endpoints.

Orchestrator uses this to resolve "who handles this task". Endpoints can be:
- Local function (sync or async)
- HTTP URL
- LangGraph sub-graph (future)
"""
from typing import Any, Callable, Dict, Optional

from querylab_agent.a2a.messages import A2ARequest, A2AResponse


class AgentRegistry:
    """
    Registry of agent name -> callable(A2ARequest) -> A2AResponse (or awaitable).
    Thread-safe for read; writes typically at startup.
    """

    def __init__(self) -> None:
        self._handlers: Dict[str, Callable[..., Any]] = {}

    def register(
        self,
        name: str,
        handler: Callable[[A2ARequest], Any],
        *,
        overwrite: bool = False,
    ) -> None:
        """Register an agent. handler can be sync or async (A2ARequest -> A2AResponse)."""
        if name in self._handlers and not overwrite:
            raise ValueError(f"Agent '{name}' already registered")
        self._handlers[name] = handler

    def get(self, name: str) -> Optional[Callable[..., Any]]:
        """Return the callable for the given agent name, or None."""
        return self._handlers.get(name)

    def list_agents(self) -> list[str]:
        """Return all registered agent names."""
        return list(self._handlers.keys())

    async def invoke(self, name: str, request: A2ARequest) -> A2AResponse:
        """Invoke agent by name with an A2A request. Returns A2AResponse."""
        handler = self.get(name)
        if handler is None:
            from querylab_agent.a2a.messages import ResponseStatus

            return A2AResponse(
                task_id=request.task_id,
                status=ResponseStatus.FAILED,
                error=f"Agent '{name}' not found in registry",
            )
        import asyncio

        if asyncio.iscoroutinefunction(handler):
            return await handler(request)
        return handler(request)


_default_registry: Optional[AgentRegistry] = None


def get_registry() -> AgentRegistry:
    """Return the default global agent registry (singleton)."""
    global _default_registry
    if _default_registry is None:
        _default_registry = AgentRegistry()
    return _default_registry
