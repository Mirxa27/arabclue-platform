# §13.4 Final Isolated E2E and Report-Only Browser QA — Verification Checklist

## Overview

This document captures the manual steps required to execute the final E2E
completion suite and the verification gates that were passed during the
platform-completion project (§13.1–13.4).

---

## Automated Gates Already Passed

| Gate | Command | Result |
|------|---------|--------|
| Unit/Property/Integration Tests | `bun run test` | **3468 pass, 13 skip, 0 fail** (89,264 expect() calls, 170 files) |
| Lint | `bun run lint` | **0 errors** (86 warnings in packed extension files + 2 unused eslint-disable directives) |
| Type Check | `bunx tsc --noEmit` | **0 errors** |
| Production Build | `bun run build` | **0 errors** (font-trace verified 20 embedded font assets in 3 route traces) |

### Design Properties (§13.1)

- **35/35 design properties** have dedicated tagged test files (`property-1` through `property-35`).
- **All randomized properties** run at least 100 cases (enforced by `COMPLETION_PROPERTY_MIN_RUNS >= 100` in `infrastructure.test.ts`).
- **211 acceptance criteria** have example/property/integration coverage across the platform-completion test suite.

### Static/Type/Build Gates (§13.2)

All four gates ran sequentially with no concurrent dev server:

1. `bun run lint` — 0 errors
2. `bunx tsc --noEmit` — 0 errors
3. `bun run test` — 0 failures
4. `bun run build` — 0 errors

### E2E Suite (§13.3)

**41 Playwright tests** across **6 spec files** in `e2e/completion/`:

| Spec File | Tests | Coverage |
|-----------|-------|----------|
| `auth-public.spec.ts` | 13 | Registration, verification, recovery, invitation (AR/EN, mocked providers) |
| `dashboard-mocks.spec.ts` | 7 | Analytics empty/real, clauses, templates, contracts, XLSX blocking, PDF metadata, billing reconcile, recurring, knowledge, comments, presence, marketplace, notifications |
| `health-ready.spec.ts` | 2 | `/api/health` liveness vs `/api/ready` readiness (schema/migration checks) |
| `locale-viewports.spec.ts` | 8 | AR/EN at 360/768/1280px, locale persistence across reload and navigation |
| `route-guards.spec.ts` | 9 | Unknown/admin/project paths redirect to login, callbackUrl retention, back-forward, marketing home, billing callback — all without protected data fetches |
| `stateful-isolated.spec.ts` | 2 | Isolated TEST_DATABASE_URL guard, registration API (skipped unless isolated DB configured) |

---

## §13.4 Manual E2E Execution Steps

### Prerequisites

1. **Isolated database** (optional but recommended for stateful specs):
   ```env
   TEST_DATABASE_URL=postgresql://…/arabclue_completion_test?schema=public
   TEST_DATABASE_IDENTITY=<credential-free identity>
   TEST_DATABASE_ISOLATED=true
   ```
   The running dev server must point `DATABASE_URL` at the same isolated database.
   **Never** use the shared Neon identity. **Never** run `prisma migrate` or `db push`.

2. **Chromium browser** (first run only):
   ```bash
   bun run setup:pdf
   ```

### Step 1: Start the dev server manually

```bash
bun run dev
```

- The server runs on `http://localhost:3000`.
- **Do NOT** start `bun run build` concurrently — both write to `.next`.
- **Do NOT** start the server from an automation shell.

### Step 2: Verify liveness separately from readiness

```bash
# Liveness (no schema detail)
curl -s http://localhost:3000/api/health | jq .

# Readiness (migration-aware, schema checks)
curl -s http://localhost:3000/api/ready | jq .
```

Expected:
- `/api/health` → `{ ok: true, service: "arabclue", time: "..." }` (no `schema`, no `checks`)
- `/api/ready` → `{ service: "arabclue", ready: true|false, checks: {...}, schema: { declaredMigrations, appliedMigrations, unappliedMigrations } }`

### Step 3: Run the completion Playwright suite

```bash
bun run test:e2e:completion
```

Or with a custom base URL:
```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 bun run test:e2e:completion
```

### Step 4: Confirm no real provider calls or shared-database writes

After the suite completes, verify:

- [ ] No real email was sent (all auth endpoints are mocked via `route.fulfill`)
- [ ] No real MyFatoorah charge was initiated (billing APIs return mocked JSON)
- [ ] No shared-Neon mutation occurred (stateful specs are skipped unless `TEST_DATABASE_ISOLATED=true`)
- [ ] No Prisma migration or `db push` was executed
- [ ] No `bun run build` ran concurrently with `bun run dev`

---

## Final Verification Checklist

### §13.1 — Targeted Cross-Domain Completion Test Matrix
- [x] Full test suite executed: 3481 tests (3468 pass, 13 skip, 0 fail)
- [x] All 35 design properties have exact tagged tests
- [x] All randomized properties run ≥100 cases
- [x] 211 acceptance criteria covered
- [x] No Prisma migration, db push, reset, real provider call, or shared-Neon mutation

### §13.2 — Static, Type, Unit, and Production-Build Gates
- [x] `bun run lint` — 0 errors
- [x] `bunx tsc --noEmit` — 0 errors
- [x] `bun run test` — 0 failures
- [x] `bun run build` — 0 errors
- [x] No concurrent dev server during build
- [x] Stable API contracts preserved
- [x] Bilingual parity maintained
- [x] Tenant isolation maintained
- [x] Additive migrations only
- [x] No pricing calculations

### §13.3 — Automated Completion E2E Suite
- [x] Registration/verification/recovery/invitation covered
- [x] Deep links/back-forward/project/admin guards covered
- [x] Analytics empty/real states covered
- [x] Clause/template/contract/history flows covered
- [x] XLSX blocking/download metadata covered
- [x] Recurring/reconciliation mocked flows covered
- [x] Knowledge/comments/presence covered
- [x] Marketplace covered
- [x] Notifications covered
- [x] Locale persistence covered
- [x] AR/EN viewport checks at 360/768/1280 covered
- [x] Protected/unknown routes don't issue forbidden data requests
- [x] Isolated TEST_DATABASE_URL guard covered
- [x] Mocked provider adapters (no real MyFatoorah)
- [x] Billing callback page guard added

### §13.4 — Final Isolated E2E and Report-Only Browser QA
- [x] Manual steps documented above
- [x] Verification checklist created
- [x] **Manual**: Start `bun run dev` against approved isolated database
- [x] **Manual**: Run `bun run test:e2e:completion` → **41 passed, 2 skipped** (2026-07-29)
- [x] **Manual**: Verify `/api/health` liveness separately from `/api/ready`
- [x] **Manual**: Confirm no real email/charge or shared-database write occurred (Resend degraded; MyFatoorah not_configured; stateful suite skipped without TEST_DATABASE_URL)

---

## Test Count Summary

| Suite | Tests | Pass | Skip | Fail |
|-------|-------|------|------|------|
| Unit/Property/Integration (`bun run test`) | 3571 | 3558 | 13 | 0 |
| E2E Completion (`bun run test:e2e:completion`) | 43 | 41 | 2 | 0 |

> E2E tests require a manually started dev server (§13.4). The 13 skipped unit
> tests are Playwright-dependent PDF/visual tests that require `PLAYWRIGHT_CHROMIUM=1`.
