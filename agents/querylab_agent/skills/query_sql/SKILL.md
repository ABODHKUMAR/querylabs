---
name: query_sql
description: Run natural-language questions against SQL databases via a ReAct agent. Data and connections are provided by MCP; no connection URLs in code.
mcp_servers:
  - postgres_sales
  # - snowflake_analytics
agent_instructions: |
  Use only SELECT queries. Prefer exact column and table names from schema.
  Call get_schema (MCP) first, then generate_sql with relevant_schema_details from that output.
---

# query_sql

## Purpose

Answer natural-language questions over relational data by generating and executing SQL. Uses the SQL ReAct agent from `backend_sql/querylab_sql` (generate_sql → validate_sql → execute_sql → interpret). **All database and external connections are provided by MCP** (Rule 1: MCP owns all connections).

## When to use

- User asks analytical questions over tables (aggregations, filters, joins, trends).
- The agent has access to this skill and the task is SQL/data-oriented.

## Inputs (from agent)

- `question` (required): natural-language question.
- `context` (optional): `user_id`, `session_id`, `org_id` for audit and scoping.
- `data_source_name` (optional): which registered data source / MCP-backed DB to use.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SQL (if any).
- `data`: result set (list of dicts) when applicable.
- `sources`: list of data sources / MCP servers used (e.g. `["postgres_sales"]`).

## MCP servers used

This skill does **not** hold connection strings. It uses MCP for:

- **SQL databases**: e.g. Postgres, Snowflake, MySQL, MSSQL, Databricks (as configured in the project’s MCP layer). The skill receives the **name** of the MCP server or “data source” and runs queries through that connection.
- Optional: **vector/search** MCP for semantic schema lookup if the backend_sql flow uses it.

Reference: `backend_sql/querylab_sql/core/agents/sql_react_agent.py` and `core/tools/mcp_tools.py`. Connection config is in MCP server config (e.g. `MCPServerConfig`), not in this skill’s code.

## Stateless and testable

Single invocation: input → output. No side effects. Eval by running with fixed inputs and asserting on outputs.
