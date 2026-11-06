# Analysis Plan Feature — Implementation Sessions & Test Cases

> All 7 sessions required to implement the Pre-Execution Transparency Layer.
> Sessions 1–3 are backend-only. Sessions 4–6 are frontend-only. Session 7 is verification.
> Each session is a self-contained unit of work that leaves the system in a runnable state.
> All test data is synthetic — no real customer data.

---

## Session 1 — Backend Data Layer

**Goal**: All shared types, extracted utilities, and extended state in place. Nothing user-facing.

### Files

| Action | File |
|--------|------|
| NEW | `orchestrator/orchestrator/agents_client.py` |
| EXTEND | `orchestrator/orchestrator/models.py` |
| EXTEND | `orchestrator/orchestrator/graph/state.py` |
| PARTIAL | `orchestrator/orchestrator/query_stream.py` (imports only) |

**Dependencies**: None.

**Definition of done**: `poetry run python -c "from orchestrator.agents_client import fetch_agent_cards; from orchestrator.models import PlanStep, ApprovedPlan"` succeeds.

---

### Implementation Steps

**Step 1.0 — Create agents_client.py**

Extract `_fetch_agents()` and `_fetch_agent_cards()` from `query_stream.py` into a new shared module:

```python
# orchestrator/orchestrator/agents_client.py
from __future__ import annotations
import logging
from typing import Dict, List
import httpx

logger = logging.getLogger(__name__)

async def fetch_agents(base_url: str, trace_id: str) -> List[str]:
    url = f"{base_url}/agents"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"X-Trace-Id": trace_id})
        resp.raise_for_status()
        return resp.json()

async def fetch_agent_cards(base_url: str, trace_id: str) -> List[Dict]:
    url = f"{base_url}/agent-cards"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"X-Trace-Id": trace_id})
        resp.raise_for_status()
        return resp.json()
```

Then in `query_stream.py` replace the local private functions with:
```python
from orchestrator.agents_client import fetch_agent_cards, fetch_agents
```

**Step 1.1 — Extend models.py**

Add `PlanStep`, `GeneratePlanRequest`, `GeneratePlanResponse`, `ApprovedPlan` to `orchestrator/orchestrator/models.py`.
Also add `approved_plan: Optional[ApprovedPlan] = None` to the existing `MessageRequest`.

```python
class PlanStep(BaseModel):
    step_id: str
    agent_name: str
    task: str
    description: str          # max 80 chars, human-readable label
    data_source: str
    confidence: str           # "high" | "medium"
    rationale: str

class GeneratePlanRequest(BaseModel):
    query: str
    collection: str = ""
    session_id: str
    user_id: str
    conversation_history: Any = []
    regeneration_feedback: Optional[str] = None
    previous_plan_steps: Optional[List[Dict]] = None

class GeneratePlanResponse(BaseModel):
    plan_id: str
    steps: List[PlanStep]
    query: str
    generated_at: str         # ISO timestamp

class ApprovedPlan(BaseModel):
    plan_id: str
    steps: List[PlanStep]
    user_constraints: Optional[str] = None
```

**Step 1.2 — Extend state.py**

Add `step_id: Optional[str]` to `SubTask` and `plan_id: Optional[str]` to `OrchestratorState`:

```python
class SubTask(TypedDict):
    task_id: str
    agent_name: str
    task: str
    step_id: Optional[str]   # set when sub_task originates from approved plan

class OrchestratorState(TypedDict):
    ...
    plan_id: Optional[str]   # echoed from ApprovedPlan for traceability
```

---

### Test Cases — Session 1

**T1.1 — Import smoke test**
```bash
cd orchestrator && poetry run python -c "
from orchestrator.agents_client import fetch_agent_cards, fetch_agents
from orchestrator.models import PlanStep, ApprovedPlan, GeneratePlanRequest, GeneratePlanResponse
from orchestrator.graph.state import SubTask, OrchestratorState
print('Session 1 imports OK')
"
```
Pass: prints `Session 1 imports OK`.

**T1.2 — SubTask backward compat (step_id optional)**
```python
# tests/unit/test_state_s1.py
from orchestrator.graph.state import SubTask

def test_subtask_step_id_defaults_none():
    t = SubTask(task_id="abc", agent_name="agent1", task="test question")
    assert t.get("step_id") is None

def test_subtask_accepts_step_id():
    t = SubTask(task_id="abc", agent_name="agent1", task="test question", step_id="uuid-001")
    assert t["step_id"] == "uuid-001"
```

**T1.3 — PlanStep model validation**
```python
# tests/unit/test_models_s1.py
from orchestrator.models import PlanStep, ApprovedPlan

def test_planstep_all_fields():
    step = PlanStep(
        step_id="s-001", agent_name="sales_agent",
        task="What was total revenue in Q3 2024?",
        description="Fetch Q3 2024 revenue data",
        data_source="mysql_sales", confidence="high",
        rationale="sales_agent has direct access to revenue tables"
    )
    assert step.confidence == "high"
    assert len(step.description) <= 80

def test_approved_plan_constraints_optional():
    plan = ApprovedPlan(plan_id="pid-001", steps=[], user_constraints=None)
    assert plan.user_constraints is None
```

**T1.4 — MessageRequest backward compat**
```python
from orchestrator.models import MessageRequest

def test_message_request_approved_plan_defaults_none():
    req = MessageRequest(query="Revenue?", collection="sales", session_id="s1", user_id="u1")
    assert req.approved_plan is None
```

---

## Session 2 — Plan Generation API

**Goal**: `POST /api/v3/query/plan` returns a valid plan. Backend fully testable via curl/Postman.

### Files

| Action | File |
|--------|------|
| NEW | `orchestrator/orchestrator/plan_generator.py` |
| NEW | `orchestrator/orchestrator/plan_routes.py` |
| EXTEND | `orchestrator/orchestrator/app.py` |

**Dependencies**: Session 1.

**Definition of done**: `curl -X POST /api/v3/query/plan -H "Authorization: Bearer <token>" -d '{"query":"...","session_id":"...","user_id":"..."}'` returns JSON with `plan_id`, `steps[]` with `step_id` UUIDs, correct `confidence` values.

---

### Implementation Steps

**Step 2.1 — Create plan_generator.py**

Key function: `generate_analysis_plan(request, request_id, authenticated_user_id) -> GeneratePlanResponse`

