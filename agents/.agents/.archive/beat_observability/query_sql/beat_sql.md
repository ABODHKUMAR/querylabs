---
name: beat_sql
description: Data quality testing and test execution analytics over MySQL. Tables include test execution tracking, test case configuration, data profiling, validation results, and user management. Discovery and execution via MySQL MCP server.
skill_type: sql
mcp_servers:
  - name: mysql_beat
    transport: http
    url: "http://localhost:8006/mcp"
agent_instructions: |
  **CRITICAL: This is MySQL database. Use MySQL-specific syntax.**
  
  **!!!! FIRST STEP - SCHEMA RETRIEVAL !!!!**
  ALWAYS start by calling: MCP_get_schema(table_names=['t_execution_tracker'])
  NEVER call: MCP_get_schema() or MCP_get_schema(include_sample_data=True)
  This prevents 30MB+ payload that causes timeout!
  
  **!!!! QUERY TIMEOUT PREVENTION - MANDATORY - READ THIS FIRST !!!!**
  
  The t_execution_tracker table has MILLIONS of rows. EVERY query on this table WILL TIMEOUT unless you follow these EXACT rules:
  
  RULE 1: NEVER use DATE() function in WHERE clause
  WRONG: `WHERE DATE(exec_end_date) = CURRENT_DATE - INTERVAL 1 DAY`
  WRONG: `WHERE DATE(exec_end_date) = '2024-01-01'`
  
  RULE 2: ALWAYS use date range comparisons
  CORRECT: `WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY) AND exec_end_date < CURRENT_DATE`
  CORRECT: `WHERE exec_end_date >= '2024-01-01' AND exec_end_date < '2024-01-02'`
  
  RULE 3: ALWAYS include LIMIT clause (default: LIMIT 10)
  
  RULE 4: If no date range specified by user, default to last 30 days:
  `WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) LIMIT 10`
  
  **DEFAULT TIME RANGE**: If user doesn't specify time period, use last 30 days:
  ```sql
  WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
    AND scenario_name = 'null_check'  -- Add other filters here
  LIMIT 10
  ```
  
  MySQL Syntax Requirements:
  - INTERVAL: Use `INTERVAL 1 DAY` NOT `INTERVAL '1 day'` (PostgreSQL style)
  - Date functions: DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), DATE_ADD(), NOW()
  - ALWAYS add LIMIT clause on t_execution_tracker queries
  - Backticks for identifiers: `table_name`, `column_name`
  - String literals: Single quotes 'value'
  
  **SCHEMA RETRIEVAL - CRITICAL FOR PERFORMANCE:**
  - NEVER: `MCP_get_schema(include_sample_data=True)` ← 30MB+ causes timeout!
  - ALWAYS: `MCP_get_schema(table_names=['t_execution_tracker'])` ← Fast!
  - Only fetch schema for tables you'll actually query
  - For multiple tables: `MCP_get_schema(table_names=['t_execution_tracker', 'test_plan'])`
  
  Example - WRONG (causes 30MB+ payload and timeout):
  ```python
  MCP_get_schema(include_sample_data=True)  #  Returns all 107 tables!
  ```
  
  Example - CORRECT (fast, focused schema):
  ```python
  MCP_get_schema(table_names=['t_execution_tracker'])  #  Only 1 table!
  ```
  
  Use only SELECT queries. Database contains comprehensive data quality testing framework tables.
  
  SPECIAL INSTRUCTIONS - TABLE SELECTION:
  - 95% of queries: MCP_get_schema(table_names=['t_execution_tracker']) ← Use this by default!
  - For test configuration: MCP_get_schema(table_names=['t_execution_tracker', 'test_plan'])
  - For validation results: MCP_get_schema(table_names=['t_execution_tracker', 'dv_count'])
  - For scenario info: Use scenario_name column in t_execution_tracker (NOT a separate table!)
  - For DAG info: Use dag_id column in t_execution_tracker
  - For "yesterday" or "last day": Use `exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY) AND exec_end_date < CURRENT_DATE`
  - For "last 7 days": Use `exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY) AND exec_end_date < CURRENT_DATE`
  - For "this month": Use `exec_end_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`
  - ALWAYS include LIMIT clause (default: LIMIT 10) to prevent timeout on large result sets
  
  COMMON QUERY PATTERNS (MySQL):
  
  **WORKFLOW for "How many test cases failed in null_check scenario?"**
  
  Step 1: Call MCP_get_schema(table_names=['t_execution_tracker']) ← Only this table!
  Step 2: Generate SQL using the focused schema from Step 1:
  
  ```sql
  -- Failed test cases in specific scenario (e.g., null_check) - DEFAULT to last 30 days
  SELECT COUNT(*) as failed_count
  FROM t_execution_tracker 
  WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
    AND scenario_name = 'null_check'
    AND test_case_status = 'FAIL'
  LIMIT 1;
  
  -- List failed test cases with details for specific scenario
  SELECT dag_id, test_case_id, exec_end_date, err_msg
  FROM t_execution_tracker
  WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
    AND scenario_name = 'null_check'
    AND test_case_status = 'FAIL'
  ORDER BY exec_end_date DESC
  LIMIT 10;
  
  -- Failed test cases yesterday (OPTIMIZED - uses date range, not DATE() function)
  SELECT dag_id, task_id, test_case_id, exec_end_date, err_msg
  FROM t_execution_tracker 
  WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY)
    AND exec_end_date < CURRENT_DATE
    AND test_case_status = 'FAIL'
  ORDER BY exec_end_date DESC 
  LIMIT 10;
  
  -- Test cases in last 7 days (OPTIMIZED - date range comparison)
  SELECT dag_id, test_case_status, COUNT(*) as count
  FROM t_execution_tracker
  WHERE exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
    AND exec_end_date < CURRENT_DATE
  GROUP BY dag_id, test_case_status
  ORDER BY exec_end_date DESC
  LIMIT 10;
  
  -- Recent runs for specific dag (OPTIMIZED - with LIMIT)
  SELECT test_case_id, scenario_name, test_case_status, exec_end_date
  FROM t_execution_tracker
  WHERE dag_id = 'your_dag_id'
    AND exec_end_date >= DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH)
  ORDER BY exec_end_date DESC
  LIMIT 10;
  ```
  
  KEY TABLE GROUPS:
  1. Test Execution Tracking: 
     - t_execution_tracker (tracker_id, test_case_id, test_plan_id, Batch_ID, RUN_ID, execution_method, scenario_name, scenario_desc, exec_status, test_case_status, exec_start_date, exec_end_date, scenario_exec_start_dtm, scenario_exec_end_dtm, err_msg, dag_id, task_id, dag_scheduled_date)
     - NOTE: Use exec_start_date or exec_end_date for date filtering, NOT execution_date
  
  2. Test Configuration: test_plan (test_plan_id, dag_id, platform_nm, data_product, data_layer, source_table_name, target_table_name), scenario_tracker (test_case_id, test_plan_id, scenario_name, scenario_desc, scenario_query, isReq, passwhen)
  
  3. Data Validation Results: dv_count (RUN_ID, Count_Diff, Count_Validation_Status, Source_Cnt, Target_Cnt, Batch_ID, test_case_id), dv_tgt_nulls_data (RUN_ID, Column_Name, null_count, Total_Count, test_case_id), dv_custom_execution (RUN_ID, test_case_id, data, batch_id)
  
  7. Test Suite Management: testcase_suite (tc_suite_id, tc_suite_type, app_proj_rel_tc_link_id, suite_name, suite_desc, is_active), testcase_suite_map (tc_suite_id, test_case_id, is_active), regression_suite_master (tc_suite_id, reg_suite_name, reg_suite_desc, app_proj_rel_tc_link_id), schedule_master (schedule_id, tc_suite_id, job_id, cron_expression, timezone, schedule_type, is_active)
  
  8. Additional Tables: alert_report_tracker (test_plan_id, send_alert, alert_params, body_sections), beat_report_input (id, report_lbl, type_of_query, rpt_domain, query, sql_execution_seq), organization_details_master (ORG_ID, ORG_NAME, CONTACT_PERSON, CONTRACT_TYPE, CONTRACT_END_DATE), jira_tc_mapping (jira_auto_id, dag_id, dag_task_id, jira_test_plan_id, jira_test_exec_id)
  
  RELATIONSHIPS:
  - tc_execution_tracker → test_case_details on test_case_id
  - tc_execution_tracker → test_plan on test_plan_id
  - tc_scenario_execution_tracker → tc_execution_tracker on tracker_id
  - tc_connection_execution_tracker → tc_scenario_execution_tracker on scenario_exec_id
  - test_case_details → test_plan on test_plan_id
  - test_case_details → test_cases_scenario_master on scenario_id
  - test_case_details → test_tables on table_id
  - test_plan → app_proj_rel_cycle_link on app_proj_release_test_cycle_id
  - app_proj_rel_cycle_link links application_master, project_master, release_master, test_cycle_master
  - tables_profile → profiling_runs on profile_run_id
  - columns_profile → tables_profile on table_profile_id
  - column_metrics → columns_profile on column_profile_id
  - user_role_map → user_master on user_id and role_master on role_id
  
  EXECUTION STATUS VALUES: 'c'=completed, 'f'=failed, 'p'=pending, 'r'=running, 'n'=not started
  
  For time-based questions use exec_start_time, exec_end_time, scenario_exec_start, scenario_exec_end columns. Aggregate with COUNT, SUM where appropriate. Use scenario_name, test_case_status, exec_status as categorical dimensions.
