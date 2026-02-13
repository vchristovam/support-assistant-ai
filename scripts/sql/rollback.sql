-- ============================================================================
-- Enterprise Support Autopilot - Database Rollback Script
-- ============================================================================
-- Description: Drops all application tables created by schema.sql.
--              Does NOT drop the users table (assumed to pre-exist).
--
-- Execution Order: Child tables must be dropped before parent tables due to
--                  foreign key constraints.
--
-- Target: SQL Server 2016+
-- ============================================================================

PRINT 'Starting database rollback - Enterprise Support Autopilot';
PRINT '============================================================';
GO

-- ============================================================================
-- Step 1: Drop Child Tables (conversations, langgraph_checkpoints)
-- ============================================================================
-- These tables have foreign keys referencing threads, so they must be dropped
-- before the threads table can be removed.

-- Drop conversations table (child of threads)
IF OBJECT_ID('dbo.conversations', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table: conversations...';
    DROP TABLE conversations;
    PRINT '  >> conversations table dropped successfully';
END
ELSE
BEGIN
    PRINT '  >> conversations table does not exist, skipping';
END
GO

-- Drop langgraph_checkpoints table (child of threads)
IF OBJECT_ID('dbo.langgraph_checkpoints', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table: langgraph_checkpoints...';
    DROP TABLE langgraph_checkpoints;
    PRINT '  >> langgraph_checkpoints table dropped successfully';
END
ELSE
BEGIN
    PRINT '  >> langgraph_checkpoints table does not exist, skipping';
END
GO

-- ============================================================================
-- Step 2: Drop Parent Table (threads)
-- ============================================================================
-- The threads table is the parent table referenced by both conversations
-- and langgraph_checkpoints. It must be dropped last.

IF OBJECT_ID('dbo.threads', 'U') IS NOT NULL
BEGIN
    PRINT 'Dropping table: threads...';
    DROP TABLE threads;
    PRINT '  >> threads table dropped successfully';
END
ELSE
BEGIN
    PRINT '  >> threads table does not exist, skipping';
END
GO

-- ============================================================================
-- Step 3: Verify Cleanup
-- ============================================================================
-- Check that all application tables have been removed

PRINT '';
PRINT 'Verifying table cleanup...';
PRINT '----------------------------';

DECLARE @tables_remaining INT;

SELECT @tables_remaining = COUNT(*) 
FROM sys.tables 
WHERE name IN ('threads', 'conversations', 'langgraph_checkpoints')
  AND SCHEMA_NAME(schema_id) = 'dbo';

IF @tables_remaining = 0
BEGIN
    PRINT 'SUCCESS: All application tables have been dropped.';
END
ELSE
BEGIN
    PRINT 'WARNING: ' + CAST(@tables_remaining AS NVARCHAR(10)) + ' table(s) still exist.';
END
GO

PRINT '';
PRINT '============================================================';
PRINT 'Rollback complete. Database cleaned successfully.';
PRINT '============================================================';
GO
