# Implementation Plan

[Overview]
Close the remaining open tasks in `.kiro/specs/platform-completion/tasks.md` by finishing partial domain modules already in `src/lib/*`, wiring them through existing App Router routes/UI, adding required property/example tests, and updating task checkboxes only when acceptance criteria and tests pass.

Platform completion is mid-execution: foundations (section 1 + Checkpoint A) and several core services (registration, invitations, analytics vocabulary, clause seeding, template schema, workbook planner, recurring state, comment delete, dashboard route table) are implemented. Roughly **47 mandatory** and **42 optional** leaf tasks remain open in the checklist, many against modules that already exist as incomplete or partially wired code. Live production already shipped schema/migrations; this plan must **not** mutate shared Neon, run migrate/db push/reset, call real MyFatoorah/email, or invent synthetic runtime metrics.

Approach: work dependency waves from `tasks.md` §Task Dependency Graph. For each open task: (1) read design/requirement slice, (2) extend existing files in place (no parallel replacements), (3) add/fix isolated unit/property tests with mocks + `fast-check` ≥100 where required, (4) flip checklist markers in `tasks.md` only after green, (5) run targeted completion suites before advancing.

[Types]
No greenfield type system—extend existing domain types already present in completion modules.

Key existing contracts to complete against (do not re-fork):
- `src/lib/recovery-service.ts` — `RequestRecoveryCommand`, `ResetPasswordCommand`, token digests, rate limits
- `src/lib/analytics-collector.ts` — `ANALYTICS_EVENT_TYPES`, event key version `av1`, append-once semantics
- `src/lib/clause-library.ts` — catalog projections, select/list page bounds, custom clauses
- `src/lib/contract-template-authoring.ts` / `contract-versioning.ts` — workspace templates, immutable revisions
- `src/lib/proposal-workbook-plan.ts` — representable vs manifest-only blocks, two-row bilingual headers
- `src/lib/recurring-billing.ts` — DRAFT/ACTIVE/SUSPENDED/CANCELLED, exact amount copy, webhook idempotence
- `src/lib/knowledge-queue.ts` — merged pending projections, keyset cursors
- `src/lib/comment-lifecycle.ts` — amend/withdraw preserving replies
- `src/lib/notification-service.ts` — must evolve toward durable outbox (`NotificationDelivery`) per design §11
- `src/lib/dashboard-routes.ts` / `app-route-resolver.ts` / `hooks/use-view-router.ts` — path↔view mapping
- Shared: `ApiFailure` codes in `api-failure.ts` / i18n completion keys; `token-digest.ts`; `keyset-cursor.ts`

Stable response codes and bounds remain those named in `requirements.md` / design; do not invent alternate codes.

[Files]
Primary work is extend-in-place across domain services, API routes, dashboard components, and platform-completion tests.

### Likely modified (existing)
- Account/recovery/invite: `src/lib/recovery-service*.ts`, `src/app/api/auth/forgot-password/route.ts`, `reset-password/route.ts`, pages under `src/app/{forgot,reset}-password`, `register`, `verify-email`, `invite`, invitation dashboard controls
- Analytics: `src/lib/analytics-collector.ts`, proposal/agent/document origin call sites, `src/app/api/analytics/proposals/route.ts`, `src/components/dashboard/analytics-*.tsx`
- Clauses: `src/lib/clause-library*.ts`, `src/app/api/clauses/**`, `src/components/dashboard/clause-browser.tsx`, contract draft insertion points
- Templates/contracts: `contract-template-authoring.ts`, `contract-versioning.ts`, `src/app/api/contracts/workspace-templates/**`, `instances/**/versions/**`, studio UI
- XLSX: `proposal-workbook-plan.ts`, ExcelJS serializer (new helper under `src/lib/` if not present), `src/app/api/proposals/[id]/download/route.ts` validation gate order
- Billing: `recurring-billing*.ts`, `src/app/api/billing/recurring/**`, webhook route, admin `billing-reconciliation.tsx`, `billing-panel.tsx`
- Knowledge/collab: `knowledge-queue.ts`, pending-approval route, presence route (`collaboration/presence`), comment UI
- History/routing: version APIs/UI, `(app)/app/[...segments]/page.tsx`, `use-view-router.ts`, store/sidebar integration
- Marketplace: catalog seeding persistence, rate/use routes, marketplace UI
- Notifications: evolve `notification-service.ts` + outbox rows; cron/retry if present
- Cross-cutting: `src/lib/i18n.ts`, layout/locale cookie, `schema-guard.ts` / scanners, `.kiro/specs/platform-completion/tasks.md` (+ meta if tool-managed)

### New files (as needed, under existing trees only)
- Missing property tests: `src/lib/__tests__/platform-completion/property-{5-16,18-31,33-35}-*.test.ts` (optional `*` tasks may follow mandatory wiring)
- Optional pure helpers: e.g. `src/lib/proposal-workbook-xlsx.ts` for ExcelJS serialization if download route still embeds incomplete writer
- Capability reachability manifest (task 12.3): machine-readable path under `src/lib/` or `docs/` per design

### Never touch for this plan
- Shared Neon mutations / `prisma migrate` / `db push` / reset
- Committing `.env` or secrets
- Parallel “v2” services that strand existing modules

[Functions]
Extend and complete existing exported surfaces; preferred pattern is injectable dependencies + pure validators + serializable transactions.

