# White-Box Execution Transparency — Session Implementation Guide

**Source plan:** `white-box-execution-transparency.md`
**Total changes:** 12 across 8 files
**Sessions:** 7 (ordered by dependency)

---

## Session 1 — Foundation Layer
**Files:** `state.py`, `llm_observability.py`
**Plan changes:** Change 1, Change 5
**Prerequisite:** None — start here

### Objective
Lay the two foundational pieces that every other session depends on:
1. Extend `SubTask` to carry `reasoning`
2. Add the `extract_tool_events` helper that extracts MCP tool calls from the LangChain message chain

---

### Task 1.1 — Add `reasoning` to SubTask (`state.py`)
**File:** `orchestrator/orchestrator/graph/state.py`
**Location:** `SubTask` TypedDict (line 17)

- [ ] Open `state.py`
- [ ] In `SubTask`, add one new optional field after `step_id`:
  ```python
  reasoning: Optional[str]  # why this agent was chosen (from decompose LLM)
  ```
- [ ] Confirm `Optional` is already imported from `typing` (it is — line 12)
- [ ] No other changes to this file

**Expected result:**
```python
class SubTask(TypedDict):
    task_id: str
    agent_name: str
    task: str
    step_id: Optional[str]
    reasoning: Optional[str]  # NEW
```

---

### Task 1.2 — Add `extract_tool_events` helper (`llm_observability.py`)
**File:** `agents/querylab_agent/llm_observability.py`
**Location:** After `count_tool_events` function (~line 46)

- [ ] Open `llm_observability.py`
- [ ] Locate `count_tool_events` function — insert new function immediately after it
- [ ] Add `extract_tool_events(messages: list) -> list[dict]`:
  - Iterates messages list
  - On `AIMessage` with `tool_calls` attr → records pending calls keyed by call_id
  - On `ToolMessage` (has `tool_call_id`) → matches with pending, builds event dict `{tool, args, result[:500], truncated}`
  - For `generate_sql` tool → additionally parses JSON result to extract `sql_query` field and adds as `event["sql"]`
  - Returns ordered list of events
- [ ] No new imports needed at module level (uses `getattr`, standard `json` imported inline)

**Smoke test (run after this task):**
```bash
cd agents && poetry run python -c "
from querylab_agent.llm_observability import extract_tool_events
print('OK:', extract_tool_events([]))
"
```

---

### Session 1 Verification
```bash
# state.py import check
cd orchestrator && poetry run python -c "
from orchestrator.graph.state import SubTask
t = SubTask(task_id='x', agent_name='a', task='q', step_id=None, reasoning='test reason')
print('SubTask OK:', t['reasoning'])
"

# llm_observability helper check
cd agents && poetry run python -c "
from querylab_agent.llm_observability import extract_tool_events
result = extract_tool_events([])
print('extract_tool_events OK:', result)
"
```

---

---

## Session 2 — Agent-Side Transport Layer
**Files:** `a2a/messages.py`, `api.py`
**Plan changes:** Change 6, Change 7
**Prerequisite:** Session 1 complete (`extract_tool_events` must exist)

### Objective
Add `tool_events` as a field on `A2AResponse` (the HTTP response model from agent → orchestrator),
and populate it in both agent invocation paths in `api.py`.

---

### Task 2.1 — Add `tool_events` field to `A2AResponse` (`a2a/messages.py`)
**File:** `agents/querylab_agent/a2a/messages.py`
**Location:** After `estimated_cost_usd` field (line ~59)

- [ ] Open `a2a/messages.py`
- [ ] Confirm `Optional`, `List`, `Dict`, `Any` are imported from `typing` / `pydantic`
- [ ] After `estimated_cost_usd` field, add:
  ```python
  tool_events: Optional[List[Dict[str, Any]]] = Field(
      default=None,
      description="Ordered list of tool calls made during execution (for white-box audit)"
  )
  ```
- [ ] Confirm `Field` is already imported from `pydantic` (it is — used by other fields)

**Expected result:** `A2AResponse` now has `tool_events` as an optional list, defaults to `None`.

---

### Task 2.2 — Populate `tool_events` in `api.py` — Location A (skill path)
**File:** `agents/querylab_agent/api.py`
**Location:** Skill invocation path — after `out = await runner.ainvoke(...)` (~line 398), before `return A2AResponse(...)`

- [ ] Open `api.py`
- [ ] Find the skill invocation path's `return A2AResponse(...)` block (~line 411)
- [ ] Add import at the top of the function/try block:
  ```python
  from querylab_agent.llm_observability import extract_tool_events
  ```
  (or add to module-level imports if not already there)
- [ ] Before the `return A2AResponse(...)`, add:
  ```python
  _tool_events = extract_tool_events(out.get("messages", []))
  ```
- [ ] Add `tool_events=_tool_events or None` to the `A2AResponse(...)` constructor call

---

### Task 2.3 — Populate `tool_events` in `api.py` — Location B (agent-router path)
**File:** `agents/querylab_agent/api.py`
**Location:** Agent-level router path — after `out = await runner.ainvoke(...)` (~line 307), before `return A2AResponse(...)` (~line 321)

- [ ] Find the agent-router path's `return A2AResponse(...)` block (~line 321)
- [ ] Same pattern as Task 2.2:
  ```python
  _tool_events = extract_tool_events(out.get("messages", []))
  ```
- [ ] Add `tool_events=_tool_events or None` to this `A2AResponse(...)` constructor too
- [ ] Ensure `extract_tool_events` import is not duplicated — import once at module level or shared try block

---

### Session 2 Verification
```bash
cd agents && poetry run python -c "
from querylab_agent.a2a.messages import A2AResponse
r = A2AResponse(
    task_id='t1',
    status='success',
    tool_events=[{'tool': 'MCP_get_schema', 'args': {}, 'result': 'ok', 'truncated': False}]
)
print('A2AResponse tool_events OK:', len(r.tool_events))
print('A2AResponse None default OK:', A2AResponse(task_id='t2', status='success').tool_events)
"
```

---

---

## Session 3 — Orchestrator SSE Events (Original 4)
**Files:** `nodes.py`
**Plan changes:** Change 2, Change 3, Change 4
**Prerequisite:** Session 1 complete (`reasoning` field on SubTask must exist)

### Objective
Expose decomposition reasoning, raw agent responses, and synthesis strategy as SSE `thought` events.
All changes are in `nodes.py` only.