Logic:
1. `await fetch_agent_cards(QUERYLAB_AGENTS_API_URL, request_id)` — raise `HTTPException(502)` if this fails
2. Filter by `request.collection` (same logic as `stream_query_response`)
3. Build LLM system prompt using `_PLAN_BASE_PROMPT` with Python if/else for conditionals:
   ```python
   system_prompt = _PLAN_BASE_PROMPT.format(agent_list=agent_list_str)
   if request.regeneration_feedback:
       system_prompt += f'\n\nThe user rejected a previous plan. Their feedback: "{request.regeneration_feedback}". Incorporate this.'
   if request.previous_plan_steps:
       summary = "; ".join(f"{s['agent_name']}: {s['description']}" for s in request.previous_plan_steps[:5])
       system_prompt += f"\n\nPrevious query used these steps: {summary}. Reuse, adapt, or replace as needed."
   ```
4. Call LLM `ainvoke(messages)` requesting JSON `[{agent_name, task, description, data_source, rationale}]`
5. Parse JSON — if fails or empty list, raise `HTTPException(500, "Plan generation failed")`
6. Validate each step's `agent_name` against known agent cards — drop invalid steps
7. If ALL steps dropped, raise `HTTPException(500, "No valid agents in plan")`
8. Assign confidence: `high` if card has `allowed_mcp_servers`, `medium` if card found but no MCP servers
9. Assign `step_id = str(uuid.uuid4())` to each valid step
10. Return `GeneratePlanResponse(plan_id=str(uuid4()), steps=..., query=request.query, generated_at=datetime.utcnow().isoformat())`

Base prompt template:
```python
_PLAN_BASE_PROMPT = """\
You are an intelligent orchestrator. Given a user query and available agents,
generate an ANALYSIS PLAN: the minimum ordered set of steps to answer the query.

Rules:
- One step per agent needed. If one agent suffices, return exactly one step.
- Only assign a step to an agent whose description clearly matches that part.
- Each step "task" must be a complete, standalone question for that agent.
- "description" is a human-readable label (max 80 chars) e.g. "Fetch Q3 revenue data"
- "data_source" is the primary MCP server or agent name
- "rationale" is one sentence explaining why this agent was chosen

Return ONLY a JSON array, no other text:
[{{"agent_name":"...","task":"...","description":"...","data_source":"...","rationale":"..."}}]

Available agents:
{agent_list}
"""
```

**Step 2.2 — Create plan_routes.py**

```python
from fastapi import APIRouter, Depends, Request
from orchestrator.auth import verify_jwt_token, ensure_user_matches_token
from orchestrator.models import GeneratePlanRequest, GeneratePlanResponse
from orchestrator.plan_generator import generate_analysis_plan
from orchestrator.rate_limit import limiter

router = APIRouter()

@router.post("/query/plan", response_model=GeneratePlanResponse)
@limiter.limit("30/minute")
async def generate_plan(
    http_request: Request,
    body: GeneratePlanRequest,
    token_user: dict = Depends(verify_jwt_token),
) -> GeneratePlanResponse:
    request_id = _get_request_id(http_request)
    authenticated_user_id = ensure_user_matches_token(token_user, body.user_id)
    return await generate_analysis_plan(body, request_id, authenticated_user_id)
```

**Step 2.3 — Register plan_router in app.py**

```python
# After existing import on ln 33
from orchestrator.plan_routes import router as plan_router

# After existing line: app.include_router(query_stream_router, prefix="/api/v3", tags=["query"])
app.include_router(plan_router, prefix="/api/v3", tags=["plan"])
```

---

### Test Cases — Session 2

**T2.1 — Plan endpoint HTTP 200**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8082/api/v3/query/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid_token>" \
  -d '{"query":"What is total revenue?","session_id":"test-sess","user_id":"test-user"}'
```
Pass: `200`.

**T2.2 — Response structure validation**
```bash
curl -X POST http://localhost:8082/api/v3/query/plan \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"query":"Compare Q3 and Q4 sales","session_id":"s1","user_id":"u1"}' | \
  python3 -c "
import sys, json, re
r = json.load(sys.stdin)
assert r.get('plan_id'), 'missing plan_id'
assert isinstance(r.get('steps'), list) and len(r['steps']) >= 1, 'steps must be non-empty'
for s in r['steps']:
    assert re.match(r'^[0-9a-f-]{36}$', s['step_id']), f'bad step_id: {s[\"step_id\"]}'
    assert s['confidence'] in ('high', 'medium'), f'bad confidence: {s[\"confidence\"]}'
    assert len(s['description']) <= 80, 'description too long'
    assert s['rationale'], 'missing rationale'
print('T2.2 PASS')
"
```

**T2.3 — Confidence scoring unit test**
```python
# tests/unit/test_plan_generator.py
import pytest
from unittest.mock import AsyncMock, patch
from orchestrator.plan_generator import generate_analysis_plan
from orchestrator.models import GeneratePlanRequest

class _MockResp:
    def __init__(self, text): self.content = text

@pytest.mark.asyncio
async def test_high_confidence_with_mcp_servers():
    cards = [{"name": "sales_agent", "allowed_mcp_servers": ["mysql_sales"]}]
    llm_json = '[{"agent_name":"sales_agent","task":"Revenue?","description":"Get revenue","data_source":"mysql_sales","rationale":"Has DB"}]'
    with patch("orchestrator.plan_generator.fetch_agent_cards", AsyncMock(return_value=cards)), \
         patch("orchestrator.plan_generator._get_llm") as mock_llm_fn:
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=_MockResp(llm_json))
        mock_llm_fn.return_value = mock_llm
        req = GeneratePlanRequest(query="Revenue?", session_id="s1", user_id="u1")
        result = await generate_analysis_plan(req, "req-1", "u1")
        assert result.steps[0].confidence == "high"

@pytest.mark.asyncio
async def test_medium_confidence_no_mcp_servers():
    cards = [{"name": "analytics_agent"}]  # no allowed_mcp_servers key
    llm_json = '[{"agent_name":"analytics_agent","task":"Trend?","description":"Analyze trend","data_source":"analytics_agent","rationale":"Analytics"}]'
    # ... same mock setup ...
    assert result.steps[0].confidence == "medium"
