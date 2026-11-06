"""
Unit tests for weaviate_mcp.server cache and confidence-filter improvements.

Steps covered:
  Step 4 — Embedding TTL+LRU cache (_get_query_vector)
  Step 5 — Result TTL+LRU cache (_retrieve_from_weaviate)
  Step 6 — Weaviate connection singleton (_get_weaviate_client)
  Step 7 — Dynamic confidence filtering (_retrieve_from_weaviate)
  Step 8 — Tunable alpha / min_score parameters (retrieve_docs_from_collection)
"""
import hashlib
import os
import time
from collections import OrderedDict
from unittest.mock import MagicMock, patch

import pytest
import weaviate_mcp.server as srv


# ── helpers ───────────────────────────────────────────────────────────────────

def _cache_key_embed(model: str, query: str) -> str:
    return hashlib.md5(f"{model}:{query}".encode()).hexdigest()


def _cache_key_result(collection: str, query: str, limit: int, alpha: float, min_score: float) -> str:
    return hashlib.md5(f"{collection}:{query}:{limit}:{alpha}:{min_score}".encode()).hexdigest()


def _make_mock_result(content: str, score: float):
    obj = MagicMock()
    obj.properties = {"content": content}
    obj.metadata.score = score
    return obj


@pytest.fixture(autouse=True)
def clear_caches():
    """Reset all module-level caches and singleton before/after each test."""
    srv._embed_cache.clear()
    srv._result_cache.clear()
    srv._weaviate_client = None
    yield
    srv._embed_cache.clear()
    srv._result_cache.clear()
    srv._weaviate_client = None


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Embedding cache
# ─────────────────────────────────────────────────────────────────────────────

def test_embed_cache_miss_calls_openai(monkeypatch):
    """Cold embed cache: _get_query_vector must call the OpenAI API."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    monkeypatch.setenv("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")

    fake_vector = [0.1, 0.2, 0.3]
    mock_client = MagicMock()
    mock_client.embeddings.create.return_value.data = [MagicMock(embedding=fake_vector)]

    with patch("openai.OpenAI", return_value=mock_client):
        result = srv._get_query_vector("hello world")

    assert result == fake_vector
    mock_client.embeddings.create.assert_called_once()


def test_embed_cache_hit_skips_openai(monkeypatch):
    """Warm embed cache: _get_query_vector must return cached vector without OpenAI."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    model = os.environ.get("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")
    query = "cached query"
    fake_vector = [0.5, 0.6, 0.7]

    # Pre-populate cache
    key = _cache_key_embed(model, query)
    srv._embed_cache[key] = (fake_vector, time.monotonic())

    with patch("openai.OpenAI") as mock_openai_cls:
        result = srv._get_query_vector(query)

    assert result == fake_vector
    mock_openai_cls.assert_not_called()


def test_embed_cache_ttl_expiry_refetches(monkeypatch):
    """Expired embed cache entry must trigger a fresh OpenAI call."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    model = os.environ.get("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")
    query = "expiry test"
    old_vector = [0.1]
    new_vector = [0.9]

    # Pre-populate with an expired entry (ts=0)
    key = _cache_key_embed(model, query)
    srv._embed_cache[key] = (old_vector, 0.0)

    mock_client = MagicMock()
    mock_client.embeddings.create.return_value.data = [MagicMock(embedding=new_vector)]

    with patch("openai.OpenAI", return_value=mock_client):
        result = srv._get_query_vector(query)

    assert result == new_vector
    mock_client.embeddings.create.assert_called_once()


def test_embed_cache_lru_eviction(monkeypatch):
    """Embedding cache must not grow beyond _EMBED_CACHE_MAX entries."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    model = os.environ.get("WEAVIATE_EMBEDDING_MODEL", "text-embedding-3-small")

    # Set a tiny max size
    original_max = srv._EMBED_CACHE_MAX
    srv._EMBED_CACHE_MAX = 3
    try:
        # Fill cache beyond max by directly populating (avoids real OpenAI calls)
        for i in range(5):
            q = f"query {i}"
            key = _cache_key_embed(model, q)
            mock_client = MagicMock()
            mock_client.embeddings.create.return_value.data = [MagicMock(embedding=[float(i)])]
            with patch("openai.OpenAI", return_value=mock_client):
                srv._get_query_vector(q)

        assert len(srv._embed_cache) <= srv._EMBED_CACHE_MAX
    finally:
        srv._EMBED_CACHE_MAX = original_max


