# Platform-completion E2E (task 13.3)

One-shot Playwright coverage for public auth surfaces, locale/viewport parity,
route guards, health vs ready probes, and mocked completion API contracts.

## Prerequisites

1. **Start the dev server manually** (task 13.4 — the harness never runs `bun run dev`):

   ```bash
   bun run dev
   ```

2. **Install Chromium** (first run only):

   ```bash
   bun run setup:pdf
   ```

3. Optional: **isolated database** for stateful specs in `stateful-isolated.spec.ts`:

   ```env
   TEST_DATABASE_URL=postgresql://…/arabclue_completion_test?schema=public
   TEST_DATABASE_IDENTITY=<credential-free identity from test-database guard>
   TEST_DATABASE_ISOLATED=true
   ```

   The running dev server must point `DATABASE_URL` at the same isolated database.
   Never use the shared Neon identity. Do not run `prisma migrate` or `db push`.

## Run

```bash
# List tests (dry-run)
bun run test:e2e:completion -- --list

# Execute against a running server (default http://localhost:3000)
bun run test:e2e:completion

# Custom base URL
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 bun run test:e2e:completion
```

## What is covered

| Area | Spec | Notes |
|------|------|-------|
| Health / ready | `health-ready.spec.ts` | Liveness vs migration-aware readiness |
| Locale + viewports | `locale-viewports.spec.ts` | AR/EN at 360 / 768 / 1280, `arabclue-locale` persistence |
| Public auth | `auth-public.spec.ts` | Register, verify, recovery, invite with mocked APIs |
| Route guards | `route-guards.spec.ts` | Unknown/admin/project paths redirect without protected fetches |
| Mocked domains | `dashboard-mocks.spec.ts` | Analytics, clauses, templates, XLSX, billing, marketplace, etc. |
| Stateful (optional) | `stateful-isolated.spec.ts` | Skipped unless isolated `TEST_DATABASE_URL` guard passes |

Protected tenant APIs are tracked via `support/forbidden-requests.ts` and must
not fire on unauthenticated or unknown dashboard paths.

## Provider safety

- Email, billing, and other outbound providers are **not** contacted; Playwright
  `route.fulfill` stubs return deterministic JSON.
- No schema mutations are issued from the test harness.