```

**T2.4 — Hallucinated agent dropped → HTTP 500**
```python
@pytest.mark.asyncio
async def test_all_invalid_agents_raises_500():
    from fastapi import HTTPException
    cards = [{"name": "real_agent"}]
    llm_json = '[{"agent_name":"FAKE_AGENT","task":"...","description":"...","data_source":"...","rationale":"..."}]'
    with patch("orchestrator.plan_generator.fetch_agent_cards", AsyncMock(return_value=cards)), \
         patch("orchestrator.plan_generator._get_llm") as mock_llm_fn:
        mock_llm = AsyncMock()
        mock_llm.ainvoke = AsyncMock(return_value=_MockResp(llm_json))
        mock_llm_fn.return_value = mock_llm
        req = GeneratePlanRequest(query="Revenue?", session_id="s1", user_id="u1")
        with pytest.raises(HTTPException) as exc:
            await generate_analysis_plan(req, "req-1", "u1")
        assert exc.value.status_code == 500
        assert "No valid agents" in exc.value.detail
```

**T2.5 — Regeneration feedback appended to LLM prompt**
```python
@pytest.mark.asyncio
async def test_regeneration_feedback_appended():
    captured_messages = []
    async def capture_invoke(msgs):
        captured_messages.extend(msgs)
        return _MockResp('[{"agent_name":"sales_agent","task":"...","description":"Try comparison","data_source":"mysql","rationale":"..."}]')
    cards = [{"name": "sales_agent", "allowed_mcp_servers": ["mysql_sales"]}]
    req = GeneratePlanRequest(query="Revenue?", session_id="s1", user_id="u1",
                              regeneration_feedback="Include a comparison step")
    with patch("orchestrator.plan_generator.fetch_agent_cards", AsyncMock(return_value=cards)), \
         patch("orchestrator.plan_generator._get_llm") as mock_llm_fn:
        mock_llm = AsyncMock()
        mock_llm.ainvoke = capture_invoke
        mock_llm_fn.return_value = mock_llm
        await generate_analysis_plan(req, "req-1", "u1")
    assert any("Include a comparison step" in m.get("content", "") for m in captured_messages)
```

**T2.6 — Unauthenticated request rejected**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8082/api/v3/query/plan \
  -d '{"query":"test","session_id":"s1","user_id":"u1"}'
```
Pass: `401` or `403`.

---

## Session 3 — Execution Integration

**Goal**: Approved plan bypasses `decompose_node`; `plan_step_status` SSE events flow correctly.

### Files

| Action | File |
|--------|------|
| EXTEND | `orchestrator/orchestrator/graph/nodes.py` |
| MODIFY | `orchestrator/orchestrator/graph/orchestrator_graph.py` |
| EXTEND | `orchestrator/orchestrator/query_stream.py` |

**Dependencies**: Session 1.

**Definition of done**:
- `POST /api/v3/query/stream` with `approved_plan` → SSE stream contains `plan_step_status` events, NO `thought/decompose` from `decompose_node`
- `POST /api/v3/query/stream` without `approved_plan` → existing behavior unchanged

---

### Implementation Steps

**Step 3.1 — Add plan_step_status SSE events in nodes.py**

In `route_node._call_one`, add three new `event_queue.put` calls:

**Before** `ask_agent_fn` call (after the existing `tool_call` thought event):
```python
step_id = sub_task.get("step_id")
if step_id:
    await event_queue.put(_sse("plan_step_status", {
        "step_id": step_id, "status": "in_progress",
        "agent_name": agent_name, "error": None,
    }))
```

**After** successful response (after existing `tool_result` thought):
```python
if step_id:
    await event_queue.put(_sse("plan_step_status", {
        "step_id": step_id, "status": "completed",
        "agent_name": agent_name, "error": None,
    }))
```

**In the except block** (after existing `tool_error` thought):
```python
if step_id:
    await event_queue.put(_sse("plan_step_status", {
        "step_id": step_id, "status": "failed",
        "agent_name": agent_name, "error": str(exc)[:120],
    }))
```

**Step 3.2 — Add conditional entry edge in orchestrator_graph.py**

Add routing function above `build_graph()`:
```python
def _entry_router(state: OrchestratorState) -> str:
    """Skip decompose if sub_tasks are already populated (pre-approved plan)."""
    return "route" if state.get("sub_tasks") else "decompose"
```

Replace `builder.add_edge(START, "decompose")` with:
```python
builder.add_conditional_edges(
    START, _entry_router,
    {"decompose": "decompose", "route": "route"}
)
```

**Step 3.3 — Consume approved_plan in query_stream.py**

After agent_cards are filtered and before building `initial_state`, add:

```python
pre_populated_sub_tasks: List[SubTask] = []
approved_plan = getattr(request, "approved_plan", None)
if approved_plan and approved_plan.steps:
    valid_agent_names = {c["name"] for c in agent_cards}
    for step in approved_plan.steps:
        if step.agent_name in valid_agent_names:
            pre_populated_sub_tasks.append(SubTask(
                task_id=str(uuid.uuid4()),
                agent_name=step.agent_name,
                task=step.task,
                step_id=step.step_id,
            ))
    if pre_populated_sub_tasks:
        yield format_sse_event("thought", {
            "type": "decompose",
            "content": f"Using approved plan: {len(pre_populated_sub_tasks)} step(s)",
            "sub_tasks": [{"agent": t["agent_name"], "task": t["task"]} for t in pre_populated_sub_tasks],
            "from_plan": True,
        })

# Append user_constraints to the query if present
effective_query = request.query
if approved_plan and approved_plan.user_constraints:
    effective_query = (
        f"{request.query}\n\nAdditional constraints from user: "
        f"{approved_plan.user_constraints}"
    )

initial_state = {
    "user_query": effective_query,
    "user_context": {"conversation_history": messages},
    "sub_tasks": pre_populated_sub_tasks,   # [] if no approved plan → triggers decompose
    "responses": [],
    "final_answer": None,
    "plan_id": approved_plan.plan_id if approved_plan else None,
}
```

---

### Test Cases — Session 3

**T3.1 — Entry router unit test**
```python
# tests/unit/test_orchestrator_graph_s3.py
from orchestrator.graph.orchestrator_graph import _entry_router

def test_empty_subtasks_routes_to_decompose():
    state = {"sub_tasks": [], "user_query": "test", "user_context": {}, "responses": [], "final_answer": None}
    assert _entry_router(state) == "decompose"

def test_populated_subtasks_routes_to_route():
    state = {
        "sub_tasks": [{"task_id": "1", "agent_name": "a", "task": "q", "step_id": "s1"}],
        "user_query": "test", "user_context": {}, "responses": [], "final_answer": None
    }
    assert _entry_router(state) == "route"
```

