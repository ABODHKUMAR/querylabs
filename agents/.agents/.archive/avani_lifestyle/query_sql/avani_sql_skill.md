---
name: avani_sql
description: Avani Lifestyle retail analytics over MySQL. Tables include campaigns, monthly sales, store metrics, inventory, customer cohorts, and financial data. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_avani
    transport: http
    url: "http://localhost:8009/mcp"
agent_instructions: |
  **CRITICAL: This is a MySQL database. Use MySQL-specific syntax.**

  **!!!! FIRST STEP - SCHEMA RETRIEVAL !!!!**
  ALWAYS start by calling MCP_get_schema() with only the tables relevant to the question.
  NEVER call MCP_get_schema() with no arguments — fetches all tables and may cause timeout!

  MySQL Syntax Requirements:
  - INTERVAL: Use `INTERVAL 1 MONTH` NOT `INTERVAL '1 month'` (PostgreSQL style)
  - Date functions: DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH), DATE_ADD(), NOW()
  - ALWAYS add LIMIT clause on large table queries (default: LIMIT 20)
  - Backticks for identifiers: `table_name`, `column_name`
  - String literals: Single quotes 'value'
  - month column is CHAR(7) in format 'YYYY-MM' — filter with: `month` >= '2024-01'

  Use only SELECT queries.

  **SCHEMA RETRIEVAL — FETCH ONLY WHAT YOU NEED:**
  - Store performance:        MCP_get_schema(table_names=['stores', 'monthly_store_metrics'])
  - Overall financials:       MCP_get_schema(table_names=['monthly_financials'])
  - Product & channel sales:  MCP_get_schema(table_names=['products', 'monthly_sales', 'channels'])
  - Campaign analytics:       MCP_get_schema(table_names=['campaigns', 'campaign_performance'])
  - Inventory & supply chain: MCP_get_schema(table_names=['products', 'inventory_snapshots'])
  - Customer cohorts / CLV:   MCP_get_schema(table_names=['customer_cohorts'])

  KEY TABLE GROUPS:

  1. Store Operations:
     - stores (id, name, city, state, region ENUM('West','East','South','Central'),
               format ENUM('flagship','standard','outlet'), manager_name, opened_date, sqft, monthly_rent)
     - monthly_store_metrics (id, store_id → stores.id, month CHAR(7),
               foot_traffic, conversion_rate_pct, avg_transaction_usd,
               units_per_transaction, same_store_yoy_pct, staff_hours, revenue_per_staff_hour)

  2. Overall Financials:
     - monthly_financials (id, month CHAR(7), total_revenue_usd, cogs_usd, gross_margin_pct,
               opex_usd, ebitda_usd, ebitda_margin_pct,
               dtc_revenue_usd, retail_revenue_usd, wholesale_revenue_usd,
               capex_usd, inventory_value_usd)

  3. Product & Channel Sales:
     - products (id, name, category ENUM('Leggings','Tops','Outerwear','Accessories','Footwear','Mens'),
               collection ENUM('Core','Seasonal','Limited'), supplier, cogs_usd, msrp_usd, launched_date)
     - channels (id, name, channel_type ENUM('dtc','retail','wholesale'))
     - monthly_sales (id, product_id → products.id, channel_id → channels.id, month CHAR(7),
               units_sold, gross_revenue_usd, returns_units, returns_usd, discount_usd, net_revenue_usd)

  4. Campaign Analytics:
     - campaigns (id, name, platform ENUM('Meta','TikTok','Google','Influencer','Email','SMS','Affiliate'),
               start_date, end_date, budget_usd, target_audience)
     - campaign_performance (id, campaign_id → campaigns.id, month CHAR(7),
               spend_usd, impressions, clicks, conversions,
               revenue_attributed_usd, new_customers_acquired, cac_usd, roas)

  5. Inventory & Supply Chain:
     - inventory_snapshots (id, product_id → products.id, month CHAR(7),
               warehouse_units, in_transit_units, store_units,
               weeks_of_supply, stockout_incidents, supplier_on_time_pct, sell_through_rate_pct)

  6. Customer Cohorts / CLV / Retention:
     - customer_cohorts (id, cohort_quarter CHAR(7),
               acquisition_channel ENUM('DTC-Organic','DTC-Paid-Meta','DTC-Paid-TikTok',
                 'DTC-Paid-Google','DTC-Email','Retail-Walk-In','Wholesale'),
               customers_acquired, month_3_retention_pct, month_6_retention_pct,
               month_12_retention_pct, avg_clv_usd, avg_orders, nps_score, loyalty_member_pct)

  COMMON QUERY PATTERNS (MySQL):

  **Store conversion rate last quarter:**
  ```sql
  SELECT s.`name`, s.`city`, AVG(m.`conversion_rate_pct`) AS avg_conversion_pct
  FROM `monthly_store_metrics` m
  JOIN `stores` s ON s.`id` = m.`store_id`
  WHERE m.`month` >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH), '%Y-%m')
  GROUP BY s.`id`, s.`name`, s.`city`
  ORDER BY avg_conversion_pct DESC
  LIMIT 10;
  ```

  **Revenue by channel (DTC vs retail vs wholesale):**
  ```sql
  SELECT c.`channel_type`, c.`name`,
         SUM(ms.`net_revenue_usd`) AS total_net_revenue,
         SUM(ms.`units_sold`) AS total_units
  FROM `monthly_sales` ms
  JOIN `channels` c ON c.`id` = ms.`channel_id`
  WHERE ms.`month` >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH), '%Y-%m')
  GROUP BY c.`id`, c.`channel_type`, c.`name`
  ORDER BY total_net_revenue DESC
  LIMIT 10;
  ```

  **Top products by net revenue:**
  ```sql
  SELECT p.`name`, p.`category`, p.`collection`,
         SUM(ms.`units_sold`) AS total_units,
         SUM(ms.`net_revenue_usd`) AS total_net_revenue
  FROM `monthly_sales` ms
  JOIN `products` p ON p.`id` = ms.`product_id`
  GROUP BY p.`id`, p.`name`, p.`category`, p.`collection`
  ORDER BY total_net_revenue DESC
  LIMIT 10;
  ```

  **Campaign ROAS and CAC:**
  ```sql
  SELECT c.`name`, c.`platform`,
         SUM(cp.`spend_usd`) AS total_spend,
         SUM(cp.`revenue_attributed_usd`) AS total_revenue,
         AVG(cp.`roas`) AS avg_roas,
         AVG(cp.`cac_usd`) AS avg_cac,
         SUM(cp.`new_customers_acquired`) AS total_new_customers
  FROM `campaign_performance` cp
  JOIN `campaigns` c ON c.`id` = cp.`campaign_id`
  GROUP BY c.`id`, c.`name`, c.`platform`
  ORDER BY avg_roas DESC
  LIMIT 10;
  ```

  **Inventory health — products at risk of stockout:**
  ```sql
  SELECT p.`name`, p.`category`,
         i.`month`, i.`weeks_of_supply`, i.`stockout_incidents`,
         i.`sell_through_rate_pct`, i.`supplier_on_time_pct`
  FROM `inventory_snapshots` i
  JOIN `products` p ON p.`id` = i.`product_id`
  WHERE i.`weeks_of_supply` < 4 OR i.`stockout_incidents` > 0
  ORDER BY i.`weeks_of_supply` ASC
  LIMIT 10;
  ```

  **Customer cohort retention and CLV:**
  ```sql
  SELECT `cohort_quarter`, `acquisition_channel`,
         `customers_acquired`, `month_3_retention_pct`,
         `month_6_retention_pct`, `month_12_retention_pct`,
         `avg_clv_usd`, `avg_orders`, `nps_score`
  FROM `customer_cohorts`
  ORDER BY `cohort_quarter` DESC
  LIMIT 20;
  ```

  **Overall P&L summary:**
  ```sql
  SELECT `month`, `total_revenue_usd`, `gross_margin_pct`,
         `ebitda_usd`, `ebitda_margin_pct`,
         `dtc_revenue_usd`, `retail_revenue_usd`, `wholesale_revenue_usd`
  FROM `monthly_financials`
  ORDER BY `month` DESC
  LIMIT 12;
  ```

  KEY ENUM VALUES:
  - channels.channel_type: 'dtc', 'retail', 'wholesale'
  - stores.region: 'West', 'East', 'South', 'Central'
  - stores.format: 'flagship', 'standard', 'outlet'
  - products.category: 'Leggings', 'Tops', 'Outerwear', 'Accessories', 'Footwear', 'Mens'
  - products.collection: 'Core', 'Seasonal', 'Limited'
  - campaigns.platform: 'Meta', 'TikTok', 'Google', 'Influencer', 'Email', 'SMS', 'Affiliate'
  - customer_cohorts.acquisition_channel: 'DTC-Organic', 'DTC-Paid-Meta', 'DTC-Paid-TikTok',
      'DTC-Paid-Google', 'DTC-Email', 'Retail-Walk-In', 'Wholesale'

  RELATIONSHIPS:
  - monthly_store_metrics.store_id → stores.id
  - monthly_sales.product_id → products.id
  - monthly_sales.channel_id → channels.id
  - campaign_performance.campaign_id → campaigns.id
  - inventory_snapshots.product_id → products.id
