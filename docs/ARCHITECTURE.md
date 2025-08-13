## Architecture — Levante (Hexagonal)

### Overview
Electron + React desktop app structured with Hexagonal Architecture (Ports & Adapters):
- Domain: core business rules (sessions, messages, MCP invocation policies).
- Application: use cases and ports.
- Adapters (Infrastructure/UI): Electron Main (DB/AI/MCP/Keychain adapters), Preload (IPC adapters), React Renderer (UI adapter).

Reference DB and vector search (post‑MVP): [Turso — The next evolution of SQLite](https://turso.tech/).

### Layers & Boundaries
- Domain
  - Entities: Session, Message, MCPServer, MCPTool, Provider, Model.
  - Policies: consent requirements, audit requirements, message lifecycle.

- Application
  - Ports (interfaces): `ChatPort`, `MCPPort`, `SearchPort`, `SettingsPort`.
  - Use cases: `SendMessage`, `InvokeTool`, `SearchMessages`, `ConfigureProvider`.

- Adapters
  - Infrastructure: `DatabaseAdapter` (SQLite), `ModelsAdapter` (AI SDK), `MCPAdapter`, `KeychainAdapter`, `UpdaterAdapter`.
  - UI: React components; IPC bridge in Preload exposing safe methods.

### Data Flow
React UI → Preload API (validated) → Application port → Infrastructure adapter → External service (AI/MCP/DB) → back through port → UI render.

### Security
Context isolation, sandboxed renderer, strict IPC schemas, secrets in keychain, telemetry opt‑in.

### Persistence
SQLite local. MVP: sessions/messages/settings only. Post‑MVP: documents/chunks/embeddings and vector search.

### Packaging & Updates
`electron-updater` with stable/beta channels, signed artifacts per OS.


