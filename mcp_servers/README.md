# MCP servers

Standalone MCP (Model Context Protocol) servers used by the Query Labs agents. Each server exposes tools over stdio so that `querylab_agent` (or any MCP client) can call them.

## MySQL MCP (`mysql_mcp`)

Exposes **get_schema** and **execute_sql** for MySQL (same pattern as `backend_sql/querylab_sql` DBMysql). Used by the SQL ReAct agent for schema discovery and query execution.

- **Default: HTTP server** – `poetry run python -m mysql_mcp.server` (listens on `http://0.0.0.0:8000/mcp`). No cwd/path issues.
- **Config**: `MYSQL_*` in `.env`; optional `MCP_HOST`, `MCP_PORT` (default 8000). Set `MCP_TRANSPORT=stdio` for stdio.
- **Use in agents**: In skill `.md` or `mcp_servers.json` use `transport: "http"`, `url: "http://localhost:8000/mcp"` (or your host).

See `mysql_mcp/README.md` and `mysql_mcp/.env.example`.

## PostgreSQL MCP (`postgres_mcp`)

Exposes **get_schema** and **execute_sql** for PostgreSQL / Neon. Used by the Kestiq agent (`postgres_kestiq`).

- **Default: HTTP server** – `poetry run python -m postgres_mcp.server` (listens on `http://0.0.0.0:8000/mcp`).
- **Config**: `POSTGRES_*` in `.env` (or `.env.kestiq.mcp` via Docker); optional `MCP_HOST`, `MCP_PORT`.
- **Docker**: `kestiq_mcp` on host port `8012`.

See `postgres_mcp/README.md`.

## Weaviate MCP (`weaviate_mcp`)

Exposes **retrieve_docs_from_collection**: hybrid search over a Weaviate collection and returns document contents (same retrieval pattern as `backend_sql/querylab_sql`).

- **Default: HTTP server** – `poetry run python -m weaviate_mcp.server` (listens on `http://0.0.0.0:8001/mcp`). No cwd/path issues.
- **Config**: `WEAVIATE_*` (and optional `OPENAI_API_KEY`) in `.env`; optional `MCP_HOST`, `MCP_PORT` (default 8001). Set `MCP_TRANSPORT=stdio` for stdio.
- **Use in agents**: In skill `.md` or `mcp_servers.json` use `transport: "http"`, `url: "http://localhost:8001/mcp"` (or your host).

See `weaviate_mcp/README.md` and `weaviate_mcp/.env.example`.