**T3.2 — plan_step_status emitted when step_id present**
```python
# tests/unit/test_nodes_s3.py
import asyncio, json
import pytest
from orchestrator.graph.nodes import route_node

@pytest.mark.asyncio
async def test_plan_step_status_on_success():
    queue = asyncio.Queue()
    sub_task = {"task_id": "t1", "agent_name": "agent1", "task": "Revenue?", "step_id": "step-001"}
    mock_resp = {
        "answer": "100M", "artifacts": [], "skill_name": "sql", "skill_type": "sql",
        "mcp_server": "mysql", "tool_calls": 1
    }
    async def mock_ask(**kwargs): return mock_resp
    state = {"sub_tasks": [sub_task], "user_query": "Revenue?", "user_context": {}, "responses": []}
    config = {"configurable": {
        "base_url": "http://x", "event_queue": queue,
        "trace_id": "t", "orch_span_id": "o", "ask_agent_fn": mock_ask,
        "agent_cards": [{"name": "agent1"}]
    }}
    await route_node(state, config)
    events = []
    while not queue.empty():
        raw = queue.get_nowait()
        if "plan_step_status" in raw:
            events.append(json.loads(raw.split("data: ", 1)[1]))
    statuses = [e["status"] for e in events]
    assert "in_progress" in statuses
    assert "completed" in statuses
```

**T3.3 — No plan_step_status when step_id absent (legacy path)**
```python
@pytest.mark.asyncio
async def test_no_plan_step_status_without_step_id():
    queue = asyncio.Queue()
    sub_task = {"task_id": "t1", "agent_name": "agent1", "task": "Revenue?"}  # no step_id
    mock_resp = {"answer": "100M", "artifacts": [], "skill_name": "sql",
                 "skill_type": "sql", "mcp_server": "mysql", "tool_calls": 1}
    async def mock_ask(**kwargs): return mock_resp
    state = {"sub_tasks": [sub_task], "user_query": "Revenue?", "user_context": {}, "responses": []}
    config = {"configurable": {
        "base_url": "http://x", "event_queue": queue,
        "trace_id": "t", "orch_span_id": "o", "ask_agent_fn": mock_ask,
        "agent_cards": [{"name": "agent1"}]
    }}
    await route_node(state, config)
    all_raw_events = []
    while not queue.empty():
        all_raw_events.append(queue.get_nowait())
    plan_events = [e for e in all_raw_events if "plan_step_status" in e]
    assert len(plan_events) == 0
```

**T3.4 — Backward compat: stream without approved_plan uses decompose**
```bash
# Should see thought/decompose event, NOT plan_step_status
curl -N -X POST http://localhost:8082/api/v3/query/stream \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"Revenue?","session_id":"s1","user_id":"u1","collection":""}' 2>/dev/null | \
  grep -c "plan_step_status" | xargs -I{} test {} -eq 0 && echo "T3.4 PASS"
```

**T3.5 — With approved_plan: decompose skipped, plan_step_status present**
```bash
PAYLOAD='{"query":"Revenue?","session_id":"s1","user_id":"u1","approved_plan":{"plan_id":"pid-1","steps":[{"step_id":"sid-1","agent_name":"sales_agent","task":"Revenue Q3?","description":"Get revenue","data_source":"mysql_sales","confidence":"high","rationale":"Has access"}],"user_constraints":null}}'
curl -N -X POST http://localhost:8082/api/v3/query/stream \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null | tee /tmp/sse_out.txt
grep -c "plan_step_status" /tmp/sse_out.txt | xargs -I{} test {} -gt 0 && echo "plan_step_status found"
grep "thought" /tmp/sse_out.txt | python3 -c "
import sys, json
for line in sys.stdin:
    if line.startswith('data:'):
        d = json.loads(line[5:].strip())
        if d.get('type') == 'decompose' and not d.get('from_plan'):
            print('FAIL: decompose_node ran'); exit(1)
print('decompose skipped OK')
"
```

**T3.6 — User constraints appended to user_query**
```python
@pytest.mark.asyncio
async def test_user_constraints_in_initial_state():
    from orchestrator.models import MessageRequest, ApprovedPlan, PlanStep
    step = PlanStep(
        step_id="s1", agent_name="sales_agent", task="Revenue?",
        description="Get revenue", data_source="mysql", confidence="high", rationale="Has DB"
    )
    request = MessageRequest(
        query="Show revenue", collection="", session_id="s1", user_id="u1",
        approved_plan=ApprovedPlan(
            plan_id="pid", steps=[step],
            user_constraints="Only Q3 2024 data"
        )
    )
    captured = {}
    async def mock_graph_run(state, config):
        captured["query"] = state["user_query"]
    # patch graph invocation and call stream_query_response ...
    assert "Only Q3 2024 data" in captured["query"]
```

---

## Session 4 — Frontend API + State Hook

**Goal**: `generateAnalysisPlan()` callable from browser; `useAnalysisPlan` covers all phase transitions.

### Files

| Action | File |
|--------|------|
| EXTEND | `frontend/src/api/api.js` |
| NEW | `frontend/src/components/hooks/useAnalysisPlan.js` |
| EXTEND | `frontend/src/components/hooks/useStreamingQuery.js` |

**Dependencies**: Session 2 (for live testing; can mock for unit tests).

**Definition of done**: Hook transitions `idle → loading → pending_approval` on success; `buildApprovedPlan()` returns shape matching `ApprovedPlan` model.

---

### Implementation Steps

**Step 4.1 — Add generateAnalysisPlan to api.js**

```javascript
export async function generateAnalysisPlan(
  payload,
  conversationHistory = [],
  regenerationFeedback = null,
  previousPlanSteps = null,
) {
  const authToken = Cookies.get("authToken");
  const body = {
    query: payload.query || payload.prompt || "",
    collection: payload.collection || "",
    session_id: payload.sessionID,
    user_id: payload.userID,
    conversation_history: conversationHistory,
    regeneration_feedback: regenerationFeedback || null,
    previous_plan_steps: previousPlanSteps || null,
  };
  const response = await fetch(`${baseURL}/v3/query/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken ? `Bearer ${authToken}` : "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Plan generation failed: HTTP ${response.status}`);
  return response.json();
}
```

In `streamDataForQuery`, add `approved_plan: payload.approved_plan || null` to `chatPayload`.

In SSE event switch, add:
```javascript
case "plan_step_status":
  callbacks.onPlanStepStatus?.(data);
  break;
