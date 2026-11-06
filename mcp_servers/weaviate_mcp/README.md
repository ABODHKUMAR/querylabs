# Weaviate MCP server

MCP server that exposes **retrieve_docs_from_collection**: retrieves documents from a Weaviate collection using hybrid search. Creates query embeddings using OpenAI (same as backend_sql pattern), allowing hybrid search to work even when collection has no vectorizer configured.

## Tool

- **retrieve_docs_from_collection**  
  - `query` (str): natural language or keyword search  
  - `collection_name` (str): Weaviate class/collection name  
  - `limit` (int, optional): max docs to return (default 10)  

  Returns a string with each document’s content and score.

## Setup

```bash
cd mcp_servers/weaviate_mcp
cp .env.example .env   # set WEAVIATE_* and OPENAI_API_KEY (required)
poetry install
```

**Default: HTTP server** (no cwd/path issues). Run once and connect via URL:

```bash
poetry run python -m weaviate_mcp.server
```

Server listens on `http://0.0.0.0:8001/mcp` (override with `MCP_HOST`, `MCP_PORT`). In your skill or `mcp_servers.json` use:

```json
{
  "weaviate_docs": {
    "name": "weaviate_docs",
    "transport": "http",
    "url": "http://localhost:8001/mcp"
  }
}
```

**Stdio (optional):** `MCP_TRANSPORT=stdio poetry run python -m weaviate_mcp.server`, then use `transport: "stdio"` with `command`/`args` (run from this directory so `.env` is loaded).

## Env vars

| Variable | Description |
|----------|-------------|
| `WEAVIATE_HOST` | Weaviate host (default `localhost`) |
| `WEAVIATE_PORT` | Weaviate port (default `8080`) |
| `WEAVIATE_API_KEY` | API key if required |
| `WEAVIATE_URL` | If set, use Weaviate Cloud URL instead of HOST/PORT |
| `OPENAI_API_KEY` | **Required**: for creating query embeddings (same as backend_sql pattern) |
| `WEAVIATE_EMBEDDING_MODEL` | Embedding model (default `text-embedding-3-small`) |
| `MCP_HOST` | HTTP bind host (default `0.0.0.0`) |
| `MCP_PORT` | HTTP port (default `8001`) |
| `MCP_TRANSPORT` | Set to `stdio` for stdio instead of HTTP |
| `MCP_LOG_LEVEL` | Log level: DEBUG, INFO (default), WARNING, ERROR |
