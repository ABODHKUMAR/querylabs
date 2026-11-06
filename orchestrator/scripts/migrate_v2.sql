-- Session 2: agent_runs table + chat_history.is_pinned
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS agent_runs (
    id                  INT             NOT NULL AUTO_INCREMENT,
    trace_id            VARCHAR(64)     NOT NULL,
    task_id             VARCHAR(64)     NOT NULL,
    user_id             VARCHAR(64)     NOT NULL,
    org_id              VARCHAR(64)     NULL,
    session_id          VARCHAR(64)     NOT NULL,
    agent_name          VARCHAR(128)    NOT NULL,
    skill_name          VARCHAR(128)    NULL,
    skill_type          VARCHAR(64)     NULL,
    mcp_server          VARCHAR(128)    NULL,
    outcome             VARCHAR(16)     NOT NULL,
    tool_calls          INT             NOT NULL DEFAULT 0,
    prompt_tokens       INT             NULL,
    completion_tokens   INT             NULL,
    total_tokens        INT             NULL,
    estimated_cost_usd  FLOAT           NULL,
    duration_ms         INT             NULL,
    error_type          VARCHAR(128)    NULL,
    question_snippet    VARCHAR(200)    NULL,
    feedback            VARCHAR(10)     NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_agent_runs_trace_id   (trace_id),
    INDEX idx_agent_runs_user_id    (user_id),
    INDEX idx_agent_runs_agent_name (agent_name),
    INDEX idx_agent_runs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MySQL 8.0.31+ supports ADD COLUMN IF NOT EXISTS.
-- For older MySQL 8.0, replace with the stored-procedure block below.
ALTER TABLE chat_history
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Fallback for MySQL < 8.0.31 ──────────────────────────────────────────────
-- Uncomment this block and comment out the ALTER above if your MySQL version
-- does not support ADD COLUMN IF NOT EXISTS.
--
-- DROP PROCEDURE IF EXISTS _querylab_add_is_pinned;
-- DELIMITER //
-- CREATE PROCEDURE _querylab_add_is_pinned()
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
--         WHERE TABLE_SCHEMA = DATABASE()
--           AND TABLE_NAME   = 'chat_history'
--           AND COLUMN_NAME  = 'is_pinned'
--     ) THEN
--         ALTER TABLE chat_history ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
--     END IF;
-- END //
-- DELIMITER ;
-- CALL _querylab_add_is_pinned();
-- DROP PROCEDURE IF EXISTS _querylab_add_is_pinned;
