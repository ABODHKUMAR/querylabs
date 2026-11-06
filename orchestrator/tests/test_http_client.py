"""
Unit tests for orchestrator.http_client singleton (Step 2 — httpx singleton).
"""
import pytest
import httpx
from orchestrator.http_client import get_http_client, set_http_client


@pytest.fixture(autouse=True)
def reset_singleton():
    """Ensure the singleton is cleared before and after each test."""
    set_http_client(None)
    yield
    set_http_client(None)


def test_get_before_set_raises():
    """get_http_client must raise RuntimeError when singleton is not initialised."""
    with pytest.raises(RuntimeError, match="lifespan not started"):
        get_http_client()


def test_set_and_get_roundtrip():
    """set_http_client followed by get_http_client returns the same object."""
    client = httpx.AsyncClient()
    set_http_client(client)
    assert get_http_client() is client


def test_set_none_clears_singleton():
    """Setting the singleton to None causes the next get to raise."""
    client = httpx.AsyncClient()
    set_http_client(client)
    set_http_client(None)
    with pytest.raises(RuntimeError):
        get_http_client()


def test_replace_singleton():
    """The singleton can be replaced with a new client."""
    client_a = httpx.AsyncClient()
    client_b = httpx.AsyncClient()
    set_http_client(client_a)
    set_http_client(client_b)
    assert get_http_client() is client_b
    assert get_http_client() is not client_a
