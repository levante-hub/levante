## Technical Specification — Levante

### Modules (Ports/Adapters)
- DatabasePort / DatabaseAdapter (SQLite)
  - `init()`, `runMigrations()`, `saveMessage()`, `listSessions()`, `searchText()`.

- ModelsPort / ModelsAdapter (AI SDK)
  - `listProviders()`, `listModels(provider)`, `chatStream(args)`.

- MCPPort / MCPAdapter
  - `registerServer()`, `listTools(serverId)`, `invokeTool(serverId, name, input)`.

- SettingsPort / SettingsAdapter
  - `get(key)`, `set(key, value)`.

- KeychainPort / KeychainAdapter
  - `saveSecret(id, value)`, `getSecret(id)`.

### IPC Contracts
Namespace: `levante/*`
- `levante/chat/send` → stream `{ delta?, done?, error? }`
- `levante/mcp/invoke` → `{ output }`
- `levante/db/searchText` → `{ items: Array<{id, snippet, score}> }`

### Data Schema
See `docs/DB/MIGRATIONS/0001_init.sql`. MVP uses `chat_sessions`, `messages`, `settings`.

### Frontend (React + TS)
- React + TypeScript, theming light/dark, accessible defaults.
- State: local per view + scoped stores for sessions/chat.
- Bridge: Preload via `contextBridge` exposes validated APIs.

### Performance
- Cold start < 3s typical hardware; streaming rendering; lazy load heavy adapters.

### i18n
- EN default, ES available; extensible catalogs.


