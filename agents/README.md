# querylab_agents

Agents and skills (e.g. SQL ReAct) driven by `.agents`, `.skills`, and MCP.

## Skill architecture

Agents support two modes — both are backward-compatible and auto-detected:

### Legacy mode (nested `.md` files)
```
.agents/<agent>/query_sql/<skill>.md   # MCP server URL hardcoded in frontmatter
```

### Policy mode (Phase 2 — decoupled skills)
```
.agents/<agent>/AGENT.md              # declares allowed_skills + allowed_mcp_servers
.skills/<skill>.md                    # generic skill with requires_mcp_type (no hardcoded URL)
```

Policy mode is activated automatically when `AGENT.md` contains an `allowed_skills` field.
At runtime, MCP binding is resolved by matching `requires_mcp_type` in the skill to
`allowed_mcp_servers` in the MCP registry. Agent-specific DB/collection context lives in
`AGENT.md` `agent_instructions` and is merged with the generic skill instructions.

#### Example `AGENT.md` (policy mode)
```yaml
---
name: domain
allowed_skills:
  - query_sql
  - query_vector
allowed_mcp_servers:
  - mysql_revenue
agent_instructions: |
  SQL context — database: financial_metrics (MySQL)
  ...
---
```

#### Available generic skills (`.skills/`)
| Skill | `requires_mcp_type` | Description |
|-------|---------------------|-------------|
| `query_sql` | `sql` | SQL analytics over any relational DB |
| `query_vector` | `vector` | Semantic search over vector stores |
| `web_search` | `web` | Web search and summarisation |
| `create_charts` | — | Chart generation from data |

## How to run

From the `agents` directory:

```bash
# Install (with optional MCP support)
poetry install
poetry install --extras mcp   # if you need MCP tools

# Optional: use a .env file at agents/.env (copy from .env.example)
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=your-key

# List discovered agents and skills (no question)
poetry run python -m querylab_agent

# Run a question through the first agent's first skill
poetry run python -m querylab_agent "How many users do we have?"
```

The entry point uses `agents/.agents` as the default agents root. To override:

```bash
export QUERYLAB_AGENTS_ROOT=/path/to/.agents
poetry run python -m querylab_agent "Your question"
```

MCP server config can live in the skill `.md` files (see `.agents/README.md`), or you can put a registry in `.agents/mcp_servers.example.json` (or next to `.agents`) for name resolution.

## Expose as API

Run the HTTP API (FastAPI + Uvicorn):

```bash
cd agents
export OPENAI_API_KEY=your-key
poetry run python -m querylab_agent --api
```

Then open:

- **Docs:** http://localhost:8000/docs
- **Health:** GET http://localhost:8000/health
- **Ready:** GET http://localhost:8000/ready — runtime loaded, agents discovered, MCP registry present (503 if not ready).
- **List agents:** GET http://localhost:8000/agents
- **List skills:** GET http://localhost:8000/agents/domain/skills
- **List all skills (library):** GET http://localhost:8000/skills — returns all skills from `.skills/`.
- **MCP registry:** GET http://localhost:8000/mcp/registry?type=sql — returns registered MCP servers, optionally filtered by type.
- **Ask:** POST http://localhost:8000/ask with JSON body:
  `{"question": "How many users?", "agent_name": "domain", "skill_type": "query_sql"}`
  (`agent_name` and `skill_type` are optional; default is first agent and first skill.)

Optional env: `QUERYLAB_AGENTS_HOST` (default `0.0.0.0`), `QUERYLAB_AGENTS_PORT` (default `8000`), `QUERYLAB_AGENTS_RELOAD` for auto-reload.

**Observability:** `QUERYLAB_AGENTS_LOG_FORMAT=json` for structured logs. Set `QUERYLAB_AGENTS_LOG_FILE=logs/agents.log` (optional) to mirror logs to a rotating file. After each successful `POST /ask`, logs include `event=agent_run` with `tool_calls`, token usage (`prompt_tokens`, `completion_tokens`), and optional `estimated_cost_usd` (set `QUERYLAB_LLM_PRICE_*` or rely on defaults for common OpenAI models).

Or: `poetry run uvicorn querylab_agent.api:app --host 0.0.0.0 --port 8000 --reload`

## Programmatic usage

```python
from querylab_agent.executor.initializer import initialize_skills_and_agents
from querylab_agent.llm.factory import get_llm

runtime = initialize_skills_and_agents(
    agents_base_path="path/to/.agents",
    mcp_registry_path="path/to/mcp_servers.json",  # optional
    llm=get_llm(),
)
runner = await runtime.get_runner("domain", "query_sql")
result = await runner.ainvoke({"messages": [("user", "Your question")]})
```
