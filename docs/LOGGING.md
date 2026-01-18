# Levante Logging System

## Overview

Levante uses a centralized, category-based logging system designed for optimal development experience and debugging capabilities. The system provides granular control over log output through environment variables and maintains type safety across all processes.

## Quick Start

### Basic Usage

```typescript
// Main Process
import { getLogger } from './services/logging';
const logger = getLogger();

// Renderer Process  
import { logger } from '@/services/logger';

// Usage is identical in both processes
logger.aiSdk.debug('Model provider loaded', { provider: 'openai' });
logger.mcp.info('Server started', { serverId: 'filesystem' });
logger.rag.info('Document ingested', { documentId: 'doc_123', chunkCount: 15 });
logger.core.error('Initialization failed', { error: error.message });
```

### Environment Configuration

Add to your `.env.local` file:

```bash
# Master control - disables all debug logging when false
DEBUG_ENABLED=true

# Category-specific controls
DEBUG_AI_SDK=true      # AI service operations and streaming
DEBUG_MCP=true         # MCP server management and tools
DEBUG_DATABASE=true    # Database operations and migrations
DEBUG_IPC=false        # Inter-process communication
DEBUG_PREFERENCES=false # Settings and configuration
DEBUG_CORE=true        # Application lifecycle and errors
DEBUG_OAUTH=false      # OAuth flow, authorization, token lifecycle
DEBUG_RAG=false        # RAG document processing and vector operations

# Log level control (optional)
LOG_LEVEL=debug        # debug | info | warn | error

# Log rotation settings (development fallback)
LOG_MAX_SIZE=10485760    # 10MB
LOG_MAX_FILES=5          # Keep 5 rotated files
LOG_MAX_AGE=7            # Delete files older than 7 days
LOG_COMPRESS=false       # Gzip rotated files
LOG_DATE_PATTERN=YYYY-MM-DD-HHmmss
```

> Nota: la aplicación usa siempre estos valores por defecto o los que definas por entorno; no hay configuración desde la UI.

## Log Rotation

To prevent the log file from growing indefinitely, the system automatically rotates files based on:
1. **Size**: Rotates when the file exceeds the `maxSize` limit.
2. **Count**: Keeps only the most recent `maxFiles`.
3. **Age**: Deletes files older than `maxAge` days.

Rotated files follow the pattern `levante-YYYY-MM-DD-HHmmss.log`. If compression is enabled, they will be saved as `.log.gz`.

## Log Categories

| Category | Purpose | When to Use |
|----------|---------|-------------|
| `ai-sdk` | AI service operations, model interactions, streaming | Model provider config, tool calls, streaming chunks |
| `mcp` | MCP server management, tool execution, health | Server startup, tool calls, health checks |
| `database` | Database operations and migrations | Query execution, migration status, connection issues |
| `ipc` | Inter-process communication | IPC calls, preload bridge operations |
| `preferences` | Settings and configuration management | Preference loading, keychain operations |
| `core` | General application lifecycle and errors | App startup, window management, critical errors |
| `oauth` | OAuth discovery, authorization, token lifecycle | Authorization flow, token refresh/revocation, callback server events |
| `rag` | RAG document processing and vector operations | Document ingestion, embedding generation, chunk management, vector search |

## Environment Flags

- `DEBUG_ENABLED` — Master switch for all debug logging
- `DEBUG_AI_SDK` — AI service operations
- `DEBUG_MCP` — MCP server management and tool execution
- `DEBUG_DATABASE` — Database operations and migrations
- `DEBUG_IPC` — Inter-process communication
- `DEBUG_PREFERENCES` — Settings/configuration management
- `DEBUG_CORE` — Application lifecycle and critical errors
- `DEBUG_OAUTH` — OAuth flow, discovery, authorization, token lifecycle
- `DEBUG_RAG` — RAG document processing and vector operations
- `LOG_LEVEL` — Minimum log level (`debug` | `info` | `warn` | `error`)

## API Reference

### Logger Methods

Each category supports four log levels:

```typescript
logger.category.debug(message, context?)   // Detailed debugging information
logger.category.info(message, context?)    // General informational messages  
logger.category.warn(message, context?)    // Warning conditions
logger.category.error(message, context?)   // Error conditions
```

### Generic Logging

```typescript
logger.log(category, level, message, context?)
```

### Context Objects

Always include relevant context for better debugging:

```typescript
// Good
logger.aiSdk.debug('Model provider loaded', { 
  provider: 'openai', 
  models: 15, 
  loadTime: '45ms' 
});

// Better
logger.mcp.error('Server connection failed', { 
  serverId: 'filesystem',
  error: error.message,
  attempt: 3,
  timestamp: Date.now()
});
```

## Log Format

Logs are formatted with timestamps, colored categories, and structured context:

```
[2025-01-15 14:30:25] [AI-SDK] [DEBUG] Model provider loaded
  provider: openai
  models: 15
  loadTime: 45ms

[2025-01-15 14:30:26] [MCP] [INFO] Server started  
  serverId: filesystem
  tools: ["read", "write", "list"]
  status: healthy
```

## Performance

- **Zero overhead** when category logging is disabled
- **Lazy evaluation** of log message formatting  
- **Non-blocking** IPC communication for renderer logging
- **Memory efficient** with configurable retention

## Migration Guide

### From console.* to Centralized Logger

#### Before
```typescript
console.log('[AI-Stream] Tool call chunk received:', {
  type: chunk.type,
  toolCallId: chunk.toolCallId,
  toolName: chunk.toolName
});

console.error('Database connection failed:', error);
```

#### After
```typescript
logger.aiSdk.debug('Tool call chunk received', {
  type: chunk.type,
  toolCallId: chunk.toolCallId,
  toolName: chunk.toolName
});

logger.database.error('Database connection failed', { 
  error: error instanceof Error ? error.message : error 
});
```