---

### Task 3.1 — Update `_DECOMPOSE_SYSTEM` prompt (Change 2a)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** `_DECOMPOSE_SYSTEM` string (line 36)

- [ ] Find the return format block at the bottom of `_DECOMPOSE_SYSTEM`
- [ ] Replace:
  ```
  Return format (JSON array, no other text):
  [
    {{"agent_name": "name_of_agent", "task": "specific question for this agent"}},
    ...
  ]
  ```
  With:
  ```
  - "reasoning" is one sentence (max 80 chars) explaining why this agent was chosen
    for this specific sub-task.

  Return format (JSON array, no other text):
  [
    {{"agent_name": "name_of_agent", "task": "specific question for this agent",
     "reasoning": "why this agent handles this part"}},
    ...
  ]
  ```
- [ ] Also remove the old Rules line `"Return ONLY valid JSON — a JSON array of objects with keys "agent_name" and "task""` and update it to include `"reasoning"` as a third key

---

### Task 3.2 — Parse `reasoning` in decompose loop (Change 2b)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** `for item in parsed:` loop (~line 117)

- [ ] Find the loop:
  ```python
  for item in parsed:
      agent_name = (item.get("agent_name") or "").strip()
      task = (item.get("task") or "").strip()
      if agent_name and task:
          sub_tasks.append(SubTask(task_id=..., agent_name=agent_name, task=task))
  ```
- [ ] Add reasoning extraction after `task =` line:
  ```python
  reasoning = (item.get("reasoning") or "").strip()[:80]
  ```
- [ ] Add `reasoning=reasoning or None` to `SubTask(...)` constructor

---

### Task 3.3 — Enhance `thought/decompose` SSE event (Change 2c)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** `await event_queue.put(_sse("thought", {...}))` for decompose (~line 151)

- [ ] Find the existing decompose thought event:
  ```python
  "sub_tasks": [{"agent": t["agent_name"], "task": t["task"]} for t in sub_tasks],
  ```
- [ ] Add `reasoning` to each sub_task dict:
  ```python
  "sub_tasks": [
      {"agent": t["agent_name"], "task": t["task"], "reasoning": t.get("reasoning") or ""}
      for t in sub_tasks
  ],
  ```

---

### Task 3.4 — Emit `thought/decompose_fallback` event (Change 2d)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** Fallback branch (~line 139), before `logger.info`

- [ ] Find the fallback block:
  ```python
  if not sub_tasks:
      fallback = agent_cards[0]["name"] if agent_cards else "default"
      sub_tasks = [SubTask(...)]
      logger.info("[%s] decompose_node: fallback to agent=%r", trace_id, fallback)
  ```
- [ ] Insert new SSE event **before** `logger.info`:
  ```python
  await event_queue.put(_sse("thought", {
      "type": "decompose_fallback",
      "content": f"Decomposition failed — routing entire query to {fallback}",
      "fallback_agent": fallback,
  }))
  ```

---

### Task 3.5 — Emit `thought/agent_response` event (Change 3)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** Inside `_call_one`, after the existing `tool_result` event (~line 249)

- [ ] Find the `tool_result` thought event block (on the success path):
  ```python
  await event_queue.put(_sse("thought", {
      "type": "tool_result",
      "tool": agent_name,
      "content": f"Completed: {agent_name}",
  }))
  ```
- [ ] Add new event immediately after it:
  ```python
  await event_queue.put(_sse("thought", {
      "type": "agent_response",
      "agent": agent_name,
      "step_id": step_id,
      "answer": result[:1000],
      "truncated": len(result) > 1000,
      "metadata": {
          "mcp_server": mcp_server,
          "tool_calls": tool_calls,
          "total_tokens": total_tokens,
      },
  }))
  ```
- [ ] This is on the **success path only** — do NOT add to the except block

---

### Task 3.6 — Emit `thought/synthesis_context` event (Change 4)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** `synthesise_node`, after the `if not responses` guard (~line 325), before the passthrough branch

- [ ] Find the guard:
  ```python
  if not responses:
      ...
      return {"final_answer": final_answer}

  # ── Single successful response: pass through ──
  if len(responses) == 1 and responses[0]["status"] != "failed":
  ```
- [ ] Insert between the guard's `return` and the passthrough `if`:
  ```python
  successful = [r for r in responses if r["status"] != "failed"]
  strategy = "passthrough" if len(successful) == 1 else "multi_agent_synthesis"
  await event_queue.put(_sse("thought", {
      "type": "synthesis_context",
      "strategy": strategy,
      "agents_used": [r["agent_name"] for r in successful],
      "failed_agents": [r["agent_name"] for r in responses if r["status"] == "failed"],
  }))
  ```

---

### Session 3 Verification
```bash
# Start orchestrator
cd orchestrator && poetry run uvicorn orchestrator.app:app --reload --port 8082

# Stream a query and check for new event types
curl -N -X POST http://localhost:8082/api/v3/query/stream \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the total count for category A?","session_id":"s1","user_id":"u1","collection":""}' \
  2>/dev/null | grep '"type"'
```

**Expected in output:**
```
"type":"decompose"        ← sub_tasks now include "reasoning" field
"type":"agent_response"   ← shows raw answer + metadata
"type":"synthesis_context" ← shows strategy + agents_used
```

**Regression check:** `tool_call`, `tool_result`, `token`, `complete` events still present.

---

---

## Session 4 — Pipeline Wiring + Tier 1 SSE Events
**Files:** `query_stream.py`, `nodes.py`
**Plan changes:** Change 8, Change 9
**Prerequisite:** Sessions 1, 2, and 3 all complete

### Objective
Wire `tool_events` from the agent HTTP response through to the orchestrator node,
then emit `agent_tool_trace` and `sql_generated` SSE events so the frontend can show
exactly which MCP tools were called, with what arguments (including table names), and what SQL was generated.

---

### Task 4.1 — Pass `tool_events` through `_ask_agent` (Change 8)
**File:** `orchestrator/orchestrator/query_stream.py`
**Location:** `_ask_agent` return dict (~line 165)

- [ ] Open `query_stream.py`
- [ ] Find the `return { "answer": answer, "artifacts": ... }` dict in `_ask_agent`
- [ ] Add one new key at the end:
  ```python
  "tool_events": data.get("tool_events") or [],
  ```
- [ ] No other changes to this function

---

