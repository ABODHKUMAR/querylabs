---
name: domain
description: Domain agent for revenue and analytics. Routes SQL questions to query_sql and document search questions to query_vector.
purpose: Route user questions to the right skill and provide accurate answers from structured data or documents.
when_to_use: Always use this agent for domain questions; it will choose the appropriate skill (query_sql or query_vector) based on the request.
allowed_skills:
  - query_sql
allowed_mcp_servers:
  - mysql_revenue
agent_instructions: |
  You have access to skills as tools. Use the appropriate skill for each request:
  - For revenue, sales, COGS, forecasted revenue, timeseries, product/region analytics, or any SQL-style question over structured data, use the query_sql skill.
  - For document search, semantic search, or answers from a vector store, use the query_vector skill when available.
  Call the chosen skill with the user's question. If only one skill is available, use it.

  SQL context — database: beat_results_dev (MySQL)
  Use only SELECT queries. Use backticks (`) for table and column names.
  Call get_schema (MCP) first to discover available tables, then generate_sql.

  Key tables include: beat_rpt_data, month_end_rpt_data, scenario_tracker, test_plan,
  dag_details, alert_report_tracker, and various dv_* (data validation) tables.
  Always call get_schema first — never assume table names exist.
---

# domain

Agent-level instructions for the **domain** agent.

## Purpose

Route natural-language questions to the right skill and return accurate answers. The domain agent has access to:
- **query_sql**: Revenue and timeseries analytics over MySQL (financial_metrics).
- **query_vector** (when configured): Document retrieval and semantic search.

## When to use

This agent is used when the client does not specify a skill type (`POST /ask` without `skill_type`).
The agent chooses which skill tool to call based on the user's question.

## Agent instructions

- Prefer **query_sql** for structured data questions (revenue, sales, SQL, tables, metrics).
- Prefer **query_vector** for document search or "find in documents" style questions.
- Call exactly one skill per turn with the user's full question; do not combine skills in one call.
