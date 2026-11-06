-- Query Labs product sample data (idempotent-ish: drop/recreate demo tables)
-- Covers tables referenced by agents so SQL questions return real product answers.

-- ===========================================================================
-- financial_metrics (revenue / product analytics — mysql_revenue MCP)
-- ===========================================================================
USE financial_metrics;

DROP TABLE IF EXISTS product_region_revenue;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS monthly_revenue;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  unit_price_usd DECIMAL(12,2) NOT NULL,
  cogs_usd DECIMAL(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_region_revenue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  month_label VARCHAR(16) NOT NULL,
  region VARCHAR(64) NOT NULL,
  units_sold INT NOT NULL,
  revenue_usd DECIMAL(14,2) NOT NULL,
  forecast_usd DECIMAL(14,2) NOT NULL,
  cogs_usd DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_revenue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month_label VARCHAR(16) NOT NULL,
  region VARCHAR(64) NOT NULL,
  revenue_usd DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO products (sku, product_name, category, unit_price_usd, cogs_usd, status) VALUES
  ('QL-ANALYTICS', 'Query Labs Analytics Suite', 'SaaS', 149.00, 22.00, 'active'),
  ('QL-INSIGHTS', 'Query Labs Insights Pro', 'SaaS', 299.00, 35.00, 'active'),
  ('QL-EMBED', 'Query Labs Embedded Charts', 'Platform', 99.00, 12.00, 'active'),
  ('QL-DATAHUB', 'Query Labs Data Hub', 'Platform', 499.00, 60.00, 'active'),
  ('QL-AGENT', 'Query Labs Agent Pack', 'AI', 199.00, 40.00, 'active'),
  ('QL-VECTOR', 'Query Labs Vector Search Add-on', 'AI', 79.00, 15.00, 'active');

INSERT INTO product_region_revenue (product_id, month_label, region, units_sold, revenue_usd, forecast_usd, cogs_usd) VALUES
  (1,'2025-01','APAC',420,62580.00,60000.00,9240.00),
  (1,'2025-01','EMEA',310,46190.00,45000.00,6820.00),
  (1,'2025-01','NA',510,75990.00,74000.00,11220.00),
  (2,'2025-01','APAC',180,53820.00,52000.00,6300.00),
  (2,'2025-01','EMEA',140,41860.00,40000.00,4900.00),
  (2,'2025-01','NA',220,65780.00,64000.00,7700.00),
  (3,'2025-01','APAC',260,25740.00,25000.00,3120.00),
  (3,'2025-01','EMEA',190,18810.00,18000.00,2280.00),
  (3,'2025-01','NA',300,29700.00,29000.00,3600.00),
  (4,'2025-01','APAC',90,44910.00,43000.00,5400.00),
  (4,'2025-01','EMEA',70,34930.00,34000.00,4200.00),
  (4,'2025-01','NA',110,54890.00,53000.00,6600.00),
  (5,'2025-01','APAC',150,29850.00,28000.00,6000.00),
  (5,'2025-01','EMEA',120,23880.00,23000.00,4800.00),
  (5,'2025-01','NA',200,39800.00,38000.00,8000.00),
  (6,'2025-01','APAC',210,16590.00,16000.00,3150.00),
  (6,'2025-01','EMEA',160,12640.00,12000.00,2400.00),
  (6,'2025-01','NA',250,19750.00,19000.00,3750.00),
  (1,'2025-02','APAC',450,67050.00,65000.00,9900.00),
  (1,'2025-02','EMEA',330,49170.00,47000.00,7260.00),
  (1,'2025-02','NA',540,80460.00,78000.00,11880.00),
  (2,'2025-02','APAC',195,58305.00,56000.00,6825.00),
  (2,'2025-02','EMEA',155,46345.00,44000.00,5425.00),
  (2,'2025-02','NA',235,70265.00,68000.00,8225.00),
  (5,'2025-02','APAC',170,33830.00,32000.00,6800.00),
  (5,'2025-02','EMEA',135,26865.00,25000.00,5400.00),
  (5,'2025-02','NA',225,44775.00,42000.00,9000.00),
  (1,'2025-03','APAC',480,71520.00,70000.00,10560.00),
  (1,'2025-03','EMEA',360,53640.00,51000.00,7920.00),
  (1,'2025-03','NA',580,86420.00,84000.00,12760.00),
  (4,'2025-03','APAC',105,52395.00,50000.00,6300.00),
  (4,'2025-03','EMEA',85,42415.00,41000.00,5100.00),
  (4,'2025-03','NA',130,64870.00,62000.00,7800.00),
  (6,'2025-03','APAC',240,18960.00,18000.00,3600.00),
  (6,'2025-03','EMEA',185,14615.00,14000.00,2775.00),
  (6,'2025-03','NA',280,22120.00,21000.00,4200.00);

INSERT INTO monthly_revenue (month_label, region, revenue_usd)
SELECT month_label, region, SUM(revenue_usd)
FROM product_region_revenue
GROUP BY month_label, region;

-- ===========================================================================
-- beat_results_dev (observability / execution product metrics)
-- ===========================================================================
USE beat_results_dev;

DROP TABLE IF EXISTS beat_rpt_data;
DROP TABLE IF EXISTS check_results;

CREATE TABLE beat_rpt_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_date DATE NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  pipeline_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  rows_processed INT NOT NULL,
  duration_sec INT NOT NULL,
  error_count INT NOT NULL DEFAULT 0,
  region VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE check_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  check_name VARCHAR(128) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  score DECIMAL(5,2) NULL,
  observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO beat_rpt_data (run_date, product_name, pipeline_name, status, rows_processed, duration_sec, error_count, region) VALUES
  ('2025-03-01','Query Labs Analytics Suite','daily_metrics_etl','success',1250000,420,0,'APAC'),
  ('2025-03-01','Query Labs Insights Pro','usage_rollup','success',880000,365,2,'EMEA'),
  ('2025-03-01','Query Labs Data Hub','warehouse_sync','warn',640000,610,12,'NA'),
  ('2025-03-02','Query Labs Agent Pack','agent_eval_batch','success',210000,290,0,'APAC'),
  ('2025-03-02','Query Labs Vector Search Add-on','embedding_refresh','success',450000,510,1,'NA'),
  ('2025-03-02','Query Labs Embedded Charts','chart_cache_warm','failed',0,95,1,'EMEA'),
  ('2025-03-03','Query Labs Analytics Suite','daily_metrics_etl','success',1310000,405,0,'APAC'),
  ('2025-03-03','Query Labs Insights Pro','usage_rollup','success',910000,350,0,'EMEA'),
  ('2025-03-03','Query Labs Data Hub','warehouse_sync','success',655000,540,3,'NA'),
  ('2025-03-04','Query Labs Agent Pack','agent_eval_batch','success',225000,275,0,'NA'),
  ('2025-03-04','Query Labs Vector Search Add-on','embedding_refresh','warn',470000,580,8,'APAC'),
  ('2025-03-05','Query Labs Analytics Suite','daily_metrics_etl','success',1285000,398,0,'EMEA');

INSERT INTO check_results (check_name, product_name, status, score) VALUES
  ('api_latency','Query Labs Analytics Suite','pass',98.5),
  ('error_rate','Query Labs Insights Pro','warn',87.0),
  ('uptime','Query Labs Data Hub','pass',99.9),
  ('embedding_freshness','Query Labs Vector Search Add-on','pass',96.2),
  ('agent_success_rate','Query Labs Agent Pack','pass',94.1),
  ('chart_render_p95','Query Labs Embedded Charts','warn',82.4);

-- ===========================================================================
-- meridian_ventures (portfolio product companies)
-- ===========================================================================
USE meridian_ventures;

DROP TABLE IF EXISTS quarterly_updates;
DROP TABLE IF EXISTS founders;
DROP TABLE IF EXISTS portfolio_companies;

CREATE TABLE portfolio_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  sector VARCHAR(64) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  invested_date DATE NOT NULL,
  investment_usd DECIMAL(14,2) NOT NULL,
  arr_usd DECIMAL(14,2) NOT NULL,
  mom_growth_pct DECIMAL(6,2) NOT NULL,
  burn_rate_usd DECIMAL(14,2) NOT NULL,
  runway_months INT NOT NULL,
  headcount INT NOT NULL,
  valuation_usd DECIMAL(14,2) NOT NULL,
  status VARCHAR(16) NOT NULL,
  product_summary VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE founders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  prior_exits INT NOT NULL DEFAULT 0,
  background_summary VARCHAR(255) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES portfolio_companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE quarterly_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  quarter VARCHAR(16) NOT NULL,
  arr_usd DECIMAL(14,2) NOT NULL,
  burn_usd DECIMAL(14,2) NOT NULL,
  headcount INT NOT NULL,
  kpi_summary VARCHAR(255) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES portfolio_companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO portfolio_companies
(name, sector, stage, invested_date, investment_usd, arr_usd, mom_growth_pct, burn_rate_usd, runway_months, headcount, valuation_usd, status, product_summary) VALUES
('Northwind Labs','B2B SaaS','Series A','2023-06-15',2500000,4200000,8.5,320000,18,54,48000000,'green','B2B product analytics platform'),
('Blue Harbor','FinTech','Series B','2022-11-02',4100000,9100000,5.2,510000,22,120,125000000,'green','Embedded payments product suite'),
('PulseCart','B2B SaaS','Seed','2024-02-20',900000,780000,14.0,140000,9,22,12000000,'amber','E-commerce product recommendation engine'),
('MediStack','HealthTech','Series A','2023-09-10',1800000,2100000,7.1,260000,11,41,32000000,'amber','Clinical workflow product OS'),
('Shiply','DevTools','Seed','2024-05-01',750000,420000,18.5,110000,8,16,9000000,'red','Developer product release automation'),
('Ledgerly','FinTech','Series A','2023-03-18',2200000,3500000,6.4,290000,15,48,40000000,'green','SMB accounting product with AI insights');

INSERT INTO founders (company_id, name, role, prior_exits, background_summary) VALUES
(1,'Asha Raman','CEO',1,'Ex-product lead at enterprise analytics unicorn'),
(1,'Ken Park','CTO',0,'Built data platforms at two SaaS scale-ups'),
(2,'Maya Ortiz','CEO',2,'Fintech founder with prior payments exit'),
(2,'Jon Hale','CTO',0,'Ex-Stripe infrastructure engineer'),
(3,'Ravi Mehta','CEO',0,'Retail tech product manager turned founder'),
(4,'Elena Cruz','CEO',1,'Health systems product operator'),
(5,'Tom Nguyen','CEO',0,'Open-source maintainer and DevEx lead'),
(6,'Priya Shah','CEO',1,'Built SMB finance products at Intuit');

INSERT INTO quarterly_updates (company_id, quarter, arr_usd, burn_usd, headcount, kpi_summary) VALUES
(1,'2024-Q3',3600000,300000,46,'Product NPS 52; enterprise seats up 18%'),
(1,'2024-Q4',3900000,310000,50,'Launched Insights Pro SKU'),
(1,'2025-Q1',4200000,320000,54,'Expansion ARR beat plan by 12%'),
(2,'2024-Q4',8500000,490000,112,'Payments volume +22% QoQ'),
(2,'2025-Q1',9100000,510000,120,'New banking partners live'),
(3,'2024-Q4',620000,130000,19,'Pilot conversion 28%'),
(3,'2025-Q1',780000,140000,22,'Retailer logo count 41'),
(5,'2024-Q4',310000,105000,14,'Burn high vs ARR; hiring freeze'),
(5,'2025-Q1',420000,110000,16,'Self-serve product launch');

-- ===========================================================================
-- novadash (SaaS product customers / usage)
-- ===========================================================================
USE novadash;

DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS renewal_forecast;
DROP TABLE IF EXISTS product_usage;
DROP TABLE IF EXISTS mrr_history;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  industry VARCHAR(64) NOT NULL,
  tier VARCHAR(32) NOT NULL,
  contract_start DATE NOT NULL,
  mrr_usd DECIMAL(12,2) NOT NULL,
  arr_usd DECIMAL(12,2) NOT NULL,
  health_score INT NOT NULL,
  nps_score INT NOT NULL,
  seats INT NOT NULL,
  gmv_tracked_monthly DECIMAL(14,2) NOT NULL,
  csm_owner VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  last_qbr_date DATE NULL,
  renewal_date DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mrr_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  mrr_usd DECIMAL(12,2) NOT NULL,
  change_type VARCHAR(32) NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  dau_count INT NOT NULL,
  reports_run INT NOT NULL,
  dashboards_viewed INT NOT NULL,
  api_calls INT NOT NULL,
  feature_cohort_analysis TINYINT NOT NULL,
  feature_funnel TINYINT NOT NULL,
  feature_ltv TINYINT NOT NULL,
  feature_attribution TINYINT NOT NULL,
  session_minutes_avg DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE renewal_forecast (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  renewal_date DATE NOT NULL,
  current_arr DECIMAL(12,2) NOT NULL,
  forecast_outcome VARCHAR(32) NOT NULL,
  confidence_pct INT NOT NULL,
  expansion_potential DECIMAL(12,2) NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  opened_date DATE NOT NULL,
  closed_date DATE NULL,
  category VARCHAR(64) NOT NULL,
  priority VARCHAR(16) NOT NULL,
  csat_score INT NULL,
  resolution_hours DECIMAL(8,2) NULL,
  is_escalated TINYINT NOT NULL DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO customers
(name, industry, tier, contract_start, mrr_usd, arr_usd, health_score, nps_score, seats, gmv_tracked_monthly, csm_owner, status, last_qbr_date, renewal_date) VALUES
('Acme Cosmetics','Beauty & Cosmetics','Growth','2024-01-15',12000,144000,82,54,40,2500000,'Nina Patel','active','2025-01-10','2026-01-15'),
('Globex Apparel','Apparel & Fashion','Enterprise','2023-06-01',28500,342000,61,31,120,9100000,'Chris Wong','at_risk','2024-11-20','2025-06-01'),
('HomeNest','Home & Garden','Starter','2024-08-12',3500,42000,74,48,12,420000,'Nina Patel','active','2025-02-01','2025-08-12'),
('TrailForge','Sports & Outdoors','Growth','2024-03-05',9800,117600,88,62,35,1800000,'Alex Rivera','active','2025-01-28','2026-03-05'),
('BiteBox','Food & Beverage','Enterprise','2023-11-18',22000,264000,55,22,95,6400000,'Chris Wong','at_risk','2024-12-05','2025-11-18'),
('CircuitCart','Electronics','Growth','2024-05-22',14500,174000,79,50,48,3100000,'Alex Rivera','active','2025-02-15','2026-05-22'),
('PawPrime','Pet Supplies','Starter','2024-09-01',2900,34800,70,44,10,260000,'Nina Patel','active',NULL,'2025-09-01'),
('LumaWear','Apparel & Fashion','Growth','2024-02-14',11200,134400,45,18,38,1500000,'Chris Wong','paused','2024-10-01','2025-02-14');

INSERT INTO mrr_history (customer_id, month, mrr_usd, change_type) VALUES
(1,'2024-11',11000,'expansion'),(1,'2024-12',11500,'expansion'),(1,'2025-01',12000,'expansion'),
(2,'2024-11',30000,'contraction'),(2,'2024-12',29000,'contraction'),(2,'2025-01',28500,'contraction'),
(3,'2024-11',3200,'new'),(3,'2024-12',3400,'expansion'),(3,'2025-01',3500,'expansion'),
(4,'2024-11',9000,'expansion'),(4,'2024-12',9400,'expansion'),(4,'2025-01',9800,'expansion'),
(5,'2024-11',23500,'contraction'),(5,'2024-12',22500,'contraction'),(5,'2025-01',22000,'contraction'),
(6,'2024-11',13000,'expansion'),(6,'2024-12',14000,'expansion'),(6,'2025-01',14500,'expansion'),
(7,'2024-11',2500,'new'),(7,'2024-12',2700,'expansion'),(7,'2025-01',2900,'expansion'),
(8,'2024-11',12000,'contraction'),(8,'2024-12',11200,'contraction'),(8,'2025-01',11200,'contraction');

INSERT INTO product_usage
(customer_id, month, dau_count, reports_run, dashboards_viewed, api_calls, feature_cohort_analysis, feature_funnel, feature_ltv, feature_attribution, session_minutes_avg) VALUES
(1,'2025-01',28,410,220,18000,1,1,1,1,24.5),
(2,'2025-01',45,260,180,42000,1,1,0,1,18.2),
(3,'2025-01',8,90,55,3200,1,0,0,1,16.0),
(4,'2025-01',22,350,190,15000,1,1,1,1,27.4),
(5,'2025-01',30,180,140,26000,0,1,0,1,12.8),
(6,'2025-01',26,390,210,21000,1,1,1,1,25.1),
(7,'2025-01',6,70,40,2100,1,0,0,0,14.2),
(8,'2025-01',9,55,35,1800,0,0,0,1,9.5);

INSERT INTO renewal_forecast
(customer_id, renewal_date, current_arr, forecast_outcome, confidence_pct, expansion_potential, notes) VALUES
(1,'2026-01-15',144000,'renew_expand',82,24000,'Strong product adoption on Insights Pro'),
(2,'2025-06-01',342000,'downgrade',64,0,'Usage declining; ask for exec sponsor'),
(3,'2025-08-12',42000,'renew_flat',75,5000,'Healthy starter account'),
(4,'2026-03-05',117600,'renew_expand',88,18000,'Adding attribution module'),
(5,'2025-11-18',264000,'churn',58,0,'Multiple critical tickets; health low'),
(6,'2026-05-22',174000,'renew_expand',80,12000,'API product usage growing'),
(7,'2025-09-01',34800,'renew_flat',70,3000,'New logo, still onboarding'),
(8,'2025-02-14',134400,'churn',55,0,'Paused seats; win-back campaign needed');

INSERT INTO support_tickets
(customer_id, opened_date, closed_date, category, priority, csat_score, resolution_hours, is_escalated) VALUES
(2,'2025-01-08','2025-01-10','Performance','high',3,36.0,1),
(2,'2025-01-20',NULL,'Attribution Accuracy','critical',NULL,NULL,1),
(5,'2025-01-05','2025-01-07','Data Integration','high',2,40.0,1),
(5,'2025-01-18','2025-01-19','Reporting Bug','medium',4,18.0,0),
(1,'2025-01-12','2025-01-12','Feature Request','low',5,4.0,0),
(4,'2025-01-15','2025-01-16','Onboarding','medium',5,10.0,0),
(8,'2025-01-03','2025-01-09','Billing','high',2,72.0,1),
(6,'2025-01-22','2025-01-22','API','low',5,3.5,0);

-- ===========================================================================
-- avani (retail lifestyle product data)
-- ===========================================================================
USE avani;

DROP TABLE IF EXISTS customer_cohorts;
DROP TABLE IF EXISTS inventory_snapshots;
DROP TABLE IF EXISTS campaign_performance;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS monthly_sales;
DROP TABLE IF EXISTS channels;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS monthly_financials;
DROP TABLE IF EXISTS monthly_store_metrics;
DROP TABLE IF EXISTS stores;

CREATE TABLE stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  city VARCHAR(64) NOT NULL,
  state VARCHAR(64) NOT NULL,
  region VARCHAR(32) NOT NULL,
  format VARCHAR(32) NOT NULL,
  manager_name VARCHAR(64) NOT NULL,
  opened_date DATE NOT NULL,
  sqft INT NOT NULL,
  monthly_rent DECIMAL(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_store_metrics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  foot_traffic INT NOT NULL,
  conversion_rate_pct DECIMAL(5,2) NOT NULL,
  avg_transaction_usd DECIMAL(10,2) NOT NULL,
  units_per_transaction DECIMAL(6,2) NOT NULL,
  same_store_yoy_pct DECIMAL(6,2) NOT NULL,
  staff_hours INT NOT NULL,
  revenue_per_staff_hour DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (store_id) REFERENCES stores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_financials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month VARCHAR(16) NOT NULL,
  total_revenue_usd DECIMAL(14,2) NOT NULL,
  cogs_usd DECIMAL(14,2) NOT NULL,
  gross_margin_pct DECIMAL(5,2) NOT NULL,
  opex_usd DECIMAL(14,2) NOT NULL,
  ebitda_usd DECIMAL(14,2) NOT NULL,
  ebitda_margin_pct DECIMAL(5,2) NOT NULL,
  dtc_revenue_usd DECIMAL(14,2) NOT NULL,
  retail_revenue_usd DECIMAL(14,2) NOT NULL,
  wholesale_revenue_usd DECIMAL(14,2) NOT NULL,
  capex_usd DECIMAL(14,2) NOT NULL,
  inventory_value_usd DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  supplier VARCHAR(64) NOT NULL,
  cogs_usd DECIMAL(10,2) NOT NULL,
  msrp_usd DECIMAL(10,2) NOT NULL,
  launched_date DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  channel_type VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  channel_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  units_sold INT NOT NULL,
  gross_revenue_usd DECIMAL(14,2) NOT NULL,
  returns_units INT NOT NULL,
  returns_usd DECIMAL(12,2) NOT NULL,
  discount_usd DECIMAL(12,2) NOT NULL,
  net_revenue_usd DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget_usd DECIMAL(12,2) NOT NULL,
  target_audience VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE campaign_performance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  spend_usd DECIMAL(12,2) NOT NULL,
  impressions INT NOT NULL,
  clicks INT NOT NULL,
  conversions INT NOT NULL,
  revenue_attributed_usd DECIMAL(14,2) NOT NULL,
  new_customers_acquired INT NOT NULL,
  cac_usd DECIMAL(10,2) NOT NULL,
  roas DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  month VARCHAR(16) NOT NULL,
  warehouse_units INT NOT NULL,
  in_transit_units INT NOT NULL,
  store_units INT NOT NULL,
  weeks_of_supply DECIMAL(6,2) NOT NULL,
  stockout_incidents INT NOT NULL,
  supplier_on_time_pct DECIMAL(5,2) NOT NULL,
  sell_through_rate_pct DECIMAL(5,2) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_cohorts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cohort_quarter VARCHAR(16) NOT NULL,
  acquisition_channel VARCHAR(64) NOT NULL,
  customers_acquired INT NOT NULL,
  month_3_retention_pct DECIMAL(5,2) NOT NULL,
  month_6_retention_pct DECIMAL(5,2) NOT NULL,
  month_12_retention_pct DECIMAL(5,2) NOT NULL,
  avg_clv_usd DECIMAL(10,2) NOT NULL,
  avg_orders DECIMAL(6,2) NOT NULL,
  nps_score INT NOT NULL,
  loyalty_member_pct DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO stores (name, city, state, region, format, manager_name, opened_date, sqft, monthly_rent) VALUES
('Avani Central','Mumbai','MH','Central','flagship','R. Iyer','2021-03-01',4200,18000),
('Avani Park','Bengaluru','KA','South','standard','S. Nair','2022-07-15',2800,12000),
('Avani Coast','Goa','GA','West','outlet','M. Dias','2023-11-01',2100,9000),
('Avani Metro','Delhi','DL','North','standard','A. Kapoor','2022-01-20',3000,14000);

INSERT INTO monthly_store_metrics
(store_id, month, foot_traffic, conversion_rate_pct, avg_transaction_usd, units_per_transaction, same_store_yoy_pct, staff_hours, revenue_per_staff_hour) VALUES
(1,'2025-01',18500,18.5,62.40,2.1,8.2,1600,72.0),
(2,'2025-01',14200,16.8,55.10,1.9,5.4,1200,61.5),
(3,'2025-01',9800,14.2,48.90,2.4,3.1,900,52.0),
(4,'2025-01',15100,17.1,58.20,2.0,6.0,1300,65.2);

INSERT INTO monthly_financials
(month, total_revenue_usd, cogs_usd, gross_margin_pct, opex_usd, ebitda_usd, ebitda_margin_pct, dtc_revenue_usd, retail_revenue_usd, wholesale_revenue_usd, capex_usd, inventory_value_usd) VALUES
('2024-12',920000,414000,55.0,310000,196000,21.3,280000,520000,120000,45000,610000),
('2025-01',980000,431200,56.0,325000,223800,22.8,310000,545000,125000,38000,595000),
('2025-02',1015000,446600,56.0,330000,238400,23.5,325000,555000,135000,42000,602000);

INSERT INTO products (name, category, collection, supplier, cogs_usd, msrp_usd, launched_date) VALUES
('FlexRun Leggings','Leggings','Core','KnitWorks',18.00,68.00,'2023-01-10'),
('AirFlow Top','Tops','Core','KnitWorks',12.00,48.00,'2023-02-01'),
('StormShell Jacket','Outerwear','Seasonal','AlpineCo',42.00,148.00,'2024-09-15'),
('Studio Tote','Accessories','Limited','BagCraft',15.00,59.00,'2024-11-01'),
('Trail Soft Runner','Footwear','Seasonal','StepForm',35.00,129.00,'2024-08-20'),
('Forge Tee Mens','Mens','Core','KnitWorks',9.00,36.00,'2023-05-05');

INSERT INTO channels (name, channel_type) VALUES
('Avani.com','dtc'),
('Retail Stores','retail'),
('Partner Wholesale','wholesale');

INSERT INTO monthly_sales
(product_id, channel_id, month, units_sold, gross_revenue_usd, returns_units, returns_usd, discount_usd, net_revenue_usd) VALUES
(1,1,'2025-01',2200,149600,80,5440,8900,135260),
(1,2,'2025-01',3100,210800,120,8160,12500,190140),
(2,1,'2025-01',1800,86400,40,1920,4200,80280),
(2,2,'2025-01',2500,120000,70,3360,7000,109640),
(3,1,'2025-01',620,91760,25,3700,5100,82960),
(3,2,'2025-01',840,124320,35,5180,7400,111740),
(4,1,'2025-01',900,53100,20,1180,2600,49320),
(5,2,'2025-01',710,91590,30,3870,4800,82920),
(6,3,'2025-01',1600,57600,15,540,1800,55260),
(1,1,'2025-02',2350,159800,75,5100,9200,145500),
(3,2,'2025-02',900,133200,28,4144,8100,120956),
(5,1,'2025-02',680,87720,22,2838,4500,80382);

INSERT INTO campaigns (name, platform, start_date, end_date, budget_usd, target_audience) VALUES
('New Year Reset','Meta','2025-01-01','2025-01-31',45000,'Women 22-40 fitness'),
('Trail Season Push','TikTok','2025-02-01','2025-02-28',32000,'Outdoor enthusiasts 18-35'),
('Wholesale Spring Book','Email','2025-01-15','2025-02-15',8000,'Boutique buyers');

INSERT INTO campaign_performance
(campaign_id, month, spend_usd, impressions, clicks, conversions, revenue_attributed_usd, new_customers_acquired, cac_usd, roas) VALUES
(1,'2025-01',42000,3200000,78000,3100,168000,1450,28.97,4.00),
(2,'2025-02',30000,4100000,95000,2800,121000,1200,25.00,4.03),
(3,'2025-01',7500,180000,9200,210,54000,55,136.36,7.20);

INSERT INTO inventory_snapshots
(product_id, month, warehouse_units, in_transit_units, store_units, weeks_of_supply, stockout_incidents, supplier_on_time_pct, sell_through_rate_pct) VALUES
(1,'2025-01',8200,1200,3400,5.2,1,96.0,62.0),
(2,'2025-01',6100,800,2800,4.8,0,97.5,58.0),
(3,'2025-01',2100,500,900,3.1,4,91.0,71.0),
(4,'2025-01',1500,200,700,4.0,0,98.0,55.0),
(5,'2025-01',1800,350,850,3.4,2,93.5,66.0),
(6,'2025-01',5000,600,2200,6.0,0,99.0,48.0);

INSERT INTO customer_cohorts
(cohort_quarter, acquisition_channel, customers_acquired, month_3_retention_pct, month_6_retention_pct, month_12_retention_pct, avg_clv_usd, avg_orders, nps_score, loyalty_member_pct) VALUES
('2024-Q1','DTC-Organic',4200,62.0,48.0,31.0,186.00,2.8,51,34.0),
('2024-Q2','DTC-Paid-Meta',6100,55.0,41.0,26.0,164.00,2.4,44,29.0),
('2024-Q3','DTC-Paid-TikTok',5400,58.0,43.0,28.0,171.00,2.5,47,30.0),
('2024-Q4','Retail',3800,66.0,52.0,35.0,198.00,3.1,56,41.0);

-- ===========================================================================
-- mvw (vacation / resort product portfolio)
-- ===========================================================================
USE mvw;

DROP TABLE IF EXISTS monthly_financials;
DROP TABLE IF EXISTS owner_activity;
DROP TABLE IF EXISTS maintenance_fees;
DROP TABLE IF EXISTS sales_tours;
DROP TABLE IF EXISTS owners;
DROP TABLE IF EXISTS resorts;

CREATE TABLE resorts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  brand VARCHAR(64) NOT NULL,
  location VARCHAR(128) NOT NULL,
  state_region VARCHAR(64) NOT NULL,
  total_units INT NOT NULL,
  star_rating DECIMAL(3,1) NOT NULL,
  opened_year INT NOT NULL,
  avg_occupancy_pct DECIMAL(5,2) NOT NULL,
  owner_satisfaction_score DECIMAL(4,1) NOT NULL,
  monthly_tour_capacity INT NOT NULL,
  last_renovation_year INT NOT NULL,
  status VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE owners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(128) NOT NULL,
  tier VARCHAR(32) NOT NULL,
  ownership_points INT NOT NULL,
  years_as_owner INT NOT NULL,
  home_resort_id INT NOT NULL,
  maintenance_fee_annual_usd DECIMAL(12,2) NOT NULL,
  mf_status VARCHAR(32) NOT NULL,
  satisfaction_score DECIMAL(4,1) NOT NULL,
  last_stay_date DATE NULL,
  FOREIGN KEY (home_resort_id) REFERENCES resorts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sales_tours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resort_id INT NOT NULL,
  month_date VARCHAR(16) NOT NULL,
  tours_conducted INT NOT NULL,
  contract_sales_usd DECIMAL(14,2) NOT NULL,
  vpg_usd DECIMAL(10,2) NOT NULL,
  close_rate_pct DECIMAL(5,2) NOT NULL,
  avg_contract_usd DECIMAL(12,2) NOT NULL,
  new_owner_count INT NOT NULL,
  upgrade_count INT NOT NULL,
  FOREIGN KEY (resort_id) REFERENCES resorts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE maintenance_fees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  fee_year INT NOT NULL,
  amount_due_usd DECIMAL(12,2) NOT NULL,
  amount_paid_usd DECIMAL(12,2) NOT NULL,
  payment_status VARCHAR(32) NOT NULL,
  days_overdue INT NOT NULL DEFAULT 0,
  FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE owner_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  activity_year INT NOT NULL,
  resort_stays INT NOT NULL,
  exchange_trips INT NOT NULL,
  points_banked INT NOT NULL,
  points_rented_out INT NOT NULL,
  digital_logins_ytd INT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE monthly_financials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month_date VARCHAR(16) NOT NULL,
  voi_sales_usd DECIMAL(14,2) NOT NULL,
  financing_revenue_usd DECIMAL(14,2) NOT NULL,
  exchange_revenue_usd DECIMAL(14,2) NOT NULL,
  rental_revenue_usd DECIMAL(14,2) NOT NULL,
  mf_management_revenue_usd DECIMAL(14,2) NOT NULL,
  total_revenue_usd DECIMAL(14,2) NOT NULL,
  development_cost_usd DECIMAL(14,2) NOT NULL,
  sales_marketing_cost_usd DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO resorts
(name, brand, location, state_region, total_units, star_rating, opened_year, avg_occupancy_pct, owner_satisfaction_score, monthly_tour_capacity, last_renovation_year, status) VALUES
('Palm Cove','Marriott Vacation Club','Maui, HI','Hawaii',220,4.5,2008,78.50,8.4,420,2022,'active'),
('Hillside','Westin Vacation Club','Aspen, CO','Mountain',160,4.3,2012,66.20,7.9,310,2021,'active'),
('Coral Bay','Sheraton Vacation Club','Orlando, FL','Southeast',300,4.1,2005,81.00,8.1,500,2020,'active'),
('Alpine Crest','Hyatt Vacation Club','Lake Tahoe, CA','West',140,4.4,2015,71.30,8.0,280,2023,'active'),
('Royal Sands','Ritz-Carlton Club','Cancun','Mexico',110,4.7,2010,74.80,8.6,200,2019,'under_renovation');

INSERT INTO owners
(full_name, tier, ownership_points, years_as_owner, home_resort_id, maintenance_fee_annual_usd, mf_status, satisfaction_score, last_stay_date) VALUES
('Jordan Lee','Signature',18000,6,1,4200,'current',8.5,'2025-01-12'),
('Samira Khan','Select',9000,3,2,2800,'current',7.8,'2024-12-20'),
('Mark Evans','Presidential',32000,11,3,7100,'at_risk',6.9,'2024-08-02'),
('Olivia Chen','Select',11000,4,4,3100,'current',8.1,'2025-02-01'),
('Diego Alvarez','Signature',15000,7,1,3900,'delinquent',5.8,'2024-05-18'),
('Emma Brooks','Presidential',28000,9,5,6500,'current',8.7,'2025-01-28');

INSERT INTO sales_tours
(resort_id, month_date, tours_conducted, contract_sales_usd, vpg_usd, close_rate_pct, avg_contract_usd, new_owner_count, upgrade_count) VALUES
(1,'2025-01',380,1620000,4263.16,12.4,34468.00,38,9),
(2,'2025-01',290,980000,3379.31,10.1,33620.00,24,5),
(3,'2025-01',450,1880000,4177.78,13.2,31666.00,49,11),
(4,'2025-01',260,870000,3346.15,11.0,30208.00,22,4),
(1,'2025-02',360,1550000,4305.56,12.8,33695.00,36,8),
(3,'2025-02',430,1790000,4162.79,12.9,32252.00,45,10);

INSERT INTO maintenance_fees
(owner_id, fee_year, amount_due_usd, amount_paid_usd, payment_status, days_overdue) VALUES
(1,2024,4200,4200,'paid',0),
(2,2024,2800,2800,'paid',0),
(3,2024,7100,3550,'partial',45),
(4,2024,3100,3100,'paid',0),
(5,2024,3900,0,'unpaid',120),
(6,2024,6500,6500,'paid',0);

INSERT INTO owner_activity
(owner_id, activity_year, resort_stays, exchange_trips, points_banked, points_rented_out, digital_logins_ytd) VALUES
(1,2024,3,1,2000,0,48),
(2,2024,2,0,900,500,22),
(3,2024,1,0,0,4000,12),
(4,2024,2,2,1500,0,35),
(5,2024,0,0,0,8000,5),
(6,2024,4,1,3000,0,61);

INSERT INTO monthly_financials
(month_date, voi_sales_usd, financing_revenue_usd, exchange_revenue_usd, rental_revenue_usd, mf_management_revenue_usd, total_revenue_usd, development_cost_usd, sales_marketing_cost_usd) VALUES
('2025-01',5340000,820000,310000,540000,690000,7700000,2100000,1450000),
('2025-02',5210000,805000,295000,560000,690000,7560000,1980000,1390000);

-- ===========================================================================
-- pe_trading_db (trading / securities product data)
-- ===========================================================================
USE pe_trading_db;

DROP TABLE IF EXISTS crm_business_customer;
DROP TABLE IF EXISTS crm_customer;
DROP TABLE IF EXISTS regulatory_filings;
DROP TABLE IF EXISTS investment_history;
DROP TABLE IF EXISTS custody_transactions;
DROP TABLE IF EXISTS asset_holdings;
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS cap_tables;
DROP TABLE IF EXISTS valuations;
DROP TABLE IF EXISTS securities;
DROP TABLE IF EXISTS aml_alerts;
DROP TABLE IF EXISTS kyc_records;
DROP TABLE IF EXISTS investors;

CREATE TABLE investors (
  investor_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(64) NOT NULL,
  last_name VARCHAR(64) NOT NULL,
  email VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  accreditation_status VARCHAR(64) NOT NULL,
  kyc_status VARCHAR(32) NOT NULL,
  country_of_residence VARCHAR(64) NOT NULL,
  investor_type VARCHAR(32) NOT NULL,
  declared_net_worth_usd DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kyc_records (
  kyc_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  review_date DATE NOT NULL,
  reviewer VARCHAR(64) NOT NULL,
  id_verified TINYINT NOT NULL,
  address_verified TINYINT NOT NULL,
  sow_verified TINYINT NOT NULL,
  pep_screened TINYINT NOT NULL,
  sanctions_clear TINYINT NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  next_review_date DATE NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE aml_alerts (
  alert_id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INT NOT NULL,
  alert_reason VARCHAR(128) NOT NULL,
  alert_severity VARCHAR(16) NOT NULL,
  detected_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE securities (
  security_id INT AUTO_INCREMENT PRIMARY KEY,
  ticker_symbol VARCHAR(32) NOT NULL,
  company_name VARCHAR(128) NOT NULL,
  security_type VARCHAR(64) NOT NULL,
  sector VARCHAR(64) NOT NULL,
  issuance_date DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE valuations (
  valuation_id INT AUTO_INCREMENT PRIMARY KEY,
  security_id INT NOT NULL,
  valuation_date DATE NOT NULL,
  price_per_share DECIMAL(12,2) NOT NULL,
  valuation_method VARCHAR(64) NOT NULL,
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cap_tables (
  entry_id INT AUTO_INCREMENT PRIMARY KEY,
  security_id INT NOT NULL,
  shareholder_name VARCHAR(128) NOT NULL,
  share_class VARCHAR(32) NOT NULL,
  shares_held INT NOT NULL,
  ownership_percentage DECIMAL(6,2) NOT NULL,
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  security_id INT NOT NULL,
  order_type VARCHAR(16) NOT NULL,
  order_price DECIMAL(12,2) NOT NULL,
  quantity INT NOT NULL,
  order_status VARCHAR(32) NOT NULL,
  order_timestamp DATETIME NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trades (
  trade_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  execution_price DECIMAL(12,2) NOT NULL,
  quantity_executed INT NOT NULL,
  trade_timestamp DATETIME NOT NULL,
  counterparty_id INT NULL,
  exchange VARCHAR(64) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settlements (
  settlement_id INT AUTO_INCREMENT PRIMARY KEY,
  trade_id INT NOT NULL,
  settlement_date DATE NOT NULL,
  settlement_status VARCHAR(32) NOT NULL,
  settlement_amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (trade_id) REFERENCES trades(trade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE asset_holdings (
  holding_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  security_id INT NOT NULL,
  shares_held INT NOT NULL,
  current_value DECIMAL(14,2) NOT NULL,
  custody_account VARCHAR(64) NOT NULL,
  as_of_date DATE NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE custody_transactions (
  custody_txn_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  security_id INT NOT NULL,
  txn_type VARCHAR(32) NOT NULL,
  shares INT NOT NULL,
  txn_date DATE NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE investment_history (
  position_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  security_id INT NOT NULL,
  entry_price DECIMAL(12,2) NOT NULL,
  shares INT NOT NULL,
  entry_date DATE NOT NULL,
  position_status VARCHAR(32) NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id),
  FOREIGN KEY (security_id) REFERENCES securities(security_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE regulatory_filings (
  filing_id INT AUTO_INCREMENT PRIMARY KEY,
  filing_type VARCHAR(64) NOT NULL,
  filing_date DATE NOT NULL,
  entity_id INT NOT NULL,
  filing_status VARCHAR(32) NOT NULL,
  description VARCHAR(255) NOT NULL,
  filed_with VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crm_customer (
  crm_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  relationship_mgr VARCHAR(64) NOT NULL,
  tier VARCHAR(32) NOT NULL,
  last_contact_dt DATE NOT NULL,
  lifetime_value DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE crm_business_customer (
  crm_biz_id INT AUTO_INCREMENT PRIMARY KEY,
  investor_id INT NOT NULL,
  firm_name VARCHAR(128) NOT NULL,
  relationship_mgr VARCHAR(64) NOT NULL,
  aum_usd DECIMAL(14,2) NOT NULL,
  tier VARCHAR(32) NOT NULL,
  last_contact_dt DATE NOT NULL,
  notes VARCHAR(255) NOT NULL,
  FOREIGN KEY (investor_id) REFERENCES investors(investor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO investors
(first_name, last_name, email, phone, accreditation_status, kyc_status, country_of_residence, investor_type, declared_net_worth_usd) VALUES
('Ava','Thompson','ava.thompson@example.com','+1-415-555-0101','Accredited','approved','USA','individual',2500000),
('Noah','Patel','noah.patel@example.com','+1-646-555-0144','Qualified Purchaser','approved','USA','individual',12000000),
('Mia','Garcia','mia.garcia@example.com','+44-20-555-0199','Accredited','pending','UK','individual',1800000),
('Liam','Chen','liam.chen@example.com','+65-6555-0188','Accredited','approved','Singapore','individual',3200000),
('Horizon','Capital','ops@horizoncap.example','+1-212-555-0177','Qualified Purchaser','approved','USA','institutional',250000000);

INSERT INTO kyc_records
(investor_id, review_date, reviewer, id_verified, address_verified, sow_verified, pep_screened, sanctions_clear, outcome, next_review_date, notes) VALUES
(1,'2024-12-01','Compliance A',1,1,1,1,1,'pass','2025-12-01','Clean profile'),
(2,'2024-11-15','Compliance B',1,1,1,1,1,'pass','2025-11-15','QP docs verified'),
(3,'2025-01-20','Compliance A',1,1,0,1,1,'pending','2025-04-20','Awaiting source-of-wealth docs'),
(4,'2024-10-05','Compliance C',1,1,1,1,1,'pass','2025-10-05','OK'),
(5,'2024-09-12','Compliance B',1,1,1,1,1,'pass','2025-09-12','Institutional KYC complete');

INSERT INTO aml_alerts
(entity_type, entity_id, alert_reason, alert_severity, detected_at, status) VALUES
('investor',3,'Large unexplained transfer pattern','medium','2025-01-22 09:15:00','open'),
('investor',5,'Cross-border rapid round-trip','low','2025-02-01 14:40:00','closed');

INSERT INTO securities (ticker_symbol, company_name, security_type, sector, issuance_date) VALUES
('NWND','Northwind Labs','Preferred','B2B SaaS','2023-06-15'),
('BLHB','Blue Harbor','Common','FinTech','2022-11-02'),
('PSCT','PulseCart','Preferred','B2B SaaS','2024-02-20'),
('LDGR','Ledgerly','Preferred','FinTech','2023-03-18');

INSERT INTO valuations (security_id, valuation_date, price_per_share, valuation_method) VALUES
(1,'2025-01-31',12.50,'409A'),
(2,'2025-01-31',28.40,'market_comp'),
(3,'2025-01-31',4.75,'409A'),
(4,'2025-01-31',9.20,'409A');

INSERT INTO cap_tables (security_id, shareholder_name, share_class, shares_held, ownership_percentage) VALUES
(1,'Founders','Common',4200000,42.00),
(1,'Meridian Ventures','Preferred',1800000,18.00),
(2,'Founders','Common',5100000,51.00),
(2,'Meridian Ventures','Preferred',1500000,15.00);

INSERT INTO orders
(investor_id, security_id, order_type, order_price, quantity, order_status, order_timestamp) VALUES
(1,1,'BUY',12.40,5000,'filled','2025-01-10 10:22:00'),
(2,2,'BUY',28.10,2000,'filled','2025-01-12 11:05:00'),
(4,3,'BUY',4.70,10000,'filled','2025-01-18 09:40:00'),
(5,4,'BUY',9.10,25000,'filled','2025-01-22 15:18:00'),
(1,2,'SELL',28.50,800,'filled','2025-02-03 13:12:00');

INSERT INTO trades
(order_id, execution_price, quantity_executed, trade_timestamp, counterparty_id, exchange) VALUES
(1,12.42,5000,'2025-01-10 10:22:15',5,'Secondary Desk'),
(2,28.15,2000,'2025-01-12 11:05:20',5,'Secondary Desk'),
(3,4.72,10000,'2025-01-18 09:40:30',2,'Secondary Desk'),
(4,9.12,25000,'2025-01-22 15:18:10',1,'Secondary Desk'),
(5,28.48,800,'2025-02-03 13:12:05',2,'Secondary Desk');

INSERT INTO settlements
(trade_id, settlement_date, settlement_status, settlement_amount, notes) VALUES
(1,'2025-01-12','settled',62100.00,'T+2 complete'),
(2,'2025-01-14','settled',56300.00,'T+2 complete'),
(3,'2025-01-20','settled',47200.00,'T+2 complete'),
(4,'2025-01-24','settled',228000.00,'T+2 complete'),
(5,'2025-02-05','pending',22784.00,'Awaiting cash wire');

INSERT INTO asset_holdings
(investor_id, security_id, shares_held, current_value, custody_account, as_of_date) VALUES
(1,1,5000,62500.00,'CUST-1001','2025-02-28'),
(1,2,1200,34080.00,'CUST-1001','2025-02-28'),
(2,2,2000,56800.00,'CUST-1002','2025-02-28'),
(4,3,10000,47500.00,'CUST-1004','2025-02-28'),
(5,4,25000,230000.00,'CUST-2001','2025-02-28');

INSERT INTO custody_transactions
(investor_id, security_id, txn_type, shares, txn_date, notes) VALUES
(1,1,'deposit',5000,'2025-01-12','Trade settlement inbound'),
(2,2,'deposit',2000,'2025-01-14','Trade settlement inbound'),
(1,2,'withdraw',800,'2025-02-05','Partial sell settlement');

INSERT INTO investment_history
(investor_id, security_id, entry_price, shares, entry_date, position_status) VALUES
(1,1,12.42,5000,'2025-01-10','open'),
(2,2,28.15,2000,'2025-01-12','open'),
(4,3,4.72,10000,'2025-01-18','open'),
(5,4,9.12,25000,'2025-01-22','open'),
(1,2,28.15,2000,'2024-10-01','partially_closed');

INSERT INTO regulatory_filings
(filing_type, filing_date, entity_id, filing_status, description, filed_with) VALUES
('Form D','2024-06-20',1,'filed','Northwind Labs offering notice','SEC'),
('Form D','2023-12-01',2,'filed','Blue Harbor financing round','SEC'),
('AML SAR','2025-01-23',3,'draft','Alert follow-up for investor 3','FinCEN');

INSERT INTO crm_customer
(investor_id, relationship_mgr, tier, last_contact_dt, lifetime_value, notes) VALUES
(1,'Helen Cho','Gold','2025-02-10',98000,'Interested in AI product deals'),
(2,'Helen Cho','Platinum','2025-02-18',210000,'QP; prefers FinTech'),
(3,'Omar Said','Silver','2025-01-25',45000,'KYC pending blocks new trades'),
(4,'Omar Said','Gold','2025-02-05',76000,'Active in SEA SaaS');

INSERT INTO crm_business_customer
(investor_id, firm_name, relationship_mgr, aum_usd, tier, last_contact_dt, notes) VALUES
(5,'Horizon Capital','Helen Cho',250000000,'Institutional','2025-02-20','Lead ticket on Ledgerly secondary');

-- Ensure admin login still present
USE querylab_auth;
INSERT INTO user_master (user_id, password, display_name, roll)
VALUES (
  'admin@querylab.com',
  '$2b$12$9Ha8qQoSb5dIRyj2bU3CDO..GShzRn6kU2TC07xau.KYND66AQpZ6',
  'Query Labs Admin',
  'admin'
) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password = VALUES(password);
