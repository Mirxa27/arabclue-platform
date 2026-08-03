# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates compliant technical and financial proposal **structure** for Saudi government tenders on Etimad — **never pricing bids**.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma (Postgres) + NextAuth + Playwright PDF + ExcelJS + JSZip + multi-provider LLM + MyFatoorah.

## Status (2026-08-02 delivery-completion pass)

### Delivered (this pass)
- Fixed Bun test-runner module-mock leakage: the 7 files using `mock.module` now live in `src/lib/__tests-isolated/` with hook-scoped registration; `test` script runs them in a separate process pass. Suite: 3937 pass / 0 fail.
- Applied the final pending migration `20260729100000_marketplace_rating_check` (shared Neon, user-approved); schema 20/20 up to date. Removed obsolete `MIGRATION_REQUIRED.md`.
- Regenerated the migration ledger in `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` (Requirement 16.6 tests green).
- Fixed business-profile export route fixtures to model verified users (email-verification gating is enforced).
- Moved the previously-orphaned `arabclue-logo.test.tsx` suite (38 tests, was breaking `tsc`) into the runnable test tree.
- Lint 0 errors / 0 warnings (fixed react-hooks/refs violation in `use-copilot-processing.ts`, ignored esbuild bundles under `extensions/arabclue-agent/{content,background,sidepanel,shared}`, removed stale eslint-disable directives).
- `tsc --noEmit` clean (removed stale `.next/types` duplicates; tsconfig test-dir excludes consistent).
- `bun run build` green (Next.js 16.2.11 Turbopack, no warnings).
- Audit docs refreshed: `AUDIT_REPORT.md` / `AUDIT_IMPLEMENTATION_MAP.md` — all previously-flagged items marked resolved; remaining items are operational load tests needing production-scale data.

### Verification
```bash
bun run test                 # 3937 pass, 0 fail, 13 intentional skips
bun run lint                 # 0 errors, 0 warnings
bunx tsc --noEmit            # pass
bunx prisma migrate status   # up to date (20/20)
bun run build                # pass
```

### Intentionally out of scope
- Real Etimad portal submission API
- Redis/Bull job queue
- SSO
- Live MyFatoorah sandbox charge without merchant credentials
- Production-scale load tests (1M+ analytics events, 10K+ row XLSX)

### Delivered
- Versioned regulatory policy registry (no blanket 10%, no PDPL universal residency, no invented NORA IDs, tender SLA preserved)
- Deterministic validation gate blocking export on pricing / placeholders / invented identifiers
- MyFatoorah Webhook V2 canonical HMAC, URL allowlist, amount/currency verification, webhook event idempotency
- Admin Payments → MyFatoorah panel (write-only secrets, connection + signature tests)
- Recurring profile + webhook event models/migration
- Full docs suite under `docs/`

### Verification
```bash
bun test src/lib/__tests__   # 49 pass
bun run lint                 # 0 errors
bunx tsc --noEmit            # pass
bunx prisma migrate deploy   # pass
bun run build                # pass
```

### Intentionally out of scope
- Real Etimad portal submission API
- Redis/Bull job queue
- SSO
- Live MyFatoorah sandbox charge without merchant credentials
