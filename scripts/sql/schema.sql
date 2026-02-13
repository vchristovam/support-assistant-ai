-- ============================================================================
-- Enterprise Support Autopilot - SQL Server Database Schema
-- ============================================================================
-- Description: Core persistence layer for the LangGraph.js multi-agent support
--              system. Implements thread management, conversation history,
--              and LangGraph checkpoint storage.
--
-- Target: SQL Server 2016+
-- Collation: Recommended SQL_Latin1_General_CP1_CI_AS or UTF-8
-- ============================================================================

-- ============================================================================
-- threads Table
-- ============================================================================
-- Purpose: Stores conversation threads with ownership and metadata.
-- Each thread represents a unique conversation between a user and the support
-- system. Threads can be in various states: 'idle', 'busy', 'interrupted', 'error'.
--
-- Foreign Key: users(user_id) - references existing users table
-- =============================================================================
CREATE TABLE threads (
    thread_id NVARCHAR(255) NOT NULL PRIMARY KEY,
    -- Thread identifier (e.g., 'thread-uuid' format)
    
    user_id UNIQUEIDENTIFIER NOT NULL,
    -- Reference to existing users table (application-managed)
    
    title NVARCHAR(500) NULL,
    -- Thread title (auto-generated or user-provided)
    
    status NVARCHAR(50) NOT NULL DEFAULT 'idle',
    -- Thread status: 'idle', 'busy', 'interrupted', 'error'
    
    metadata NVARCHAR(MAX) NULL,
    -- JSON metadata: assistant_id, tags, context, etc.
    
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    -- Timestamp when thread was created
    
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    -- Timestamp when thread was last updated
);
GO

-- Foreign key constraint to existing users table
ALTER TABLE threads
    ADD CONSTRAINT FK_threads_users
    FOREIGN KEY (user_id) REFERENCES users(user_id);
GO

-- Indexes for threads table
CREATE INDEX IX_threads_user_id ON threads(user_id);
-- Optimizes queries filtering by user

CREATE INDEX IX_threads_status ON threads(status);
-- Optimizes queries filtering by thread status

CREATE INDEX IX_threads_created_at ON threads(created_at);
-- Optimizes time-based queries and sorting
GO

-- ============================================================================
-- conversations Table  
-- ============================================================================
-- Purpose: Stores ALL messages in the conversation history including user
-- messages, assistant responses, tool results, and system prompts.
-- Maintains complete audit trail of all interactions.
--
-- Foreign Key: threads(thread_id) ON DELETE CASCADE
-- =============================================================================
CREATE TABLE conversations (
    message_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    -- Unique message identifier
    
    thread_id NVARCHAR(255) NOT NULL,
    -- Reference to parent thread
    
    role NVARCHAR(50) NOT NULL,
    -- Message role: 'user', 'assistant', 'system', 'tool'
    
    content NVARCHAR(MAX) NOT NULL,
    -- Message content text
    
    tool_calls NVARCHAR(MAX) NULL,
    -- JSON: tool calls made by assistant (agent only)
    
    tool_call_id NVARCHAR(255) NULL,
    -- Reference to tool call (for tool result messages)
    
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    -- Timestamp when message was created
);
GO

-- Foreign key constraint with CASCADE DELETE
-- When a thread is deleted, all its messages are automatically removed
ALTER TABLE conversations
    ADD CONSTRAINT FK_conversations_threads
    FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE;
GO

-- Indexes for conversations table
CREATE INDEX IX_conversations_thread_id_created_at ON conversations(thread_id, created_at);
-- Critical index for loading conversation history in chronological order

CREATE INDEX IX_conversations_created_at ON conversations(created_at);
-- Optimizes time-based queries and cleanup operations
GO

-- ============================================================================
-- langgraph_checkpoints Table
-- ============================================================================
-- Purpose: Stores LangGraph state checkpoints for resuming conversations.
-- Enables conversation continuity across sessions and recovery from interruptions.
-- Each checkpoint represents a snapshot of the graph state at a specific point.
--
-- Foreign Key: threads(thread_id) ON DELETE CASCADE  
-- =============================================================================
CREATE TABLE langgraph_checkpoints (
    checkpoint_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    -- Unique checkpoint identifier
    
    thread_id NVARCHAR(255) NOT NULL,
    -- Reference to parent thread
    
    checkpoint_ns NVARCHAR(255) NOT NULL DEFAULT '',
    -- Checkpoint namespace for multi-checkpoint scenarios
    
    checkpoint_map NVARCHAR(MAX) NULL,
    -- JSON: checkpoint mapping metadata
    
    checkpoint_data NVARCHAR(MAX) NOT NULL,
    -- JSON: Full serialized graph state including messages, config, etc.
    
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    -- Timestamp when checkpoint was created
    
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    -- Timestamp when checkpoint was last updated
);
GO

-- Foreign key constraint with CASCADE DELETE
-- When a thread is deleted, all its checkpoints are automatically removed
ALTER TABLE langgraph_checkpoints
    ADD CONSTRAINT FK_checkpoints_threads
    FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE;
GO

-- Indexes for langgraph_checkpoints table
CREATE INDEX IX_checkpoints_thread_id ON langgraph_checkpoints(thread_id);
-- Optimizes queries for retrieving checkpoints by thread

CREATE INDEX IX_checkpoints_ns ON langgraph_checkpoints(checkpoint_ns);
-- Optimizes queries filtering by checkpoint namespace
GO

-- ============================================================================
-- Schema Verification Comments
-- ============================================================================
-- All tables use:
--   - NVARCHAR for Unicode string support
--   - DATETIME2 for high-precision timestamps  
--   - UNIQUEIDENTIFIER for UUID generation (NEWID())
--   - NVARCHAR(MAX) for JSON storage
--   - Proper indexes on FK columns and query patterns
--   - FOREIGN KEY constraints with CASCADE DELETE
-- ============================================================================
