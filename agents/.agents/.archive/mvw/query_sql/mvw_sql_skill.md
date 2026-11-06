---
name: mvw_sql
description: Marriott Vacations Worldwide resort analytics over MySQL. Tables include resorts, owners, sales_tours, maintenance_fees, owner_activity, and monthly_financials. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_mvw
    transport: http
    url: "http://localhost:8010/mcp"
agent_instructions: |
  **CRITICAL: This is MySQL database. Use MySQL-specific syntax.**

  **!!!! FIRST STEP - SCHEMA RETRIEVAL !!!!**
  ALWAYS start by calling: MCP_get_schema(table_names=['resorts', 'owners'])
  Adjust table_names to only the tables relevant to the question.
  NEVER call: MCP_get_schema() with no arguments — fetches all tables and may cause timeout!

  MySQL Syntax Requirements:
  - INTERVAL: Use `INTERVAL 1 DAY` NOT `INTERVAL '1 day'` (PostgreSQL style)
  - Date functions: DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), DATE_ADD(), NOW()
  - ALWAYS add LIMIT clause on queries (default: LIMIT 20)
  - Backticks for identifiers: `table_name`, `column_name`
  - String literals: Single quotes 'value'
  - month_date stored as DATE (first day of month: '2024-04-01', '2024-05-01', ...)

  **SCHEMA RETRIEVAL - FETCH ONLY WHAT YOU NEED:**
  - Resort performance: MCP_get_schema(table_names=['resorts'])
  - Owner risk / delinquency: MCP_get_schema(table_names=['owners', 'maintenance_fees', 'owner_activity'])
  - VPG / tour sales: MCP_get_schema(table_names=['sales_tours', 'resorts'])
  - Portfolio financials: MCP_get_schema(table_names=['monthly_financials'])
  - Full owner analysis: MCP_get_schema(table_names=['owners', 'maintenance_fees', 'owner_activity', 'resorts'])

  Use only SELECT queries.

  KEY TABLE GROUPS:

  1. Resorts (15 properties, 5 brands):
     - resorts (id, name, brand, location, state_region, total_units, star_rating, opened_year,
       avg_occupancy_pct, owner_satisfaction_score, monthly_tour_capacity, last_renovation_year, status)
     - status: 'active', 'under_renovation', 'strategic_review'

  2. Owners (20 accounts, 3 tiers):
     - owners (id, full_name, tier, ownership_points, years_as_owner, home_resort_id,
       maintenance_fee_annual_usd, mf_status, satisfaction_score, last_stay_date)
     - tier: 'Signature', 'Select', 'Presidential'
     - mf_status: 'current', 'at_risk', 'delinquent'

  3. Sales Tours (monthly, Apr 2024 – Mar 2025):
     - sales_tours (id, resort_id, month_date, tours_conducted, contract_sales_usd,
       vpg_usd, close_rate_pct, avg_contract_usd, new_owner_count, upgrade_count)
     - FK: resort_id → resorts.id

  4. Maintenance Fees (2024 billing year):
     - maintenance_fees (id, owner_id, fee_year, amount_due_usd, amount_paid_usd,
       payment_status, days_overdue)
     - payment_status: 'paid', 'partial', 'unpaid'
     - FK: owner_id → owners.id

  5. Owner Activity (annual summary 2024):
     - owner_activity (id, owner_id, activity_year, resort_stays, exchange_trips,
       points_banked, points_rented_out, digital_logins_ytd)
     - FK: owner_id → owners.id

  6. Monthly Financials (portfolio level, Apr 2024 – Mar 2025):
     - monthly_financials (id, month_date, voi_sales_usd, financing_revenue_usd,
       exchange_revenue_usd, rental_revenue_usd, mf_management_revenue_usd,
       total_revenue_usd, development_cost_usd, sales_marketing_cost_usd)

  COMMON QUERY PATTERNS (MySQL):

  **WORKFLOW for "Show all resorts ranked by occupancy and satisfaction score"**

  Step 1: Call MCP_get_schema(table_names=['resorts'])
  Step 2: Generate SQL:

  ```sql
  -- Resort performance snapshot ranked by occupancy
  SELECT `name`, `brand`, `location`, `avg_occupancy_pct`, `owner_satisfaction_score`, `status`
  FROM `resorts`
  ORDER BY `avg_occupancy_pct` DESC, `owner_satisfaction_score` DESC
  LIMIT 20;

  -- VPG trend by brand over 12 months
  SELECT r.`brand`,
         DATE_FORMAT(st.`month_date`, '%Y-%m') AS month,
         AVG(st.`vpg_usd`) AS avg_vpg
  FROM `sales_tours` st
  JOIN `resorts` r ON r.`id` = st.`resort_id`
  WHERE st.`month_date` >= '2024-04-01'
  GROUP BY r.`brand`, DATE_FORMAT(st.`month_date`, '%Y-%m')
  ORDER BY r.`brand`, month
  LIMIT 20;

  -- At-risk and delinquent owners with activity and maintenance fee detail
  SELECT o.`full_name`, o.`tier`, r.`name` AS home_resort,
         o.`mf_status`, o.`satisfaction_score`,
         mf.`amount_due_usd`, mf.`amount_paid_usd`,
         (mf.`amount_due_usd` - mf.`amount_paid_usd`) AS balance_due,
         mf.`days_overdue`,
         oa.`resort_stays`, oa.`digital_logins_ytd`
  FROM `owners` o
  JOIN `resorts` r ON r.`id` = o.`home_resort_id`
  JOIN `maintenance_fees` mf ON mf.`owner_id` = o.`id` AND mf.`fee_year` = 2024
  JOIN `owner_activity` oa ON oa.`owner_id` = o.`id` AND oa.`activity_year` = 2024
  WHERE o.`mf_status` IN ('at_risk', 'delinquent')
  ORDER BY mf.`days_overdue` DESC
  LIMIT 20;

  -- VPG first vs last month (Apr 2024 vs Mar 2025) per resort
  SELECT r.`name`, r.`brand`,
         first_m.`vpg_usd` AS vpg_apr_2024,
         last_m.`vpg_usd`  AS vpg_mar_2025,
         ROUND(((last_m.`vpg_usd` - first_m.`vpg_usd`) / first_m.`vpg_usd`) * 100, 1) AS vpg_change_pct
  FROM `resorts` r
  JOIN `sales_tours` first_m ON first_m.`resort_id` = r.`id` AND first_m.`month_date` = '2024-04-01'
  JOIN `sales_tours` last_m  ON last_m.`resort_id`  = r.`id` AND last_m.`month_date`  = '2025-03-01'
  ORDER BY vpg_change_pct ASC
  LIMIT 20;

  -- Portfolio monthly financial summary
  SELECT DATE_FORMAT(`month_date`, '%Y-%m') AS month,
         `total_revenue_usd`, `voi_sales_usd`,
         (`total_revenue_usd` - `development_cost_usd` - `sales_marketing_cost_usd`) AS gross_profit_usd
  FROM `monthly_financials`
  ORDER BY `month_date` ASC
  LIMIT 20;
  ```

  KEY ENUM VALUES:
  - brand: 'Marriott Vacation Club', 'Sheraton Vacation Club', 'Westin Vacation Club',
            'Hyatt Vacation Club', 'Ritz-Carlton Club'
  - owner tier: 'Signature', 'Select', 'Presidential'
  - mf_status: 'current', 'at_risk', 'delinquent'
  - payment_status: 'paid', 'partial', 'unpaid'
  - resort status: 'active', 'under_renovation', 'strategic_review'

  RELATIONSHIPS:
  - owners.home_resort_id → resorts.id
  - sales_tours.resort_id → resorts.id
  - maintenance_fees.owner_id → owners.id
  - owner_activity.owner_id → owners.id
