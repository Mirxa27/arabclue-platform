# ArabClue — Prioritized Gap Analysis

Audit date: 2026-08-22 · Baseline: `tsc` clean, `lint` clean, **3,904 tests passing, 0 failing**

Scope filter applied: **Critical and High only.** Medium and Low findings
(~180 of them) remain catalogued in [`subsystems/`](./subsystems/) for later.

Deployment context confirmed with the owner: **Vercel production only, no
internet-reachable non-production environment; private repository.** Two
findings were downgraded out of this list as a direct result — see §7.

Every item below was verified by reading the code. Nothing here is inferred
from documentation or from another agent's report without independent check.

---

## 0. How to read this

Ordering is by **expected loss × reachability**, not by CVSS-style severity
alone. An item that needs an ADMIN session ranks below one that any
authenticated tenant can reach.

Effort is engineering time for the fix **plus** its regression test.

---

## P0 — Critical. Production-reachable, fix before anything else.

### C1. Cross-tenant project access via unvalidated `activeProjectId`

**Where** `src/lib/agents/platform/main-agent.ts:42`, `src/app/api/platform-agent/missions/[id]/autopilot/route.ts:83-86`, `src/lib/agents/orchestrator.ts:169,174`

`buildPlatformAgentContext` stores a caller-supplied `activeProjectId` with no
ownership check. Every other field in that context (`workspace`, `userId`,
`role`, `isAdmin`, `canWrite`) is correctly derived from the server session;
this one crosses the trust boundary unchecked. It reaches the database through
three client-controlled entry points — the autopilot request body, the realtime
voice `opts`, and the chat route — and the orchestrator then queries on it with
no workspace predicate:

```ts
// orchestrator.ts:169,174 — no workspaceId filter
const project = await db.tenderProject.findUnique({ where: { id: opts.projectId } });
const docs = await db.uploadedDocument.findMany({ where: { projectId: opts.projectId } });
```

**Impact** An authenticated tenant posts another workspace's project id to the
autopilot endpoint. The route writes to the victim's project
(`tenderProject.update → status: "PARSING"`, line 167), then runs the full
six-agent pipeline over the victim's uploaded documents, emitting generated
analysis into the **attacker's** workspace. Cross-tenant read *and* write.

**Fix** Add `assertProjectInWorkspace(projectId, workspaceId)` and call it at
each of the three boundaries; add `workspaceId` to both orchestrator queries.
`/api/agents/run:92-93` already does this correctly via `assertWorkspaceMatch` —
mirror it.

**Effort** ~2h · **Risk** very low, additive guard only

---

### C2. Admin can exfiltrate any environment variable to an arbitrary host

**Where** `src/lib/env-settings.ts:6-13,32-41`, `src/lib/llm/index.ts:295`

```ts
export async function getDecryptedEnv(key: string): Promise<string> {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.length > 0) return fromProcess;
```

`resolveProviderApiKey(provider, apiKeyEnvKey)` passes an admin-supplied string
into that lookup, so it reads **any** environment variable by name. The admin
AI-providers UI exposes both `apiKeyEnvKey` and `apiBase` as free-text inputs
(`ai-providers.tsx:779`, `:1297`).

**Impact** An admin sets `apiKeyEnvKey = "NEXTAUTH_SECRET"` (or
`ARABCLUE_ENC_KEY`, `DATABASE_URL`, `MYFATOORAH_API_KEY`) and `apiBase` to a host
they control, then triggers any AI call. The platform sends that secret as a
bearer token to that host. `NEXTAUTH_SECRET` then forges any session including
SUPER_ADMIN; `ARABCLUE_ENC_KEY` decrypts every stored provider secret. One admin
credential becomes total platform compromise, and the secret leaves the network.

**Fix** Allowlist `apiKeyEnvKey` against `defaultApiKeyEnvKey(provider)` plus a
known set; allowlist `apiBase` hosts. `myfatoorah.ts` already implements exactly
this URL-allowlist pattern — reuse it.

**Effort** ~3h · **Risk** low; may reject existing non-standard provider rows, so
migrate-and-warn rather than hard-fail on read

---

### C3. Every email notification fails — conflicting unique constraints

**Where** `prisma/schema.prisma:1632-1633`, migration `20260726000000_platform_completion:484-487`, `src/lib/notification-service.ts:189,256,280`

```prisma
@@unique([eventId, recipientId])
@@unique([eventId, recipientId, channel])
```

The two-column key strictly subsumes the three-column one, so only one delivery
row can exist per (event, recipient) and the `channel` column is unreachable.
`notification-service.ts` writes the in-app row first (line 189, `create`), which
consumes the slot; both email branches — line 256 (`EMAIL_UNCONFIGURED`) and line
280 (real send) — then `create` a second row and throw `P2002`.

