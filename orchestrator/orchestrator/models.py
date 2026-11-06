"""Request/response models for orchestrator API (aligned with querylab_sql v3)."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PlanStep(BaseModel):
    """A single step in an analysis plan, produced by /query/plan."""
    step_id: str
    agent_name: str
    task: str
    description: str          # human-readable label, max 80 chars
    data_source: str
    confidence: str           # "high" | "medium"
    rationale: str
    sub_sources: List[str] = []
    selected_sub_sources: List[str] = []  # user-narrowed subset; empty means all


class GeneratePlanRequest(BaseModel):
    """Request body for POST /query/plan."""
    query: str
    collection: str = ""
    session_id: str
    user_id: str
    conversation_history: Any = []
    regeneration_feedback: Optional[str] = None
    previous_plan_steps: Optional[List[Dict]] = None
    clarification_answer: Optional[str] = None
    skip_clarification: bool = False


class GeneratePlanResponse(BaseModel):
    """Response from POST /query/plan."""
    plan_id: str
    steps: List[PlanStep]
    query: str
    generated_at: str         # ISO timestamp
    needs_clarification: bool = False
    clarification_question: Optional[str] = None


class ApprovedPlan(BaseModel):
    """An approved plan sent back with POST /query/stream to bypass decompose_node."""
    plan_id: str
    steps: List[PlanStep]
    user_constraints: Optional[str] = None


class MessageRequest(BaseModel):
    """Same shape as querylab_sql MessageRequest for /query/stream."""
    query: str
    collection: str
    conversation_history: Any = []
    session_id: str
    user_id: str
    clarification_responses: Optional[str] = None
    approved_plan: Optional[ApprovedPlan] = None
