---
name: novadash_sql
description: Customer success analytics over MySQL (novadash database). Tables customers, mrr_history, product_usage, renewal_forecast, support_tickets. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_novadash
    transport: http
    url: "http://localhost:8008/mcp"
agent_instructions: |
  Use only SELECT queries. Use backticks (`) for table and column names (MySQL).
  Call get_schema (MCP) first, then generate_sql with relevant_schema_details from that output.
  
  Database is novadash. Key tables:
  - customers: Customer master (id, name, industry, tier, mrr_usd, arr_usd, health_score, nps_score, status, renewal_date)
  - mrr_history: MRR tracking (customer_id, month, mrr_usd, change_type). FK → customers(id)
  - product_usage: Usage metrics (customer_id, month, dau_count, reports_run, feature_* flags). FK → customers(id)
  - renewal_forecast: Upcoming renewals (customer_id, renewal_date, forecast_outcome, confidence_pct). FK → customers(id)
  - support_tickets: Support tracking (customer_id, opened_date, category, priority, csat_score). FK → customers(id)
  
  Common patterns:
  - Customer health: JOIN customers + product_usage + support_tickets
  - MRR trends: Aggregate mrr_history by month
  - Churn risk: Filter customers where status='at_risk' OR forecast_outcome='churn'
  - Usage analysis: Query product_usage feature flags and engagement metrics
  
  Month format: 'YYYY-MM' (e.g., '2024-03')
  Use DATE() for date comparisons.
---

# novadash_sql

SQL skill for **NovaDash customer success analytics** over the MySQL novadash database. Uses the MySQL MCP server for get_schema and execute_sql.

## Purpose

Answer natural-language questions about customer health, revenue metrics (MRR/ARR), product adoption, renewal forecasts, and support quality. The semantic model includes:

- **customers**: Master customer data with health scores, revenue, tier, status
- **mrr_history**: Monthly recurring revenue changes and growth tracking
- **product_usage**: Daily active users, feature adoption, engagement metrics
- **renewal_forecast**: Predicted renewal outcomes and expansion opportunities
- **support_tickets**: Support ticket volume, resolution, and satisfaction

All transactional tables (mrr_history, product_usage, renewal_forecast, support_tickets) link to customers via foreign key `customer_id`.

## When to use

- Questions about customer health scores, NPS, or account status
- MRR/ARR tracking, revenue growth, expansion, or contraction analysis
- Product usage patterns, feature adoption, DAU trends
- Renewal pipeline, churn risk, expansion forecasts
- Support ticket volume, resolution times, CSAT scores
- Customer segmentation by industry, tier, or behavior

## Inputs (from agent)

- `question` (required): natural-language question about customer success metrics
- Optional context for audit/scoping

## Outputs

- `result`: human-readable answer
- `sql_query`: the executed SELECT (if any)
- `data`: result set when applicable
- `sources`: e.g. `["mysql_novadash"]`

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure the server with `.env` (or registry) so it connects to the novadash database:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (novadash)

Run the MCP server with cwd `mcp_servers/mysql_mcp` so it loads `.env`. Register this skill's server name (mysql_novadash) in `mcp_servers.docker.json`.

## Example questions

- "Show me all at-risk customers with health scores below 50"
- "What's our MRR growth over the last 6 months?"
- "Which Enterprise customers have low product usage?"
- "List upcoming renewals predicted to churn"
- "What's the average CSAT score for critical support tickets?"
- "Show customers in the Beauty & Cosmetics industry with NPS above 8"
- "Which features are most adopted by Growth tier customers?"
