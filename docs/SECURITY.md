## Security & Privacy — Levante

### Principles
- Privacy by default: local data; no cloud except AI provider calls.
- Least privilege: minimal, validated IPC surfaces.
- Transparency: clear consents, local logs.

### Secrets Handling
- API keys in Keychain (macOS), DPAPI (Windows), libsecret/kwallet (Linux).
- Never store secrets in plaintext files nor expose them to the Renderer.

### Data at Rest
- SQLite local (Turso compatible). Optional field‑level encryption for messages/documents.
- Optional local backups, always encrypted if containing content.

### Data in Transit
- TLS to AI providers or remote MCP servers.
- IPC validated via schemas; no unsafe serialization.

### Telemetry
- Opt‑in, anonymous, fully disableable.

### Threats & Mitigations
- File ingestion: sanitize, limit types, scan metadata. (Post‑MVP)
- MCP abuse: consents, limits, audit.
- Exfiltration: default local‑only; explicit permissions.

### References
- Local DB: [Turso — The next evolution of SQLite](https://turso.tech/)


