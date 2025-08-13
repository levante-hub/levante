## Testing Strategy — Levante

### Levels
- Unit: DB, AI, MCP services with mocks. (Post‑MVP: RAG)
- Integration: IPC, migrations. (Post‑MVP: vector search)
- E2E: onboarding → chat → invoke MCP. (Post‑MVP: attach → search)
- Performance: cold start, response times. (Post‑MVP: indexing)
- Security: keychain, encryption, MCP permissions.

### Tooling (suggested)
- Unit/Integration: Vitest/Jest + ts-node/tsx.
- E2E: Playwright on dev packaging.
- Bench: Node scripts.


