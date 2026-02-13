-- ============================================================================
-- Enterprise Support Autopilot - Database Seed Script
-- ============================================================================
-- Description: Inserts sample test data for development and testing.
--              Creates realistic conversation scenarios covering different
--              thread states and use cases.
--
-- Prerequisites: schema.sql must be executed first
-- Target: SQL Server 2016+
-- Test User ID: '00000000-0000-0000-0000-000000000001' (placeholder)
-- ============================================================================

PRINT 'Starting database seed - Enterprise Support Autopilot';
PRINT '============================================================';
GO

-- ============================================================================
-- Seed Data: Threads
-- ============================================================================
-- Creates 3 threads representing different conversation states:
--   1. Active conversation about database queries
--   2. Completed conversation about system health
--   3. Interrupted conversation waiting for HITL approval

PRINT '';
PRINT 'Inserting test threads...';
PRINT '-------------------------';

INSERT INTO threads (thread_id, user_id, title, status, metadata, created_at, updated_at)
VALUES 
    -- Thread 1: Active conversation about database queries
    (
        'thread-001-active-db-query',
        '00000000-0000-0000-0000-000000000001',
        'Database Performance Issue - Query Optimization',
        'busy',
        '{"assistant_id": "support-supervisor", "tags": ["database", "performance", "query"], "context": {"priority": "high", "category": "databricks"}}',
        DATEADD(minute, -45, GETUTCDATE()),
        DATEADD(minute, -5, GETUTCDATE())
    ),
    -- Thread 2: Completed conversation about system health
    (
        'thread-002-completed-health',
        '00000000-0000-0000-0000-000000000001',
        'System Health Check - Dynatrace Analysis',
        'idle',
        '{"assistant_id": "support-supervisor", "tags": ["system-health", "dynatrace", "monitoring"], "context": {"priority": "medium", "category": "dynatrace", "resolved": true}}',
        DATEADD(hour, -2, GETUTCDATE()),
        DATEADD(hour, -1, GETUTCDATE())
    ),
    -- Thread 3: Interrupted conversation waiting for HITL approval
    (
        'thread-003-interrupted-hitl',
        '00000000-0000-0000-0000-000000000001',
        'Production Database Migration - Approval Required',
        'interrupted',
        '{"assistant_id": "support-supervisor", "tags": ["database", "migration", "production", "hitl"], "context": {"priority": "critical", "category": "operations", "requires_approval": true, "interrupted_at": "supervisor"}}',
        DATEADD(minute, -30, GETUTCDATE()),
        DATEADD(minute, -10, GETUTCDATE())
    );

PRINT '  >> 3 threads inserted successfully';
GO

-- ============================================================================
-- Seed Data: Conversations (Thread 1 - Active)
-- ============================================================================
-- Simulates an ongoing conversation about database performance

PRINT '';
PRINT 'Inserting conversation messages for Thread 1 (Active)...';
PRINT '--------------------------------------------------------';

