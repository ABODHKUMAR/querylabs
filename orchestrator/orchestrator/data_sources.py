"""
GET /data_sources: returns agent card names from the agents API.

Same response shape as querylab_sql api/v1/data_sources (list of display names),
but sources are agent card names from the agents service (GET /agents/cards).
"""
import logging
from typing import List

from fastapi import APIRouter, HTTPException

from orchestrator.agents_client import fetch_agent_cards
from orchestrator.config import QUERYLAB_AGENTS_API_URL

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_cards() -> List[dict]:
    """Fetch agent cards via shared TTL-cached client."""
    import httpx
    try:
        return await fetch_agent_cards(QUERYLAB_AGENTS_API_URL, "data_sources")
    except httpx.HTTPStatusError as e:
        logger.warning("Agents API cards failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Agents API error: {e.response.status_code}")
    except Exception as e:
        logger.warning("Agents API unreachable: %s", e)
        raise HTTPException(status_code=503, detail="Agents service unavailable")


@router.get("/data_sources")
@router.get("/data_source/")  # Same path as querylab_sql for UI compatibility
async def get_data_sources():
    """
    List data source names: agent card names from the agents API.

    Returns same shape as querylab_sql GET /api/data_source/: {"response": ["agent1", "agent2", ...]}.
    """
    cards = await _get_cards()
    result = []
    for card in cards:
        sub_sources = card.get("sub_sources") or []
        if sub_sources:
            result.extend(sub_sources)
        else:
            name = card.get("name", "")
            if name:
                result.append(name)
    logger.info("GET /data_sources -> %d source(s)", len(result))
    return {"response": result}


@router.get("/agent_names")
async def get_agent_names():
    """
    List master agent cards with name and sub_sources.

    Used by the Analysis Plan AGENT(S) dropdown to show the 8 master agents
    and to update sub_sources when the user switches agents.
    Returns {"response": [{"name": "avani_agent", "sub_sources": [...]}, ...]}.
    """
    cards = await _get_cards()
    result = [
        {
            "name": c.get("name"),
            "sub_sources": c.get("sub_sources") or [],
            "suggested_questions": c.get("suggested_questions") or [],
            "allowed_skills": c.get("allowed_skills") or [],
        }
        for c in cards if c.get("name")
    ]
    logger.info("GET /agent_names -> %d agent(s)", len(result))
    return {"response": result}
