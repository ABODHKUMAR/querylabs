"""
Shared HTTP helpers for fetching agent metadata from the agents service.

Used by both query_stream.py (streaming queries) and plan_generator.py
(plan generation) to avoid duplicating the fetch logic.
"""
from __future__ import annotations

import logging
import os
import time as _time
from typing import Dict, List

from orchestrator.http_client import get_http_client

logger = logging.getLogger(__name__)

# ── Agent card TTL cache ───────────────────────────────────────────────────────
_cards_cache: List[Dict] | None = None
_cards_cache_ts: float = 0.0
_CARDS_CACHE_TTL = int(os.getenv("AGENT_CARDS_CACHE_TTL", "60"))


async def fetch_agents(base_url: str, trace_id: str) -> List[str]:
    """Return the list of agent names from GET /agents."""
    headers = {"X-Request-ID": trace_id}
    client = get_http_client()
    r = await client.get(f"{base_url}/agents", headers=headers)
    r.raise_for_status()
    return list((r.json()).get("agents") or [])


async def _fetch_agent_cards_http(base_url: str, trace_id: str) -> List[Dict]:
    """Uncached fetch of agent cards from GET /agents/cards."""
    headers = {"X-Request-ID": trace_id}
    client = get_http_client()
    r = await client.get(f"{base_url}/agents/cards", headers=headers)
    r.raise_for_status()
    return list((r.json()).get("cards") or [])


async def fetch_agent_cards(base_url: str, trace_id: str) -> List[Dict]:
    """Return agent card objects (name, description, allowed_mcp_servers, …) from GET /agents/cards.

    Results are cached in-process for AGENT_CARDS_CACHE_TTL seconds (default 60).
    Cache is shared across all requests — cards change only on agent restart.
    """
    global _cards_cache, _cards_cache_ts
    now = _time.monotonic()
    if _cards_cache is not None and (now - _cards_cache_ts) < _CARDS_CACHE_TTL:
        logger.debug("fetch_agent_cards: cache hit (age=%.1fs)", now - _cards_cache_ts)
        return _cards_cache
    cards = await _fetch_agent_cards_http(base_url, trace_id)
    _cards_cache = cards
    _cards_cache_ts = now
    logger.debug("fetch_agent_cards: cache populated (%d cards)", len(cards))
    return cards
