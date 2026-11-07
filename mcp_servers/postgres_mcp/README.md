# PostgreSQL MCP (`postgres_mcp`)

Exposes **get_schema** and **execute_sql** for PostgreSQL (including Neon). Same tool surface as `mysql_mcp`.

## Config

Set via env (or `.env` when not in Docker):

| Variable | Default | Notes |
|----------|---------|--------|
| `POSTGRES_HOST` | `localhost` | Neon pooler host for Kestiq |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_USER` | `postgres` | |
| `POSTGRES_PASSWORD` | _(empty)_ | |
| `POSTGRES_DATABASE` | `postgres` | e.g. `neondb` |
| `POSTGRES_SSLMODE` | `require` | Neon needs SSL |
| `MCP_HOST` | `0.0.0.0` | |
| `MCP_PORT` | `8000` | |
| `MCP_TRANSPORT` | `streamable-http` | or `stdio` |

## Run locally

```bash
cd mcp_servers/postgres_mcp
poetry install
poetry run python -m postgres_mcp.server
# → http://localhost:8000/mcp
```

## Docker (Kestiq)

See root `docker-compose.yaml` service `kestiq_mcp` and `.env.kestiq.mcp`.
