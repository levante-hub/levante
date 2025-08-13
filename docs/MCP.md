## MCP Integration — Levante

### Goal
Enable safe, auditable tool invocation via MCP with non‑technical friendly UX.

### Server Registration
- Add by URL/manifest, local discovery, or profile import.
- Validate manifest; persist in `mcp_servers` and `mcp_tools`.

### Consent & Permissions
- Consent per server/tool; modal with description, params, risks.
- Audit: timestamp, tool, input/output summaries, status.

### Execution
- Isolated process/thread; timeouts/limits; robust error handling.

### UX
- Servers/tools list with enable/disable.
- In chat: tool suggestions; collapsible invocation traces.


