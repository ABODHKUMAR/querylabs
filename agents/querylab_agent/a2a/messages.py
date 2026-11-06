"""
A2A (Agent-to-Agent) message types.

Matches the Query Labs re-design: REQUEST (Orchestrator -> Domain Agent) and
RESPONSE (Domain Agent -> Orchestrator). All context flows in the request;
agents are stateless.
"""
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ResponseStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class A2ARequest(BaseModel):
    """Request from Orchestrator to a Domain Agent."""

    task_id: str = Field(description="Unique task id, e.g. 't-291'")
    task: str = Field(description="Task description, e.g. 'Find Q1 revenue by product'")
    context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Shared context: user_id, session_id, org_id, permissions",
    )
    constraints: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional constraints, e.g. time_budget_ms: 5000",
    )


class A2AResponse(BaseModel):
    """Response from Domain Agent back to Orchestrator."""

    task_id: str = Field(description="Same task_id as in the request")
    status: ResponseStatus = Field(
        description="success | partial | failed; orchestrator continues with partial"
    )
    result: Optional[str] = Field(default=None, description="Human-readable result")
    sources: List[str] = Field(
        default_factory=list,
        description="Data sources used, e.g. ['postgres_sales']",
    )
    confidence: Optional[str] = Field(default=None, description="e.g. 'high', 'medium'")
    artifacts: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Structured artifacts, e.g. [{type: 'table', data: [...]}]",
    )
    error: Optional[str] = Field(default=None, description="Error message if status is failed/partial")
    skill_name: Optional[str] = Field(default=None, description="Skill name that handled this request")
    skill_type: Optional[str] = Field(default=None, description="Skill type, e.g. 'query_vector', 'query_sql'")
    tool_calls: Optional[int] = Field(default=None, description="Number of LLM tool calls made")
    prompt_tokens: Optional[int] = Field(default=None)
    completion_tokens: Optional[int] = Field(default=None)
    total_tokens: Optional[int] = Field(default=None)
    estimated_cost_usd: Optional[float] = Field(default=None)
    tool_events: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Ordered list of tool calls made during execution (for white-box audit)",
    )