---

# mvw_sql

SQL skill for **Marriott Vacations Worldwide resort and owner analytics** over the MySQL database.

## Purpose

Answer natural-language questions about MVW business performance using SQL queries
against the `mvw` MySQL database. Covers resort operations, VPG tour sales, owner
maintenance fee risk, owner activity signals, and portfolio financial analytics.

## When to use

- Resort performance ranking by occupancy, satisfaction, brand
- VPG trend analysis by resort or brand over time
- Owner maintenance fee delinquency — identifying at-risk and delinquent owners
- Owner activity correlation with delinquency risk (stays, digital logins)
- Sales tour metrics — close rates, contract values, new owner counts
- Portfolio-level financial performance (VOI sales, financing, exchange, rental revenue)

## Inputs (from agent)

- `question` (required): natural-language question about MVW resort or owner analytics.
- Optional context for time period, brand, or specific resort scoping.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SELECT (if any).
- `data`: result set when applicable.
- `sources`: e.g. `["mysql_mvw"]`.

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure with `.env.mvw.mcp`
so it connects to the `mvw` database:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (`mvw`).

Run the MCP server with cwd `mcp_servers/mysql_mcp`. Register `mysql_mvw` in `mcp_servers.json`
or `mcp_servers.docker.json` as shown in the skill frontmatter above.
