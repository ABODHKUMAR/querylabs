"""
MySQL MCP server: exposes get_schema and execute_sql tools.

Same pattern as backend_sql/querylab_sql (DBMysql, get_schema, execute_sql).
Config via env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.

Run as HTTP server (recommended; no cwd/path issues):
  poetry run python -m mysql_mcp.server
  Uses MCP_HOST (default 0.0.0.0), MCP_PORT (default 8000). Connect at http://<host>:8000/mcp

Run stdio (optional): MCP_TRANSPORT=stdio poetry run python -m mysql_mcp.server
Set MCP_LOG_LEVEL=DEBUG for verbose logging.
"""
import json
import logging
import os
from pathlib import Path

# Load .env from mcp_servers/mysql_mcp or cwd (skip when DOCKER_RUNNING=true, env from compose)
def _load_env():
    if os.environ.get("DOCKER_RUNNING", "").strip().lower() in ("1", "true", "yes"):
        return
    try:
        from dotenv import load_dotenv
        root = Path(__file__).resolve().parent.parent
        for p in [root / ".env", root / ".env.local", Path.cwd() / ".env"]:
            if p.is_file():
                load_dotenv(p)
                break
    except ImportError:
        pass

_load_env()

def _configure_logging() -> None:
    level_name = os.environ.get("MCP_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    fmt = "[mysql_mcp] %(levelname)s %(message)s"
    logging.basicConfig(level=level, format=fmt, force=True)

_configure_logging()
logger = logging.getLogger("mysql_mcp")

# Windows: when client closes the connection, asyncio's proactor may raise
# ConnectionResetError in _call_connection_lost. Suppress so it doesn't spam the log.
def _connection_lost_handler(loop, ctx):
    exc = ctx.get("exception")
    if exc is not None:
        if isinstance(exc, ConnectionResetError):
            logger.debug("Client closed connection (ConnectionResetError), ignoring")
            return
        if isinstance(exc, OSError) and getattr(exc, "winerror", None) == 10054:
            logger.debug("Client closed connection (WinError 10054), ignoring")
            return
    loop.default_exception_handler(ctx)


def _install_connection_reset_handler():
    import asyncio

    def _wrap_run(method_name):
        try:
            orig = getattr(asyncio.BaseEventLoop, method_name)
        except AttributeError:
            return
        def wrapped(self, *args, **kwargs):
            self.set_exception_handler(_connection_lost_handler)
            return orig(self, *args, **kwargs)
        setattr(asyncio.BaseEventLoop, method_name, wrapped)

    _wrap_run("run_forever")
    _wrap_run("run_until_complete")

_install_connection_reset_handler()

from mcp.server.fastmcp import FastMCP

_host = os.environ.get("MCP_HOST", "0.0.0.0")
_port = int(os.environ.get("MCP_PORT", "8000"))
mcp = FastMCP("mysql-mcp", host=_host, port=_port, stateless_http=True)


# Same schema query as querylab_sql DBMysql
SCHEMA_COLUMNS_QUERY = """
    SELECT
        TABLE_NAME as table_name,
        COLUMN_NAME as column_name,
        DATA_TYPE as data_type,
        IS_NULLABLE as is_nullable,
        COLUMN_KEY as column_key,
        COLUMN_COMMENT as column_comment
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
"""


def _get_connection():
    """Build MySQL connection from env (same connection pattern as querylab_sql DBMysql)."""
    import pymysql
    return pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", ""),
        cursorclass=pymysql.cursors.DictCursor,
    )


def _normalize_key(k):
    """Ensure dict keys are str (MySQL DictCursor can return bytes keys in some setups)."""
    if isinstance(k, bytes):
        return k.decode("utf-8", errors="replace")
    return k if isinstance(k, str) else str(k)


def _make_json_serializable(obj):
    """Recursively convert values so that json.dumps() succeeds (bytes, date, nested dict/list)."""
    if obj is None:
        return None
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {_normalize_key(k): _make_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_make_json_serializable(v) for v in obj]
    if isinstance(obj, (str, int, float, bool)):
        return obj
    return str(obj)

#from sqlalchemy import text
def _execute_query(query: str):
    """Execute a read-only query and return list of dicts. All values are JSON-serializable."""
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
        out = []
        for row in rows:
            out.append({_normalize_key(k): _make_json_serializable(v) for k, v in row.items()})
        return out
    finally:
        conn.close()


