## ADR 0002 — Storage and Encryption

Author: Oliver Montes  
Date: 2025-08-12  
Status: Proposed

### Context
Keys, history and documents must remain local with minimal risk and optional encryption.

### Decision
- Secrets in OS keychain.
- SQLite local with optional field‑level encryption for messages/documents.
- Optional encrypted local backups.

### Consequences
- + Privacy, + compliance readiness.
- + Some complexity in managing encryption keys; mitigated by keychain.

### Alternatives Considered
- Store secrets in app config: simpler but unsafe; fails privacy goals.
- Full‑DB encryption (SQLite extension): stronger at rest, but portability/licensing/trust issues across platforms; field‑level chosen for granularity.
- Cloud KMS for keys: better rotation/audit; conflicts with local‑first/privacy‑by‑default and offline use.