### Finish/verify first (code largely present)
- Recovery: `createRecoveryService` request/reset paths; ensure routes call prisma adapter; pages use shared bilingual failures; session revoke inside reset transaction (design gap if still outside)
- Clauses list/select APIs + browser insert into active draft
- Template CRUD already partially exported (`createWorkspaceTemplate`, `updateWorkspaceTemplate`, `listTemplateVersions`, …)—close retirement, same-hash no-op, version conflict mapping
- Contract `createContractVersion`, `listContractVersions`, `compareContractRevisions`—ensure mutation origins append revisions
- Workbook `compileProposalWorkbookPlan` + wire gated XLSX download
- Recurring reserve/finalize/transition + webhook claim/settle; reconciliation report/apply
- Knowledge `list`/`decide` service methods + pending-approval route
- Dashboard `resolveAppRoute` + server entry auth/email/role gates + `useViewRouter` history sync

### Origin wiring required
- After successful commits: analytics append helpers for proposal/agent/document/template events without failing origin responses
- Notification outbox rows inside same transactions as review/subscription triggers (after outbox domain complete)

### Tests to add
- Mandatory example/integration tests for open domains
- Tagged property tests Properties 5–16, 18–31, 33–35 as optional `*` after domain functions stable; keep 17 and 32 green
- Never weaken assertions to pass; fix product code

[Classes]
No new class hierarchy. Prefer frozen object dependencies and small error classes already in use (`RecurringBillingError`, `ContractVersioningError`, `ApiFailure` mapper).

- Extend domain “service factories” (`createXService`) rather than classes with inheritance
- Prisma adapters remain separate (`*-prisma.ts`) so unit tests inject fakes from `src/lib/__tests__/support/*`

[Dependencies]
No new runtime packages expected.

- Keep `fast-check@4.9.0` exact (already in package.json)
- ExcelJS already dependency—reuse for workbook serializer
- Playwright only for tasks 13.3–13.4 later; not in early waves
- Do not add message brokers or new frameworks

[Testing]
Follow completion test policy in `tasks.md` Notes.

1. Unit/property: `bun test --preload ./src/lib/__tests__/support/completion-test-preload.ts src/lib/__tests__/platform-completion`
2. Targeted domain tests when touching a service
3. Randomized properties: ≥100 cases, exact `Feature: platform-completion, Property N: …` tag string
4. Isolated DB only when task requires serializable races and `TEST_DATABASE_URL` is explicitly isolated
5. Before declaring section done: `bun run lint`, relevant tests green; full `bun run test` + `bun run build` at section 13 / checkpoints
6. No concurrent `dev` + `build`; user starts dev manually for browser QA

[Implementation Order]
Execute waves to minimize blocked work; mark `tasks.md` checkboxes only after verification for that leaf.

1. **Accuracy pass**: Re-audit open tasks against existing code; mark complete only items that fully meet acceptance (candidate: 2.3 recovery if tx + routes + anti-enumeration verified; similar for partials wrongly still open).
2. **Section 2 closeout**: Finish recovery gaps; bilingual account/invite surfaces (2.5); example tests (2.6); Property 18 (2.8); mark parent section 2 complete.
3. **Section 3 analytics**: Origin wiring (3.2), aggregation/API range (3.3), dashboard (3.4); optional 3.5–3.7 when stable.
4. **Section 4 clauses**: API completeness (4.2), browser/insert (4.3); optional property 5–6.
5. **Section 5 templates/contracts**: 5.2–5.7 transactions/routes/UI; optional properties 7–10, 25–26, 19 keyset.
6. **Checkpoint B** after 4–5 + related tests green.
7. **Section 6 XLSX**: serializer (6.2), validation gate ordering (6.3); optional properties 11–12, 24, 27.
8. **Section 7 billing**: checkout/webhook/cancel/resume/console (7.2–7.5), reconciliation (7.6–7.7); optional 7.8–7.12.
9. **Section 8 knowledge/collab**: queue/commands/UI (8.1–8.3), comment UI (8.5), durable presence (8.6); optional 8.7–8.8.
10. **Section 9 history/routing**: version APIs/UI (9.1–9.3), server entry (9.5), nav sync (9.6); optional path properties.
11. **Section 10 marketplace**: persistence seed/list/rate/apply/UI (10.1–10.3); optional 10.4–10.5.
12. **Section 11 notifications**: outbox domain, wire triggers, retry cron, inbox UI (11.1–11.4); optional 11.5–11.7.
13. **Section 12 integrity**: locale cookie/server-first RTL (12.1), literals/logical CSS (12.2), scanners/manifest (12.3); optional 12.4–12.9.
14. **Checkpoint C**.
15. **Section 13 validation**: matrix 13.1, lint/tsc/test/build 13.2, Playwright 13.3, manual dev+browse 13.4, Final checkpoint.

### Explicit non-goals while closing tasks
- History rewrite for old `.env` blobs (tracked as pre-prod debt, not platform-completion task)
- Redis provisioning / Resend prod config
- Pricing calculations or commercial optimizers
- Rewriting Mission Control / unrelated UX already on main

### Definition of done for this plan
- All **non-optional** leaf tasks in `tasks.md` checked `[x]`
- Optional `*` tasks either completed or explicitly deferred with user consent (prefer complete)
- Completion suite green; no synthetic success on missing schema; bilingual keys only for new UI; tenant isolation preserved
