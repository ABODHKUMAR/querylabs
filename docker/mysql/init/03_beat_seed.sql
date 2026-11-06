-- Beat observability product sample data (beat_results_dev / mysql_beat)
-- Supports questions like: "Which DAGs have the most null target violations this week?"

USE beat_results_dev;

DROP TABLE IF EXISTS dv_custom_execution;
DROP TABLE IF EXISTS dv_tgt_nulls_data;
DROP TABLE IF EXISTS dv_count;
DROP TABLE IF EXISTS alert_report_tracker;
DROP TABLE IF EXISTS scenario_tracker;
DROP TABLE IF EXISTS t_execution_tracker;
DROP TABLE IF EXISTS test_plan;
DROP TABLE IF EXISTS dag_runs;

CREATE TABLE test_plan (
  test_plan_id INT PRIMARY KEY,
  dag_id VARCHAR(128) NOT NULL,
  platform_nm VARCHAR(64) NOT NULL,
  data_product VARCHAR(128) NOT NULL,
  data_layer VARCHAR(64) NOT NULL,
  source_table_name VARCHAR(128) NOT NULL,
  target_table_name VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE t_execution_tracker (
  tracker_id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  test_plan_id INT NOT NULL,
  Batch_ID VARCHAR(64) NOT NULL,
  RUN_ID VARCHAR(64) NOT NULL,
  execution_method VARCHAR(32) NOT NULL,
  scenario_name VARCHAR(128) NOT NULL,
  scenario_desc VARCHAR(255) NOT NULL,
  exec_status VARCHAR(8) NOT NULL,
  test_case_status VARCHAR(16) NOT NULL,
  exec_start_date DATETIME NOT NULL,
  exec_end_date DATETIME NOT NULL,
  scenario_exec_start_dtm DATETIME NOT NULL,
  scenario_exec_end_dtm DATETIME NOT NULL,
  err_msg VARCHAR(255) NULL,
  dag_id VARCHAR(128) NOT NULL,
  task_id VARCHAR(128) NOT NULL,
  dag_scheduled_date DATE NOT NULL,
  INDEX idx_exec_end (exec_end_date),
  INDEX idx_dag (dag_id),
  INDEX idx_run (RUN_ID),
  INDEX idx_scenario (scenario_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE scenario_tracker (
  test_case_id INT PRIMARY KEY,
  test_plan_id INT NOT NULL,
  scenario_name VARCHAR(128) NOT NULL,
  scenario_desc VARCHAR(255) NOT NULL,
  scenario_query TEXT,
  isReq TINYINT NOT NULL DEFAULT 1,
  passwhen VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dv_count (
  id INT AUTO_INCREMENT PRIMARY KEY,
  RUN_ID VARCHAR(64) NOT NULL,
  Count_Diff INT NOT NULL,
  Count_Validation_Status VARCHAR(16) NOT NULL,
  Source_Cnt INT NOT NULL,
  Target_Cnt INT NOT NULL,
  Batch_ID VARCHAR(64) NOT NULL,
  test_case_id INT NOT NULL,
  INDEX idx_dv_count_run (RUN_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dv_tgt_nulls_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  RUN_ID VARCHAR(64) NOT NULL,
  Column_Name VARCHAR(128) NOT NULL,
  null_count INT NOT NULL,
  Total_Count INT NOT NULL,
  test_case_id INT NOT NULL,
  INDEX idx_dv_nulls_run (RUN_ID),
  INDEX idx_dv_nulls_tc (test_case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dv_custom_execution (
  id INT AUTO_INCREMENT PRIMARY KEY,
  RUN_ID VARCHAR(64) NOT NULL,
  test_case_id INT NOT NULL,
  data JSON NULL,
  batch_id VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert_report_tracker (
  id INT AUTO_INCREMENT PRIMARY KEY,
  RUN_ID VARCHAR(64) NOT NULL,
  dag_id VARCHAR(128) NOT NULL,
  alert_type VARCHAR(64) NOT NULL,
  alert_status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Convenience view-like table some users expect
CREATE TABLE dag_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dag_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  execution_date DATETIME NOT NULL,
  state VARCHAR(32) NOT NULL,
  data_product VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO test_plan
(test_plan_id, dag_id, platform_nm, data_product, data_layer, source_table_name, target_table_name) VALUES
(101, 'analytics_suite_daily', 'spark', 'Query Labs Analytics Suite', 'gold', 'src_events', 'tgt_events'),
(102, 'insights_pro_usage', 'spark', 'Query Labs Insights Pro', 'gold', 'src_usage', 'tgt_usage'),
(103, 'datahub_warehouse_sync', 'spark', 'Query Labs Data Hub', 'silver', 'src_orders', 'tgt_orders'),
(104, 'agent_pack_eval', 'python', 'Query Labs Agent Pack', 'gold', 'src_evals', 'tgt_evals'),
(105, 'vector_addon_embed', 'python', 'Query Labs Vector Search Add-on', 'silver', 'src_docs', 'tgt_embeddings');

INSERT INTO scenario_tracker
(test_case_id, test_plan_id, scenario_name, scenario_desc, scenario_query, isReq, passwhen) VALUES
(1001, 101, 'null_check', 'Null target column validation', 'SELECT ...', 1, 'null_count = 0'),
(1002, 101, 'count_check', 'Source vs target count', 'SELECT ...', 1, 'Count_Diff = 0'),
(1003, 102, 'null_check', 'Null target column validation', 'SELECT ...', 1, 'null_count = 0'),
(1004, 103, 'null_check', 'Null target column validation', 'SELECT ...', 1, 'null_count = 0'),
(1005, 103, 'count_check', 'Source vs target count', 'SELECT ...', 1, 'Count_Diff = 0'),
(1006, 104, 'null_check', 'Null target column validation', 'SELECT ...', 1, 'null_count = 0'),
(1007, 105, 'null_check', 'Null target column validation', 'SELECT ...', 1, 'null_count = 0'),
(1008, 102, 'count_check', 'Source vs target count', 'SELECT ...', 1, 'Count_Diff = 0');

-- Dynamic dates relative to CURRENT_DATE so "this week" always has data
INSERT INTO t_execution_tracker
(test_case_id, test_plan_id, Batch_ID, RUN_ID, execution_method, scenario_name, scenario_desc,
 exec_status, test_case_status, exec_start_date, exec_end_date,
 scenario_exec_start_dtm, scenario_exec_end_dtm, err_msg, dag_id, task_id, dag_scheduled_date)
VALUES
-- analytics_suite_daily: many null violations this week
(1001,101,'B-AN-01','RUN-AN-01','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 'Nulls found in target columns','analytics_suite_daily','validate_nulls', CURDATE() - INTERVAL 1 DAY),
(1001,101,'B-AN-02','RUN-AN-02','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 'Nulls found in target columns','analytics_suite_daily','validate_nulls', CURDATE() - INTERVAL 2 DAY),
(1001,101,'B-AN-03','RUN-AN-03','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 'Nulls found in target columns','analytics_suite_daily','validate_nulls', CURDATE() - INTERVAL 3 DAY),
(1002,101,'B-AN-04','RUN-AN-04','airflow','count_check','Source vs target count','c','PASS',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 NULL,'analytics_suite_daily','validate_counts', CURDATE() - INTERVAL 1 DAY),

-- datahub_warehouse_sync: second most null violations
(1004,103,'B-DH-01','RUN-DH-01','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 'Nulls found in target columns','datahub_warehouse_sync','validate_nulls', CURDATE() - INTERVAL 1 DAY),
(1004,103,'B-DH-02','RUN-DH-02','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 'Nulls found in target columns','datahub_warehouse_sync','validate_nulls', CURDATE() - INTERVAL 2 DAY),
(1005,103,'B-DH-03','RUN-DH-03','airflow','count_check','Source vs target count','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY),
 'Count mismatch','datahub_warehouse_sync','validate_counts', CURDATE() - INTERVAL 2 DAY),

-- insights_pro_usage
(1003,102,'B-IN-01','RUN-IN-01','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 'Nulls found in target columns','insights_pro_usage','validate_nulls', CURDATE() - INTERVAL 1 DAY),
(1008,102,'B-IN-02','RUN-IN-02','airflow','count_check','Source vs target count','c','PASS',
 DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 NULL,'insights_pro_usage','validate_counts', CURDATE() - INTERVAL 3 DAY),

-- agent_pack_eval
(1006,104,'B-AG-01','RUN-AG-01','airflow','null_check','Null target column validation','c','PASS',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
 NULL,'agent_pack_eval','validate_nulls', CURDATE() - INTERVAL 1 DAY),

-- vector_addon_embed
(1007,105,'B-VX-01','RUN-VX-01','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY),
 DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY),
 'Nulls found in target columns','vector_addon_embed','validate_nulls', CURDATE() - INTERVAL 4 DAY),

-- older than a week (should not dominate "this week")
(1001,101,'B-AN-OLD','RUN-AN-OLD','airflow','null_check','Null target column validation','c','FAIL',
 DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY),
 DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY),
 'Nulls found in target columns','analytics_suite_daily','validate_nulls', CURDATE() - INTERVAL 20 DAY);

INSERT INTO dv_tgt_nulls_data (RUN_ID, Column_Name, null_count, Total_Count, test_case_id) VALUES
('RUN-AN-01','customer_id',120,10000,1001),
('RUN-AN-01','product_sku',45,10000,1001),
('RUN-AN-02','customer_id',98,10000,1001),
('RUN-AN-02','region',30,10000,1001),
('RUN-AN-03','customer_id',110,10000,1001),
('RUN-AN-03','product_sku',22,10000,1001),
('RUN-DH-01','order_id',75,8000,1004),
('RUN-DH-01','sku',40,8000,1004),
('RUN-DH-02','order_id',66,8000,1004),
('RUN-IN-01','user_id',25,5000,1003),
('RUN-VX-01','doc_id',18,3000,1007),
('RUN-AG-01','eval_id',0,2000,1006);

INSERT INTO dv_count
(RUN_ID, Count_Diff, Count_Validation_Status, Source_Cnt, Target_Cnt, Batch_ID, test_case_id) VALUES
('RUN-AN-04',0,'PASS',1250000,1250000,'B-AN-04',1002),
('RUN-DH-03',150,'FAIL',640000,639850,'B-DH-03',1005),
('RUN-IN-02',0,'PASS',880000,880000,'B-IN-02',1008);

INSERT INTO alert_report_tracker (RUN_ID, dag_id, alert_type, alert_status, created_at) VALUES
('RUN-AN-01','analytics_suite_daily','null_target','open', DATE_SUB(NOW(), INTERVAL 1 DAY)),
('RUN-AN-02','analytics_suite_daily','null_target','open', DATE_SUB(NOW(), INTERVAL 2 DAY)),
('RUN-DH-01','datahub_warehouse_sync','null_target','open', DATE_SUB(NOW(), INTERVAL 1 DAY)),
('RUN-DH-03','datahub_warehouse_sync','count_mismatch','open', DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO dag_runs (dag_id, run_id, execution_date, state, data_product) VALUES
('analytics_suite_daily','RUN-AN-01', DATE_SUB(NOW(), INTERVAL 1 DAY), 'failed', 'Query Labs Analytics Suite'),
('analytics_suite_daily','RUN-AN-02', DATE_SUB(NOW(), INTERVAL 2 DAY), 'failed', 'Query Labs Analytics Suite'),
('analytics_suite_daily','RUN-AN-03', DATE_SUB(NOW(), INTERVAL 3 DAY), 'failed', 'Query Labs Analytics Suite'),
('datahub_warehouse_sync','RUN-DH-01', DATE_SUB(NOW(), INTERVAL 1 DAY), 'failed', 'Query Labs Data Hub'),
('datahub_warehouse_sync','RUN-DH-02', DATE_SUB(NOW(), INTERVAL 2 DAY), 'failed', 'Query Labs Data Hub'),
('insights_pro_usage','RUN-IN-01', DATE_SUB(NOW(), INTERVAL 1 DAY), 'failed', 'Query Labs Insights Pro'),
('agent_pack_eval','RUN-AG-01', DATE_SUB(NOW(), INTERVAL 1 DAY), 'success', 'Query Labs Agent Pack'),
('vector_addon_embed','RUN-VX-01', DATE_SUB(NOW(), INTERVAL 4 DAY), 'failed', 'Query Labs Vector Search Add-on');