---

# beat_sql

SQL skill for **data quality testing and test execution analytics** over the MySQL database defined in `backend_sql/sample_data/beat_metadata.json`. Uses the MySQL MCP server for get_schema and execute_sql.

## Purpose

Answer natural-language questions about data quality test execution tracking, test case configuration, data profiling, validation results, and user management. The database manages a comprehensive data quality testing framework with support for:

- **Test Execution Tracking**: Monitor test case executions with detailed status, timing, and error tracking across tc_execution_tracker (main execution records), tc_scenario_execution_tracker (scenario-level details), and tc_connection_execution_tracker (connection-specific details).
- **Test Configuration**: Define and manage test plans, test cases, scenarios, and tables through test_plan, test_case_details, test_cases_scenario_master, and test_tables.
- **Application Hierarchy**: Track applications, projects, releases, and test cycles through application_master, project_master, release_master, test_cycle_master, and app_proj_rel_cycle_link.
- **Data Profiling**: Profile data quality with profiling_jobs, profiling_runs, tables_profile, columns_profile, and column_metrics for comprehensive metadata analysis.
- **Data Validation Results**: Store validation results across multiple dimensions including counts (dv_count), DDL validation (dv_ddl_validation), schema validation (dv_schema_validation), duplicate detection (dv_tgt_cols_dups_data), data rules (dv_tgt_data_rules), null checks (dv_tgt_nulls_data), and profiling (dv_tgt_profile_data).
- **User Management**: Handle authentication and role-based access control through user_master, role_master, user_role_map, module_master, and role_module_permission_mapping.
- **Test Suite Management**: Organize test cases into suites with testcase_suite, testcase_suite_map, regression_suite_master, and schedule_master for automated execution.
- **Reporting and Alerts**: Configure alerts and reports through alert_report_tracker and beat_report_input.
- **Integrations**: Link to Jira for test plan synchronization through jira_tc_mapping.

