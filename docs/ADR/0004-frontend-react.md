## ADR 0004 — Frontend in React

Author: Oliver Montes  
Date: 2025-08-12  
Status: Proposed

### Context
Need a mature UI framework for Electron renderer with strong DX and maintainability.

### Decision
- Use React + TypeScript in the Renderer.

### Consequences
- + Ecosystem, tooling, docs, composition patterns.
- ± Dependency size acceptable in Electron context.

### Alternatives Considered
- Vue: great DX and ecosystem; team expertise and existing React ecosystem weighed in favor of React.
- Svelte: excellent performance and simplicity; smaller enterprise ecosystem; fewer ready‑made components for Electron desktop patterns.
- Plain web components: minimal deps; slower DX, more boilerplate for complex state.


