---
name: forge_global_sql
description: Forge Global private equity trading analytics over MySQL (pe_trading_db). Tables include investors, securities, orders, trades, settlements, asset_holdings, custody_transactions, investment_history, kyc_records, aml_alerts, regulatory_filings, valuations, cap_tables, crm_customer, and crm_business_customer. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_pe_trading
    transport: http
    url: "http://localhost:8011/mcp"
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

  Use only SELECT queries. Database is pe_trading_db.

  **SCHEMA RETRIEVAL — FETCH ONLY WHAT YOU NEED:**
  - Investor profiles:         MCP_get_schema(table_names=['investors'])
  - KYC compliance:            MCP_get_schema(table_names=['investors', 'kyc_records'])
  - AML alerts:                MCP_get_schema(table_names=['aml_alerts', 'investors'])
  - Securities & valuations:   MCP_get_schema(table_names=['securities', 'valuations'])
  - Cap table ownership:       MCP_get_schema(table_names=['securities', 'cap_tables'])
  - Orders & trades:           MCP_get_schema(table_names=['orders', 'trades', 'securities', 'investors'])
  - Trade settlements:         MCP_get_schema(table_names=['trades', 'settlements'])
  - Asset holdings:            MCP_get_schema(table_names=['asset_holdings', 'securities', 'investors'])
  - Custody transactions:      MCP_get_schema(table_names=['custody_transactions', 'securities', 'investors'])
  - Investment history:        MCP_get_schema(table_names=['investment_history', 'securities', 'investors'])
  - Regulatory filings:        MCP_get_schema(table_names=['regulatory_filings'])
  - CRM (individual):          MCP_get_schema(table_names=['crm_customer', 'investors'])
  - CRM (institutional):       MCP_get_schema(table_names=['crm_business_customer', 'investors'])

  KEY TABLE GROUPS:

  1. Investors:
     - `investors` (investor_id PK, first_name, last_name, email, phone,
         accreditation_status, kyc_status, country_of_residence,
         investor_type, declared_net_worth_usd, created_at DATETIME)

  2. KYC & AML Compliance:
     - `kyc_records` (kyc_id PK, investor_id → investors, review_date DATE, reviewer,
         id_verified BOOL, address_verified BOOL, sow_verified BOOL,
         pep_screened BOOL, sanctions_clear BOOL,
         outcome, next_review_date DATE, notes)
     - `aml_alerts` (alert_id PK, entity_type, entity_id, alert_reason,
         alert_severity, detected_at DATETIME, status DEFAULT 'OPEN')

  3. Securities & Valuations:
     - `securities` (security_id PK, ticker_symbol, company_name, security_type, sector, issuance_date DATE)
     - `valuations` (valuation_id PK, security_id → securities, valuation_date DATE,
         price_per_share DECIMAL(12,4), valuation_method)
     - `cap_tables` (entry_id PK, security_id → securities, shareholder_name, share_class,
         shares_held DECIMAL(15,2), ownership_percentage DECIMAL(6,4))

  4. Orders, Trades & Settlements:
     - `orders` (order_id PK, investor_id → investors, security_id → securities,
         order_type, order_price DECIMAL(12,4), quantity DECIMAL(12,2),
         order_status, order_timestamp DATETIME)
     - `trades` (trade_id PK, order_id → orders, execution_price DECIMAL(12,4),
         quantity_executed DECIMAL(12,2), trade_timestamp DATETIME,
         counterparty_id, exchange)
     - `settlements` (settlement_id PK, trade_id → trades, settlement_date DATE,
         settlement_status, settlement_amount DECIMAL(15,4), notes)

  5. Holdings & Custody:
     - `asset_holdings` (holding_id PK, investor_id → investors, security_id → securities,
         shares_held DECIMAL(15,2), current_value DECIMAL(15,4),
         custody_account, as_of_date DATE)
     - `custody_transactions` (custody_txn_id PK, investor_id → investors, security_id → securities,
         txn_type, shares DECIMAL(15,2), txn_date DATE, notes)
     - `investment_history` (position_id PK, investor_id → investors, security_id → securities,
         entry_price DECIMAL(12,4), shares DECIMAL(12,2), entry_date DATE, position_status)

  6. Regulatory Filings:
     - `regulatory_filings` (filing_id PK, filing_type, filing_date DATE, entity_id,
         filing_status, description TEXT, filed_with)

  7. CRM:
     - `crm_customer` (crm_id PK, investor_id → investors, relationship_mgr, tier,
         last_contact_dt DATE, lifetime_value BIGINT, notes)
     - `crm_business_customer` (crm_biz_id PK, investor_id → investors, firm_name,
         relationship_mgr, aum_usd BIGINT, tier, last_contact_dt DATE, notes)

  KEY ENUM VALUES:
  - investors.accreditation_status: 'Accredited', 'Non-Accredited', 'Qualified Purchaser'
  - investors.kyc_status: 'APPROVED', 'PENDING', 'REJECTED', 'EXPIRED'
  - investors.investor_type: 'Individual', 'Institutional', 'Family Office', 'Fund'
  - orders.order_type: 'BUY', 'SELL'
  - orders.order_status: 'FILLED', 'PARTIAL', 'CANCELLED', 'PENDING'
  - settlements.settlement_status: 'SETTLED', 'PENDING', 'FAILED'
  - aml_alerts.alert_severity: 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  - aml_alerts.status: 'OPEN', 'REVIEWED', 'CLOSED', 'ESCALATED'
  - kyc_records.outcome: 'PASS', 'FAIL', 'ESCALATED'
  - regulatory_filings.filing_status: 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PENDING'
  - investment_history.position_status: 'OPEN', 'CLOSED', 'PARTIAL'

  RELATIONSHIPS:
  - kyc_records.investor_id → investors.investor_id
  - asset_holdings.investor_id → investors.investor_id
  - asset_holdings.security_id → securities.security_id
  - orders.investor_id → investors.investor_id
  - orders.security_id → securities.security_id
  - trades.order_id → orders.order_id
  - settlements.trade_id → trades.trade_id
  - valuations.security_id → securities.security_id
  - cap_tables.security_id → securities.security_id
  - custody_transactions.investor_id → investors.investor_id
  - custody_transactions.security_id → securities.security_id
  - investment_history.investor_id → investors.investor_id
  - investment_history.security_id → securities.security_id
  - crm_customer.investor_id → investors.investor_id
  - crm_business_customer.investor_id → investors.investor_id

  COMMON QUERY PATTERNS (MySQL):

  **Investors with open AML alerts:**
  ```sql
  SELECT i.`investor_id`, i.`first_name`, i.`last_name`, i.`investor_type`,
         a.`alert_severity`, a.`alert_reason`, a.`detected_at`
  FROM `aml_alerts` a
  JOIN `investors` i ON i.`investor_id` = a.`entity_id`
  WHERE a.`status` = 'OPEN'
  ORDER BY FIELD(a.`alert_severity`, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), a.`detected_at` DESC
  LIMIT 20;
  ```

  **KYC approval rate by outcome:**
  ```sql
  SELECT k.`outcome`, COUNT(*) AS total_reviews,
         ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS pct
  FROM `kyc_records` k
  GROUP BY k.`outcome`
  ORDER BY total_reviews DESC;
  ```

  **Top investors by portfolio value (current holdings):**
  ```sql
  SELECT i.`investor_id`, CONCAT(i.`first_name`, ' ', i.`last_name`) AS investor_name,
         i.`investor_type`, SUM(ah.`current_value`) AS total_portfolio_value
  FROM `asset_holdings` ah
  JOIN `investors` i ON i.`investor_id` = ah.`investor_id`
  GROUP BY i.`investor_id`, i.`first_name`, i.`last_name`, i.`investor_type`
  ORDER BY total_portfolio_value DESC
  LIMIT 20;
  ```

  **Trade execution summary by security:**
  ```sql
  SELECT s.`ticker_symbol`, s.`company_name`, s.`sector`,
         COUNT(t.`trade_id`) AS total_trades,
         SUM(t.`quantity_executed`) AS total_shares_traded,
         AVG(t.`execution_price`) AS avg_execution_price,
         SUM(t.`quantity_executed` * t.`execution_price`) AS total_trade_value
  FROM `trades` t
  JOIN `orders` o ON o.`order_id` = t.`order_id`
  JOIN `securities` s ON s.`security_id` = o.`security_id`
  GROUP BY s.`security_id`, s.`ticker_symbol`, s.`company_name`, s.`sector`
  ORDER BY total_trade_value DESC
  LIMIT 20;
  ```

  **Failed or pending settlements:**
  ```sql
  SELECT st.`settlement_id`, st.`trade_id`, st.`settlement_date`,
         st.`settlement_status`, st.`settlement_amount`,
         o.`investor_id`, s.`ticker_symbol`
  FROM `settlements` st
  JOIN `trades` t ON t.`trade_id` = st.`trade_id`
  JOIN `orders` o ON o.`order_id` = t.`order_id`
  JOIN `securities` s ON s.`security_id` = o.`security_id`
  WHERE st.`settlement_status` IN ('FAILED', 'PENDING')
  ORDER BY st.`settlement_date` ASC
  LIMIT 20;
  ```

  **Ownership breakdown from cap table:**
  ```sql
  SELECT s.`ticker_symbol`, s.`company_name`,
         ct.`shareholder_name`, ct.`share_class`,
         ct.`shares_held`, ct.`ownership_percentage`
  FROM `cap_tables` ct
  JOIN `securities` s ON s.`security_id` = ct.`security_id`
  ORDER BY s.`ticker_symbol`, ct.`ownership_percentage` DESC
  LIMIT 20;
  ```

  **Latest valuations per security:**
  ```sql
  SELECT s.`ticker_symbol`, s.`company_name`, s.`sector`,
         v.`valuation_date`, v.`price_per_share`, v.`valuation_method`
  FROM `valuations` v
  JOIN `securities` s ON s.`security_id` = v.`security_id`
  WHERE v.`valuation_date` = (
    SELECT MAX(v2.`valuation_date`)
    FROM `valuations` v2
    WHERE v2.`security_id` = v.`security_id`
  )
  ORDER BY v.`price_per_share` DESC
  LIMIT 20;
  ```

  **CRM: institutional investors by AUM:**
  ```sql
  SELECT cb.`firm_name`, cb.`relationship_mgr`, cb.`tier`,
         cb.`aum_usd`, cb.`last_contact_dt`,
         CONCAT(i.`first_name`, ' ', i.`last_name`) AS primary_contact
  FROM `crm_business_customer` cb
  JOIN `investors` i ON i.`investor_id` = cb.`investor_id`
  ORDER BY cb.`aum_usd` DESC
  LIMIT 20;
  ```

  **Regulatory filings pending or rejected:**
  ```sql
  SELECT `filing_id`, `filing_type`, `filing_date`, `entity_id`,
         `filing_status`, `filed_with`, `description`
  FROM `regulatory_filings`
  WHERE `filing_status` IN ('PENDING', 'REJECTED')
  ORDER BY `filing_date` ASC
  LIMIT 20;
  ```

  **Open investment positions by investor:**
  ```sql
  SELECT CONCAT(i.`first_name`, ' ', i.`last_name`) AS investor_name,
         s.`ticker_symbol`, s.`company_name`,
         ih.`shares`, ih.`entry_price`, ih.`entry_date`,
         ih.`shares` * ih.`entry_price` AS position_cost
  FROM `investment_history` ih
  JOIN `investors` i ON i.`investor_id` = ih.`investor_id`
  JOIN `securities` s ON s.`security_id` = ih.`security_id`
  WHERE ih.`position_status` = 'OPEN'
  ORDER BY position_cost DESC
  LIMIT 20;
  ```
