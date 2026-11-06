---
name: meridian_sql_skill
description: Venture capital portfolio analytics over MySQL (meridian_ventures). Tables portfolio_companies, founders, quarterly_updates. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_meridian
    transport: http
    url: "http://localhost:8007/mcp"
agent_instructions: |
  Use only SELECT queries. Use backticks (`) for table and column names (MySQL).
  Call get_schema (MCP) first, then generate_sql with relevant_schema_details from that output.
  
  Database is meridian_ventures. Key tables:
  
  **portfolio_companies**:
  Columns: id, name, sector, stage, invested_date, investment_usd, arr_usd, 
  mom_growth_pct, burn_rate_usd, runway_months, headcount, valuation_usd, 
  status, product_summary
  
  **founders**:
  Columns: id, company_id (FK), name, role, prior_exits, background_summary
  
  **quarterly_updates**:
  Columns: id, company_id (FK), quarter, arr_usd, burn_usd, headcount, kpi_summary
  
  Relationships:
  - JOIN founders ON founders.company_id = portfolio_companies.id
  - JOIN quarterly_updates ON quarterly_updates.company_id = portfolio_companies.id
  
  For growth analysis, compare ARR across quarters in quarterly_updates.
  For company health, check status column (green/amber/red) and runway_months.
  For founder analysis, use prior_exits and role from founders table.
  
  Sector values: 'FinTech', 'HealthTech', 'DevTools', 'B2B SaaS'
  Stage values: 'Seed', 'Series A', 'Series B'
  Status values: 'green', 'amber', 'red'
  Role values: 'CEO', 'CTO', 'CPO', 'COO'
---

# meridian_sql_skill

SQL skill for **venture capital portfolio analytics** over the MySQL database meridian_ventures. 
Uses the MySQL MCP server for get_schema and execute_sql.

## Purpose

Answer natural-language questions about portfolio companies, founders, investment performance, 
and quarterly business metrics. Support analysis by sector, stage, company status, and time periods.

The semantic model includes:

- **portfolio_companies**: Core table with company details, current metrics, and status
  - Financial: investment_usd, arr_usd, valuation_usd, burn_rate_usd
  - Growth: mom_growth_pct, runway_months
  - Context: sector, stage, status, product_summary
  
- **founders**: Leadership team with background and experience
  - Attributes: name, role, prior_exits, background_summary
  - Linked to companies via company_id
  
- **quarterly_updates**: Historical performance tracking
  - Time-series data: arr_usd, burn_usd, headcount by quarter
  - Format: quarter = "YYYY-Q#" (e.g. "2024-Q1")

## When to use

- Portfolio performance questions (ARR, growth rates, valuations)
- Company health monitoring (status, burn rate, runway)
- Founder background research (prior exits, roles)
- Trend analysis (quarterly ARR growth, burn trends)
- Comparative analysis (by sector, stage, or status)
- Investment return calculations

## Inputs (from agent)

- `question` (required): natural-language question about portfolio or companies
- Optional context for audit/scoping

## Outputs

- `result`: human-readable answer
- `sql_query`: the executed SELECT statement
- `data`: result set when applicable
- `sources`: ["mysql_meridian"]

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure the server with `.env` 
pointing to the meridian_ventures database:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**
- **MYSQL_DATABASE** = `meridian_ventures`

Run the MCP server on port 8007 and register as `mysql_meridian` in mcp_servers.json.

## Example queries

- "What's the total ARR of our FinTech portfolio?"
- "Which companies are in red status?"
- "Show me founders with prior exits"
- "What's the ARR growth for [company] over the last 4 quarters?"
- "Which Series A companies have runway under 12 months?"
- "Compare burn rates by sector"