### Task 4.2 — Emit `agent_tool_trace` and `sql_generated` SSE events (Change 9)
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** `_call_one`, immediately after the `agent_response` event added in Session 3 (Task 3.5)

- [ ] Find the `agent_response` event block added in Task 3.5
- [ ] Add the Tier 1 loop immediately after it:
  ```python
  for seq, te in enumerate(resp_data.get("tool_events") or [], start=1):
      tool_name = te.get("tool", "")
      await event_queue.put(_sse("thought", {
          "type": "agent_tool_trace",
          "agent": agent_name,
          "step_id": step_id,
          "seq": seq,
          "tool": tool_name,
          "args": te.get("args", {}),
          "result": te.get("result", ""),
          "truncated": te.get("truncated", False),
      }))
      if tool_name == "generate_sql" and te.get("sql"):
          await event_queue.put(_sse("thought", {
              "type": "sql_generated",
              "agent": agent_name,
              "step_id": step_id,
              "sql": te["sql"],
              "seq": seq,
          }))
  ```
- [ ] This loop emits 0 events if `tool_events` is empty — safe when Tier 1 agent-side changes are not yet deployed

---

### Session 4 Verification
```bash
# Full end-to-end stream — check all 6 new event types appear
curl -N -X POST http://localhost:8082/api/v3/query/stream \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"Compare total units sold vs average order value","session_id":"s1","user_id":"u1","collection":""}' \
  2>/dev/null | grep '"type"'
```

**Expected — all 6 new types visible:**
```
"type":"decompose"           ← with reasoning[] per sub_task
"type":"agent_response"      ← once per successful agent
"type":"agent_tool_trace"    ← once per MCP/tool call (shows table names in args)
"type":"sql_generated"       ← once per SQL query generated
"type":"synthesis_context"   ← strategy + agents_used
```

**Decompose fallback test:**
- Temporarily break the `_DECOMPOSE_SYSTEM` prompt JSON format
- Verify `"type":"decompose_fallback"` appears in stream
- Revert the break

**Full regression:**
```bash
cd orchestrator && poetry run pytest tests/ -v --tb=short
```
All existing tests must pass.

---

---

## Summary Table

| Session | Changes | Files | Prerequisite |
|---------|---------|-------|--------------|
| Session 1 — Foundation | 1, 5 | `state.py`, `llm_observability.py` | None |
| Session 2 — Agent Transport | 6, 7 | `a2a/messages.py`, `api.py` | Session 1 |
| Session 3 — Orchestrator SSE | 2, 3, 4 | `nodes.py` | Session 1 |
| Session 4 — Tier 1 Wiring | 8, 9 | `query_stream.py`, `nodes.py` | Sessions 1+2+3 |
| Session 5 — Frontend Rendering | F1 | `ChatMessages.jsx` | Sessions 1–4 complete |
| Session 6 — ExecutionTrace Redesign | F2 | `ChatMessages.jsx` | Session 5 complete |
| Session 7 — Decision Canvas | C1, C2, C3 | `ChatMessages.jsx`, `App.jsx`, `DecisionCanvas.jsx` | Session 6 complete |
| Session 8 — Universal Chart Synthesis | C4 | `state.py`, `nodes.py`, `query_stream.py` | None (independent) |

> Sessions 2 and 3 can run in **parallel** — they have no dependency on each other,
> only on Session 1.
> Session 8 is fully independent and can run in parallel with any other session.

---

---

## Session 5 — Frontend ThoughtProcess Rendering
**Files:** `frontend/src/components/ChatMessages.jsx`
**Plan change:** F1 (6 sub-tasks: F1.1 – F1.5 + badge content helper)
**Prerequisite:** Sessions 1–4 complete (all backend SSE events emitting)

### Objective
Add proper rendering for the 5 new `thought` event types in the `ThoughtProcess`
component. Currently they appear as anonymous grey badge pills (default fallback).
No hook changes needed — `useStreamingQuery.js:87` already spreads the full
`thoughtData` object into state, so all extra fields are preserved.

---

### Task 5.1 — Add `AlertTriangle` to lucide-react import (F1.1)
**File:** `frontend/src/components/ChatMessages.jsx`, line 9

- [ ] Open `ChatMessages.jsx`
- [ ] Find the lucide-react import line
- [ ] Add `AlertTriangle` to the import list

```js
import { X, ArrowDown, User, Bot, Brain, Database, CheckCircle2, Loader2, Copy,
         Check, ChevronDown, RotateCcw, ThumbsUp, ThumbsDown, AlertTriangle } from "lucide-react";
```

---

### Task 5.2 — Extend `getIcon()` with 6 new cases (F1.2)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** `getIcon()` switch inside `ThoughtProcess` (~line 61)

- [ ] Add after the last existing `case`:
```jsx
case 'decompose':
  return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
case 'decompose_fallback':
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
case 'agent_response':
  return <Bot className="w-3.5 h-3.5 text-blue-500" />;
case 'synthesis_context':
  return <Brain className="w-3.5 h-3.5 text-purple-500" />;
case 'agent_tool_trace':
  return <Database className="w-3.5 h-3.5 text-slate-500" />;
case 'sql_generated':
  return <Database className="w-3.5 h-3.5 text-blue-600" />;
```

---

### Task 5.3 — Extend `getStyle()` with 6 new cases (F1.3)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** `getStyle()` switch (~line 91)

- [ ] Add after the last existing `case`:
```jsx
case 'decompose':
  return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-300';
case 'decompose_fallback':
  return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
case 'agent_response':
  return 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
case 'synthesis_context':
  return 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800/50 dark:text-purple-300';
case 'agent_tool_trace':
  return 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
case 'sql_generated':
  return 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
```

---

### Task 5.4 — Update `cardTypes` array (F1.4)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** `const cardTypes = [...]` (~line 121)

- [ ] Find:
```js
const cardTypes = ['interpretation', 'assumptions', 'understanding', 'sql', 'top_document'];
```
- [ ] Replace with:
```js
const cardTypes = [
  'interpretation', 'assumptions', 'understanding', 'sql', 'top_document',
  'decompose', 'agent_response', 'agent_tool_trace', 'sql_generated',
];
// decompose_fallback and synthesis_context remain as badge pills (short content)
```

---

### Task 5.5 — Add `getContent()` helper for badge types (F1.5a)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** Just above the `return (` of `ThoughtProcess` (~line 133)

