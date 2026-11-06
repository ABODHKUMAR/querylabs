# Query Labs Orchestrator

Thin orchestration layer over the **agents** API. Same folder style as `agents/` and `mcp_servers/`.

## APIs

| Endpoint | Description |
|----------|-------------|
| **GET /api/data_source/** | Returns agent card names from the agents service (same shape as querylab_sql). |
| **POST /api/v3/query/stream** | Streaming query using a LangGraph orchestrator. **Requires** `Authorization: Bearer <JWT>`. Same SSE contract as querylab_sql v3, plus `request_id` / `trace_id` on events. |
| **POST /api/login** | Login (legacy path; same handler as below). |
| **POST /api/v1/auth/login** | Login against MySQL `user_master`. Returns `{ token, user }`. |
| **POST /api/logout** / **POST /api/v1/auth/logout** | Stateless JWT: client discards token. |
| **GET /health** | Liveness (process up). |
| **GET /ready** | Readiness: agents `/ready` OK; MySQL ping when chat persistence is enabled. |
| **GET/POST /api/workspace/...** | **JWT:** list/create agents, skill dirs, `AGENT.md`, and per-skill `*.md` under `QUERYLAB_AGENTS_ROOT` (default `../agents/.agents`). Disable with `ORCHESTRATOR_DISABLE_AGENT_WORKSPACE=1`. |
| **POST /api/workspace/generate** | **JWT:** LLM draft/refine `AGENT.md` or skill `*.md` using **OPENAI_API_KEY** / **OPENAI_MODEL**; output matches `querylab_agent.skills.loader` (YAML frontmatter + `## Purpose`, etc.). |
| **GET /api/workspace/skills** | **JWT:** Proxy to agents `GET /skills` — returns all skills from `.skills/` library. Used by the UI skills picker. |
| **GET /api/workspace/mcp/registry** | **JWT:** Proxy to agents `GET /mcp/registry` — returns registered MCP servers. Supports `?type=sql\|vector\|web` filter. Used by the UI MCP picker. |

## LangGraph orchestrator (Phase 4)

`POST /api/v3/query/stream` now runs a compiled 3-node **LangGraph** pipeline instead of a single ReAct agent:

```
START → decompose → route → synthesise → END
```

| Node | Responsibility | SSE event emitted |
|------|---------------|-------------------|
| `decompose_node` | LLM breaks query into per-agent sub-tasks | `thought` (type: `decompose`) |
| `route_node` | Fan-out via `asyncio.gather()` to agents `POST /ask` | `thought` (type: `tool_call` / `tool_result` / `tool_error`) |
| `synthesise_node` | LLM merges all agent responses into one answer | `token` (streamed) |

The compiled graph is a singleton (`get_graph()` in `orchestrator/graph/orchestrator_graph.py`). All per-request state is passed via LangGraph `config["configurable"]` — the graph itself is stateless.

## Observability

- **Structured logs:** set `ORCHESTRATOR_LOG_FORMAT=json` for one JSON line per event (fields: `trace_id`, `user_id`, `session_id`, `route`, `duration_ms`, `event`, `error_type`, etc.). Default is text.
- **Access log:** every HTTP request logs `event=access` with `duration_ms` and `status_code`.
- **Errors:** unhandled exceptions and HTTP validation errors log with `trace_id` from `X-Request-ID` / correlation middleware.
- **Audit:** login success/failure logs `event=audit_login` with **hashed** `user_id` / client IP and **truncated** IP (no passwords).
- **Rate limits:** login is limited per IP (`ORCHESTRATOR_RATE_LIMIT_LOGIN`, default `20/minute`). Throttles log `event=rate_limited`.
- **Canary:** optional background probes (`ORCHESTRATOR_CANARY_INTERVAL_SEC`, `ORCHESTRATOR_CANARY_MODE=ready|ask|health`).

## Tracing

- Send optional **`X-Request-ID`** on `POST /api/v3/query/stream`; it is echoed on the HTTP response and in the first SSE `status` and final `complete` payload as `request_id` / `trace_id`.
- Each tool call to the agents service sends **`X-Request-ID`** and JSON **`trace_context`**: `{ trace_id, parent_span_id, span_id }`.
- Agents **`POST /ask`** accepts `trace_context` and forwards `trace_id` into MCP HTTP clients as **`X-Request-ID`** and into LangSmith `metadata`.

## Config

- **QUERYLAB_AGENTS_API_URL** — Base URL of the agents service (default `http://localhost:8000`).
- **QUERYLAB_AGENTS_ROOT** — Absolute path to the `.agents` directory (same files the agents service loads). Empty = `<repo>/agents/.agents`.
- **ORCHESTRATOR_DISABLE_AGENT_WORKSPACE** — Set to `1`/`true` to turn off workspace CRUD APIs.
- **OPENAI_API_KEY** / **OPENAI_MODEL** — Used for LangGraph decompose/synthesise nodes (default model `gpt-4o-mini`).
- **SECRET_KEY** / **ALGORITHM** / **ACCESS_TOKEN_EXPIRE_MINUTES** — JWT (`orchestrator.settings.SecuritySettings`).
- **BACKEND_DB_*** — MySQL (`AppBackendDBSettings`-compatible names): login + chat persistence (`chat_history` / `chat_messages`).
- **ORCHESTRATOR_DISABLE_CHAT_PERSISTENCE** — Set to `1` or `true` to skip DB writes after each stream.
- **ORCHESTRATOR_HOST** / **ORCHESTRATOR_PORT** — Server bind (default `0.0.0.0:8082`).
- **ORCHESTRATOR_LOG_FORMAT** — `text` (default) or `json`.
- **ORCHESTRATOR_LOG_FILE** — Optional path (e.g. `logs/orchestrator.log`); same records as stderr, with rotation via **ORCHESTRATOR_LOG_FILE_MAX_BYTES** (default 10MB) and **ORCHESTRATOR_LOG_FILE_BACKUP_COUNT** (default 5).
- **ORCHESTRATOR_RATE_LIMIT_LOGIN** / **ORCHESTRATOR_RATE_LIMIT_GLOBAL** — SlowAPI limits.
- **ORCHESTRATOR_CANARY_*** — Synthetic checks against the agents API.
- **QUERYLAB_LLM_PRICE_*** — (agents) optional USD per 1M tokens for cost estimates in logs.

## Run

```bash
# From repo root
cd orchestrator
poetry install
poetry run uvicorn orchestrator.app:app --host 0.0.0.0 --port 8082 --reload

# Or
poetry run python -m orchestrator
```

Ensure the **agents** service is running first (e.g. `cd agents && poetry run uvicorn querylab_agent.api:app --port 8000`).

Set **SECRET_KEY** and **BACKEND_DB_*** for JWT-protected streaming and optional chat save.

## Configuration (same shape as legacy `querylab_sql` settings)

Orchestrator loads env from **`orchestrator/.env`** (repo root next to `pyproject.toml`), then **`.env.local`**, then **`<cwd>/.env`** (override). See [`orchestrator/settings.py`](orchestrator/settings.py): `AppBackendDBSettings`, `SecuritySettings`, and `OrchestratorAPISettings` (pydantic-settings).

| Variable group | Purpose |
|----------------|---------|
| `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT (defaults: `HS256`, `1440` min = 24h). Optional: `JWT_SECRET_KEY` / `JWT_ALGORITHM` env still work. |
| `BACKEND_DB_*` | MySQL for `user_master`, `user_login_history`, chat tables — **same names** as old `AppBackendDBSettings` if you reuse a `.env`. |
| `QUERYLAB_AGENTS_API_URL`, `ORCHESTRATOR_HOST`, `ORCHESTRATOR_PORT` | Agents API URL and bind defaults. |

**Login:** `POST /api/login` or `POST /api/v1/auth/login` with `{"user_id": "<email>", "password": "..."}`.

**Troubleshooting:** `401` — credentials / user row; `500` — DB or `user_login_history`; `429` — rate limits. Do not commit `.env`.

## Flow

- **GET /data_sources** → `GET {QUERYLAB_AGENTS_API_URL}/agents/cards` → `{"response": [agent card names]}`.
- **POST /query/stream** → JWT validated; `user_id` in JSON body must equal JWT `sub` → `GET /agents/cards` → LangGraph pipeline (decompose → route → synthesise) → SSE stream; then append row to `chat_messages` when DB is configured.

## Agents API contract (`POST /ask`)

Optional JSON fields:

- **`trace_context`**: `{ "trace_id": "<uuid>", "parent_span_id": "<uuid>", "span_id": "<uuid>" }`

Response may include **`trace_id`** and **`span_id`** for debugging.