INSERT INTO conversations (message_id, thread_id, role, content, tool_calls, tool_call_id, created_at)
VALUES
    -- User initiates the conversation
    (
        NEWID(),
        'thread-001-active-db-query',
        'user',
        'Hi, I''m seeing slow query performance on our analytics dashboard. Queries that used to take 2 seconds are now taking over 30 seconds. Can you help investigate?',
        NULL,
        NULL,
        DATEADD(minute, -45, GETUTCDATE())
    ),
    -- Assistant acknowledges and starts investigation
    (
        NEWID(),
        'thread-001-active-db-query',
        'assistant',
        'I''ll help you investigate this database performance issue. Let me check the current query execution plans and resource utilization.',
        '[{"id": "call_databricks_001", "type": "function", "function": {"name": "query_databricks", "arguments": "{\"query\": \"SELECT query_id, query_text, execution_time_ms FROM query_history WHERE start_time > DATEADD(hour, -24, NOW()) ORDER BY execution_time_ms DESC LIMIT 20\"}"}}]',
        NULL,
        DATEADD(minute, -44, GETUTCDATE())
    ),
    -- Tool result with query data
    (
        NEWID(),
        'thread-001-active-db-query',
        'tool',
        '{"results": [{"query_id": "q-12345", "query_text": "SELECT * FROM large_table JOIN another_table...", "execution_time_ms": 28500}, {"query_id": "q-12346", "query_text": "SELECT COUNT(*) FROM events...", "execution_time_ms": 15200}]}',
        NULL,
        'call_databricks_001',
        DATEADD(minute, -43, GETUTCDATE())
    ),
    -- Assistant provides analysis
    (
        NEWID(),
        'thread-001-active-db-query',
        'assistant',
        'I found some issues. Your top slow query (28.5s) is doing a full table scan on large_table. Let me check the table statistics and indexes.',
        '[{"id": "call_databricks_002", "type": "function", "function": {"name": "analyze_table", "arguments": "{\"table_name\": \"large_table\"}"}}]',
        NULL,
        DATEADD(minute, -42, GETUTCDATE())
    ),
    -- User responds
    (
        NEWID(),
        'thread-001-active-db-query',
        'user',
        'Thanks for checking. We did add some new columns to that table last week. Could that be related?',
        NULL,
        NULL,
        DATEADD(minute, -10, GETUTCDATE())
    ),
    -- Latest assistant message (conversation still active)
    (
        NEWID(),
        'thread-001-active-db-query',
        'assistant',
        'That''s very likely the cause! When you add columns without updating statistics, the query optimizer can make poor decisions. I''m checking the current statistics now...',
        '[{"id": "call_databricks_003", "type": "function", "function": {"name": "check_statistics", "arguments": "{\"table_name\": \"large_table\", " +
        "\"columns\": [\"new_column_1\", \"new_column_2\"]}"}}]',
        NULL,
        DATEADD(minute, -5, GETUTCDATE())
    );

PRINT '  >> 6 messages inserted for Thread 1';
GO

-- ============================================================================
-- Seed Data: Conversations (Thread 2 - Completed)
-- ============================================================================
-- Simulates a completed system health check conversation

PRINT '';
PRINT 'Inserting conversation messages for Thread 2 (Completed)...';
PRINT '-----------------------------------------------------------';

INSERT INTO conversations (message_id, thread_id, role, content, tool_calls, tool_call_id, created_at)
VALUES
    -- User asks about system health
    (
        NEWID(),
        'thread-002-completed-health',
        'user',
        'Can you run a system health check on our production environment? I want to make sure everything is stable before the weekend.',
        NULL,
        NULL,
        DATEADD(hour, -2, GETUTCDATE())
    ),
    -- Assistant runs health check via Dynatrace
    (
        NEWID(),
        'thread-002-completed-health',
        'assistant',
        'I''ll run a comprehensive system health check using Dynatrace. This will check CPU, memory, disk, and application response times.',
        '[{"id": "call_dynatrace_001", "type": "function", "function": {"name": "run_health_check", "arguments": "{\"environment\": \"production\", \"checks\": [\"cpu\", \"memory\", \"disk\", \"response_time\"]}"}}]',
        NULL,
        DATEADD(hour, -1, GETUTCDATE())
    ),
    -- Tool returns health status
    (
        NEWID(),
        'thread-002-completed-health',
        'tool',
        '{"status": "healthy", "checks": {"cpu": {"status": "pass", "usage": "45%"}, "memory": {"status": "pass", "usage": "62%"}, "disk": {"status": "pass", "usage": "78%"}, "response_time": {"status": "pass", "p95": "120ms"}}, "recommendations": ["Consider disk cleanup in 2 weeks"]}}',
        NULL,
        'call_dynatrace_001',
        DATEADD(hour, -1, GETUTCDATE())
    ),
    -- Assistant provides summary
    (
        NEWID(),
        'thread-002-completed-health',
        'assistant',
        'Great news! All system health checks passed:
• CPU: 45% utilization (healthy)
• Memory: 62% utilization (healthy)
• Disk: 78% utilization (healthy)
• Response Time: 95th percentile at 120ms (excellent)

Your production environment is stable for the weekend. I recommend scheduling a disk cleanup in about 2 weeks when usage approaches 85%.',
        NULL,
        NULL,
        DATEADD(hour, -1, GETUTCDATE())
    ),
    -- User thanks and closes
    (
        NEWID(),
        'thread-002-completed-health',
        'user',
        'Perfect, thank you! I''ll schedule that disk cleanup for next month. Have a great weekend!',
        NULL,
        NULL,
        DATEADD(hour, -1, GETUTCDATE())
    );