- [ ] Add:
```jsx
const getContent = (thought) => {
  if (thought.type === 'synthesis_context') {
    return thought.strategy === 'passthrough'
      ? 'Passthrough'
      : `Synthesising ${thought.agents_used?.length ?? ''} agent(s)`;
  }
  return thought.content;
};
```
- [ ] In the badge `<span>` render (~line 188), replace `{thought.content}` with `{getContent(thought)}`

---

### Task 5.6 — Add `renderCardBody()` helper and wire into card render (F1.5b)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** Immediately after `getContent`, still above the `return (`

- [ ] Add the `renderCardBody(thought)` helper (see full spec in plan file `F1.5`):

```jsx
const renderCardBody = (thought) => {
  switch (thought.type) {

    case 'decompose': {
      const label = thought.from_plan
        ? `Using approved plan — ${thought.sub_tasks?.length ?? 0} step(s)`
        : `Decomposed into ${thought.sub_tasks?.length ?? 0} sub-task(s)`;
      return (
        <div className="w-full space-y-1">
          <div className="font-medium text-[11px]">{label}</div>
          {(thought.sub_tasks || []).map((st, i) => (
            <div key={i} className="flex flex-col gap-0.5 pl-2 border-l border-indigo-200">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                  {st.agent}
                </span>
                <span className="text-[11px] truncate">{st.task}</span>
              </div>
              {st.reasoning && (
                <span className="text-[10px] italic text-indigo-500 pl-0.5">{st.reasoning}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    case 'agent_response': {
      const meta = thought.metadata || {};
      return (
        <div className="w-full space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold">{thought.agent}</span>
            {thought.truncated && (
              <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-600">truncated</span>
            )}
          </div>
          <p className="text-[11px] line-clamp-3 break-words">{thought.answer}</p>
          <div className="flex flex-wrap gap-1 pt-0.5">
            {meta.mcp_server && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">{meta.mcp_server}</span>
            )}
            {meta.tool_calls != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                {meta.tool_calls} tool call{meta.tool_calls !== 1 ? 's' : ''}
              </span>
            )}
            {meta.total_tokens != null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                {meta.total_tokens} tokens
              </span>
            )}
          </div>
        </div>
      );
    }

    case 'agent_tool_trace': {
      const argsStr = thought.args ? JSON.stringify(thought.args).slice(0, 120) : '';
      return (
        <div className="w-full space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold font-mono">#{thought.seq} {thought.tool}</span>
            {thought.truncated && (
              <span className="px-1 py-0.5 rounded text-[10px] bg-slate-200 text-slate-500">truncated</span>
            )}
          </div>
          {argsStr && (
            <code className="block text-[10px] font-mono break-all line-clamp-2 group-hover:line-clamp-none bg-slate-100 rounded px-1.5 py-1">
              {argsStr}
            </code>
          )}
          {thought.result && (
            <p className="text-[11px] line-clamp-2 group-hover:line-clamp-none break-words">
              {thought.result}
            </p>
          )}
        </div>
      );
    }

    case 'sql_generated': {
      return (
        <div className="w-full space-y-1">
          <div className="text-[11px] font-semibold">#{thought.seq} SQL — {thought.agent}</div>
          <code className="block text-[10px] font-mono break-all line-clamp-4 group-hover:line-clamp-none bg-blue-100 rounded px-1.5 py-1">
            {thought.sql}
          </code>
        </div>
      );
    }

    default:
      return thought.type === 'sql'
        ? <code className="text-xs font-mono break-all line-clamp-2 group-hover:line-clamp-none">{thought.content}</code>
        : <span className="break-words line-clamp-2 group-hover:line-clamp-none">{thought.content}</span>;
  }
};
```

- [ ] In the card `{cardThoughts.map(...)}` JSX (~line 198), replace:
```jsx
{thought.type === 'sql' ? (
  <code className="text-xs font-mono break-all line-clamp-2 group-hover:line-clamp-none">{thought.content}</code>
) : (
  <span className="break-words line-clamp-2 group-hover:line-clamp-none">{thought.content}</span>
)}
```
With:
```jsx
{renderCardBody(thought)}
```

---

### Session 5 Verification

```bash
cd frontend && npm run dev
```

Submit a synthetic test query (e.g., "What is the total count for category A in the last 30 days?")

Open the "Thought for Xs" collapsible panel and verify:

| Event type | Expected rendering |
|---|---|
| `decompose` | Indigo card — sub-task rows with agent chip + task + italic reasoning |
| `decompose_fallback` | Amber badge — AlertTriangle icon + fallback message |
| `agent_response` | Blue card — agent name, answer snippet (3-line clamp), metadata chips |
| `synthesis_context` | Purple badge — "Passthrough" or "Synthesising N agent(s)" |
| `agent_tool_trace` | Slate card — `#N tool_name`, args JSON snippet, result snippet |
| `sql_generated` | Blue code card — `#N SQL — agent_name` + monospace SQL block |

**Regression checks:**
- `tool_call` → blue badge (unchanged)
- `tool_result` → green badge (unchanged)
- `thinking` → purple badge (unchanged)
- `sql` (old type from existing agents) → blue card with `thought.content` (unchanged)
- Dark mode toggle — all new dark: variants render correctly
- Hover on any card → `line-clamp-none` expands full content

---

---

## Session 6 — ExecutionTrace Step-Card Redesign
**Files:** `frontend/src/components/ChatMessages.jsx`
**Plan change:** F2 (5 sub-tasks: F2.1 – F2.5)
**Prerequisite:** Session 5 complete

### Objective
Redesign the `ExecutionTrace` component (separate panel below `ThoughtProcess`) from a flat
`divide-y` function-signature list into a **numbered step-card** layout matching the plan review
UI: blue numbered badge per call, bold tool name, arg badge pills showing data sources, and
card-level expand for Input/Output.

No backend changes. No hook changes. Only `ExecutionTrace` (~lines 361–530) is touched.

---

### Task 6.1 — Numbered step badge (replaces spinner/checkmark icon)
**Location:** `ExecutionTrace`, inside `tier1.map`, `agent_tool_trace` branch — button row

- [ ] Remove `<Loader2>` and `<CheckCircle2>` icon elements
- [ ] Replace with:
```jsx
<div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
  text-[10px] font-bold leading-none select-none
  ${isActive && !t.result
    ? 'border-2 border-blue-400 text-blue-400 animate-pulse bg-white dark:bg-gray-900'
    : 'bg-blue-600 text-white'}`}>
  {String(idx + 1).padStart(2, '0')}
