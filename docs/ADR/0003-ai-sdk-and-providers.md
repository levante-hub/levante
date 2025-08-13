## ADR 0003 — AI SDK and Providers

Author: Oliver Montes  
Date: 2025-08-12  
Status: Proposed

### Context
We require multi‑provider support, streaming, and future embeddings.

### Decision
- Use AI SDK as orchestration layer.
- Map providers (OpenAI, Anthropic, OpenRouter, Google, etc.) and models.
- Unify interfaces: chat and tool calling.

### Consequences
- + Flexibility to change providers.
- ± Ongoing compatibility testing required.

### Alternatives Considered
- Direct provider SDKs only: less abstraction; faster to start; harder to swap providers and unify features like streaming/tool calling.
- Custom abstraction layer: full control; higher maintenance burden; risks duplicating AI SDK capabilities.


