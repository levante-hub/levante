## ADR 0001 — Platform: Electron + MCP + SQLite (Turso)

Author: Oliver Montes  
Date: 2025-08-12  
Status: Proposed

### Context
Cross‑platform desktop, chat + tools (MCP), local persistence.

### Decision
- Electron (Main/Preload/Renderer, secure IPC).
- MCP for tool invocation with consent + audit.
- SQLite local with Turso compatibility. Reference: [Turso](https://turso.tech/).

### Consequences
- `+` Portability and mature ecosystem; + uniform distribution.
- `+` Larger binary compared to native.

### Alternatives Considered
- Tauri instead of Electron: smaller footprint, Rust core; trade‑off in ecosystem maturity and packaging complexity for MCP/AI SDK adapters.
- Native apps per OS: best performance/native UX; higher cost to maintain, diverging codebases.
- Web app only: easiest distribution; loses offline/local persistence guarantees and OS keychain integration.