**Impact** Email notification delivery is broken platform-wide. An unset
`RESEND_API_KEY` does not mask it, because both branches are affected. Twelve
tests pass because the test fake models only the three-column key — the suite is
green against a database shape that does not exist.

**Fix** Drop `@@unique([eventId, recipientId])` in the schema, add a migration
dropping the index, and correct the test fake to model both keys so this class of
drift is caught in future.

**Effort** ~2h · **Risk** low; dropping a redundant constraint is safe, but the
migration must run against the shared Neon database as an explicit release step

---

### C4. Stored XSS in the proposal builder preview

**Where** `src/components/dashboard/proposal-builder-preview.tsx:224-256`

`MarkdownPreview` hand-rolls a regex markdown→HTML conversion with **no
escaping** and injects the result via `dangerouslySetInnerHTML`. The repository
already has a correct escaping renderer in `src/lib/markdown.ts` that every other
preview surface uses.

**Impact** Proposal sections are shared across workspace members, can be
AI-populated from uploaded tender documents, and can arrive from marketplace
templates. `<img src=x onerror=…>` executes in a reviewer's authenticated
session. Stored, cross-user.

**Fix** Delete `MarkdownPreview` and call `markdownToHtml` from `lib/markdown.ts`.
Add a guard test asserting no component outside `lib/markdown.ts` builds HTML
from user content.

**Effort** ~1h · **Risk** very low; strictly narrows what renders

---

## P1 — High. Tenant isolation and authorization.

### H1. Marketplace routes leak cross-tenant private templates
`templates/marketplace/[id]/route.ts:30-38`, `/use:37-46`, `/rate:22-31` — bare
`{ id }` lookup with no workspace or `isPublic` predicate. `/use` **copies** the
resolved template into the caller's workspace. Same missing predicate duplicated
three times because the resolver was copy-pasted. **Fix:** one shared
`resolveMarketplaceEntry(id, workspaceId)`. ~2h.

### H2. `requireReviewerAction()` performs no role check
`src/lib/auth.ts:434-438` returns the session unchanged despite a comment
claiming an "explicit role check". It is the only authorization on
`PATCH /api/reviews/[id]`, so any authenticated member can approve or reject a
proposal review. **Fix:** enforce the intended role set; decide explicitly
whether authors may self-approve. ~1h.

### H3. `proposals/builder` bypasses four safeguards at once
`api/proposals/builder/route.ts:13,63,107,102-139` — raw `getServerSession` (no
writer role, so REVIEWER can overwrite proposals; no MFA step-up), body-supplied
`projectId` written with no ownership check, and `deleteMany` followed by N
un-transacted `create`s so one failure leaves the proposal with zero sections.
**Fix:** move to `withTenant("writer")`, validate `projectId`, wrap in a
transaction. ~3h.

### H4. Comment `parentId` written unverified
`api/collaboration/comments/route.ts:105,119` — allows injecting attacker content
into another workspace's comment thread via the `replies` include. ~1h.

### H5. Export state mutation on a `GET`
`api/proposals/[id]/download/route.ts:162,166,1054` — the APPROVED→EXPORTED
transition runs on `GET`, gated only by `requireSession`, making it
CSRF- and prefetch-reachable and available to REVIEWER. **Fix:** move the
transition to `POST`, require writer. ~2h.

### H6. Agent tool execution bypasses all input validation
`src/lib/agents/platform/realtime.ts:203-207` calls `tool.execute(args)` directly.
The AI SDK enforces `inputSchema` in the tool-calling loop, not inside `execute`,
so the voice endpoint is an unvalidated RPC over ~40 tools. **Fix:** parse
`inputSchema` before dispatch. ~2h.

### H7. Untrusted web content auto-runs pipelines with no approval gate
`extension/ingest/route.ts:98` → `autopilot.ts:159,285` — page content ingested by
the browser extension is heuristically classified and, above a confidence floor,
creates a project and starts a full pipeline with no human confirmation. Combined
with C1 this is the highest-leverage prompt-injection surface. **Fix:** require
explicit confirmation before autopilot creates or runs anything. ~3h.

### H8. Nineteen sites return raw `err.message` to clients
e.g. `api/documents/route.ts:131-134`, which additionally picks 4xx vs 5xx by
regex over an English exception message. Exposes Prisma schema and constraint
detail. **Fix:** route through the existing `ApiFailure` mapper. ~3h.

---

## P2 — High. Money and data integrity.

