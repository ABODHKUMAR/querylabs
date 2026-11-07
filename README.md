# Query Labs — Architecture Guide

This README is the **map of the whole system**: what Query Labs is, how requests flow, what each package owns, how agents/skills/MCP connect, and how to run or deploy it.

For deeper folder notes see [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md). For VM/CI deploy details see [deployment/README.md](deployment/README.md).

---

## 1. What it is

Query Labs is a **decision-support / NL-to-analytics** product:

1. User asks a business question in the web UI.
2. **Orchestrator** authenticates, optionally generates an editable analysis plan, then runs a LangGraph pipeline.
3. **Agents** answer sub-questions with ReAct + tools (SQL, vector search, charts).
4. Tools talk to databases via **MCP servers** (MySQL, Postgres/Neon, Weaviate).
5. Results stream back (SSE) as text, tables, and charts; history and observability are persisted.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser  (React SPA)                                                    │
│  Ask · Plan · Stream · History · Observability · Settings                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTP / SSE
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Orchestrator  (:8084 → container :8082)                                 │
│  • JWT auth (MySQL user_master)                                          │
│  • Plan generation (POST /api/.../plan)                                  │
│  • Query stream (SSE) — LangGraph: decompose → route → synthesise        │
│  • Chat history + run metrics persistence                                │
│  • Proxies agent cards / workspace APIs                                  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  POST /ask , GET /agents/cards
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Agents API  (:8000)                                                     │
│  • Discovers agents from agents/.agents/*/AGENT.md                       │
│  • Binds generic skills from agents/.skills/                             │
│  • Resolves MCP servers from mcp_servers.json / .docker.json             │
│  • Runs ReAct loops (query_sql, query_vector, …)                         │
└───────────┬───────────────────┬───────────────────┬──────────────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
     ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
     │ mysql_mcp×N │    │ postgres_mcp │    │ weaviate_mcp │
     │ get_schema  │    │ (Kestiq)     │    │ vector       │
     │ execute_sql │    │ Neon/Postgres│    │ retrieve     │
     └──────┬──────┘    └──────┬───────┘    └──────┬───────┘
            │                  │                   │
            ▼                  ▼                   ▼
         MySQL DBs          Neon neondb         Weaviate
```

### Runtime ports (host)

| Service | Host port | Role |
|---------|-----------|------|
| Frontend | **5174** | UI |
| Orchestrator | **8084** | Public API + SSE |
| Agents | **8000** | Agent execution |
| MySQL MCPs | 8005–8011 | Per-database SQL tools |
| Kestiq Postgres MCP | **8012** | Neon SQL tools |
| Weaviate MCP | 8003 | Vector tools |
| MySQL | 3306 | Auth + demo DBs |
| Weaviate | 8082 | Vector DB |

Defined in root [`docker-compose.yaml`](docker-compose.yaml).

---

## 3. End-to-end request flow

```
User question
    │
    ├─1─ Login → JWT (orchestrator ↔ MySQL auth DB)
    │
    ├─2─ Optional: Generate plan
    │      Orchestrator LLM picks agent(s) + steps
    │      UI lets user edit agents / sub-sources / tasks
    │
    ├─3─ Run plan / query (SSE)
    │      decompose  → break into per-agent tasks
    │      route      → parallel POST /ask to Agents API
    │      synthesise → merge answers → stream tokens
    │
    └─4─ Persist chat + agent_run metrics (observability)
```

**Collection / source filter:** UI may pass `collection` as agent names or sub-source ids. Orchestrator maps sub-sources → owning agent via each card’s `sub_sources` list.

---

## 4. Repository map

```
querylabs/
├── frontend/                 # React 19 + Vite SPA
├── orchestrator/             # FastAPI orchestrator + LangGraph
├── agents/                   # Agents microservice + .agents / .skills
├── mcp_servers/              # mysql_mcp, postgres_mcp, weaviate_mcp
├── docker/                   # MySQL init, Weaviate compose helpers
├── deployment/               # VM / Bitbucket deploy docs & scripts
├── demo_data/                # Sample vector docs
├── scripts/                  # Utility scripts
├── docker-compose.yaml       # Full local/VM stack
├── bitbucket-pipelines.yml   # CI/CD
├── FOLDER_STRUCTURE.md       # Folder reference
└── README.md                 # This file (architecture)
```

### `frontend/` — UI

| Path | Responsibility |
|------|----------------|
| `src/ql-design/` | Primary product shell: `QueryLabApp`, screens (Ask, Plan, History, Observability, Settings), `NavRail`, design tokens |
| `src/api/api.js` | All HTTP/SSE calls to orchestrator (`baseURL`) |
| `src/components/` | Shared/legacy components (login, observability widgets, analysis plan, MCP config) |
| `src/ql-design/sourceDisplayNames.js` | Friendly labels for agents/sub-sources in UI |

**Nav (live):** Ask · History · Observability · Settings. Sources/Library icons are hidden until implemented.

**Important:** Docker frontend serves a **built** image. After changing `frontend/src`, rebuild:

```bash
docker compose build --no-cache frontend && docker compose up -d frontend
```

Or use `cd frontend && npm run dev` for hot reload.

### `orchestrator/` — control plane

| Concern | Where |
|---------|--------|
| App entry | `orchestrator/app.py` |
| SSE query | `query_stream.py` |
| Plan LLM | `plan_generator.py` / `plan_routes.py` |
| LangGraph | `graph/` — decompose → route → synthesise |
| Auth | `auth.py`, `auth_routes.py` |
| Settings catalog | `settings_routes.py` (Resources / Models / Token usage) |
| History / runs | `api/history.py`, `api/runs.py` |
| Agent cards proxy | `data_sources.py`, `agents_client.py` |

Key APIs (prefix `/api`):

- `POST /v1/auth/login` — JWT
- `GET /agent_names` — master agents (+ `display_name`, `sub_sources`)
- `GET /data_sources` — flattened sub-source list
- Plan + `POST .../query/stream` — analysis + SSE execution
- `GET /runs/summary/agents` — observability health
- `GET /settings/connection/all` — Settings → Resources

### `agents/` — execution plane

```
agents/
├── .agents/                    # One folder per agent
│   ├── <name>_agent/AGENT.md   # Policy: skills, MCP servers, instructions
│   ├── mcp_servers.json        # Localhost MCP URLs
│   └── mcp_servers.docker.json # Docker network MCP URLs
├── .skills/                    # Shared skills (query_sql, query_vector, …)
└── querylab_agent/             # Python package (API, ReAct, MCP client, discovery)
```

**Policy-mode agent** (`AGENT.md`):

```yaml
---
name: kestiq_agent
display_name: Kestiq          # UI label only
allowed_skills:
  - query_sql
allowed_mcp_servers:
  - postgres_kestiq           # must exist in MCP registry + type: sql
sub_sources:
  - kestiq
agent_instructions: |
  # domain / dialect / schema hints for the LLM
---
```

**Skills** declare `requires_mcp_type` (e.g. `sql` / `vector`). At runtime the agent binds only MCP servers from `allowed_mcp_servers` whose registry `type` matches.

### `mcp_servers/` — tools

| Server | Tools | Config |
|--------|-------|--------|
| `mysql_mcp` | `get_schema`, `execute_sql` | `MYSQL_*` — one container per demo DB |
| `postgres_mcp` | same (Postgres/Neon) | `POSTGRES_*` + `POSTGRES_SSLMODE` — used by **Kestiq** |
| `weaviate_mcp` | vector retrieve | `WEAVIATE_*` |

Agents never open DB sockets directly; they call MCP over HTTP (`…/mcp`).

---

## 5. Data sources & agents

### Demo MySQL niches (anonymized UI labels)

| Settings name | Agent (id → label) | MCP registry key | DB (internal) |
|---------------|--------------------|------------------|---------------|
| Finance Metrics | `revenue_agent` → Finance | `mysql_revenue` | `financial_metrics` |
| QA Observability | `beat_agent` → Observability | `mysql_beat` | `beat_results_dev` |
| Portfolio Lab | `meridian_agent` → Portfolio | `mysql_meridian` | `meridian_ventures` |
| Growth Analytics | `novadash_agent` → Growth | `mysql_novadash` | `novadash` |
| Retail Ops | `avani_agent` → Retail | `mysql_avani` | `avani` |
| Hospitality Lab | `mvw_agent` → Hospitality | `mysql_mvw` | `mvw` |
| Markets Desk | `forge_agent` → Markets | `mysql_pe_trading` | `pe_trading_db` |
| Weaviate Vector Store | (shared) | `weaviate_mcp` | collections |
| **Kestiq** | `kestiq_agent` → Kestiq | `postgres_kestiq` | Neon `neondb` |

UI display names: `AGENT.md` → `display_name` + `frontend/src/ql-design/sourceDisplayNames.js`.  
Internal ids (`forge_agent`, `sub_sources`, MCP names) stay stable for routing.

### Adding a new SQL database (checklist)

1. **MCP** — env file (e.g. `.env.mycorp.mcp`) + compose service (or reuse `mysql_mcp` / `postgres_mcp` image).
2. **Registry** — entry in `mcp_servers.json` and `mcp_servers.docker.json` with `"type": "sql"`.
3. **Agent** — `agents/.agents/mycorp_agent/AGENT.md` with `allowed_skills`, `allowed_mcp_servers`, `sub_sources`, `display_name`, instructions.
4. **Settings seed** (optional) — `orchestrator/.../settings_routes.py` for Resources UI.
5. **Friendly label** — `sourceDisplayNames.js`.
6. Restart/rebuild: MCP + `agents` (+ `orchestrator` / `frontend` if needed).

> Settings → **+ Add** alone only updates an in-memory catalog. It does **not** wire MCP/agents.

---

## 6. Frontend ↔ API contract (mental model)

| UI surface | Primary APIs |
|------------|--------------|
| Login | `POST /api/v1/auth/login` |
| All sources chip | `GET /api/agent_names` |
| Plan | plan generate + edit local state |
| Run | SSE query stream with `approved_plan` / `collection` |
| History | history list + load by id |
| Observability | `GET /api/runs/summary/agents` + agent names |
| Settings → Resources | `GET/POST /api/settings/connection/*` |

`VITE_BASE_URL` / `VITE_HOST_URL` + `VITE_PORT_BACKEND_SQL` control where the SPA talks (see `frontend/src/api/api.js`).

---

## 7. Local run

```bash
# Repo root
docker compose up -d --build

# UI  http://127.0.0.1:5174
# API http://127.0.0.1:8084/api
# Agents docs http://127.0.0.1:8000/docs
```

Env files (gitignored patterns under `.env*`): `.env.agent`, `.env.orchestrator`, `.env.mysql`, `.env.*.mcp`, `.env.kestiq.mcp`, …

**Kestiq:** put Neon credentials in `.env.kestiq.mcp`, then:

```bash
docker compose up -d --build kestiq_mcp agents orchestrator
```

---

## 8. Deployment

### Current AWS VM

| | |
|--|--|
| IP | `3.109.189.178` |
| SSH | `ssh -i personal_vm_password.pem ec2-user@3.109.189.178` |
| App path | `/opt/querylab` |
| **HTTPS UI (preferred)** | https://3.109.189.178.sslip.io |
| **HTTPS API** | https://3.109.189.178.sslip.io/api |
| Legacy HTTP UI | http://3.109.189.178:5174 |
| Legacy HTTP API | http://3.109.189.178:8084/api |

TLS: nginx + Let’s Encrypt on the VM (`deployment/nginx/`, `deployment/scripts/setup-https-vm.sh`). Cert auto-renews via certbot timer.

PEM is local-only (`*.pem` gitignored).

After syncing code on the VM:

```bash
cd /opt/querylab
docker compose up -d --build frontend agents orchestrator kestiq_mcp
```

Automation & checklists: [deployment/](deployment/).

### HTTPS (production target)

Today the VM is **HTTP** on `5174` / `8084`. Production should use **nginx + Let’s Encrypt** on **443**:

1. Domain A-record → VM IP; open ports 80/443.
2. nginx: `/` → frontend `:5174`, `/api/` → orchestrator `:8084`.
3. `certbot --nginx -d your.domain.com`.
4. Rebuild frontend so API calls are **same-origin** (`/api` or `https://domain/api`) — otherwise mixed-content blocks.

Full steps: [deployment/VM_DEPLOYMENT_GUIDE.md](deployment/VM_DEPLOYMENT_GUIDE.md) § Part 8.

---

## 9. Tech stack

- **Python 3.12 / Poetry** — agents, orchestrator, MCP servers (FastAPI, LangChain, LangGraph, MCP SDK)
- **Node 20 / React 19 / Vite 6** — frontend (Tailwind, MUI, Plotly)
- **Docker Compose** — all services on `app_network`
- **MySQL 8** — auth + sample SQL DBs
- **Weaviate** — vector collections
- **Neon Postgres** — Kestiq production-like SQL source
- **CI** — Bitbucket Pipelines (`bitbucket-pipelines.yml`)

---

## 10. Related docs

| Doc | Use when |
|-----|----------|
| [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) | Exact folder inventory |
| [agents/README.md](agents/README.md) | Skills / policy mode / agent API |
| [agents/.agents/README.md](agents/.agents/README.md) | `.agents` layout & MCP in skills |
| [orchestrator/README.md](orchestrator/README.md) | Orchestrator APIs & LangGraph |
| [mcp_servers/README.md](mcp_servers/README.md) | MCP server list |
| [deployment/README.md](deployment/README.md) | Deploy methods |
| [deployment/VM_DEPLOYMENT_GUIDE.md](deployment/VM_DEPLOYMENT_GUIDE.md) | Manual VM + HTTPS |
| [IMPLEMENTATION_SESSIONS.md](IMPLEMENTATION_SESSIONS.md) | Historical implementation notes |