---

# avani_sql

SQL skill for **Avani Lifestyle retail and business analytics** over the MySQL database.

## Purpose

Answer natural-language questions about Avani Lifestyle business performance using SQL
queries against the `avani_lifestyle` MySQL database. Covers store operations, channel
economics, product sales, campaign performance, inventory/supply chain, customer cohorts,
and overall P&L financials.

## When to use

- Store foot traffic, conversion rates, same-store YoY growth, and fleet benchmarking
- Monthly financials: revenue, gross margin, EBITDA, DTC vs retail vs wholesale split
- Product-level sales, units sold, returns, discounts, and net revenue by channel
- Campaign analytics: ROAS, CAC, impressions, clicks, conversions by platform
- Inventory health: weeks of supply, stockout incidents, sell-through rate, supplier on-time %
- Customer cohorts: acquisition channel, retention at 3/6/12 months, CLV, NPS, loyalty %

## Inputs (from agent)

- `question` (required): natural-language question about Avani Lifestyle business metrics.
- Optional context for time period or store/product/campaign scoping.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SELECT (if any).
- `data`: result set when applicable.
- `sources`: e.g. `["mysql_avani"]`.

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure with `.env.avani.mcp`
so it connects to the `avani_lifestyle` database:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (`avani_lifestyle`).

Run the MCP server with cwd `mcp_servers/mysql_mcp`. Register `mysql_avani` in `mcp_servers.json`
or `mcp_servers.docker.json` as shown in the skill frontmatter above.
