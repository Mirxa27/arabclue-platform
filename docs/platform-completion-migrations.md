# Platform Completion — Migrations

The migration ledger for this specification (identifiers, affected capabilities,
ordered apply positions, and reverse actions) is the generated **Migration
ledger** section of [`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](./PRODUCTION_DEPLOYMENT_RUNBOOK.md),
produced from `src/lib/migration-registry.ts`.

Requirement 16.6 forbids a second, hand-maintained migration document, so this
file intentionally holds no duplicate table; consult the generated ledger above.