PRINT '  >> 5 messages inserted for Thread 2';
GO

-- ============================================================================
-- Seed Data: Conversations (Thread 3 - Interrupted/HITL)
-- ============================================================================
-- Simulates a conversation interrupted at supervisor awaiting approval

PRINT '';
PRINT 'Inserting conversation messages for Thread 3 (Interrupted/HITL)...';
PRINT '------------------------------------------------------------------';

INSERT INTO conversations (message_id, thread_id, role, content, tool_calls, tool_call_id, created_at)
VALUES
    -- User requests production migration
    (
        NEWID(),
        'thread-003-interrupted-hitl',
        'user',
        'I need to run a database migration on production to add indexes for the new reporting feature. This is urgent for Monday''s demo.',
        NULL,
        NULL,
        DATEADD(minute, -30, GETUTCDATE())
    ),
    -- Assistant explains process
    (
        NEWID(),
        'thread-003-interrupted-hitl',
        'assistant',
        'I can help with that database migration. Since this involves production changes, I''ll need to follow the change management process. Let me first analyze the migration plan.',
        '[{"id": "call_ops_001", "type": "function", "function": {"name": "analyze_migration", "arguments": "{\"target\": \"production\", \"migration_type\": \"add_indexes\", \"estimated_duration\": \"15 minutes\", \"rollback_plan\": \"available\"}"}}]',
        NULL,
        DATEADD(minute, -29, GETUTCDATE())
    ),
    -- Tool returns analysis
    (
        NEWID(),
        'thread-003-interrupted-hitl',
        'tool',
        '{"risk_level": "medium", "impact": "table locking for 10-15 minutes", "approval_required": true, "approver_role": "database_admin", "maintenance_window": "recommended"}',
        NULL,
        'call_ops_001',
        DATEADD(minute, -28, GETUTCDATE())
    ),
    -- Assistant escalates to HITL
    (
        NEWID(),
        'thread-003-interrupted-hitl',
        'assistant',
        'Based on the analysis, this migration requires approval from a Database Administrator due to the table locking impact (10-15 minutes). I''m routing this to the supervisor for human approval.',
        '[{"id": "call_supervisor_001", "type": "function", "function": {"name": "request_hitl_approval", "arguments": "{\"request_type\": \"production_migration\", \"risk_level\": \"medium\", \"justification\": \"Urgent for Monday demo\", \"estimated_impact\": \"10-15 min table lock\"}"}}]',
        NULL,
        DATEADD(minute, -10, GETUTCDATE())
    );

PRINT '  >> 4 messages inserted for Thread 3';
GO

-- ============================================================================
-- Seed Data: Checkpoints
-- ============================================================================
-- Creates checkpoints for threads to enable state restoration

PRINT '';
PRINT 'Inserting LangGraph checkpoints...';
PRINT '-----------------------------------';