```

**Step 4.2 — Create useAnalysisPlan.js**

State shape:
```javascript
{
  phase: "idle" | "loading" | "pending_approval" | "executing" | "complete" | "error",
  plan: null,              // GeneratePlanResponse from server
  editedSteps: [],         // user-editable copy of plan.steps
  userConstraints: "",
  stepStatuses: {},        // { [step_id]: "pending"|"in_progress"|"completed"|"failed" }
  error: null,
}
```

Exported functions:
- `fetchPlan(payload, conversationHistory, regenerationFeedback = null, previousPlanSteps = null)`
- `updateStep(stepId, changes)`
- `removeStep(stepId)`
- `reorderSteps(fromIndex, toIndex)`
- `setConstraints(text)`
- `buildApprovedPlan()` — returns `ApprovedPlan` object
- `updateStepStatus(stepId, status, error)`
- `completePlan()` — sets `phase: "complete"`
- `retryPlan()` — resets all `stepStatuses` to `"pending"`, phase stays `"executing"`
- `resetPlan()` — phase → `"idle"`, clears all state

**Step 4.3 — Extend useStreamingQuery.js**

Add two optional params to `startStreaming`:
```javascript
startStreaming(payload, model, conversationHistory, onComplete, onError,
  approvedPlan = null,
  onPlanStepStatus = null
)
```

Pass `approved_plan: approvedPlan` in body to `streamDataForQuery`.
Pass `onPlanStepStatus` in callbacks.
Expose existing `AbortController` as `stopStreaming()` if not already exported.

---

### Test Cases — Session 4

**T4.1 — generateAnalysisPlan request shape**
```javascript
// tests/api.test.js
test('generateAnalysisPlan sends all 4 params', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ plan_id: 'p1', steps: [], query: 'Revenue?', generated_at: '2024-01-01T00:00:00' })
  });
  await generateAnalysisPlan(
    { query: 'Revenue?', collection: 'sales', sessionID: 's1', userID: 'u1' },
    [], 'Include comparison', [{ agent_name: 'sales_agent', description: 'Old step' }]
  );
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.regeneration_feedback).toBe('Include comparison');
  expect(body.previous_plan_steps).toHaveLength(1);
  expect(body.session_id).toBe('s1');
});
```

**T4.2 — 8s timeout enforced**
```javascript
test('generateAnalysisPlan aborts after 8s', async () => {
  global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  jest.useFakeTimers();
  const promise = generateAnalysisPlan({ query: 'test', sessionID: 's1', userID: 'u1' }, []);
  jest.advanceTimersByTime(8001);
  await expect(promise).rejects.toThrow();
});
```

**T4.3 — Phase transitions: idle → loading → pending_approval**
```javascript
test('fetchPlan transitions phases correctly on success', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue({
    plan_id: 'p1',
    steps: [{
      step_id: 's1', agent_name: 'sales_agent', task: 'Revenue?',
      description: 'Get revenue', data_source: 'mysql', confidence: 'high', rationale: '...'
    }],
    query: 'Revenue?', generated_at: '2024-01-01'
  });
  const { result } = renderHook(() => useAnalysisPlan());
  expect(result.current.planState.phase).toBe('idle');
  await act(async () => {
    await result.current.fetchPlan({ query: 'Revenue?', sessionID: 's1', userID: 'u1' }, []);
  });
  expect(result.current.planState.phase).toBe('pending_approval');
  expect(result.current.planState.editedSteps).toHaveLength(1);
});
```

**T4.4 — fetchPlan error → phase: error**
```javascript
test('fetchPlan sets error phase on failure', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockRejectedValue(new Error('Service down'));
  const { result } = renderHook(() => useAnalysisPlan());
  await act(async () => {
    await result.current.fetchPlan({ query: 'test', sessionID: 's1', userID: 'u1' }, []);
  });
  expect(result.current.planState.phase).toBe('error');
  expect(result.current.planState.error).toContain('Service down');
});
```

**T4.5 — buildApprovedPlan returns correct shape**
```javascript
test('buildApprovedPlan includes editedSteps and userConstraints', () => {
  // set up hook with plan loaded in pending_approval phase
  act(() => { result.current.setConstraints('Only Q3 2024'); });
  const approved = result.current.buildApprovedPlan();
  expect(approved).toMatchObject({
    plan_id: expect.any(String),
    steps: expect.arrayContaining([expect.objectContaining({ step_id: expect.any(String) })]),
    user_constraints: 'Only Q3 2024'
  });
});
```

**T4.6 — updateStep / removeStep / retryPlan / resetPlan**
```javascript
test('updateStep patches description', () => {
  act(() => result.current.updateStep('s1', { description: 'Updated' }));
  expect(result.current.planState.editedSteps[0].description).toBe('Updated');
});

test('removeStep removes step by id', () => {
  act(() => result.current.removeStep('s1'));
  expect(result.current.planState.editedSteps).toHaveLength(0);
});

test('retryPlan resets all stepStatuses to pending', () => {
  // set a step to completed first
  act(() => result.current.updateStepStatus('s1', 'completed', null));
  act(() => result.current.retryPlan());
  expect(result.current.planState.stepStatuses['s1']).toBe('pending');
});

