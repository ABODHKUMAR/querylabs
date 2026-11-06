"""
POST /query/plan — synchronous plan generation endpoint.

Returns a GeneratePlanResponse (plan_id + ordered PlanStep list)
for user review before the main streaming execution begins.
"""
import uuid

from fastapi import APIRouter, Depends, Request

from orchestrator.auth import ensure_user_matches_token, verify_jwt_token
from orchestrator.models import GeneratePlanRequest, GeneratePlanResponse
from orchestrator.plan_generator import generate_analysis_plan
from orchestrator.query_stream import _get_request_id
from orchestrator.rate_limit import limiter

router = APIRouter()


@router.post("/query/plan", response_model=GeneratePlanResponse)
@limiter.limit("30/minute")
async def generate_plan(
    request: Request,
    body: GeneratePlanRequest,
    token_user: dict = Depends(verify_jwt_token),
) -> GeneratePlanResponse:
    """Generate an analysis plan for user review. Requires Bearer JWT."""
    request_id = _get_request_id(request)
    ensure_user_matches_token(token_user, body.user_id)
    authenticated_user_id = str(token_user["sub"])
    return await generate_analysis_plan(body, request_id, authenticated_user_id)
