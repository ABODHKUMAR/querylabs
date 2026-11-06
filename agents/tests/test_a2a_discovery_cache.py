"""
Unit tests for querylab_agent.a2a.discovery TTL cache (Step 9 — agent discovery cache).
"""
import time
import pytest
from pathlib import Path
from unittest.mock import patch
import querylab_agent.a2a.discovery as disc


SKILL_MD = "---\nname: postgres\nskill_type: sql\n---\n# Postgres"


def _make_agent(root: Path, agent_name: str = "domain") -> None:
    """Create a minimal valid agent directory under root."""
    skill_dir = root / agent_name / "query_sql"
    skill_dir.mkdir(parents=True)
    (skill_dir / "postgres.md").write_text(SKILL_MD)


@pytest.fixture(autouse=True)
def clear_discovery_cache():
    """Reset module-level cache before and after every test."""
    disc._discovery_cache.clear()
    yield
    disc._discovery_cache.clear()


# ── cache miss / hit ──────────────────────────────────────────────────────────

def test_first_call_populates_cache(tmp_path):
    """Cold cache: the live discovery runs and result is stored."""
    agents_root = tmp_path / ".agents"
    agents_root.mkdir()
    _make_agent(agents_root)

    assert len(disc._discovery_cache) == 0
    cards = disc.discover_agent_cards(base_path=agents_root, base_url="http://test")
    assert len(cards) == 1
    assert len(disc._discovery_cache) == 1


def test_second_call_hits_cache(tmp_path):
    """Second call within TTL must not re-scan the filesystem."""
    agents_root = tmp_path / ".agents"
    agents_root.mkdir()
    _make_agent(agents_root)

    disc.discover_agent_cards(base_path=agents_root, base_url="http://test")

    # Remove agents from disk — cache should still return results
    import shutil
    shutil.rmtree(agents_root)

    cached = disc.discover_agent_cards(base_path=agents_root, base_url="http://test")
    assert len(cached) == 1  # served from cache, not re-scanned


def test_expired_cache_rescans(tmp_path):
    """After TTL expires, discover_agent_cards re-reads the filesystem."""
    agents_root = tmp_path / ".agents"
    agents_root.mkdir()
    _make_agent(agents_root)

    disc.discover_agent_cards(base_path=agents_root, base_url="http://test")

    # Force-expire by zeroing the stored timestamp
    key = (str(agents_root), "http://test")
    cards_before, _ = disc._discovery_cache[key]
    disc._discovery_cache[key] = (cards_before, 0.0)

    # Add a second agent while cache is expired
    _make_agent(agents_root, agent_name="sales")
    result = disc.discover_agent_cards(base_path=agents_root, base_url="http://test")
    assert len(result) == 2  # re-scanned, picked up new agent


def test_different_base_urls_use_separate_cache_entries(tmp_path):
    """Different base_urls are distinct cache keys."""
    agents_root = tmp_path / ".agents"
    agents_root.mkdir()
    _make_agent(agents_root)

    disc.discover_agent_cards(base_path=agents_root, base_url="http://host-a")
    disc.discover_agent_cards(base_path=agents_root, base_url="http://host-b")

    assert len(disc._discovery_cache) == 2
    key_a = (str(agents_root), "http://host-a")
    key_b = (str(agents_root), "http://host-b")
    assert key_a in disc._discovery_cache
    assert key_b in disc._discovery_cache


def test_different_agent_roots_use_separate_cache_entries(tmp_path):
    """Different base_paths are distinct cache keys."""
    root_a = tmp_path / "a" / ".agents"
    root_b = tmp_path / "b" / ".agents"
    root_a.mkdir(parents=True)
    root_b.mkdir(parents=True)
    _make_agent(root_a)
    _make_agent(root_b)

    disc.discover_agent_cards(base_path=root_a)
    disc.discover_agent_cards(base_path=root_b)

    assert len(disc._discovery_cache) == 2


def test_cache_ttl_default():
    """Default TTL is 300 seconds."""
    import os
    original = os.environ.pop("AGENT_DISCOVERY_TTL", None)
    try:
        import importlib
        importlib.reload(disc)
        assert disc._DISCOVERY_CACHE_TTL == 300
    finally:
        if original is not None:
            os.environ["AGENT_DISCOVERY_TTL"] = original
        importlib.reload(disc)


def test_get_agent_card_uses_cache(tmp_path):
    """get_agent_card routes through discover_agent_cards and benefits from cache."""
    agents_root = tmp_path / ".agents"
    agents_root.mkdir()
    _make_agent(agents_root)

    card = disc.get_agent_card("domain", base_path=agents_root, base_url="http://test")
    assert card is not None
    assert card["name"] == "domain"

    missing = disc.get_agent_card("nonexistent", base_path=agents_root, base_url="http://test")
    assert missing is None

    # cache should have exactly one entry (get_agent_card shares discover_agent_cards cache)
    assert len(disc._discovery_cache) == 1