test('resetPlan returns to idle and clears state', () => {
  act(() => result.current.resetPlan());
  expect(result.current.planState.phase).toBe('idle');
  expect(result.current.planState.plan).toBeNull();
});
```

---

## Session 5 — Plan Card Component

**Goal**: `AnalysisPlan.jsx` renders all 5 phases with correct behavior.

### Files

| Action | File |
|--------|------|
| NEW | `frontend/src/components/AnalysisPlan.jsx` |

**Dependencies**: Session 4 (for live hook; can render with mock `planState` prop).

**Acceptance checklist**:
- `loading`: spinner + "Analyzing your question..." visible
- `pending_approval`: steps expand on click; description + task both editable; Regenerate reveals inline feedback field; Run Analysis disabled with 0 steps; main input grayed out
- `executing`: status icons animate in real-time as `plan_step_status` events arrive
- `complete`: one-liner "▸ Analysis Plan (N steps)" collapsed by default, expands on click
- `error`: correct message + Retry + Execute Without Plan buttons visible

---

### Implementation Steps

**Step 5.1 — Create AnalysisPlan.jsx**

Props: `planState`, `onUpdateStep`, `onRemoveStep`, `onReorderSteps`, `onSetConstraints`, `onApprove`, `onDismiss`, `isLastMessage`

Phase rendering:
- **loading**: Spinner + "Analyzing your question..."
- **pending_approval**: Numbered editable step list. Each step collapsed by default, click to expand showing `description` (editable) + `task` (editable, labelled "Agent question:"). Below list: Regenerate button (reveals inline feedback field on click), constraints textarea, Run Analysis button (disabled if 0 steps), "Skip Plan →" link.
- **executing**: Read-only list with status icons. `pending` = hollow gray circle. `in_progress` = `<Loader2 className="animate-spin" />`. `completed` = `<CheckCircle2 className="text-green-500" />`. `failed` = `<XCircle className="text-red-500" />`. Retry banner shown when any step is `failed` and stream complete.
- **complete**: Collapsed `"▸ Analysis Plan (N steps)"` widget. Click to expand read-only step list.
- **error**: Error message text + Retry Plan + Execute Without Plan buttons.

Styling: Tailwind classes matching existing `ThoughtProcess` component. Icons from `lucide-react`. Native HTML5 drag-and-drop for reorder (no external library).

---

### Test Cases — Session 5

**T5.1 — loading phase**
```javascript
test('loading renders spinner text', () => {
  render(<AnalysisPlan planState={{ phase: 'loading' }} onApprove={noop} onDismiss={noop} />);
  expect(screen.getByText(/Analyzing your question/i)).toBeInTheDocument();
});
```

**T5.2 — pending_approval: step list + action buttons**
```javascript
const mockStep = {
  step_id: 'sid-001', agent_name: 'sales_agent', task: 'What was Q3 revenue?',
  description: 'Fetch Q3 revenue data', data_source: 'mysql_sales',
  confidence: 'high', rationale: 'Has DB access'
};

test('pending_approval renders steps and Run Analysis', () => {
  const state = { phase: 'pending_approval', editedSteps: [mockStep], userConstraints: '', stepStatuses: {} };
  render(<AnalysisPlan planState={state} onApprove={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.getByText('Fetch Q3 revenue data')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run Analysis/i })).toBeEnabled();
  expect(screen.getByText(/Skip Plan/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument();
});
```

**T5.3 — Run Analysis disabled with zero steps**
```javascript
test('Run Analysis disabled when editedSteps is empty', () => {
  const state = { phase: 'pending_approval', editedSteps: [], userConstraints: '', stepStatuses: {} };
  render(<AnalysisPlan planState={state} onApprove={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.getByRole('button', { name: /Run Analysis/i })).toBeDisabled();
});
```

**T5.4 — Step expands on click, shows editable fields**
```javascript
test('clicking step reveals task input field', async () => {
  const state = { phase: 'pending_approval', editedSteps: [mockStep], userConstraints: '', stepStatuses: {} };
  render(<AnalysisPlan planState={state} onUpdateStep={jest.fn()} onDismiss={jest.fn()} />);
  fireEvent.click(screen.getByText('Fetch Q3 revenue data'));
  expect(await screen.findByLabelText(/Agent question/i)).toBeInTheDocument();
});
```

**T5.5 — Regenerate reveals inline feedback field**
```javascript
test('Regenerate button reveals feedback text field', async () => {
  const state = { phase: 'pending_approval', editedSteps: [mockStep], userConstraints: '', stepStatuses: {} };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));
  expect(await screen.findByPlaceholderText(/What should be different/i)).toBeInTheDocument();
});
```

**T5.6 — executing: status icons per step**
```javascript
test('in_progress step shows animate-spin element', () => {
  const state = { phase: 'executing', editedSteps: [mockStep],
                  stepStatuses: { 'sid-001': 'in_progress' } };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  expect(document.querySelector('.animate-spin')).toBeInTheDocument();
});

test('completed step shows CheckCircle2 icon', () => {
  const state = { phase: 'executing', editedSteps: [mockStep],
                  stepStatuses: { 'sid-001': 'completed' } };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  // CheckCircle2 from lucide-react renders as svg with data-testid or role
  expect(document.querySelector('[data-icon="check-circle-2"]')).toBeInTheDocument();
});

