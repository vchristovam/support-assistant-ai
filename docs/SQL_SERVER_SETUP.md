# SQL Server Setup Guide

This guide explains how to configure the SQL Server environment for the Enterprise Support Autopilot.

## Prerequisites

- **SQL Server 2016+**: Required for native JSON support (`NVARCHAR(MAX)` with JSON functions).
- **Database**: A dedicated database (e.g., `support_autopilot`).
- **Collation**: Recommended `SQL_Latin1_General_CP1_CI_AS` or `UTF-8` compatible collation.
- **Permissions**: The user needs `CREATE TABLE`, `CREATE INDEX`, and standard DML permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).

## Environment Variables

Configure the following environment variables in your `.env` file:

```env
# SQL Server Configuration
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=support_autopilot
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=your_secure_password
SQL_SERVER_ENCRYPT=true
SQL_SERVER_TRUST_CERT=false
```

### Security Warning

> [!IMPORTANT]
> Never commit your `.env` file with real passwords. Use a secrets manager for production environments.

## Database Schema Deployment

The schema is defined in `scripts/sql/schema.sql`. This script creates the following tables:

1.  `threads`: Stores conversation metadata and ownership.
2.  `conversations`: Stores the full message history (user, assistant, system, tool).
3.  `langgraph_checkpoints`: Stores LangGraph state snapshots for conversation continuity.

### Existing `users` Table Assumption

The schema assumes a `users` table already exists with a `user_id` column of type `UNIQUEIDENTIFIER`. If your existing users table uses a different type or name, you must update the foreign key constraint in `scripts/sql/schema.sql`:

```sql
ALTER TABLE threads
    ADD CONSTRAINT FK_threads_users
    FOREIGN KEY (user_id) REFERENCES users(user_id);
```

### Deploying the Schema

You can deploy the schema using `sqlcmd` or any SQL management tool:

```bash
sqlcmd -S localhost -U sa -P your_secure_password -d support_autopilot -i scripts/sql/schema.sql
```

## Architecture

### Single-Tenant Implementation

The current implementation follows a single-tenant architecture where all users share the same database. Isolation is enforced at the application level via the `user_id` column in the `threads` table.

### Connection Pooling

The system uses connection pooling for optimal performance. You can tune the pool settings in the configuration if needed (currently defaults are managed by the `mssql` driver).

## Mock User Integration

For development and testing without a full authentication system, the application uses a mock user integration. Ensure at least one user exists in your `users` table to satisfy foreign key constraints:

```sql
INSERT INTO users (user_id, email, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'mock@example.com', 'Mock User');
```

## Troubleshooting

- **Connection Failures**: Ensure the SQL Server Browser service is running if using named instances, and that the firewall allows traffic on port 1433.
- **JSON Errors**: If you encounter errors related to JSON parsing, verify you are running SQL Server 2016 or later.
- **SSL/TLS Errors**: If using a self-signed certificate, set `SQL_SERVER_TRUST_CERT=true`.
- **Foreign Key Violations**: Ensure the `user_id` provided during thread creation exists in the `users` table.