---

# forge_global_sql

SQL skill for **Forge Global private equity trading analytics** over the MySQL database `pe_trading_db`.

## Purpose

Answer natural-language questions about investor management, securities, order/trade execution,
settlement tracking, asset holdings, custody, KYC/AML compliance, regulatory filings,
and CRM relationship data.

## When to use

- Investor lookups by accreditation status, KYC status, country, investor type
- KYC records: review outcomes, verifications (ID, address, source of wealth, PEP, sanctions)
- AML alerts: open/escalated alerts by severity, entity type, or reason
- Securities and valuation trends: price history, valuation methods by security or sector
- Cap table: shareholder ownership percentages and share classes per security
- Order analytics: buy/sell volumes, fill rates, order status breakdown
- Trade execution: execution prices, counterparty analysis, exchange volumes
- Settlement tracking: pending/failed settlements and amounts at risk
- Asset holdings: portfolio value by investor, custody account distribution
- Custody transactions: transfer/deposit history by investor and security
- Investment positions: open/closed positions, cost basis, entry pricing
- Regulatory filings: pending/rejected filings, filing types and regulatory bodies
- CRM analytics: relationship manager assignments, investor tiers, AUM, lifetime value

## Inputs (from agent)

- `question` (required): natural-language question about pe_trading_db data.
- Optional context for time period, security, investor, or compliance scoping.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SELECT (if any).
- `data`: result set when applicable.
- `sources`: e.g. `["mysql_pe_trading"]`.

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure with `.env.pe_trading.mcp`
so it connects to the `pe_trading_db` database:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (`pe_trading_db`).

Run the MCP server with cwd `mcp_servers/mysql_mcp`. Register `mysql_pe_trading` in `mcp_servers.json`
or `mcp_servers.docker.json` as shown in the skill frontmatter above.
