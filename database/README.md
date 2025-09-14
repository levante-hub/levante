# Database — Levante

This directory contains all database-related files for the Levante application.

## Structure

```
database/
├── README.md                    # This file
├── schema.sql                   # Current database schema (for reference)
└── migrations/                  # Database migrations
    ├── README.md               # Migration documentation
    ├── 0001_init.sql           # Initial schema setup
    └── 0002_cleanup_unused_tables.sql  # Remove unused tables
```

## Database Location

The SQLite database is stored in the user's home directory following Electron conventions:

- **Path**: `~/levante/levante.db`
- **Engine**: SQLite (Turso-compatible)
- **Managed by**: `DirectoryService` and `DatabaseService`

## Schema Overview

After migration v2, the database contains only the essential tables for chat functionality:

### Core Tables
- **`chat_sessions`** - User conversation sessions
  - Stores session metadata (title, model, timestamps)
  - Organized by optional folder structure

- **`messages`** - Individual chat messages
  - Linked to sessions via foreign key
  - Supports tool calls and different message roles

- **`schema_migrations`** - Migration tracking
  - Tracks applied migrations and timestamps

### Removed Tables
These tables were removed in migration v2 as they are no longer used:
- `providers`, `models`, `settings` → Now handled via electron-store preferences
- `mcp_servers`, `mcp_tools` → Now handled via JSON config files

## Configuration Storage

The application uses different storage mechanisms based on data type:

| Data Type | Storage Method | Location |
|-----------|----------------|----------|
| Chat data | SQLite database | `~/levante/levante.db` |
| User preferences | electron-store (encrypted) | `~/levante/ui-preferences.json` |
| MCP configuration | JSON file | `~/levante/mcp.json` |
| Application logs | Log files | `~/levante/levante.log` |

This separation provides:
- **Performance**: Database only handles frequently accessed chat data
- **Security**: Sensitive preferences encrypted via electron-store
- **Flexibility**: Configuration files can be edited directly if needed
- **Clarity**: Clear separation of concerns between different data types

## Migration System

See [migrations/README.md](migrations/README.md) for detailed information about:
- Migration strategy and versioning
- How to create new migrations
- Migration history and rationale
- Database schema evolution