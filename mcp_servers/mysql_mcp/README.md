# MySQL MCP server

MCP server that exposes **get_schema** and **execute_sql** for MySQL. Matches the behavior of `backend_sql/querylab_sql` (DBMysql, SQL ReAct tools) so the Query Labs SQL ReAct agent can use this server for discovery and execution.

**Default: HTTP server** (no cwd/path issues). Run once and connect via URL from anywhere.

## Run as HTTP server (recommended)

```bash
cd mcp_servers/mysql_mcp
cp .env.example .env   # set MYSQL_* vars
poetry install
poetry run python -m mysql_mcp.server
```

Server listens on `http://0.0.0.0:8000/mcp` (override with `MCP_HOST`, `MCP_PORT`). In your skill or `mcp_servers.json` use:

```json
{
  "mysql_revenue": {
    "name": "mysql_revenue",
    "transport": "http",
    "url": "http://localhost:8000/mcp"
  }
}
```

Use `http://<your-host>:8000/mcp` if the agent runs on another machine.

## Run as stdio (optional)

```bash
MCP_TRANSPORT=stdio poetry run python -m mysql_mcp.server
```

Then configure the server with `transport: "stdio"`, `command`, and `args` (must run from `mcp_servers/mysql_mcp` or set paths accordingly).

## Tools

- **get_schema**  
  - `include_sample_data` (bool, optional): include sample rows per table (default true).  
  Returns JSON: `database_type`, `total_tables`, `tables` (table_name, ddl, sample_data), `status`.

- **execute_sql**  
  - `sql_query` (str): SELECT query to run.  
  Returns JSON: `status`, `row_count`, `results`; or `error` on failure. Only SELECT is allowed.

## Setup

```bash
cd mcp_servers/mysql_mcp
cp .env.example .env
# Edit .env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
poetry install
```

Example MCP config (HTTP): see above. For stdio, use `transport: "stdio"` with `command` and `args`.

## Env vars

| Variable        | Description                |
|----------------|----------------------------|
| MYSQL_HOST     | MySQL host (default localhost) |
| MYSQL_PORT     | MySQL port (default 3306)  |
| MYSQL_USER     | MySQL user                 |
| MYSQL_PASSWORD | MySQL password            |
| MYSQL_DATABASE | Database name              |
| MCP_LOG_LEVEL  | Log level: DEBUG, INFO (default), WARNING, ERROR |