@mcp.tool()
def get_schema(include_sample_data: bool = True, table_names: list[str] = None) -> str:
    """
    Get overview of tables with their columns (DDL-like) and optionally sample data.

    Use this tool FIRST to understand what data is available before generating SQL.
    Same behavior as querylab_sql get_schema for MySQL.

    Args:
        include_sample_data: If True, include up to 4 sample rows from each table.
        table_names: Optional list of specific table names to fetch schema for.
                    If None, returns all tables (WARNING: can be very large!).

    Returns:
        JSON with database_type, total_tables, tables (table_name, ddl, sample_data), status.
    """
    logger.info("get_schema called (include_sample_data=%s, table_names=%s)", include_sample_data, table_names)
    try:
        columns_result = _execute_query(SCHEMA_COLUMNS_QUERY)
    except Exception as e:
        logger.exception("get_schema failed: %s", e)
        return json.dumps({"tables": [], "status": "error", "error": str(e)})

    # Filter by table_names if provided
    if table_names:
        table_names_set = set(table_names)
        columns_result = [row for row in columns_result if row.get("table_name") in table_names_set]
        logger.info("Filtered to %d tables: %s", len(table_names_set), table_names)

    tables = {}
    for row in columns_result:
        table_name = row.get("table_name", "")
        if table_name not in tables:
            tables[table_name] = {"columns": [], "sample_data": []}
        col_info = {
            "name": row.get("column_name", ""),
            "type": row.get("data_type", ""),
            "nullable": row.get("is_nullable", ""),
            "key": row.get("column_key", ""),
        }
        if row.get("column_comment"):
            col_info["comment"] = row["column_comment"]
        tables[table_name]["columns"].append(col_info)

    if include_sample_data:
        # If table_names specified, fetch all; otherwise limit to first 20 tables
        tables_to_sample = list(tables.keys()) if table_names else list(tables.keys())[:20]
        for table_name in tables_to_sample:
            try:
                # Use backticks for MySQL identifiers (same as querylab_sql)
                sample_query = f"SELECT * FROM `{table_name}` LIMIT 4"
                sample_result = _execute_query(sample_query)
                tables[table_name]["sample_data"] = sample_result[:4]
            except Exception:
                tables[table_name]["sample_data"] = []

    schema_summary = []
    for table_name, table_data in tables.items():
        cols_ddl = []
        for col in table_data["columns"]:
            col_def = f"  {col['name']} {col['type']}"
            if col.get("key") == "PRI":
                col_def += " PRIMARY KEY"
            if col.get("nullable") == "NO":
                col_def += " NOT NULL"
            cols_ddl.append(col_def)
        ddl = f"CREATE TABLE `{table_name}` (\n" + ",\n".join(cols_ddl) + "\n);"
        schema_summary.append({
            "table_name": table_name,
            "ddl": ddl,
            "column_count": len(table_data["columns"]),
            "sample_rows": len(table_data["sample_data"]),
            "sample_data": table_data["sample_data"] if include_sample_data else [],
        })

    logger.info("get_schema success: %d tables", len(tables))
    return json.dumps({
        "database_type": "mysql",
        "total_tables": len(tables),
        "tables": schema_summary,
        "status": "success",
    }, indent=2)


@mcp.tool()
def execute_sql(sql_query: str) -> str:
    """
    Execute a SQL query against the MySQL database and return results.

    Use only SELECT queries. For MySQL use backticks (`) for table and column names.
    Same behavior as querylab_sql execute_sql for MySQL.

    Args:
        sql_query: The SQL query to execute (e.g. SELECT ...).

    Returns:
        JSON with results (list of rows), row_count, and status; or error message.
    """
    query = (sql_query or "").strip()
    logger.info("execute_sql called (query_len=%d)", len(query))
    if not query:
        logger.warning("execute_sql: empty query")
        return json.dumps({"status": "error", "error": "Empty query"})
    
    # Log the actual query for debugging
    logger.debug("execute_sql query: %s", query[:500] if len(query) > 500 else query)
    
    if query.upper().strip().startswith(("INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER")):
        logger.warning("execute_sql: non-SELECT rejected")
        return json.dumps({"status": "error", "error": "Only SELECT queries are allowed"})
    try:
        rows = _execute_query(query)
        logger.info("execute_sql success: %d rows", len(rows))
        return json.dumps({
            "status": "success",
            "row_count": len(rows),
            "results": rows,
        }, indent=2)
    except Exception as e:
        logger.error("execute_sql failed for query: %s", query[:200] if len(query) > 200 else query)
        logger.exception("execute_sql failed: %s", e)
        return json.dumps({"status": "error", "error": str(e)})


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "streamable-http").strip().lower()
    if transport == "stdio":
        logger.info("Starting mysql_mcp (transport=stdio)")
        mcp.run(transport="stdio")
    else:
        logger.info("Starting mysql_mcp (transport=streamable-http) on %s:%s", _host, _port)
        mcp.run(transport="streamable-http")
