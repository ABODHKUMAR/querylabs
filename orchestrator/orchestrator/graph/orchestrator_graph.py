"""
Build and expose the compiled LangGraph orchestrator.

Graph topology:

    START → decompose → route → synthesise → END

    decompose_node   — LLM decomposes the user query into per-agent sub-tasks
    route_node       — parallel fan-out via asyncio.gather() to agent API
    synthesise_node  — LLM merges all responses into one coherent answer

Usage
-----
    from orchestrator.graph.orchestrator_graph import get_graph

    graph = get_graph()            # singleton; safe to call repeatedly
    result = await graph.ainvoke(
        initial_state,
        config={"configurable": { ... }},
    )
    final_answer = result["final_answer"]

The compiled graph is a singleton compiled once and reused for every request.
It is thread-safe because LangGraph compiled graphs are stateless (all mutable
state lives in the input dict that is passed per-invocation).
"""
from __future__ import annotations

import logging
from typing import Optional

from langgraph.graph import END, START, StateGraph

from orchestrator.graph.nodes import decompose_node, route_node, synthesise_node
from orchestrator.graph.state import OrchestratorState


def _entry_router(state: OrchestratorState) -> str:
    """Skip decompose if sub_tasks are already populated (pre-approved plan)."""
    return "route" if state.get("sub_tasks") else "decompose"

logger = logging.getLogger(__name__)

# ── Graph factory ─────────────────────────────────────────────────────────────


def build_graph() -> "CompiledGraph":  # noqa: F821 — type only available at runtime
    """
    Construct and compile the orchestrator StateGraph.

    Returns a compiled LangGraph graph ready for ``ainvoke`` / ``astream``.
    """
    builder: StateGraph = StateGraph(OrchestratorState)

    # Register nodes
    builder.add_node("decompose",  decompose_node)
    builder.add_node("route",      route_node)
    builder.add_node("synthesise", synthesise_node)

    # Wire edges: START conditionally routes to decompose or route (approved plan bypass)
    builder.add_conditional_edges(
        START, _entry_router,
        {"decompose": "decompose", "route": "route"},
    )
    builder.add_edge("decompose",  "route")
    builder.add_edge("route",      "synthesise")
    builder.add_edge("synthesise", END)

    compiled = builder.compile()
    logger.info("OrchestratorGraph compiled: START →(conditional)→ decompose/route → synthesise")
    return compiled


# ── Singleton ─────────────────────────────────────────────────────────────────

_graph: Optional[object] = None   # holds the compiled graph after first call


def get_graph():
    """
    Return the singleton compiled orchestrator graph, building it on first call.

    The compiled graph is stateless — all per-request data is passed through
    ``config["configurable"]`` at invocation time.
    """
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