### H9. Bulk reconciliation fabricates payment confirmations
`admin/billing-reconciliation.tsx:208-217` sends `providerState: "PAID"` with
`invoiceValue: null` for every selected row; `applyReconciliation` accepts it and
never calls `getPaymentStatus`. The GET report deliberately lists checkouts whose
provider state is `FAILED`/`EXPIRED`/`CANCELLED`, so "select all → bulk apply"
marks them paid. Nulled amounts also defeat the mismatch guard. **No malice
required — ordinary UI use corrupts revenue data.** The legacy single-apply path
in the same file does verify against the provider. **Fix:** server re-verifies
via `getPaymentStatus`; ignore client-supplied `providerResult`. ~3h.

### H10. Analytics "archival" permanently destroys data — **and must be fixed before the cron is registered**
`analytics-retention.ts:157-165` computes daily summaries, returns them to the
caller, and never persists them; no `AnalyticsDailySummary` model exists. Then it
deletes the raw rows. `deleteExpiredEvents` additionally ignores its `limit` and
deletes unbounded in one transaction.

> **Ordering hazard.** This is currently inert *only* because
> `/api/cron/analytics-retention` is absent from `vercel.json`. Registering that
> cron as an isolated one-line ops fix — which is exactly how it reads in
> isolation — starts permanently deleting 90-day-old analytics on the next run.
> **Do not touch `vercel.json` until the archival writes something.**

**Fix:** add an `AnalyticsDailySummary` model + migration, persist buckets in the
same transaction as the delete, honour `limit`, *then* register the cron. ~5h.

### H11. Bid package manifest falsely attests approval
`structured-bid-package.ts:102-105` hardcodes `status: "APPROVED"` three lines
above `approvedAt: null`, and passes `contentMd: ""` so the published
`contentHash` is a constant SHA-256 of the empty string. This manifest is the
integrity artifact shipped to the tender buyer. **Fix:** pass real status and
content. ~2h.

### H12. Certificate `filePath` drives the hash but is never persisted
`api/certificates/route.ts:91,101,165-182` — hash and row diverge, and an
approval is lost for an edit that never happened. ~2h.

---

## P3 — High. Product integrity (things shown to users that aren't real).

For a compliance product sold to government-tender bidders, fabricated assurance
is a commercial and legal risk, not a cosmetic one.

| # | Where | What is fabricated |
| --- | --- | --- |
| H13 | `mission-pipeline-bar.tsx:100-141` | Timer-driven fake pipeline progress — checkmarks, "n/5", "NN%" — rendered identically to real agent work |
| H14 | `admin/overview.tsx:157-178` | Unconditional "Security Hardening Active" / "PDPL Compliant" banner backed by no data |
| H15 | `template-marketplace-catalog.ts:37-40` (+5) | System templates ship invented `rating`, `ratingCount`, `downloadCount` presented as community metrics |
| H16 | `constants.ts:302-374` | Hardcoded typical budgets, SLA penalty percentages and evaluation weight splits surfaced as analysis |
| H17 | `page-header.tsx:13-19,31` | Default "C1 Compliance" badge renders on 14 of 22 views, asserting a level nothing computed |

**Fix:** render real values, or render an explicit empty/unknown state. The
codebase already has this discipline — `procurement-rules.ts` refuses to invent
facts and attaches citations. Extend it. ~4h total.

---

## P4 — High. Broken or unreachable features.

### H18. Notification inbox is permanently dead
`topbar.tsx:88-96` reads the response body twice, so the query always throws.

### H19. Arabic webfont never loads on the primary PDF deliverable
`generators.ts:168-169` emits a remote Google Fonts `<link>`; `html-to-pdf.ts:268`
aborts every network request. Confirmed live on
`GET /api/proposals/[id]/download?format=pdf` via `generateProposalPDF` (line 683).
The structured engine solves this by base64-embedding fonts, and
`bilingual-pdf.ts:437` has a `REMOTE_FONT_REQUEST` inspector that would catch it —
it just doesn't run on the legacy path. **Fix:** inline fonts in the legacy
builder; extend the inspector to both paths. ~3h.

### H20. Dashboard navigation desyncs the URL
`useNavigateToView` exists and has **zero consumers**; ~50 in-content buttons call
`setView` directly, which never touches the URL. Reload, back/forward and link
sharing all break. The sidebar is the only correct navigation surface. ~4h.

### H21. Saved active project is clobbered on every load
`use-ensure-active-project.ts:1-46` treats the loading state as "no projects" and
overwrites the persisted `activeProjectId` with `projects[0]`. ~1h.

---

## P5 — High. Infrastructure and supply chain.

