# Meridian Ventures Agent

Venture capital portfolio tracking and analytics agent for querying the `meridian_ventures` MySQL database.

## Overview

This agent provides SQL querying capabilities for venture capital portfolio management, including:
- Portfolio company tracking (12 companies across FinTech, HealthTech, DevTools, B2B SaaS)
- Founder backgrounds and prior exits
- Quarterly performance metrics (ARR, burn rate, headcount)
- Investment analytics and health monitoring

## Database Schema

### portfolio_companies
Core table with company details and current metrics:
- **Dimensions**: name, sector, stage, status, product_summary
- **Financial**: investment_usd, arr_usd, valuation_usd, burn_rate_usd
- **Growth**: mom_growth_pct, runway_months, headcount

### founders
Leadership team with background information:
- **Attributes**: name, role, prior_exits, background_summary
- **Relationship**: company_id → portfolio_companies.id

### quarterly_updates
Historical performance tracking:
- **Metrics**: arr_usd, burn_usd, headcount
- **Format**: quarter (e.g., "2024-Q1"), kpi_summary
- **Relationship**: company_id → portfolio_companies.id

## Setup

### Local Development

1. **Create MCP server environment file:**
   ```bash
   cp .env.meridian.mcp.example .env.meridian.mcp
   ```

2. **Configure database connection in `.env.meridian.mcp`:**
   ```env
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=your_user
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=meridian_ventures
   MCP_PORT=8007
   ```

3. **Start the MCP server:**
   ```bash
   cd mcp_servers/mysql_mcp
   poetry install
   poetry run python -m mysql_mcp
   ```
   Server will run on `http://localhost:8007/mcp`

4. **Start agents service:**
   ```bash
   cd agents
   poetry run python -m querylab_agent
   ```

### Docker Deployment

1. **Configure `.env.meridian.mcp` with Docker database host**

2. **Build and start services:**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

The agent will be automatically discovered and available as `meridian_ventures` data source.

## Example Queries

### Portfolio Performance
- "What's the total ARR of our FinTech portfolio?"
- "Show me all companies with ARR over $5M"
- "Which companies have the highest MoM growth?"

### Health Monitoring
- "Which companies are in red status?"
- "Show me companies with runway under 12 months"
- "What's the average burn rate by sector?"

### Founder Analysis
- "Show me all founders with prior exits"
- "Which companies have a technical founder (CTO)?"
- "List CEOs with more than 2 prior exits"

### Trend Analysis
- "What's the ARR growth for [company] over the last 4 quarters?"
- "Show quarterly burn trends for all Series A companies"
- "Compare headcount growth by stage"

### Investment Returns
- "Calculate the investment multiple for each company"
- "Which investments have the highest valuation growth?"
- "Show ROI by sector"

## Configuration Files

- **Agent**: `.agents/meridian_ventures/AGENT.md`
- **Skill**: `.agents/meridian_ventures/query_sql/meridian_sql_skill.md`
- **MCP Config**: `.agents/mcp_servers.json` (localhost) or `.agents/mcp_servers.docker.json` (Docker)
- **Metadata**: `backend_sql/sample_data/meridian_ventures_metadata.json`

## MCP Server Ports

- **Local**: `localhost:8007`
- **Docker**: `meridian_mcp:8000` (internal), exposed as `localhost:8007` (host)

## Troubleshooting

### Agent not appearing in frontend
1. Verify `.agents/meridian_ventures/` directory structure
2. Restart agents service to trigger discovery
3. Check logs for MCP connection errors

### MCP connection failed
1. Verify MySQL database is accessible
2. Check `.env.meridian.mcp` credentials
3. Confirm MCP server is running on correct port
4. Test connection: `curl http://localhost:8007/mcp`

### SQL query errors
1. Agent calls `get_schema` first to discover tables
2. Check database name in `.env.meridian.mcp` is `meridian_ventures`
3. Verify tables exist: `portfolio_companies`, `founders`, `quarterly_updates`
