## Database Migrations — Levante

### Strategy
- `schema_version` table for versioning.
- Numbered files `0001_*.sql` applied in order.
- Idempotent where possible (`IF NOT EXISTS`).

### Application
On app start, `runMigrations()`:
- Read current version.
- Execute new migrations in a transaction.
- Record in `schema_version`.

Reference engine: [Turso](https://turso.tech/).


