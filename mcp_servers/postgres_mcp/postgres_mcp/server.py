"""
PostgreSQL MCP server: exposes get_schema and execute_sql tools.

Config via env: POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
POSTGRES_DATABASE, POSTGRES_SSLMODE (default require for Neon).

Run as HTTP server (recommended):
  poetry run python -m postgres_mcp.server
  Uses MCP_HOST (default 0.0.0.0), MCP_PORT (default 8000).

Run stdio (optional): MCP_TRANSPORT=stdio poetry run python -m postgres_mcp.server
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path


def _load_env() -> None:
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
    fmt = "[postgres_mcp] %(levelname)s %(message)s"
    logging.basicConfig(level=level, format=fmt, force=True)


_configure_logging()
logger = logging.getLogger("postgres_mcp")

from mcp.server.fastmcp import FastMCP

_host = os.environ.get("MCP_HOST", "0.0.0.0")
_port = int(os.environ.get("MCP_PORT", "8000"))
mcp = FastMCP("postgres-mcp", host=_host, port=_port, stateless_http=True)

SCHEMA_COLUMNS_QUERY = """
    SELECT
        c.table_name AS table_name,
        c.column_name AS column_name,
        c.data_type AS data_type,
        c.is_nullable AS is_nullable,
        CASE
            WHEN tc.constraint_type = 'PRIMARY KEY' THEN 'PRI'
            ELSE ''
        END AS column_key,
        COALESCE(pgd.description, '') AS column_comment
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_schema = kcu.table_schema
       AND c.table_name = kcu.table_name
       AND c.column_name = kcu.column_name
    LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND tc.constraint_type = 'PRIMARY KEY'
    LEFT JOIN pg_catalog.pg_statio_all_tables st
        ON st.schemaname = c.table_schema
       AND st.relname = c.table_name
    LEFT JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = st.relid
       AND pgd.objsubid = c.ordinal_position
    WHERE c.table_schema = current_schema()
    ORDER BY c.table_name, c.ordinal_position
"""

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise ValueError(f"Unsafe identifier: {name!r}")
    return f'"{name}"'


def _get_connection():
    import psycopg
    from psycopg.rows import dict_row

    return psycopg.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
        dbname=os.environ.get("POSTGRES_DATABASE", "postgres"),
        sslmode=os.environ.get("POSTGRES_SSLMODE", "require"),
        row_factory=dict_row,
    )


def _normalize_key(k):
    if isinstance(k, bytes):
        return k.decode("utf-8", errors="replace")
    return k if isinstance(k, str) else str(k)


def _make_json_serializable(obj):
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


def _execute_query(query: str):
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            if cur.description is None:
                return []
            rows = cur.fetchall()
        return [
            {_normalize_key(k): _make_json_serializable(v) for k, v in row.items()}
            for row in rows
        ]
    finally:
        conn.close()


@mcp.tool()
def get_schema(include_sample_data: bool = True, table_names: list[str] = None) -> str:
    """
    Get overview of tables with their columns (DDL-like) and optionally sample data.

    Use this tool FIRST to understand what data is available before generating SQL.

    Args:
        include_sample_data: If True, include up to 4 sample rows from each table.
        table_names: Optional list of specific table names. If None, returns all tables.

    Returns:
        JSON with database_type, total_tables, tables (table_name, ddl, sample_data), status.
    """
    logger.info(
        "get_schema called (include_sample_data=%s, table_names=%s)",
        include_sample_data,
        table_names,
    )
    try:
        columns_result = _execute_query(SCHEMA_COLUMNS_QUERY)
    except Exception as e:
        logger.exception("get_schema failed: %s", e)
        return json.dumps({"tables": [], "status": "error", "error": str(e)})

    if table_names:
        table_names_set = set(table_names)
        columns_result = [
            row for row in columns_result if row.get("table_name") in table_names_set
        ]

    tables: dict[str, dict] = {}
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
        tables_to_sample = list(tables.keys()) if table_names else list(tables.keys())[:20]
        for table_name in tables_to_sample:
            try:
                sample_query = f"SELECT * FROM {_quote_ident(table_name)} LIMIT 4"
                tables[table_name]["sample_data"] = _execute_query(sample_query)[:4]
            except Exception:
                tables[table_name]["sample_data"] = []

    schema_summary = []
    for table_name, table_data in tables.items():
        cols_ddl = []
        for col in table_data["columns"]:
            col_def = f'  "{col["name"]}" {col["type"]}'
            if col.get("key") == "PRI":
                col_def += " PRIMARY KEY"
            if col.get("nullable") == "NO":
                col_def += " NOT NULL"
            cols_ddl.append(col_def)
        ddl = f'CREATE TABLE "{table_name}" (\n' + ",\n".join(cols_ddl) + "\n);"
        schema_summary.append(
            {
                "table_name": table_name,
                "ddl": ddl,
                "column_count": len(table_data["columns"]),
                "sample_rows": len(table_data["sample_data"]),
                "sample_data": table_data["sample_data"] if include_sample_data else [],
            }
        )

    logger.info("get_schema success: %d tables", len(tables))
    return json.dumps(
        {
            "database_type": "postgresql",
            "total_tables": len(tables),
            "tables": schema_summary,
            "status": "success",
        },
        indent=2,
    )


@mcp.tool()
def execute_sql(sql_query: str) -> str:
    """
    Execute a SQL query against the PostgreSQL database and return results.

    Use only SELECT queries. For PostgreSQL use double quotes for identifiers when needed.

    Args:
        sql_query: The SQL query to execute (e.g. SELECT ...).

    Returns:
        JSON with results (list of rows), row_count, and status; or error message.
    """
    query = (sql_query or "").strip()
    logger.info("execute_sql called (query_len=%d)", len(query))
    if not query:
        return json.dumps({"status": "error", "error": "Empty query"})

    logger.debug("execute_sql query: %s", query[:500] if len(query) > 500 else query)

    if query.upper().strip().startswith(
        ("INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE")
    ):
        logger.warning("execute_sql: non-SELECT rejected")
        return json.dumps({"status": "error", "error": "Only SELECT queries are allowed"})
    try:
        rows = _execute_query(query)
        logger.info("execute_sql success: %d rows", len(rows))
        return json.dumps(
            {"status": "success", "row_count": len(rows), "results": rows},
            indent=2,
        )
    except Exception as e:
        logger.error(
            "execute_sql failed for query: %s",
            query[:200] if len(query) > 200 else query,
        )
        logger.exception("execute_sql failed: %s", e)
        return json.dumps({"status": "error", "error": str(e)})


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "streamable-http").strip().lower()
    if transport == "stdio":
        logger.info("Starting postgres_mcp (transport=stdio)")
        mcp.run(transport="stdio")
    else:
        logger.info(
            "Starting postgres_mcp (transport=streamable-http) on %s:%s", _host, _port
        )
        mcp.run(transport="streamable-http")
