---
name: revenue_skill
description: Revenue and timeseries analytics over MySQL (financial_metrics). Tables daily_revenue, product_dim, region_dim. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_revenue
    transport: http
    url: "http://localhost:8005/mcp"
agent_instructions: |
  Use only SELECT queries. Use backticks (`) for table and column names (MySQL).
  Call get_schema (MCP) first, then generate_sql with relevant_schema_details from that output.
  Database is financial_metrics. Key tables: daily_revenue (date, product_id, region_id, revenue, cogs, forecasted_revenue), product_dim (product_id, product_line), region_dim (region_id, sales_region). Join daily_revenue to product_dim on product_id, and to region_dim on region_id.
  For time-based questions use the date column; aggregate revenue/cogs/forecasted_revenue with SUM. Product_line and sales_region are categorical dimensions.
---

# revenue_skill

SQL skill for **revenue and timeseries analytics** over the MySQL database defined in `backend_sql/sample_data/revenue_timeseries_mysql.json`. Uses the MySQL MCP server for get_schema and execute_sql.

## Purpose

Answer natural-language questions about revenue, cost of goods sold (COGS), and forecasted revenue with daily granularity. Support analysis by product line, sales region, and time. The semantic model includes:

- **daily_revenue**: date, product_id, region_id, revenue, cogs, forecasted_revenue (metrics to SUM).
- **product_dim**: product_id, product_line (e.g. Electronics, Clothing, Home Appliances, Toys, Books).
- **region_dim**: region_id, sales_region (e.g. North America, Europe, Asia, South America, Africa).

Relationships: daily_revenue → product_dim on product_id; daily_revenue → region_dim on region_id.

## When to use

- User asks about revenue, sales, income, COGS, costs, forecasted revenue, or trends over time.
- Questions by product line, region, or date range.
- Comparisons (actual vs forecast, cumulative expenses, lowest/highest revenue by period).

## Inputs (from agent)

- `question` (required): natural-language question about revenue or timeseries.
- Optional context for audit/scoping.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SELECT (if any).
- `data`: result set when applicable.
- `sources`: e.g. `["mysql_revenue"]`.

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure the server with `.env` (or registry) so it connects to the database containing the revenue tables:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (e.g. `financial_metrics`).

Run the MCP server with cwd `mcp_servers/mysql_mcp` so it loads `.env`. Register this skill’s server name (e.g. `mysql_revenue`) in `mcp_servers.example.json` or in the skill’s frontmatter as shown above.
