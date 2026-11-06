# Query Labs Application — Folder Structure

This document describes the repository layout for the Query Labs orchestrator application, reflecting the services that are actually part of the active `docker-compose.yaml` stack. Copy/paste this into Confluence — the headings, code block, and table will carry over cleanly.

## Top-level structure

```
querylab/
├── agents/                     # Query Labs Agents microservice (FastAPI + LangGraph ReAct agents)
│   ├── .agents/                 # Agent definitions (avani, beat, evolus, forge, meridian, mvw, novadash, revenue)
│   ├── .skills/                 # Generic skill definitions (create_charts, query_sql, query_vector, web_search)
│   └── querylab_agent/               # Main Python package
│       ├── a2a/                  # Agent-to-agent discovery, messages, registry
│       ├── agents/                # ReAct agent implementations (sql, vector, runtime)
│       ├── executor/              # Agent initializer
│       ├── llm/                   # LLM client factory
│       ├── mcp/                   # MCP client config/tools
│       └── skills/                # Skill loader/runner + query_sql, query_vector
│
├── orchestrator/                # Orchestrator service (FastAPI + LangGraph pipeline)
│   └── orchestrator/              # Main Python package
│       ├── graph/                  # LangGraph 3-node pipeline: nodes.py, orchestrator_graph.py, state.py
│       ├── api/                    # history.py, runs.py
│       ├── persistence/            # chat.py, db.py, models.py
│       ├── query_stream.py         # Main SSE streaming endpoint
│       ├── auth.py / auth_routes.py
│       ├── plan_generator.py / plan_routes.py
│       └── workspace_generate.py
│
├── frontend/                    # React 19 + Vite SPA (MUI, Ionic, Plotly, Tailwind)
│   └── src/
│       ├── api/                    # api.js
│       ├── components/             # ~35 UI components (ChatBox, ChatMessages, AnalysisPlan, PlanWorkspace, MCPSelector, Login, ...)
│       ├── ql-design/             # QueryLabApp, QueryLabLogo, charts, icons, design tokens, screens, shell
│       └── tables/                  # PlotlyChartSet, TableDataSet, VirtualizedTable, SqlQuery, Tabs
│
├── mcp_servers/                 # Standalone MCP tool servers (one per external system)
│   ├── mysql_mcp/                 # MySQL schema/query tools
│   └── weaviate_mcp/              # Vector store retrieval tools
│
├── deployment/             # Deployment automation & docs for GCP VM deploy
│   └── scripts/
│
├── docker/                      # Auxiliary Dockerfiles
│   ├── cortext_analyst/           # backend_dockerfile
│   └── vector_db/weaviate/
│
├── env_share/                   # Collected .env templates per service
├── scripts/                     # Repo-level utility scripts (latency benchmark, env generation, SSH test)
├── demo_data/                   # Sample data (weaviate_docs)
│
├── docker-compose.yaml           # Defines the running service stack
├── bitbucket-pipelines.yml       # CI/CD pipeline
├── IMPLEMENTATION_SESSIONS.md    # Running implementation/session log
└── whitebox_implementation_session.md
```

## Service descriptions

| Folder | Purpose |
|---|---|
| `agents/` | Query Labs Agents microservice — FastAPI + LangChain/LangGraph ReAct agents (SQL & vector), A2A discovery, MCP client, agent/skill definitions driven by `.agents/` and `.skills/`. |
| `orchestrator/` | Core orchestrator service — FastAPI app running the LangGraph 3-node pipeline (decompose → route → synthesise), SSE streaming query endpoint, auth, chat persistence, and plan generation APIs. |
| `frontend/` | React 19 + Vite single-page app — chat UI, agent workspace, plan workspace, MCP selector, "ql-design" screen shell. |
| `mcp_servers/` | Standalone Model Context Protocol servers exposing tools over HTTP/stdio: `mysql_mcp` (schema/query) and `weaviate_mcp` (vector retrieval). |
| `deployment/` | Deployment automation and documentation for deploying Query Labs to a GCP VM, including Bitbucket Pipelines guides and deploy scripts. |
| `docker/` | Auxiliary Dockerfiles not colocated with their service (cortext_analyst backend, Weaviate vector DB). |
| `env_share/` | Collected `.env` file templates, one per service (agents, orchestrator, each MCP server). |
| `scripts/` | Repo-level utility scripts — latency benchmarking, env generation, SSH connection testing. |
| `demo_data/` | Sample data used for local development/testing (Weaviate docs). |

## Legacy / Unused

These folders exist in the repository but are **not** part of the active `docker-compose.yaml` stack and contain no current tracked source code (only `__pycache__`/venv artifacts or a single leftover file). They appear to be superseded or placeholder directories:

| Folder | Note |
|---|---|
| `backend/` | Empty API skeleton (Agents, Tools, api, core, db, schemas, services, utils folders with no source) — superseded by `orchestrator/` + `agents/`. |
| `backend_sql/` | Empty `querylab_sql` package skeleton; only one leftover file remains (`sample_data/meridian_ventures_metadata.json`). |
| `ms_teams_bot/` | Empty skeleton (controllers/handlers/models/services) — no tracked source. |
| `myenv/` | Stray Python virtual environment at the repo root — not project source. |
| `curated data sample/`, `timing_checkpoint_log/` | Empty directories. |
| `design_handoff_querylab_decision_support/` | Effectively empty (contains only a `.DS_Store`). |

## Tech stack summary

- **Python / Poetry** — `agents/`, `orchestrator/`, and each `mcp_servers/*` service (FastAPI, LangChain, LangGraph).
- **Node.js / React** — `frontend/` (React 19, Vite 6, MUI, Ionic React, Plotly.js, Tailwind CSS).
- **Docker / Docker Compose** — `docker-compose.yaml` orchestrates agents, orchestrator, the MCP server containers, and the frontend.
- **CI/CD** — `bitbucket-pipelines.yml` (root, with a duplicate under `deployment/`).

## Live Deployments

Deploy to your own VM. Do not use any previous shared/company server IPs.

| Branch | Server | Notes |
|---|---|---|
| `main` (or your deploy branch) | `15.207.111.124` | Your personal VM |

## Branching Strategy

**Development branch:** `dev`
All new features, bug fixes, and integration work start here.

**Production branch:** `main` (or `prod`)
Only thoroughly tested, reviewed code is merged here for deployment.

### Workflow

1. **Start new work**

   Pull latest changes:
   ```
   git checkout dev
   git pull origin dev
   ```

   Create a feature branch:
   ```
   git checkout -b feature/your-feature-name
   ```

   Develop and test locally.

2. **Push your feature branch**
   ```
   git push origin feature/your-feature-name
   ```

3. **Open a Pull Request (PR)**
   - Target: `dev`
   - Get code review and approval.
   - Ensure all CI checks pass.
   - Merge PR after approval and successful tests.

4. **Promote to production**
   - When ready, open a PR from `dev` to `main` (or your prod branch).
   - Get final review and approval.
   - Merge only after all tests pass.

5. **Keep main stable**
   - Treat `main` as the deployable backup/reference branch.

### Best Practices

- Never push directly to `querylab-mcp-dev`, `querylab-mcp-autodeploy`, or `main`.
- Always use PRs for merging.
- Ensure all tests and CI checks pass before merging.
- Use descriptive branch names (e.g., `feature/login-page`, `bugfix/api-error`).
- Communicate with the team about major changes.
