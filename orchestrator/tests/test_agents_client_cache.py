"""
Unit tests for orchestrator.agents_client TTL cache (Step 1 — agent card cache).
"""
import os
import pytest
from unittest.mock import AsyncMock, patch
import orchestrator.agents_client as agents_client

SAMPLE_CARDS = [{"name": "test_agent", "skills": [], "allowed_mcp_servers": []}]


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear module-level cache state before and after each test."""
    agents_client._cards_cache = None
    agents_client._cards_cache_ts = 0.0
    yield
    agents_client._cards_cache = None
    agents_client._cards_cache_ts = 0.0


# ── cache miss / hit ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cold_cache_calls_http():
    """Cold cache: fetch_agent_cards must call the HTTP backend exactly once."""
    with patch.object(agents_client, "_fetch_agent_cards_http", new_callable=AsyncMock) as mock_http:
        mock_http.return_value = SAMPLE_CARDS
        result = await agents_client.fetch_agent_cards("http://test", "trace-1")
        assert result == SAMPLE_CARDS
        mock_http.assert_awaited_once_with("http://test", "trace-1")


@pytest.mark.asyncio
async def test_warm_cache_skips_http():
    """Second call within TTL must return cached cards without hitting HTTP."""
    with patch.object(agents_client, "_fetch_agent_cards_http", new_callable=AsyncMock) as mock_http:
        mock_http.return_value = SAMPLE_CARDS
        await agents_client.fetch_agent_cards("http://test", "trace-1")  # populate
        result = await agents_client.fetch_agent_cards("http://test", "trace-2")  # cache hit
        assert result == SAMPLE_CARDS
        assert mock_http.await_count == 1  # not called again


@pytest.mark.asyncio
async def test_expired_cache_refetches():
    """After TTL expires the cache is bypassed and HTTP is called again."""
    with patch.object(agents_client, "_fetch_agent_cards_http", new_callable=AsyncMock) as mock_http:
        mock_http.return_value = SAMPLE_CARDS
        await agents_client.fetch_agent_cards("http://test", "trace-1")
        # force-expire by zeroing the timestamp
        agents_client._cards_cache_ts = 0.0
        await agents_client.fetch_agent_cards("http://test", "trace-2")
        assert mock_http.await_count == 2


@pytest.mark.asyncio
async def test_cache_stores_returned_cards():
    """After the first call the in-memory cache must hold the fetched cards."""
    with patch.object(agents_client, "_fetch_agent_cards_http", new_callable=AsyncMock) as mock_http:
        mock_http.return_value = SAMPLE_CARDS
        await agents_client.fetch_agent_cards("http://test", "trace-1")
        assert agents_client._cards_cache == SAMPLE_CARDS
        assert agents_client._cards_cache_ts > 0.0


@pytest.mark.asyncio
async def test_cache_updated_on_refresh():
    """When the cache expires and refetches, it stores the new result."""
    fresh_cards = [{"name": "new_agent", "skills": []}]
    with patch.object(agents_client, "_fetch_agent_cards_http", new_callable=AsyncMock) as mock_http:
        mock_http.return_value = SAMPLE_CARDS
        await agents_client.fetch_agent_cards("http://test", "trace-1")
        # expire + change response
        agents_client._cards_cache_ts = 0.0
        mock_http.return_value = fresh_cards
        result = await agents_client.fetch_agent_cards("http://test", "trace-2")
        assert result == fresh_cards
        assert agents_client._cards_cache == fresh_cards


# ── TTL env override ──────────────────────────────────────────────────────────

def test_ttl_env_default():
    """Default TTL is 60 seconds when env var is not set."""
    original = os.environ.pop("AGENT_CARDS_CACHE_TTL", None)
    try:
        import importlib
        importlib.reload(agents_client)
        assert agents_client._CARDS_CACHE_TTL == 60
    finally:
        if original is not None:
            os.environ["AGENT_CARDS_CACHE_TTL"] = original
        else:
            os.environ.pop("AGENT_CARDS_CACHE_TTL", None)
        importlib.reload(agents_client)
