"""
OrchestratorState — the LangGraph state for the 3-node orchestrator graph.

Nodes:
  decompose  → splits user query into sub-tasks (one per agent)
  route      → fan-out: calls each agent in parallel, collects responses
  synthesise → merges responses into a single coherent final answer
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, Dict, List, Optional

from typing_extensions import TypedDict


class SubTask(TypedDict):
    """A single agent invocation request produced by decompose_node."""
    task_id: str       # UUID for tracing
    agent_name: str    # Name of the agent to call (must be in agent_cards)
    task: str          # Self-contained question for the agent
    step_id: Optional[str]   # set when sub_task originates from an approved plan
    reasoning: Optional[str] # why this agent was chosen (max 80 chars)


class AgentResponse(TypedDict):
    """Result from one agent call, produced by route_node."""
    task_id: str
    agent_name: str
    result: str               # Text answer from the agent
    status: str               # "success" | "partial" | "failed"
    sources: List[str]        # MCP server names used (from agent card)
    artifacts: List[Dict]     # Structured artifacts [{type, data}] from A2A response
    skill_name: Optional[str] # Skill invoked inside the agent (from A2A response or inferred)
    skill_type: Optional[str] # "sql" | "vector" | "analytics" | etc.
    mcp_server: Optional[str] # MCP server used (from A2A response)
    tool_calls: Optional[int]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    total_tokens: Optional[int]
    estimated_cost_usd: Optional[float]


class OrchestratorState(TypedDict):
    """Full state flowing through the orchestrator graph."""

    # ── Inputs (set once at the start) ─────────────────────────────────────
    user_query: str
    user_context: Dict[str, Any]   # conversation history, session info, etc.

    # ── Produced by decompose_node ─────────────────────────────────────────
    sub_tasks: List[SubTask]

    # ── Accumulated by route_node ──────────────────────────────────────────
    # Annotated[..., operator.add] lets multiple branches append independently
    responses: Annotated[List[AgentResponse], operator.add]

    # ── Produced by synthesise_node ────────────────────────────────────────
    final_answer: Optional[str]
    chart_vis: Optional[Dict]   # Plotly spec generated during synthesis; None if not applicable

    # ── Set when request carries an approved plan ──────────────────────────
    plan_id: Optional[str]   # echoed from ApprovedPlan for traceability