### Migration Steps

1. **Import the logger**:
   ```typescript
   // Main process
   import { getLogger } from './services/logging';
   const logger = getLogger();
   
   // Renderer process
   import { logger } from '@/services/logger';
   ```

2. **Add logger instance** to classes:
   ```typescript
   export class MyService {
     private logger = getLogger();
     // ...
   }
   ```

3. **Replace console calls**:
   - `console.log` → `logger.category.debug` or `logger.category.info`
   - `console.info` → `logger.category.info`
   - `console.warn` → `logger.category.warn`
   - `console.error` → `logger.category.error`

4. **Choose appropriate category**:
   - AI operations → `logger.aiSdk`
   - MCP operations → `logger.mcp`
   - Database operations → `logger.database`
   - IPC operations → `logger.ipc`
   - Settings → `logger.preferences`
   - General/startup → `logger.core`

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// Debug: Detailed tracing information
logger.aiSdk.debug('Processing tool call', { toolName, args });

// Info: General operational messages
logger.mcp.info('Server connected successfully', { serverId });

// Warn: Recoverable issues or important notices
logger.database.warn('Migration took longer than expected', { duration });

// Error: Error conditions that need attention
logger.core.error('Failed to initialize service', { error: error.message });
```

### 2. Include Relevant Context

```typescript
// Always provide context for debugging
logger.aiSdk.error('Model provider failed', {
  provider: 'openai',
  model: 'gpt-4',
  error: error.message,
  retryAttempt: 2
});
```

### 3. Use Structured Data

```typescript
// Structure your context objects
logger.mcp.debug('Tool execution completed', {
  toolName: 'filesystem.read',
  duration: '150ms',
  inputSize: '2.3KB',
  outputSize: '15.7KB',
  success: true
});
```

### 4. Avoid Logging Sensitive Data

```typescript
// Don't log API keys, passwords, or personal data
logger.aiSdk.info('API request sent', { 
  provider: 'openai',
  model: 'gpt-4',
  // apiKey: config.apiKey  ❌ Never log sensitive data
});
```

### OAuth Logging Examples

**Main process (OAuthService)**

```typescript
logger.oauth.debug('Step 1: Discovering authorization server', {
  serverId,
  mcpServerUrl,
});

logger.oauth.info('Authorization server discovered', {
  serverId,
  authServerId,
  hasMetadata: !!metadata,
});

logger.oauth.warn('Client registration not supported, using static credentials', {
  serverId,
});

logger.oauth.error('OAuth authorization failed', {
  serverId,
  error: error.message,
  step: 'token_exchange',
});
```

**Renderer (oauthStore)**

```typescript
logger.oauth.info('OAuth required for server', {
  serverId,
});

logger.oauth.error('Failed to load OAuth servers', {
  error: error.message,
});
```

## Configuration Examples

### Development Setup
```bash
DEBUG_ENABLED=true
DEBUG_AI_SDK=true
DEBUG_MCP=true
DEBUG_DATABASE=true
DEBUG_IPC=false
DEBUG_PREFERENCES=false
DEBUG_CORE=true
DEBUG_OAUTH=true
LOG_LEVEL=debug
```

### Production Setup
```bash
DEBUG_ENABLED=true
DEBUG_AI_SDK=false
DEBUG_MCP=false
DEBUG_DATABASE=false
DEBUG_IPC=false
DEBUG_PREFERENCES=false
DEBUG_CORE=true
DEBUG_OAUTH=false
LOG_LEVEL=warn
```

### AI Development Focus
```bash
DEBUG_ENABLED=true
DEBUG_AI_SDK=true
DEBUG_MCP=false
DEBUG_DATABASE=false
DEBUG_IPC=false
DEBUG_PREFERENCES=false
DEBUG_CORE=true
DEBUG_OAUTH=false
LOG_LEVEL=debug
```

### MCP Development Focus
```bash
DEBUG_ENABLED=true
DEBUG_AI_SDK=false
DEBUG_MCP=true
DEBUG_DATABASE=false
DEBUG_IPC=false
DEBUG_PREFERENCES=false
DEBUG_CORE=true
DEBUG_OAUTH=true
LOG_LEVEL=debug
```

## Architecture

### Process Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main Process  │    │   Preload Bridge │    │ Renderer Process│
│                 │    │                  │    │                 │
│  Logger Service │◄──►│  Secure Bridge   │◄──►│ Logger Service  │
│  - Full logging │    │  - IPC logging   │    │ - IPC to main   │
│  - File output  │    │  - Type safety   │    │ - Fallback logs │
│  - Transports   │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Configuration Flow
```
.env.local → LoggerConfigService → Logger Instance → CategoryLoggers
```

## Troubleshooting

### Logs Not Appearing

1. Check `DEBUG_ENABLED=true` in `.env.local`
2. Verify specific category is enabled (e.g., `DEBUG_AI_SDK=true`)
3. Check log level setting (`LOG_LEVEL=debug`)
4. Ensure you're using the correct import path

### IPC Errors in Renderer

1. Verify preload script is properly configured
2. Check contextIsolation settings
3. Ensure logger handlers are registered in main process

### Performance Issues

1. Disable unused categories
2. Set higher log level (warn/error only)
3. Avoid logging large objects in production

## Contributing

When adding new features:

1. **Choose the appropriate category** for your logs
2. **Use structured logging** with consistent context objects
3. **Include error details** in error logs
4. **Test with logging disabled** to ensure zero overhead
5. **Document new logging patterns** in this guide

---

For implementation details, see the [PRD](docs/PRD/Centralized-Logging-System-PRD.md) and source code in `src/main/services/logging/`.