test('failed step shows XCircle icon', () => {
  const state = { phase: 'executing', editedSteps: [mockStep],
                  stepStatuses: { 'sid-001': 'failed' } };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  expect(document.querySelector('[data-icon="x-circle"]')).toBeInTheDocument();
});
```

**T5.7 — executing: retry banner on failure**
```javascript
test('retry banner appears when step fails and stream is complete', () => {
  const state = { phase: 'executing', editedSteps: [mockStep],
                  stepStatuses: { 'sid-001': 'failed' }, streamComplete: true };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  expect(screen.getByText(/1 step.*failed/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Retry Plan/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue with partial/i })).toBeInTheDocument();
});
```

**T5.8 — complete phase: collapsed by default, expands on click**
```javascript
test('complete phase shows collapsed one-liner, expands on click', () => {
  const state = { phase: 'complete', editedSteps: [mockStep],
                  stepStatuses: { 'sid-001': 'completed' } };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  expect(screen.getByText(/Analysis Plan.*1 step/i)).toBeInTheDocument();
  expect(screen.queryByText('Fetch Q3 revenue data')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(/Analysis Plan/i));
  expect(screen.getByText('Fetch Q3 revenue data')).toBeInTheDocument();
});
```

**T5.9 — error phase: retry + execute-without-plan buttons**
```javascript
test('error phase renders error message and action buttons', () => {
  const state = { phase: 'error', error: 'Service unavailable', editedSteps: [] };
  render(<AnalysisPlan planState={state} onDismiss={jest.fn()} />);
  expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Retry Plan/i })).toBeInTheDocument();
  expect(screen.getByText(/Execute Without Plan/i)).toBeInTheDocument();
});
```

---

## Session 6 — Frontend Wiring (Full Integration)

**Goal**: End-to-end two-phase flow works in the browser; all 7 user scenarios handled.

### Files

| Action | File |
|--------|------|
| EXTEND | `frontend/src/components/ChatMessages.jsx` |
| EXTEND | `frontend/src/components/ChatInput.jsx` |
| EXTEND | `frontend/src/components/ChatBox.jsx` |

**Dependencies**: Sessions 3, 4, 5.

**Definition of done**: Full golden-path — submit query, plan card appears, edit a step, click Run Analysis, step icons animate, plan collapses after completion, follow-up query adapts previous plan.

---

### Implementation Steps

**Step 6.1 — Extend ChatMessages.jsx**

Add `import AnalysisPlan from "./AnalysisPlan"` and new props:
`planState, onPlanUpdateStep, onPlanRemoveStep, onPlanReorderSteps, onPlanSetConstraints, onPlanApprove, onPlanDismiss`

In `renderMessage`, before `<ThoughtProcess>`:
```jsx
{isLastMessage && planState && planState.phase !== "idle" && (
  <AnalysisPlan
    planState={planState}
    onUpdateStep={onPlanUpdateStep}
    onRemoveStep={onPlanRemoveStep}
    onReorderSteps={onPlanReorderSteps}
    onSetConstraints={onPlanSetConstraints}
    onApprove={onPlanApprove}
    onDismiss={onPlanDismiss}
    isLastMessage={true}
  />
)}
```

For completed history messages with `item.planSnapshot`:
```jsx
{item.planSnapshot && (
  <AnalysisPlan
    planState={{ ...item.planSnapshot, phase: "complete" }}
    onUpdateStep={() => {}} onRemoveStep={() => {}} onReorderSteps={() => {}}
    onSetConstraints={() => {}} onApprove={() => {}} onDismiss={() => {}}
    isLastMessage={false}
  />
)}
```

**Step 6.2 — Extend ChatInput.jsx**

Add props: `usePlanMode = true`, `fetchPlan`, `pendingQueryRef`, `chatHistory`, `addToChatHistory`, `isPlanPending`

In `handleSubmit`, two-phase logic:
```javascript
if (usePlanMode && fetchPlan) {
  const lastEntry = chatHistory[chatHistory.length - 1];
  const previousPlanSteps = lastEntry?.planSnapshot?.editedSteps ?? null;
  pendingQueryRef.current = { payload, formattedHistory, timestamp: new Date().toISOString() };
  addToChatHistory({ query: trimmedInput, response: "", isPlanPending: true, isStreaming: false, timestamp: pendingQueryRef.current.timestamp });
  await fetchPlan(payload, formattedHistory, null, previousPlanSteps);
  return;
}
```

Add plan mode toggle (checkbox) stored in `localStorage` key `"ql_plan_mode"`, default `true`.

Textarea disabled when `isPlanPending` is true, with placeholder "Review the plan above to continue."

**Step 6.3 — Extend ChatBox.jsx**

1. Import and instantiate `useAnalysisPlan`
2. Add `pendingQueryRef = useRef(null)`
3. Add all 7 handlers:
   - `handlePlanApprove`: calls `buildApprovedPlan()`, then `startStreaming(..., approvedPlan, updateStepStatus)`; `onComplete` updates `chatHistory` entry by timestamp + stores `planSnapshot` + calls `completePlan()`
   - `handlePlanReject`: `removePendingPlanEntry()` + `resetPlan()` + re-focus input
   - `handlePlanSkip`: `removePendingPlanEntry()` + `resetPlan()` + `startStreaming(..., null, null)`
   - `handlePlanRegenerate(feedback)`: `fetchPlan(payload, history, feedback, null)` — plan card updates in-place
   - `handleStepRetry`: `stopStreaming()` + `retryPlan()` + clears partial response in `chatHistory` + `startStreaming` again
   - `handleContinuePartial`: `completePlan()` — response already rendered
   - `removePendingPlanEntry`: pops last `chatHistory` entry if `isPlanPending: true`

4. Pass `isPlanPending={planState.phase === 'loading' || planState.phase === 'pending_approval'}` to `ChatInput`
5. Pass all plan props to `ChatMessages`

---

### Test Cases — Session 6

**T6.1 — Golden path: submit → plan card appears**
```javascript
test('submitting a query shows the plan card', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  render(<ChatBox />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Revenue?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Run Analysis/i })).toBeInTheDocument());
});
```

**T6.2 — Input locked during plan review**
```javascript
test('chat input is disabled while plan is in loading or pending_approval', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  render(<ChatBox />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Revenue?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => {
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByPlaceholderText(/Review the plan above/i)).toBeInTheDocument();
  });
});
```

**T6.3 — Scenario 1: Reject removes pending entry**
```javascript
test('Reject clears plan card and re-enables input', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  render(<ChatBox />);
  // submit query, wait for plan card
  await waitFor(() => screen.getByRole('button', { name: /Run Analysis/i }));
  fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /Run Analysis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });
});
```

**T6.4 — Scenario 2: Edit step, approve, stream starts**
```javascript
test('editing a step and approving sends edited task to stream', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  const mockStream = jest.spyOn(api, 'streamDataForQuery').mockImplementation(async () => {});
  render(<ChatBox />);
  await waitFor(() => screen.getByRole('button', { name: /Run Analysis/i }));
  fireEvent.click(screen.getByText('Fetch Q3 revenue data'));  // expand step
  fireEvent.change(screen.getByLabelText(/Agent question/i), { target: { value: 'Updated task' } });
  fireEvent.click(screen.getByRole('button', { name: /Run Analysis/i }));
  const streamPayload = mockStream.mock.calls[0][0];
  expect(streamPayload.approved_plan.steps[0].task).toBe('Updated task');
});
```

**T6.5 — Scenario 3: Constraints forwarded**
```javascript
test('user constraints are included in approved_plan', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  const mockStream = jest.spyOn(api, 'streamDataForQuery').mockImplementation(async () => {});
  render(<ChatBox />);
  await waitFor(() => screen.getByRole('button', { name: /Run Analysis/i }));
  fireEvent.change(screen.getByPlaceholderText(/Add constraints/i), { target: { value: 'Only Q3 2024' } });
  fireEvent.click(screen.getByRole('button', { name: /Run Analysis/i }));
  const streamPayload = mockStream.mock.calls[0][0];
  expect(streamPayload.approved_plan.user_constraints).toBe('Only Q3 2024');
});
```

**T6.6 — Scenario 5: Skip Plan executes without approvedPlan**
```javascript
test('Skip Plan calls startStreaming with null approvedPlan', async () => {
  jest.spyOn(api, 'generateAnalysisPlan').mockResolvedValue(mockPlan);
  const mockStart = jest.spyOn(streamingHook, 'startStreaming');
  render(<ChatBox />);
  await waitFor(() => screen.getByText(/Skip Plan/i));
  fireEvent.click(screen.getByText(/Skip Plan/i));
  expect(mockStart).toHaveBeenCalledWith(
    expect.anything(), expect.anything(), expect.anything(),
    expect.anything(), expect.anything(), null, null
  );
});
```

**T6.7 — Plan mode toggle persists to localStorage**
```javascript
test('disabling plan mode toggle stores false in localStorage', () => {
  render(<ChatInput usePlanMode={true} fetchPlan={jest.fn()} />);
  const toggle = screen.getByRole('checkbox', { name: /plan mode/i });
  expect(toggle).toBeChecked();  // default ON
  fireEvent.click(toggle);
  expect(localStorage.getItem('ql_plan_mode')).toBe('false');
  expect(toggle).not.toBeChecked();
});
```

**T6.8 — planSnapshot saved in chatHistory on completion**
```javascript
test('planSnapshot is stored after streaming completes', async () => {
  let capturedOnComplete;
  jest.spyOn(streamingHook, 'startStreaming').mockImplementation(
    (payload, model, history, onComplete) => { capturedOnComplete = onComplete; }
  );
  render(<ChatBox />);
  // submit and approve plan
  await waitFor(() => screen.getByRole('button', { name: /Run Analysis/i }));
  fireEvent.click(screen.getByRole('button', { name: /Run Analysis/i }));
  act(() => capturedOnComplete('Final answer text'));
  await waitFor(() => {
    const history = getChatHistorySnapshot();
    const lastEntry = history[history.length - 1];
    expect(lastEntry.planSnapshot).toBeDefined();
    expect(lastEntry.planSnapshot.editedSteps).toHaveLength(1);
    expect(lastEntry.isPlanPending).toBe(false);
  });
});
```

**T6.9 — Follow-up query reuses previous planSnapshot steps**
```javascript
test('second query passes previous plan steps to fetchPlan', async () => {
  const mockFetch = jest.spyOn(analysisPlanHook, 'fetchPlan');
  // simulate completed first query with planSnapshot in chatHistory
  render(<ChatBox initialHistory={[completedEntryWithPlanSnapshot]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Now compare to Q4?' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), null,
      expect.arrayContaining([expect.objectContaining({ agent_name: 'sales_agent' })])
    );
  });
});
```

---

## Session 7 — Verification & Hardening

**Goal**: All 7 user scenarios verified; no regressions in existing behavior.

**Dependencies**: Sessions 1–6 complete.

---

### Full Backend Test Suite

```bash
cd orchestrator && poetry run pytest tests/ -v --tb=short 2>&1 | tee /tmp/test_results.txt
grep -E "PASSED|FAILED|ERROR" /tmp/test_results.txt | tail -20
```
Pass: zero FAILEDs or ERRORs.

### Full Frontend Test Suite

```bash
cd frontend && npm test -- --coverage --watchAll=false 2>&1 | tail -30
```
Pass: all tests green, no console errors.

---

### Scenario End-to-End Verification

| Scenario | Manual Test Steps | Pass Condition |
|---|---|---|
| **Sc 1 — Reject** | Submit query → plan appears → click Reject | Plan card gone, input re-focused, no agent call made |
| **Sc 2 — Edit + Approve** | Submit → plan appears → expand step → change task text → Run Analysis | `decompose_node` skipped (no `thought/decompose` in SSE), edited task text sent to agent |
| **Sc 3 — Constraints** | Submit → plan appears → fill constraints box → Run Analysis | SSE stream's `initial_state.user_query` contains constraint text |
| **Sc 4 — Regenerate** | Submit → plan appears → click Regenerate → type "include comparison" → Go | New plan card replaces old, old plan gone, no duplicate chat entry |
| **Sc 5 — Skip Plan** | Submit → plan appears → click "Skip Plan →" | Plan card gone, execution starts immediately, plan mode toggle unchanged |
| **Sc 6 — Error** | Stop orchestrator → submit query | Error card appears with Retry + Execute Without Plan buttons |
| **Sc 7 — Step Retry** | Mock agent to fail → submit + approve → observe step fail → click Retry Plan | Step resets to pending, full plan re-executes on fresh SSE connection |
| **Backward compat** | Toggle plan mode OFF → submit query | No plan card, direct `decompose→route→synthesise` flow, no SSE regressions |

---

### Performance Benchmarks

- `POST /api/v3/query/plan` response time: **p95 < 3s**
  ```bash
  ab -n 20 -c 2 -T application/json \
     -H "Authorization: Bearer <tok>" \
     -p /tmp/plan_body.json \
     http://localhost:8082/api/v3/query/plan
  ```
  Pass: `Percentage of the requests served within a certain time (ms)` — 95th percentile row shows < 3000ms.

- Plan card first render (spinner): **< 200ms** after user presses Enter.
  Measured in browser DevTools → Performance tab → from keydown/click event to first paint of spinner element.

---

### New Test Files Summary

| Test File | Session | Framework | Test IDs |
|---|---|---|---|
| `orchestrator/tests/unit/test_state_s1.py` | 1 | pytest | T1.2 |
| `orchestrator/tests/unit/test_models_s1.py` | 1 | pytest | T1.3, T1.4 |
| `orchestrator/tests/unit/test_plan_generator.py` | 2 | pytest-asyncio | T2.3, T2.4, T2.5 |
| `orchestrator/tests/unit/test_orchestrator_graph_s3.py` | 3 | pytest | T3.1 |
| `orchestrator/tests/unit/test_nodes_s3.py` | 3 | pytest-asyncio | T3.2, T3.3 |
| `frontend/tests/api.test.js` | 4 | Jest | T4.1, T4.2 |
| `frontend/tests/useAnalysisPlan.test.js` | 4 | Jest + RTL | T4.3–T4.6 |
| `frontend/tests/AnalysisPlan.test.jsx` | 5 | Jest + RTL | T5.1–T5.9 |
| `frontend/tests/ChatBox.integration.test.jsx` | 6 | Jest + RTL | T6.1–T6.9 |