INSERT INTO langgraph_checkpoints (checkpoint_id, thread_id, checkpoint_ns, checkpoint_map, checkpoint_data, created_at, updated_at)
VALUES
    -- Checkpoint for Thread 1 (Active - latest state)
    (
        NEWID(),
        'thread-001-active-db-query',
        'default',
        '{"thread_id": "thread-001-active-db-query", "checkpoint_count": 6}',
        '{
            "ts": "' + CONVERT(NVARCHAR(30), DATEADD(minute, -5, GETUTCDATE()), 126) + 'Z' + '",
            "channel_values": {
                "messages": [
                    {"role": "user", "content": "Hi, I''m seeing slow query performance..."},
                    {"role": "assistant", "content": "I''ll help you investigate..."},
                    {"role": "tool", "content": "Query results with slow queries..."},
                    {"role": "assistant", "content": "I found some issues..."},
                    {"role": "user", "content": "Thanks for checking..."},
                    {"role": "assistant", "content": "That''s very likely the cause..."}
                ],
                "next": "databricks",
                "current_agent": "databricks-worker",
                "pending_tool_calls": ["call_databricks_003"]
            },
            "channel_versions": {"messages": 6, "next": 3}
        }',
        DATEADD(minute, -5, GETUTCDATE()),
        DATEADD(minute, -5, GETUTCDATE())
    ),
    -- Checkpoint for Thread 2 (Completed)
    (
        NEWID(),
        'thread-002-completed-health',
        'default',
        '{"thread_id": "thread-002-completed-health", "checkpoint_count": 5}',
        '{
            "ts": "' + CONVERT(NVARCHAR(30), DATEADD(hour, -1, GETUTCDATE()), 126) + 'Z' + '",
            "channel_values": {
                "messages": [
                    {"role": "user", "content": "Can you run a system health check..."},
                    {"role": "assistant", "content": "I''ll run a comprehensive system health check..."},
                    {"role": "tool", "content": "Health check results..."},
                    {"role": "assistant", "content": "Great news! All system health checks passed..."},
                    {"role": "user", "content": "Perfect, thank you!..."}
                ],
                "next": "__end__",
                "current_agent": null,
                "conversation_status": "completed"
            },
            "channel_versions": {"messages": 5, "next": 4}
        }',
        DATEADD(hour, -1, GETUTCDATE()),
        DATEADD(hour, -1, GETUTCDATE())
    ),
    -- Checkpoint for Thread 3 (Interrupted at supervisor)
    (
        NEWID(),
        'thread-003-interrupted-hitl',
        'default',
        '{"thread_id": "thread-003-interrupted-hitl", "checkpoint_count": 4}',
        '{
            "ts": "' + CONVERT(NVARCHAR(30), DATEADD(minute, -10, GETUTCDATE()), 126) + 'Z' + '",
            "channel_values": {
                "messages": [
                    {"role": "user", "content": "I need to run a database migration..."},
                    {"role": "assistant", "content": "I can help with that database migration..."},
                    {"role": "tool", "content": "Migration analysis results..."},
                    {"role": "assistant", "content": "Based on the analysis, this migration requires approval..."}
                ],
                "next": "supervisor",
                "current_agent": "supervisor",
                "pending_hitl_approval": {
                    "request_id": "req-hitl-001",
                    "type": "production_migration",
                    "status": "pending",
                    "requested_at": "' + CONVERT(NVARCHAR(30), DATEADD(minute, -10, GETUTCDATE()), 126) + 'Z' + '",
                    "justification": "Urgent for Monday demo"
                }
            },
            "channel_versions": {"messages": 4, "next": 2}
        }',
        DATEADD(minute, -10, GETUTCDATE()),
        DATEADD(minute, -10, GETUTCDATE())
    );

PRINT '  >> 3 checkpoints inserted successfully';
GO

-- ============================================================================
-- Verification: Summary of Seed Data
-- ============================================================================

PRINT '';
PRINT '============================================================';
PRINT 'Seed Data Summary';
PRINT '============================================================';

DECLARE @thread_count INT;
DECLARE @message_count INT;
DECLARE @checkpoint_count INT;

SELECT @thread_count = COUNT(*) FROM threads;
SELECT @message_count = COUNT(*) FROM conversations;
SELECT @checkpoint_count = COUNT(*) FROM langgraph_checkpoints;

PRINT 'Tables populated:';
PRINT '  - threads:           ' + CAST(@thread_count AS NVARCHAR(10)) + ' rows';
PRINT '  - conversations:     ' + CAST(@message_count AS NVARCHAR(10)) + ' rows';
PRINT '  - checkpoints:       ' + CAST(@checkpoint_count AS NVARCHAR(10)) + ' rows';
PRINT '';
PRINT 'Test Scenarios Created:';
PRINT '  1. Thread 001 (busy): Active DB performance investigation';
PRINT '  2. Thread 002 (idle): Completed system health check';
PRINT '  3. Thread 003 (interrupted): Pending HITL approval for migration';
PRINT '';
PRINT '============================================================';
PRINT 'Seed complete. Database ready for development/testing.';
PRINT '============================================================';
GO