## When to use

- Questions about test case execution history, status, timing, or failure analysis
- Queries about test scenarios, DAGs, workflows, or execution batches
- Analysis of data quality validation results, profiling metrics, or data issues
- Questions about test configuration, test plans, or test case details
- User activity tracking, role assignments, or permission analysis
- Application, project, release, or test cycle information
- Test suite composition, scheduling, or execution history
- Data profiling job status, progress, or results
- Validation failures including count mismatches, DDL issues, duplicates, nulls, or rule violations
- Time-based analysis of test executions or trends
- Comparisons of test performance, failure rates, or execution times

## Inputs (from agent)

- `question` (required): natural-language question about data quality testing, test execution, profiling, or validation results.
- Optional context for audit/scoping.

## Outputs

- `result`: human-readable answer.
- `sql_query`: the executed SELECT (if any).
- `data`: result set when applicable.
- `sources`: e.g. `["mysql_beat"]`.

## MCP server

This skill uses the **MySQL MCP server** (`mcp_servers/mysql_mcp`). Configure the server with `.env` (or registry) so it connects to the database containing the Beat testing framework tables:

- **MYSQL_HOST**, **MYSQL_PORT**, **MYSQL_USER**, **MYSQL_PASSWORD**, **MYSQL_DATABASE** (e.g. `beat_testing`).

Run the MCP server with cwd `mcp_servers/mysql_mcp` so it loads `.env`. Register this skill's server name (e.g. `mysql_beat`) in `mcp_servers.example.json` or in the skill's frontmatter as shown above.