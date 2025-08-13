## ADR 0005 — Hexagonal Architecture (Ports & Adapters)

Author: Oliver Montes  
Date: 2025-08-12  
Status: Proposed

### Context
We want clear separation of concerns, testability, and adaptability across platforms and providers.

### Decision
- Adopt Hexagonal Architecture with Domain, Application (ports/use cases), and Adapters (infrastructure/UI).

### Consequences
+ Easier testing (ports + adapters), clear boundaries, flexible integrations.
+ Slightly higher upfront complexity and boilerplate.

### Alternatives Considered
- Layered (3‑tier) architecture: simpler, but tends to blur boundaries between domain and infrastructure over time.
- Clean Architecture (Onion): very close alternative; Hexagonal chosen for explicit focus on ports/adapters and externalized infrastructure.
- Ad‑hoc modular structure: faster start, but degrades maintainability and testability.


