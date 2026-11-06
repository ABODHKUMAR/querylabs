-- Query Labs local MySQL bootstrap (runs once on first container start)
-- User/password come from MYSQL_USER / MYSQL_PASSWORD in docker-compose.

CREATE DATABASE IF NOT EXISTS querylab_auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS financial_metrics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS beat_results_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS meridian_ventures CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS novadash CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS avani CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS mvw CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS pe_trading_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON querylab_auth.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON financial_metrics.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON beat_results_dev.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON meridian_ventures.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON novadash.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON avani.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON mvw.* TO 'querylab'@'%';
GRANT ALL PRIVILEGES ON pe_trading_db.* TO 'querylab'@'%';
FLUSH PRIVILEGES;

-- ---------------------------------------------------------------------------
-- Auth DB (orchestrator login + chat)
-- ---------------------------------------------------------------------------
USE querylab_auth;

CREATE TABLE IF NOT EXISTS user_master (
  user_id VARCHAR(255) PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  roll VARCHAR(64) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_login_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_login_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_history (
  hist_id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  timestamp DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id CHAR(36) PRIMARY KEY,
  hist_id CHAR(36) NOT NULL,
  context JSON NULL,
  timestamp DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_messages_hist
    FOREIGN KEY (hist_id) REFERENCES chat_history(hist_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_runs (
  id INT NOT NULL AUTO_INCREMENT,
  trace_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NULL,
  session_id VARCHAR(64) NOT NULL,
  agent_name VARCHAR(128) NOT NULL,
  skill_name VARCHAR(128) NULL,
  skill_type VARCHAR(64) NULL,
  mcp_server VARCHAR(128) NULL,
  outcome VARCHAR(16) NOT NULL,
  tool_calls INT NOT NULL DEFAULT 0,
  prompt_tokens INT NULL,
  completion_tokens INT NULL,
  total_tokens INT NULL,
  estimated_cost_usd FLOAT NULL,
  duration_ms INT NULL,
  error_type VARCHAR(128) NULL,
  question_snippet VARCHAR(200) NULL,
  feedback VARCHAR(10) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_agent_runs_trace_id (trace_id),
  INDEX idx_agent_runs_user_id (user_id),
  INDEX idx_agent_runs_agent_name (agent_name),
  INDEX idx_agent_runs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default login: admin@querylab.com / admin123
INSERT INTO user_master (user_id, password, display_name, roll)
VALUES (
  'admin@querylab.com',
  '$2b$12$9Ha8qQoSb5dIRyj2bU3CDO..GShzRn6kU2TC07xau.KYND66AQpZ6',
  'Query Labs Admin',
  'admin'
) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- ---------------------------------------------------------------------------
-- Demo sample data (so SQL agents have something to query)
-- ---------------------------------------------------------------------------
USE financial_metrics;

CREATE TABLE IF NOT EXISTS monthly_revenue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month_label VARCHAR(16) NOT NULL,
  region VARCHAR(64) NOT NULL,
  revenue_usd DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO monthly_revenue (month_label, region, revenue_usd) VALUES
  ('2025-01', 'APAC', 125000.00),
  ('2025-01', 'EMEA', 98000.00),
  ('2025-02', 'APAC', 131500.00),
  ('2025-02', 'EMEA', 101200.00),
  ('2025-03', 'APAC', 142000.00),
  ('2025-03', 'EMEA', 110400.00);

USE beat_results_dev;
CREATE TABLE IF NOT EXISTS check_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  check_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  score DECIMAL(5,2) NULL,
  observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO check_results (check_name, status, score) VALUES
  ('api_latency', 'pass', 98.5),
  ('error_rate', 'warn', 87.0),
  ('uptime', 'pass', 99.9);

USE meridian_ventures;
CREATE TABLE IF NOT EXISTS portfolio_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(128) NOT NULL,
  sector VARCHAR(64) NOT NULL,
  investment_usd DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO portfolio_companies (company_name, sector, investment_usd) VALUES
  ('Northwind Labs', 'SaaS', 2500000.00),
  ('Blue Harbor', 'Fintech', 4100000.00);

USE novadash;
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_name VARCHAR(128) NOT NULL,
  mrr_usd DECIMAL(12,2) NOT NULL,
  health_score INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO customers (account_name, mrr_usd, health_score) VALUES
  ('Acme Corp', 12000.00, 82),
  ('Globex', 8500.00, 61);

USE avani;
CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_name VARCHAR(128) NOT NULL,
  city VARCHAR(64) NOT NULL,
  monthly_sales_usd DECIMAL(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO stores (store_name, city, monthly_sales_usd) VALUES
  ('Avani Central', 'Mumbai', 54000.00),
  ('Avani Park', 'Bengaluru', 47000.00);

USE mvw;
CREATE TABLE IF NOT EXISTS resorts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resort_name VARCHAR(128) NOT NULL,
  occupancy_pct DECIMAL(5,2) NOT NULL,
  vpg_usd DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO resorts (resort_name, occupancy_pct, vpg_usd) VALUES
  ('Palm Cove', 78.50, 420.00),
  ('Hillside', 66.20, 385.00);

USE pe_trading_db;
CREATE TABLE IF NOT EXISTS trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  side VARCHAR(8) NOT NULL,
  quantity INT NOT NULL,
  price_usd DECIMAL(12,2) NOT NULL,
  traded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO trades (symbol, side, quantity, price_usd) VALUES
  ('AAPL', 'BUY', 100, 190.25),
  ('MSFT', 'SELL', 50, 420.10);