</div>
```
Active in-progress = pulsing ring; completed = solid blue filled circle.

---

### Task 6.2 — Title + seq row (two-line content block)
**Location:** Same button row, replacing the existing `<span>{t.tool}</span>` + `<span>({preview})</span>`

- [ ] Remove the two existing inline `<span>` elements
- [ ] Add a `firstDesc` computed value: first string arg value (max 60 chars) for a description hint
- [ ] Replace with:
```jsx
const firstDesc = (() => {
  if (!t.args) return '';
  const firstStr = Object.values(t.args).find(v => typeof v === 'string');
  return firstStr ? firstStr.slice(0, 60) + (firstStr.length > 60 ? '…' : '') : '';
})();

<div className="flex-1 min-w-0">
  <div className="flex items-center justify-between gap-2">
    <span className="font-mono text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">
      {t.tool}
    </span>
    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">#{t.seq}</span>
  </div>
  {firstDesc && (
    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{firstDesc}</p>
  )}
</div>
```
- [ ] Remove the old `{t.truncated && <span>truncated</span>}` — truncated moves into pill row (Task 6.3)

---

### Task 6.3 — Arg pills row (always visible, not gated on expand)
**Location:** After the title block, still inside the `<button>` (or just outside it, below the button header)

- [ ] Add immediately after the title `<div>`, inside a wrapping `<div className="px-3 pb-2.5">`:
```jsx
{t.args && Object.keys(t.args).length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1.5">
    {Object.entries(t.args).map(([k, v]) => {
      const display = typeof v === 'string'
        ? v.slice(0, 30) + (v.length > 30 ? '…' : '')
        : JSON.stringify(v).slice(0, 30);
      return (
        <code key={k}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono
                     bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          {k}={display}
        </code>
      );
    })}
    {t.truncated && (
      <code className="px-1.5 py-0.5 rounded text-[10px] font-mono
                       bg-amber-50 dark:bg-amber-900/20 text-amber-600">truncated</code>
    )}
  </div>
)}
```

---

### Task 6.4 — Card wrapper (replace divide-y list)
**Location:** The outer container `<div>` that wraps the `tier1.map`

- [ ] Remove:
```jsx
<div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
```
- [ ] Replace with:
```jsx
<div className="mt-1.5 space-y-1.5">
```
- [ ] Each `agent_tool_trace` item card becomes:
```jsx
<div key={idx}
  className="rounded-lg border border-gray-200 dark:border-gray-700
             bg-white dark:bg-gray-900 overflow-hidden">