### H22. `db/custom.db` — 360 KB SQLite tracked in Git
Contains 2 `User` rows (password hashes, `mfaSecret` column) and 15 encrypted
`EnvSetting` rows. Present in history (`b0aea0b`, `952b141`, `08d413f`); no
`.gitignore` rule matches it. A legacy artifact from the pre-Postgres era.
Private repo limits exposure to people with clone access, but those 15 rows are
decryptable offline by anyone holding the repo. **Fix:** `git rm --cached`, add
the ignore rule, rotate the two credentials and the fifteen settings. History
rewrite optional given the repo is private. ~1h + rotation.

### H23. Hardcoded SUPER_ADMIN password in e2e setup
`e2e/completion/global-setup.ts:9` upserts a plaintext SUPER_ADMIN password into
whatever `DATABASE_URL` names, with none of the host guards
`scripts/ensure-devtest.ts` correctly applies. Against the shared Neon database
this creates a real privileged account. ~1h.

### H24. The credential scanner cannot see the credential
`scripts/check-deployment-safety.mjs:73` scans a hardcoded three-path allowlist,
so it never scans the file in H23. And `deploy:safety` — the strongest gate in
the repo — **never runs in CI** (`package.json:20`). ~2h.

### H25. No Content-Security-Policy
`next.config.ts:59` sets `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` and HSTS, but no CSP and no
`frame-ancestors`, in an application that renders user markdown and stored
contract HTML. Directly mitigates C4's blast radius. ~3h.

### H26. Readiness probe cannot fail, and the DB check is wrong
`production-readiness.ts:48` always reports ok. Separately,
`ensure-db.ts:21-26` requires `DATABASE_URL` while `db.ts:9` prefers
`POSTGRES_PRISMA_URL` — which is what Vercel+Neon provides — so the boot-time
readiness check always fails on your deployment, silently, because
`instrumentation.ts` catches it. ~2h.

### H27. Auth hardening set
Grouped because they share one file and one test: login limiter keyed on email
only (`auth.ts:107-111` — enables password spraying across accounts *and*
lockout of a known victim); `User.mfaSecret` stored plaintext
(`schema.prisma:50`) despite AES-GCM being available; no TOTP replay ledger and
no recovery codes (`mfa.ts:11-14`); scrypt at Node defaults with no parameters
encoded in the hash, so there is no rehash-on-login upgrade path
(`password.ts:15,27`). ~6h.

### H28. Money stored as `Float`
`schema.prisma:654,689,707,734` use double precision for monetary columns,
contradicting the exact-decimal design the recurring-billing state machine
implements. **Fix:** migrate to `Decimal`. ~4h, needs a careful data migration.

### H29. `SKIP_EMAIL_VERIFICATION` has no production guard
`email-verification-policy.ts:19`. Currently `true` in the working `.env`.
Make it throw when `NODE_ENV === "production"`. ~30min.

### H30. Orphaned safety tooling
`scripts/scan-integrity.ts` uses `#!/usr/bin/env tsx` but `tsx` is not a
dependency and nothing invokes it — the full-tree integrity scan has never run.
`src/lib/schema-sql.ts` is 3.3× stale (44 KB committed vs 147 KB regenerated,
missing 13 of 20 migrations) with zero importers. ~1h to wire or delete.

---

## 6. Systemic root cause

Every P0 and most P1/P2 items are instances of one pattern:

> **The correct implementation already exists in the repository, and a parallel
> call path bypasses it.**

See §7 of [`01-ARCHITECTURE-MAP.md`](./01-ARCHITECTURE-MAP.md) for the full
eleven-row table. The consequence for remediation is that most fixes are
*deletions plus a redirect to an existing helper*, which is low-risk against a
green 3,904-test baseline — and that each one should be paired with a guard test
so the bypass cannot reappear.

---

## 7. Downgraded after confirming deployment context

Both guard on `NODE_ENV !== "production"` and are therefore **not reachable on a
Vercel-production-only deployment**. Retained as local-hygiene items:

- `myfatoorah.ts:603-605` — webhook signature verification returns `true` when no
  secret is configured outside production.
- `crypto.ts:11-20` — hardcoded `sha256("arabclue-insecure-dev-only")` master-key
  fallback outside production.

They still matter for local development (the current `.env` has no
`MYFATOORAH_WEBHOOK_SECRET`, so the dev instance accepts forged payment
webhooks), and they are the reason H22's encrypted rows may be trivially
decryptable.

---

## 8. Explicitly do not do

1. **Do not add `/api/cron/analytics-retention` to `vercel.json`** until H10 is
   fixed. It is the one change in this document that converts a dormant defect
   into active data loss.
2. **Do not run `prisma migrate dev`, `db push`, or `db reset`** against the
   shared Neon database. C3 and H28 need migrations authored and applied as an
   explicit, reviewed release step.
