"""
Tests for the agent_runs persistence layer (Session 2).

Required test deps (added via: poetry add --group dev aiosqlite):
    aiosqlite

Run:
    cd orchestrator && .venv/Scripts/python.exe -m pytest tests/test_runs.py -v
"""
import os
import sys
import asyncio
from pathlib import Path

# Make querylab_agent importable from the sibling agents/ service.
# File is at: <repo>/orchestrator/tests/test_runs.py
# parents[2] = <repo>/querylab  →  / "agents" = <repo>/querylab/agents
_agents_root = Path(__file__).resolve().parents[2] / "agents"
if str(_agents_root) not in sys.path:
    sys.path.insert(0, str(_agents_root))

import pytest
import pytest_asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set env vars before importing orchestrator modules that read them at import time
os.environ.setdefault("BACKEND_DB_HOST", "")
os.environ.setdefault("QUERYLAB_AGENTS_API_URL", "http://localhost:8000")
os.environ.setdefault("SECRET_KEY", "test-secret")

from orchestrator.persistence.models import AgentRun, Base, ChatHistory
from orchestrator.api.runs import _get_db
from orchestrator.app import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="module")
async def engine():
    eng = create_async_engine(TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as sess:
        yield sess


@pytest_asyncio.fixture
async def client(session):
    async def override_db():
        yield session

    app.dependency_overrides[_get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _run_payload(**overrides) -> dict:
    base = {
        "trace_id": "trace-001",
        "task_id": "task-001",
        "user_id": "user-001",
        "session_id": "sess-001",
        "agent_name": "sql_agent",
        "skill_type": "sql",
        "outcome": "success",
        "tool_calls": 3,
        "prompt_tokens": 500,
        "completion_tokens": 200,
        "total_tokens": 700,
        "estimated_cost_usd": 0.0035,
        "duration_ms": 1200,
        "question_snippet": "Show me total revenue",
    }
    base.update(overrides)
    return base


# ── Model unit tests (sync) ───────────────────────────────────────────────────

def test_agent_run_model_columns():
    cols = {c.name for c in AgentRun.__table__.columns}
    required = {
        "id", "trace_id", "task_id", "user_id", "org_id", "session_id",
        "agent_name", "skill_name", "skill_type", "mcp_server", "outcome",
        "tool_calls", "prompt_tokens", "completion_tokens", "total_tokens",
        "estimated_cost_usd", "duration_ms", "error_type", "question_snippet",
        "feedback", "created_at",
    }
    assert required <= cols


def test_chat_history_has_is_pinned():
    cols = {c.name for c in ChatHistory.__table__.columns}
    assert "is_pinned" in cols


# ── Model DB tests (async) ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_model_insert_and_retrieve(session):
    from sqlalchemy import select
    run = AgentRun(
        trace_id="trace-model-1",
        task_id="task-model-1",
        user_id="user-model-1",
        session_id="sess-model-1",
        agent_name="test_agent",
        outcome="success",
        tool_calls=2,
    )
    session.add(run)
    await session.flush()
    assert run.id is not None

    result = await session.execute(select(AgentRun).where(AgentRun.trace_id == "trace-model-1"))
    fetched = result.scalar_one_or_none()
    assert fetched is not None
    assert fetched.agent_name == "test_agent"
    assert fetched.tool_calls == 2


# ── Endpoint tests (async) ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ingest_run_returns_201(client):
    resp = await client.post("/api/internal/runs", json=_run_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body and body["id"] is not None


@pytest.mark.asyncio
async def test_list_runs_returns_records(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-list-1"))
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-list-2", agent_name="other_agent"))

    resp = await client.get("/api/runs")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


@pytest.mark.asyncio
async def test_list_runs_filter_by_agent(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-filter-1", agent_name="filter_agent"))
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-filter-2", agent_name="other_agent"))

    resp = await client.get("/api/runs", params={"agent_name": "filter_agent"})
    assert resp.status_code == 200
    assert all(r["agent_name"] == "filter_agent" for r in resp.json())


@pytest.mark.asyncio
async def test_list_runs_filter_by_outcome(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-outcome-1", outcome="failed"))

    resp = await client.get("/api/runs", params={"outcome": "failed"})
    assert resp.status_code == 200
    assert all(r["outcome"] == "failed" for r in resp.json())


@pytest.mark.asyncio
async def test_get_run_by_trace_id(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-get-1", question_snippet="Get top agents"))

    resp = await client.get("/api/runs/trace-get-1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["trace_id"] == "trace-get-1"
    assert body["question_snippet"] == "Get top agents"
    assert body["agent_name"] == "sql_agent"


@pytest.mark.asyncio
async def test_get_run_not_found(client):
    resp = await client.get("/api/runs/nonexistent-trace-xyz")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_runs_summary_agents(client):
    for tid, outcome, ms in [
        ("trace-sum-1", "success", 800),
        ("trace-sum-2", "success", 1200),
        ("trace-sum-3", "failed",  400),
    ]:
        await client.post("/api/internal/runs", json=_run_payload(
            trace_id=tid, agent_name="summary_agent", outcome=outcome, duration_ms=ms
        ))

    resp = await client.get("/api/runs/summary/agents")
    assert resp.status_code == 200
    data = resp.json()
    row = next((r for r in data if r["agent_name"] == "summary_agent"), None)
    assert row is not None
    assert row["total_runs"] >= 3
    assert 0.0 <= row["success_rate"] <= 100.0
    assert row["avg_duration_ms"] > 0
    assert row["p95_duration_ms"] is not None


@pytest.mark.asyncio
async def test_post_feedback_up(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-fb-1"))
    resp = await client.post("/api/feedback", json={"trace_id": "trace-fb-1", "rating": "up"})
    assert resp.status_code == 200 and resp.json()["ok"] is True

    detail = await client.get("/api/runs/trace-fb-1")
    assert detail.json()["feedback"] == "up"


@pytest.mark.asyncio
async def test_post_feedback_down(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-fb-2"))
    await client.post("/api/feedback", json={"trace_id": "trace-fb-2", "rating": "down"})
    assert (await client.get("/api/runs/trace-fb-2")).json()["feedback"] == "down"


@pytest.mark.asyncio
async def test_post_feedback_invalid_rating(client):
    await client.post("/api/internal/runs", json=_run_payload(trace_id="trace-fb-bad"))
    resp = await client.post("/api/feedback", json={"trace_id": "trace-fb-bad", "rating": "meh"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_post_feedback_run_not_found(client):
    resp = await client.post("/api/feedback", json={"trace_id": "no-such-trace", "rating": "up"})
    assert resp.status_code == 404


# ── Resilience: persistence failure must never propagate ──────────────────────

def test_persist_run_no_loop_does_not_raise(monkeypatch):
    """Without a running event loop, _schedule_persist_run must be silent."""
    from querylab_agent import llm_observability as obs
    monkeypatch.setenv("QUERYLAB_PERSIST_RUNS", "true")
    monkeypatch.setenv("QUERYLAB_ORCHESTRATOR_URL", "http://127.0.0.1:1")

    # Sync context — get_running_loop() raises RuntimeError; must be swallowed.
    obs.log_agent_invocation_summary(
        trace_id="resilience-sync",
        agent_name="test_agent",
        skill_type="sql",
        out={},
        success=True,
    )


def test_persist_run_bad_url_async_does_not_raise():
    """With a running loop, a bad target URL must still not surface to caller."""
    from querylab_agent import llm_observability as obs

    async def _run():
        os.environ["QUERYLAB_PERSIST_RUNS"] = "true"
        os.environ["QUERYLAB_ORCHESTRATOR_URL"] = "http://127.0.0.1:1"
        obs.log_agent_invocation_summary(
            trace_id="resilience-async",
            agent_name="test_agent",
            skill_type="sql",
            out={},
            success=False,
            error_type="timeout",
        )
        await asyncio.sleep(0.1)  # let the background task attempt and fail

    asyncio.run(_run())


# ── _save_agent_runs retry logic ──────────────────────────────────────────────

def _sample_responses():
    return [{"agent_name": "sql_agent", "status": "success", "task_id": "t-retry-1"}]


@pytest.mark.asyncio
async def test_save_runs_succeeds_on_first_attempt(monkeypatch):
    """Happy path: DB write succeeds immediately, no retries needed."""
    import orchestrator.query_stream as qs

    monkeypatch.setattr(qs, "chat_persistence_enabled", lambda: True)

    mock_session = AsyncMock()
    attempt_count = 0

    @asynccontextmanager
    async def mock_scope():
        nonlocal attempt_count
        attempt_count += 1
        yield mock_session

    monkeypatch.setattr(qs, "async_session_scope", mock_scope)

    await qs._save_agent_runs(_sample_responses(), "req-ok", "user-1", "sess-1", "test question", 500)

    assert attempt_count == 1
    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_runs_retries_and_succeeds(monkeypatch):
    """First attempt fails, second succeeds — row must be saved."""
    import orchestrator.query_stream as qs

    monkeypatch.setattr(qs, "chat_persistence_enabled", lambda: True)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock())

    mock_session = AsyncMock()
    attempt_count = 0

    @asynccontextmanager
    async def mock_scope():
        nonlocal attempt_count
        attempt_count += 1
        if attempt_count == 1:
            raise Exception("transient DB error")
        yield mock_session

    monkeypatch.setattr(qs, "async_session_scope", mock_scope)

    await qs._save_agent_runs(_sample_responses(), "req-retry", "user-1", "sess-1", "test question", 500)

    assert attempt_count == 2
    mock_session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_save_runs_silent_after_all_retries_exhausted(monkeypatch):
    """All retries fail — function must not raise (loss is logged, never surfaced to caller)."""
    import orchestrator.query_stream as qs

    monkeypatch.setattr(qs, "chat_persistence_enabled", lambda: True)
    monkeypatch.setattr(asyncio, "sleep", AsyncMock())

    attempt_count = 0

    @asynccontextmanager
    async def mock_scope():
        nonlocal attempt_count
        attempt_count += 1
        raise Exception("DB permanently down")
        yield  # noqa: unreachable — required for asynccontextmanager

    monkeypatch.setattr(qs, "async_session_scope", mock_scope)

    # Must NOT raise even when every retry fails
    await qs._save_agent_runs(
        _sample_responses(), "req-allfail", "user-1", "sess-1", "test question", 500, max_retries=3
    )

    assert attempt_count == 3