```
(Remove the old `<div key={idx} className="bg-white dark:bg-gray-900">` — the border is now on the card itself)

---

### Task 6.5 — SQL step card redesign
**Location:** `sql_generated` branch inside `tier1.map`

- [ ] Replace entire `sql_generated` branch with:
```jsx
if (t.type === 'sql_generated') {
  const firstLine = (t.sql || '').split('\n')[0].trim().slice(0, 80);
  return (
    <div key={idx}
      className="rounded-lg border border-blue-200 dark:border-blue-800/50
                 bg-white dark:bg-gray-900 overflow-hidden">
      <button onClick={() => toggleItem(idx)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left
                   hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white
                        flex items-center justify-center text-[10px] font-bold leading-none">
          {String(idx + 1).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-gray-800 dark:text-gray-200">
              generate_sql
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono
                             bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              SQL
            </span>
          </div>
          {firstLine && (
            <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {firstLine}
            </p>
          )}
        </div>
        <ChevronDown
          className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5 transition-transform duration-150"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>
      {open && (
        <div className="border-t border-blue-100 dark:border-blue-800/50 px-4 pt-2.5 pb-2.5">
          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">SQL</p>
          <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300
                          bg-gray-50 dark:bg-gray-800 rounded p-2.5 overflow-x-auto
                          whitespace-pre leading-relaxed">{t.sql}</pre>
        </div>
      )}
    </div>
  );
}
```

---

### Session 6 Verification

```bash
cd frontend && npm run dev
```

Submit a synthetic test query and open the "Tool calls" panel:

| Check | Expected |
|---|---|
| Step badges | Blue `01`, `02`… circles; active step shows pulsing ring |
| Title row | Tool name bold, `#seq` number right-aligned |
| Arg pills | `key=val` monospace chips visible without expanding |
| Expand card | Click → Input (JSON) and Output sections appear |
| SQL card | Blue border, `generate_sql` + `SQL` pill, first SQL line inline |
| SQL expand | Full SQL in `<pre>` block with `SQL` label |
| Panel header | "Tool calls" + count still present, unchanged |

**Regression:**
- `ThoughtProcess` panel (Session 5 cards) must render unchanged
- Dark mode: all `dark:` variants render correctly
- No blank-screen crashes — hooks still called unconditionally

---

---

## Session 7 — Decision Canvas (Chart View)
**Files:** `frontend/src/components/ChatMessages.jsx`, `frontend/src/App.jsx`, `frontend/src/components/DecisionCanvas.jsx`
**Plan change:** C1, C2, C3
**Prerequisite:** Session 6 complete

### Objective
Add a **"Chart" button** to the message action bar that appears on completed responses containing
data (chart, table, or SQL). Clicking it opens a full-page **Decision Canvas** at `/canvas` — a
3-column workspace: conversation thread left, data cards center, insights + sources right.
No backend changes. No hook changes. No new API calls.

---

### Task 7.1 — Add imports and `useNavigate` to `ChatMessages.jsx` (C1a)
**File:** `frontend/src/components/ChatMessages.jsx`

- [ ] Find the existing react-router-dom import:
  ```javascript
  import { useLocation } from "react-router-dom";
  ```
- [ ] Add `useNavigate`:
  ```javascript
  import { useLocation, useNavigate } from "react-router-dom";
  ```
- [ ] Find the existing lucide-react import line
- [ ] Add `BarChart2` to the import list
- [ ] Inside the `ChatMessages` component body (alongside existing `useLocation` call), add:
  ```javascript
  const navigate = useNavigate();
  ```

---

### Task 7.2 — Add `hasCanvasData` helper (C1b)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** Just before the `renderMessage` function definition

- [ ] Add:
```javascript
const hasCanvasData = (item) =>
  !!(
    (item.plotlyJson && Object.keys(item.plotlyJson).length > 0) ||
    (item.artifacts && item.artifacts.some(a => ['chart', 'plotly', 'table'].includes(a.type))) ||
    (item.tableData && Object.keys(item.tableData).length > 0) ||
    (item.sql_query && Object.keys(item.sql_query).length > 0)
  );
```

---

### Task 7.3 — Add "Chart" button to message action bar (C1c)
**File:** `frontend/src/components/ChatMessages.jsx`
**Location:** Inside `renderMessage`, in the hover action bar block — the `div` that contains the
Copy, Regenerate, and thumbs buttons (visible when `hoveredIndex === index && !item.error && responseText && !isStreamingMessage`)

- [ ] Add the Chart button **before** the Copy button:
```jsx
{hasCanvasData(item) && (
  <button
    onClick={() => navigate('/canvas', { state: { message: item, chatHistory, messageIndex: index } })}
    title="Open in Decision Canvas"
    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary
               hover:text-[#0071e3] hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
  >
    <BarChart2 className="w-3.5 h-3.5" />
    <span>Chart</span>
  </button>
)}
```

---

### Task 7.4 — Register `/canvas` route in `App.jsx` (C2)
**File:** `frontend/src/App.jsx`

- [ ] Add import near the other component imports:
  ```javascript
  import DecisionCanvas from './components/DecisionCanvas';
  ```
- [ ] Inside the `<Routes>` (or `<Layout>`) block, add the new route:
  ```jsx
  <Route path="/canvas" element={<DecisionCanvas />} />
  ```
- [ ] Place it alongside the existing routes (`/chatBox`, `/settings`, `/agent-studio`, `/observability`)

---

### Task 7.5 — Create `DecisionCanvas.jsx` (C3)
**File:** `frontend/src/components/DecisionCanvas.jsx` (new file)

**Imports:**
```javascript
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import PlotlyChartSet from '../tables/PlotlyChartSet';
import { TableDataSet } from '../tables/TableDataSet';
```

**Guard — redirect if no state:**
```javascript
const { message, chatHistory, messageIndex } = useLocation().state || {};
if (!message) return <Navigate to="/chatBox" />;
```

**`CanvasCard` sub-component** (define at top of file, outside main component):
```jsx
const CanvasCard = ({ title, badge, children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-900 overflow-hidden mb-4">
    <div className="flex items-center justify-between px-4 py-2.5
                    border-b border-gray-100 dark:border-gray-800">
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</span>
      {badge && (
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800
                         px-2 py-0.5 rounded-full">{badge}</span>
      )}
    </div>
    <div className="p-4">{children}</div>
  </div>
);
```

**Layout (3-column, full viewport):**
```
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar: [← Chat] | "Query Title — Decision Canvas" | [Chart badge]   │
├─────────────────┬──────────────────────────────┬─────────────────────┤
│ Left (w-72)     │ Center (flex-1, overflow-y)   │ Right (w-72)        │
│ Conversation    │ Canvas cards grid             │ What Query Labs noticed   │
│ thread          │  Chart card(s)                │ • Agent finding 1   │
│ Scrollable      │  Table card(s)                │ • Agent finding 2   │
│ Current msg     │  SQL card(s)                  │ Sources             │
│ highlighted     │                               │ Follow-up chips     │
└─────────────────┴──────────────────────────────┴─────────────────────┘
```

**Top bar:**
- [ ] `←` button: calls `navigate(-1)`
- [ ] Title: `message.query.slice(0, 60)` + `' — Decision Canvas'`
- [ ] Small `Chart` badge pill (blue)

**Left panel — Conversation thread:**
- [ ] Render `chatHistory` items 0..messageIndex (inclusive)
- [ ] Each item: small user bubble (query, 1 line) + bot response text (max 120 chars)
- [ ] Current item (`messageIndex`) gets `border-l-2 border-blue-500 bg-blue-50/30` highlight
- [ ] `useEffect` scrolls highlighted item into view on mount

**Center panel — Canvas cards (render in this order):**
1. If `message.plotlyJson` is non-empty:
   ```jsx
   <CanvasCard title="Chart" badge={`from turn ${messageIndex + 1}`}>
     <PlotlyChartSet plotlyJson={message.plotlyJson} />
   </CanvasCard>
   ```
2. For each artifact where `type === 'chart' || type === 'plotly'`:
   ```jsx
   <CanvasCard title={artifact.title || 'Chart'} badge={`from turn ${messageIndex + 1}`}>
     <PlotlyChartSet plotlyJson={artifact.data} />
   </CanvasCard>
   ```
3. For each artifact where `type === 'table'`:
   ```jsx
   <CanvasCard title={artifact.title || 'Table'} badge={`from turn ${messageIndex + 1}`}>
     <TableDataSet tableData={artifact.data} />
   </CanvasCard>
   ```
4. If `message.tableData` is non-empty:
   ```jsx
   <CanvasCard title="Data" badge={`from turn ${messageIndex + 1}`}>
     <TableDataSet tableData={message.tableData} />
   </CanvasCard>
   ```
5. For each key in `message.sql_query` (if non-empty):
   ```jsx
   <CanvasCard title={`Query · ${key}`} badge="SQL">
     <pre className="text-xs font-mono overflow-x-auto whitespace-pre bg-gray-50
                     dark:bg-gray-800 rounded p-3">{sqlText}</pre>
   </CanvasCard>
   ```

**Right panel — What Query Labs noticed:**
```javascript
// Key findings from saved agent_response thoughts
const keyFindings = (message.thoughts || [])
  .filter(t => t.type === 'agent_response')
  .map(t => ({ agent: t.agent, text: (t.answer || '').slice(0, 200) }));

// Fallback: first 3 sentences of response text
const fallbackSentences = (message.response || '')
  .split('. ')
  .slice(0, 3)
  .filter(Boolean);
```
- [ ] Render findings as bullet list: agent name bold + answer snippet
- [ ] If `keyFindings` empty, render `fallbackSentences` as plain bullets
- [ ] Sources: `message.dataSources || []` — each as `•` bullet in monospace
- [ ] Follow-up chips: `message.followUpQuestions || []` — render as chips (same Tailwind style as ChatMessages follow-up chips); on click: `navigate(-1)` (no pre-fill in this session)

---

### Session 7 Verification

```bash
cd frontend && npm run dev
```

1. Submit a synthetic test query that returns a chart or table (e.g. "Show total counts by category")
2. After response completes, hover over the message → **"Chart" button appears** in action bar
3. Click "Chart" → navigates to `/canvas`
4. Verify Decision Canvas:
   - Top bar: query title + "Decision Canvas" label + `←` back button
   - Left panel: conversation thread, current message has blue left border highlight
   - Center: at least one card (Chart or Table or SQL) rendered correctly
   - Right panel: "What Query Labs noticed" bullets (agent findings or response sentences) + sources list
5. Click "← Chat" → returns to `/chatBox` correctly
6. For a **text-only response** (no data), "Chart" button does **NOT** appear
7. For a message with **only SQL** (no chart), only SQL card appears in center
8. Direct URL visit to `/canvas` (no state) → redirects to `/chatBox`

**Regression:**
- All existing inline chart/table rendering inside chat bubbles unchanged
- No change to Copy / Regenerate / thumbs buttons in action bar
- All existing routes (`/chatBox`, `/settings`, `/agent-studio`, `/observability`) work unchanged

---

---

## Session 8 — Universal Chart Synthesis
**Files:** `orchestrator/orchestrator/graph/state.py`, `orchestrator/orchestrator/graph/nodes.py`, `orchestrator/orchestrator/query_stream.py`
**Prerequisite:** None — fully independent of Sessions 1–7

### Objective

Charts must be generated whenever there is numerical data in the response, **regardless of
what format the agent returned its data in** (SQL results, JSON blobs, markdown tables, plain
prose, or mixed text). The agent's response format must never block chart generation.

The approach mirrors how Claude Code handles visualizations: the **synthesize step itself**
outputs a structured chart specification block alongside the text answer. Because the synthesis
LLM has full visibility of all agent responses, it can always extract and structure the data —
no post-hoc parsing heuristics needed.

---

### Current state (what was done before this session)

Three post-synthesis fallback sources already exist in `query_stream.py`:
- Source 1: SQL/tool artifacts returned by agents
- Source 2: `_parse_markdown_table()` — regex-parses a markdown table from the response text
- Source 3: LLM extraction call — asks an LLM to extract numerical rows from the response text
  (only triggers when query contains "chart"/"plot"/"graph"/"visualize" keywords)

**Problems:**
- Source 2 only works if the LLM happened to format its answer as a markdown table
- Source 3 is an extra LLM call (adds ~1–2 s latency) and is gated behind keyword matching
- None of the three sources are guaranteed — a prose response with inline numbers (e.g.
  "Customer A had an MRR of $12,000 and a health score of 45") produces no chart at all

---

### Architecture: Synthesis-time chart generation

**Core change:** Modify `synthesise_node` so the synthesis LLM outputs BOTH the text answer
AND a machine-readable chart specification block in one call — no extra LLM call needed.

```
New flow:
  Agent responses → synthesise_node (single LLM call)
                        ├─ text answer  → final_answer (shown to user)
                        └─ <querylab_chart> block → chart_vis (stored in state)
```

The `<querylab_chart>` block is stripped from `final_answer` before sending to the frontend.

**Chart block format (output by LLM, parsed by orchestrator):**
```json
<querylab_chart>
{
  "title": "Human-readable chart title",
  "x_label": "Column used as X axis (e.g. Customer, Date, Category)",
  "series": [
    {"name": "Series name (e.g. Health Score)", "x": ["A","B","C"], "y": [45, 72, 60]},
    {"name": "MRR", "x": ["A","B","C"], "y": [12000, 8500, 15000]}
  ]
}
</querylab_chart>
```

This format maps directly to Plotly bar traces without any column-detection heuristics.
The LLM is responsible for deciding which columns are X (categorical) vs Y (numeric).

---

### Step 8.1 — Add `chart_vis` to `OrchestratorState`
**File:** `orchestrator/orchestrator/graph/state.py`

Add one new optional field to `OrchestratorState` (after `final_answer`):
```python
chart_vis: Optional[Dict]   # Plotly spec generated during synthesis; None if not applicable
```

`Optional` and `Dict` are already imported from `typing`. No other changes to this file.

**Expected result:**
```python
class OrchestratorState(TypedDict):
    ...
    final_answer: Optional[str]
    chart_vis: Optional[Dict]    # NEW
```

---

### Step 8.2 — Add chart prompt constant to `nodes.py`
**File:** `orchestrator/orchestrator/graph/nodes.py`

Add a new module-level constant `_CHART_SPEC_PROMPT` directly below the existing
`_SYNTHESISE_SYSTEM` or `_DECOMPOSE_SYSTEM` constants:

```python
_CHART_SPEC_PROMPT = """
If the answer contains numerical or comparative data (scores, amounts, counts, percentages,
dates with values), append a chart specification block using EXACTLY this format at the very end
of your response — after all text:

<querylab_chart>
{
  "title": "short human-readable title",
  "x_label": "name of the categorical/label column",
  "series": [
    {"name": "metric name", "x": ["label1","label2"], "y": [value1, value2]}
  ]
}
</querylab_chart>

Rules for the chart block:
- Each series has exactly one "name" (string), one "x" array (labels), one "y" array (numbers).
- "y" values must be plain numbers — strip currency symbols, percentage signs, commas.
- If multiple numeric columns exist, include each as a separate series object.
- Do NOT include the <querylab_chart> block at all if there is truly no numerical data.
- Output valid JSON inside the block — no trailing commas, no comments.
"""
```

---

### Step 8.3 — Modify `synthesise_node` to append chart prompt
**File:** `orchestrator/orchestrator/graph/nodes.py`
**Location:** Inside `synthesise_node`, where the system prompt is assembled for the LLM call

**Logic:**
1. After collecting all successful agent `responses`, check `_should_generate_chart(responses, user_query)`:
   ```python
   def _should_generate_chart(responses: list, user_query: str) -> bool:
       """Return True when chart generation is worth attempting."""
       import re
       chart_words = re.compile(
           r'\b(chart|plot|graph|visuali|trend|compare|distribution|breakdown|ranking)\b',
           re.IGNORECASE
       )
       if chart_words.search(user_query):
           return True
       # Check if any agent response contains numeric values
       number_re = re.compile(r'\b\d+[\.,]?\d*\b')
       for resp in responses:
           answer = resp.get("answer") or resp.get("result") or ""
           if len(number_re.findall(str(answer))) >= 3:   # at least 3 distinct numbers
               return True
       return False
   ```

2. If `_should_generate_chart` returns True: append `_CHART_SPEC_PROMPT` to the synthesis
   system message before calling `llm.ainvoke(messages)`. Do not modify the messages otherwise.

3. After `llm.ainvoke` returns, extract the chart block:
   ```python
   raw_answer = response.content or ""
   chart_vis, final_answer = _extract_synthesis_chart(raw_answer)
   ```
   (see Step 8.4 for `_extract_synthesis_chart`)

4. Return both from the node:
   ```python
   return {"final_answer": final_answer, "chart_vis": chart_vis}
   ```
   (previously only returned `{"final_answer": ...}`)

---

### Step 8.4 — Add `_extract_synthesis_chart` helper
**File:** `orchestrator/orchestrator/query_stream.py`
**Location:** After `_generate_chart_from_table`, before `_extract_answer`

```python
import re as _re
_QUERYLAB_CHART_RE = _re.compile(r'<querylab_chart>(.*?)</querylab_chart>', _re.DOTALL)

def _extract_synthesis_chart(text: str) -> tuple:
    """
    Parse <querylab_chart>JSON</querylab_chart> block from synthesis output.
    Returns (clean_text, plotly_spec_or_None).
    Strips the block from the visible answer regardless of whether parsing succeeds.
    Never raises.
    """
    match = _QUERYLAB_CHART_RE.search(text)
    clean_text = _QUERYLAB_CHART_RE.sub('', text).strip() if match else text

    if not match:
        return clean_text, None

    try:
        data = json.loads(match.group(1).strip())
        series = data.get("series") or []
        if not series:
            return clean_text, None

        traces = []
        for s in series:
            x_vals = [str(v) for v in (s.get("x") or [])]
            y_vals = []
            for v in (s.get("y") or []):
                try:
                    y_vals.append(float(v))
                except (TypeError, ValueError):
                    y_vals.append(0.0)
            if x_vals and y_vals:
                traces.append({"type": "bar", "name": s.get("name", ""), "x": x_vals, "y": y_vals})

        if not traces:
            return clean_text, None

        title = data.get("title", "")
        x_label = data.get("x_label", "")
        tick_angle = -45 if max(len(s.get("x", [])) for s in series) > 8 else 0
        plotly_spec = {
            "data": traces,
            "layout": {
                "title": {"text": title},
                "xaxis": {"title": {"text": x_label}, "tickangle": tick_angle},
                "yaxis": {"title": {"text": series[0].get("name", "Value") if len(traces) == 1 else "Value"}},
                "barmode": "group" if len(traces) > 1 else "relative",
                "height": 420,
                "margin": {"t": 60, "b": 110, "l": 60, "r": 20},
                "legend": {"orientation": "h", "y": -0.25},
            },
        }
        return clean_text, plotly_spec

    except Exception as exc:
        logger.warning("[chart_gen] synthesis chart parse failed: %s", exc)
        return clean_text, None
```

---

### Step 8.5 — Read `chart_vis` from final_state in `query_stream.py`
**File:** `orchestrator/orchestrator/query_stream.py`
**Location:** The chart generation block (section `── 7b. Auto-generate Plotly chart`)

Update the priority order to:

```python
chart_vis: Optional[Dict] = None

# Priority 0: Synthesis-time chart (LLM generated spec during synthesis)
synthesis_chart = (final_state or {}).get("chart_vis")
if synthesis_chart:
    chart_vis = synthesis_chart
    all_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})
    logger.info("[%s] chart_gen: using synthesis chart from state", request_id)

# Priority 1: SQL/tool artifacts
if not chart_vis and table_artifacts:
    chart_vis = _generate_chart_from_table(table_artifacts[0]["data"], request.query)
    if chart_vis:
        all_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})

# Priority 2: Markdown table in response text
if not chart_vis and answer:
    md_rows = _parse_markdown_table(answer)
    if md_rows:
        chart_vis = _generate_chart_from_table(md_rows, request.query)
        if chart_vis:
            all_artifacts.append({"type": "chart", "title": "Chart", "data": chart_vis})
            all_artifacts.append({"type": "table", "title": "Data", "data": md_rows})

# Priority 3: LLM extraction (no keyword gate — always try if still no chart)
if not chart_vis and answer:
    # [existing Source 3 LLM extraction block — remove keyword check]
```

Key change in Priority 3: **remove the `_chart_keywords` check** so LLM extraction runs
whenever there's still no chart, not just when the query mentions "chart"/"plot".

---

### Step 8.6 — Update summary table
Update the summary table at the top of this file to include Session 8.

---

### Session 8 Verification

**Backend:**
```bash
cd orchestrator && poetry run uvicorn orchestrator.app:app --reload --port 8082
```

Test 1 — Chart keyword in query:
```
POST /api/v3/query/stream
{"query": "Show me all product categories with their total sales and plot a chart"}
```
Expected log: `chart_gen: using synthesis chart from state`
Expected: `chart_vis` in `complete` event, `artifacts` includes a chart artifact

Test 2 — No chart keyword, but numeric data in response:
```
POST /api/v3/query/stream
{"query": "Show me all active customers with their health score and MRR"}
```
Expected: chart is still generated (numeric detection triggers synthesis chart path)

Test 3 — Purely text response (no numbers):
```
POST /api/v3/query/stream
{"query": "What does the term churn mean in this context?"}
```
Expected: `chart_vis` is None, no chart artifact, "Chart" button does not appear in UI

Test 4 — Agent returns SQL artifacts (Source 1 still works):
Submit a query that triggers a SQL agent. Verify Source 1 still runs and its chart
takes priority over synthesis chart (chart_vis from state should be checked first,
but if SQL artifact exists it still wins — actually Source 0 wins, SQL is Source 1).

**Frontend (after restarting services):**
1. Submit any query that returns customer data with scores/amounts
2. Chart appears in chat bubble inline (via `artifacts` rendering)
3. "Chart" button appears in hover action bar
4. Click "Chart" → Decision Canvas shows chart card

---

### Session 8 Summary Table Update

| Session | Focus | Files | Prerequisite |
|---------|-------|-------|--------------|
| Session 8 — Universal Chart | Synthesis-time chart generation | `state.py`, `nodes.py`, `query_stream.py` | None |