def test_embed_cache_no_api_key_returns_none(monkeypatch):
    """Without OPENAI_API_KEY, _get_query_vector returns None immediately."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = srv._get_query_vector("test")
    assert result is None
    assert len(srv._embed_cache) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Result cache
# ─────────────────────────────────────────────────────────────────────────────

def _mock_weaviate_response(objects):
    mock_response = MagicMock()
    mock_response.objects = objects
    mock_coll = MagicMock()
    mock_coll.query.hybrid.return_value = mock_response
    mock_client = MagicMock()
    mock_client.collections.get.return_value = mock_coll
    return mock_client


def test_result_cache_miss_calls_weaviate(monkeypatch):
    """Cold result cache: _retrieve_from_weaviate must query Weaviate."""
    objects = [_make_mock_result("doc1", 0.9), _make_mock_result("doc2", 0.8)]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    results = srv._retrieve_from_weaviate("test", "TestColl")
    mock_client.collections.get.assert_called_once_with("TestColl")


def test_result_cache_hit_skips_weaviate(monkeypatch):
    """Warm result cache: _retrieve_from_weaviate must not call Weaviate again."""
    objects = [_make_mock_result("doc1", 0.9)]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    srv._retrieve_from_weaviate("test", "TestColl")
    srv._retrieve_from_weaviate("test", "TestColl")  # should hit cache

    assert mock_client.collections.get.call_count == 1


def test_result_cache_ttl_expiry(monkeypatch):
    """Expired result cache must re-query Weaviate."""
    objects = [_make_mock_result("doc1", 0.9)]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    srv._retrieve_from_weaviate("test", "TestColl")

    # Force-expire the cache entry
    key = _cache_key_result("TestColl", "test", 10, 0.75, 0.0)
    cached_results, _ = srv._result_cache[key]
    srv._result_cache[key] = (cached_results, 0.0)

    srv._retrieve_from_weaviate("test", "TestColl")
    assert mock_client.collections.get.call_count == 2


# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Dynamic confidence filtering
# ─────────────────────────────────────────────────────────────────────────────

def test_confidence_filter_removes_low_scores(monkeypatch):
    """Results below dynamic threshold (max*ratio) are filtered out."""
    # max_score=0.8, RATIO=0.5, dynamic=max(0.4, 0.15)=0.4 → 0.3 score is filtered
    objects = [
        _make_mock_result("high", 0.8),
        _make_mock_result("mid", 0.5),
        _make_mock_result("low", 0.3),
    ]
    mock_client = _mock_weaviate_response(objects)

    original_ratio = srv._CONFIDENCE_RATIO
    srv._CONFIDENCE_RATIO = 0.5
    try:
        monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
        monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

        results = srv._retrieve_from_weaviate("test", "TestColl")
        scores = [r["score"] for r in results]
        assert 0.3 not in scores
        assert 0.8 in scores
        assert 0.5 in scores
    finally:
        srv._CONFIDENCE_RATIO = original_ratio


def test_confidence_floor_prevents_over_filtering(monkeypatch):
    """When all scores are low, CONFIDENCE_FLOOR prevents removing everything."""
    # max_score=0.1, RATIO=0.5 → dynamic=max(0.05, 0.15)=0.15 → only 0.1<0.15 is cut
    objects = [
        _make_mock_result("a", 0.20),
        _make_mock_result("b", 0.10),
    ]
    mock_client = _mock_weaviate_response(objects)

    original_ratio, original_floor = srv._CONFIDENCE_RATIO, srv._CONFIDENCE_FLOOR
    srv._CONFIDENCE_RATIO = 0.5
    srv._CONFIDENCE_FLOOR = 0.15
    try:
        monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
        monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

        results = srv._retrieve_from_weaviate("test", "TestColl")
        scores = [r["score"] for r in results]
        assert 0.20 in scores   # passes (≥0.15)
        assert 0.10 not in scores  # filtered (0.10 < 0.15)
    finally:
        srv._CONFIDENCE_RATIO = original_ratio
        srv._CONFIDENCE_FLOOR = original_floor


def test_min_score_raises_effective_threshold(monkeypatch):
    """A caller-supplied min_score raises the effective threshold above dynamic."""
    objects = [
        _make_mock_result("good", 0.85),
        _make_mock_result("ok", 0.6),
        _make_mock_result("low", 0.4),
    ]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    # Without min_score, dynamic threshold = max(0.85*0.5, 0.15) = max(0.425, 0.15) = 0.425
    # So 0.4 would be filtered naturally. With min_score=0.7, also 0.6 is filtered.
    results = srv._retrieve_from_weaviate("test", "TestColl", min_score=0.7)
    scores = [r["score"] for r in results]
    assert 0.85 in scores
    assert 0.6 not in scores
    assert 0.4 not in scores


def test_no_scored_results_passes_through(monkeypatch):
    """Results without scores are never filtered by confidence filter."""
    obj = MagicMock()
    obj.properties = {"content": "no-score doc"}
    obj.metadata.score = None

    mock_response = MagicMock()
    mock_response.objects = [obj]
    mock_coll = MagicMock()
    mock_coll.query.hybrid.return_value = mock_response
    mock_client = MagicMock()
    mock_client.collections.get.return_value = mock_coll

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    results = srv._retrieve_from_weaviate("test", "TestColl")
    assert len(results) == 1
    assert results[0]["score"] is None


# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Connection singleton reconnect
# ─────────────────────────────────────────────────────────────────────────────

def test_singleton_reused_when_ready(monkeypatch):
    """_get_weaviate_client returns the same client when is_ready() is True."""
    mock_client = MagicMock()
    mock_client.is_ready.return_value = True
    srv._weaviate_client = mock_client

    with patch.object(srv, "_build_weaviate_client") as mock_build:
        result = srv._get_weaviate_client()

    assert result is mock_client
    mock_build.assert_not_called()


def test_singleton_reconnects_when_not_ready(monkeypatch):
    """_get_weaviate_client rebuilds the client when is_ready() returns False."""
    old_client = MagicMock()
    old_client.is_ready.return_value = False
    srv._weaviate_client = old_client

    new_client = MagicMock()
    with patch.object(srv, "_build_weaviate_client", return_value=new_client) as mock_build:
        result = srv._get_weaviate_client()

    assert result is new_client
    mock_build.assert_called_once()
    old_client.close.assert_called_once()


def test_singleton_reconnects_after_exception(monkeypatch):
    """_get_weaviate_client rebuilds when is_ready() raises an exception."""
    bad_client = MagicMock()
    bad_client.is_ready.side_effect = ConnectionError("gone")
    srv._weaviate_client = bad_client

    new_client = MagicMock()
    with patch.object(srv, "_build_weaviate_client", return_value=new_client):
        result = srv._get_weaviate_client()

    assert result is new_client


# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Tunable alpha / min_score in MCP tool
# ─────────────────────────────────────────────────────────────────────────────

def test_tool_passes_alpha_to_weaviate(monkeypatch):
    """The alpha parameter from the MCP tool must reach the hybrid query call."""
    objects = [_make_mock_result("doc", 0.9)]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    srv.retrieve_docs_from_collection("query", "TestColl", alpha=0.3)
    call_kwargs = mock_client.collections.get().query.hybrid.call_args
    assert call_kwargs.kwargs["alpha"] == 0.3


def test_tool_passes_min_score_filtering(monkeypatch):
    """The min_score parameter from the MCP tool filters low-relevance results."""
    objects = [
        _make_mock_result("pass", 0.9),
        _make_mock_result("fail", 0.1),
    ]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    result_str = srv.retrieve_docs_from_collection("query", "TestColl", min_score=0.5)
    assert "pass" in result_str
    assert "fail" not in result_str


def test_tool_default_alpha_is_0_75(monkeypatch):
    """Default alpha of 0.75 is passed to Weaviate when not specified by caller."""
    objects = [_make_mock_result("doc", 0.9)]
    mock_client = _mock_weaviate_response(objects)

    monkeypatch.setattr(srv, "_get_weaviate_client", lambda: mock_client)
    monkeypatch.setattr(srv, "_get_query_vector", lambda q: None)

    srv.retrieve_docs_from_collection("query", "TestColl")
    call_kwargs = mock_client.collections.get().query.hybrid.call_args
    assert call_kwargs.kwargs["alpha"] == 0.75
