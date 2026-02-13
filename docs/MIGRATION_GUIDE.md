# Migration Guide: Moving to SQL Server Persistence

This guide outlines the process of migrating conversation persistence from In-Memory or Redis to SQL Server.

## Migration Strategy

The migration follows a "side-by-side" deployment strategy:

1.  **Preparation**: Set up the SQL Server environment (see [SQL_SERVER_SETUP.md](./SQL_SERVER_SETUP.md)).
2.  **Schema Deployment**: Apply the schema to the target SQL Server.
3.  **Data Extraction**: Extract existing threads and checkpoints from the source (Redis or Memory).
4.  **Data Transformation**: Map the source data to the new SQL Server table structure.
5.  **Data Loading**: Import the transformed data into SQL Server.
6.  **Switchover**: Update environment variables to point to SQL Server.

## Pre-Migration Checklist

- [ ] SQL Server 2016+ is provisioned and accessible.
- [ ] Database backup of the target SQL Server (if not empty).
- [ ] Read-only mode planned for the application during migration to prevent data loss.
- [ ] Source data (Redis/Memory) is backed up.

## Data Migration

### Conceptual Mapping

| Source Component | SQL Server Table        | Key Columns                        |
| :--------------- | :---------------------- | :--------------------------------- |
| Thread Metadata  | `threads`               | `thread_id`, `user_id`, `metadata` |
| Message History  | `conversations`         | `thread_id`, `role`, `content`     |
| LangGraph State  | `langgraph_checkpoints` | `thread_id`, `checkpoint_data`     |

### Migration Script (Optional)

If you have existing data in Redis, you can use a migration script to transfer threads. A template for this script can be found in `scripts/migrate-redis-to-sql.js` (if implemented).

## Switching the Application to SQL Server

Update your `.env` file to enable SQL Server persistence:

```env
# Disable Redis if it was being used
# REDIS_URL=

# Configure SQL Server
SQL_SERVER_HOST=your-server
SQL_SERVER_DATABASE=support_autopilot
...
```

The application is designed to prioritize SQL Server configuration if provided. Ensure all `SQL_SERVER_*` variables are correctly set.

## Verification Steps

After switching to SQL Server, perform the following checks:

1.  **Check Logs**: Verify no connection errors are appearing on startup.
2.  **Create a New Thread**:
    ```bash
    curl -X POST http://localhost:3000/api/threads -H "user-id: 00000000-0000-0000-0000-000000000000"
    ```
3.  **Send a Message**: Verify the message and checkpoint are saved in SQL Server.
4.  **Query History**:
    ```bash
    curl http://localhost:3000/api/threads/{id}
    ```
5.  **Direct Database Query**:
    ```sql
    SELECT * FROM threads;
    SELECT * FROM conversations;
    SELECT * FROM langgraph_checkpoints;
    ```

## Rollback Plan

If critical issues are encountered:

1.  **Revert Environment Variables**: Point the application back to the previous persistence layer (Redis or Memory).
2.  **Restart Application**: Ensure the old state is correctly loaded.
3.  **Analyze Logs**: Check SQL Server logs and application logs for the root cause of the failure.
4.  **Data Reconciliation**: If any new data was written to SQL Server during the migration attempt, it may need to be manually backported if you choose to retry.

## Troubleshooting

- **ID Mismatch**: Ensure `thread_id` formats are consistent across the migration.
- **Serialization Issues**: Verify that JSON data from Redis is correctly stringified before being inserted into `NVARCHAR(MAX)` columns.
- **Performance**: If loading old threads is slow, ensure that the indexes defined in `schema.sql` were properly created.
