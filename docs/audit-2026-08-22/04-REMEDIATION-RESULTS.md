# ArabClue — Remediation Results

Session date: 2026-08-22 · Branch: `main` · Base commit: `5a3ef50`

Scope approved by the owner: **all Critical and High findings** from
[`03-GAP-ANALYSIS.md`](./03-GAP-ANALYSIS.md). Migrations authored **and
applied**. Commits made directly to `main`.

---

## 1. Verification

### Baseline (before any change)

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | pass, 0 errors |
| `bun run lint` | pass, 0 errors |
| `bun run test` | **3840 pass**, 13 skip, 0 fail — 184 files |
| Chromium-gated suites | 64 pass, 0 fail |

### After remediation

| Check | Result | Delta |
| --- | --- | --- |
| `bunx tsc --noEmit` | pass, 0 errors | unchanged |
| `bun run lint` | pass, 0 errors | unchanged |
| `bun run test` | **4025 pass**, 13 skip, **0 fail** — 199 files | +185 tests, +15 files |
| Chromium-gated suites | 64 pass, 0 fail | unchanged |
| `bun run build` | pass — 20 embedded font assets verified across 3 route traces | newly exercised |
| `bun run deploy:safety:repo` | pass | newly runnable in CI |
| `bun run scan:integrity` | pass, no findings | **had never run before** |

The 13 skips are the Chromium-gated tests, which are skipped in the offline run
by design and pass in the dedicated run above.

**No existing test was deleted or weakened.** Four were updated because they
asserted the defective behaviour directly, each noted below.

---

## 2. Completed — 32 items (29 of 34 approved, plus 3 late Criticals/High)

### Critical (4/4)

| # | Finding | Commit |
| --- | --- | --- |
| C1 | Cross-tenant project access via unvalidated `activeProjectId` | `d109137` |
| C2 | Admin could exfiltrate any env var to an arbitrary host via `apiKeyEnvKey` | `29c245f` |
| C3 | Conflicting unique keys made every email notification throw `P2002` | `59f01ef` |
| C4 | Stored XSS in the proposal builder preview | `e6c74ac` |

### High (25/30)

| # | Finding | Commit |
| --- | --- | --- |
| H1 | Cross-tenant marketplace reads (4 routes, incl. one found by the new test) | `d1e5d94` |
| H2 | Approval-policy editing was self-serviceable | `d1e5d94` |
| H4 | Comment `parentId` written unverified | `d1e5d94` |
| H5 | Export lifecycle transition on a `GET` | `12b7633` |
| H6 | Voice tool execution bypassed all schema validation | `d109137` |
| H7 | Browser-captured content auto-ran pipelines | `4681f55` |
| H9 | Bulk reconciliation trusted client-supplied payment state | `1b91146` |
| H10 | Analytics "archival" destroyed data; cron then scheduled | `1fd1ba2` |
| H11 | Bid package manifest falsely attested approval | `95f6812` |
| H12 | Certificate `filePath` fed the hash but was never persisted | `b65317b` |
| H13–H17 | Five fabricated-assurance surfaces | `b65317b` |
| H18 | Notification inbox permanently dead (double body read) | `a015600` |
| H19 | Arabic webfont never loaded on the primary PDF | `95f6812` |
| H21 | Saved active project clobbered on every load | `a015600` |
| H22 | `db/custom.db` tracked in Git | `4506605` |
| H23 | Hardcoded SUPER_ADMIN password in e2e setup | `4506605` |
| H24 | Credential scanner blind; `deploy:safety` never in CI | `4506605` |
| H25 | No Content-Security-Policy | `95f6812` |
| H26 | Readiness check looked at the wrong env var | `a015600` |
| H29 | `SKIP_EMAIL_VERIFICATION` had no production guard | `4506605` |
| H30 | Integrity scanner unrunnable; stale generated SQL | `12b7633` |
| H3 | Builder route bypassed four safeguards | `ec2b381` |
| H20 | Dashboard navigation desynced the URL | `145557b` |
| H27 | Auth hardening (limiter, MFA seal, TOTP replay, recovery codes, scrypt params) | this session |

### Migrations applied to the shared Neon database

Both are strictly additive or index-only, applied with `prisma migrate deploy`,
and verified by querying `pg_indexes` / `information_schema` afterwards.

| Migration | Effect | Verified |
| --- | --- | --- |
| `20260822170000_notification_delivery_channel_unique` | Drops the subsuming `(eventId, recipientId)` unique index | Subsuming index absent, channel-scoped key present |
| `20260822180000_analytics_daily_summary` | Creates `AnalyticsDailySummary` + 3 indexes | Table, columns, and all indexes present |
| `20260822190000_auth_hardening_mfa` | Adds `pendingMfaSecret`, `mfaLastUsedStep`, `MfaRecoveryCode` | Applied with `prisma migrate deploy` |

`prisma migrate status` reported 20 applied and 0 pending before the session;
22 applied and 0 pending after the first remediation wave. H27 adds a 23rd
additive migration.

---

## 3. Tests added

147 new assertions across 13 files, each pinning a specific regression so the
bypass fails CI rather than shipping.

| File | Covers |
| --- | --- |
| `tenant-project-isolation.test.ts` | `resolveOwnedProjectId`; asserts the **query shape**, not just the return value |
| `voice-tool-validation.test.ts` | Tool arg validation; fails closed on an unevaluatable schema |
| `provider-api-key-allowlist.test.ts` | Named platform secrets stay rejected; prefix-boundary cases |
| `markdown-preview-escaping.test.ts` | 7 XSS payloads plus payloads inside markdown constructs |
| `notification-delivery-constraints.test.ts` | Schema declares exactly one, channel-scoped, unique key |
| `marketplace-visibility.test.ts` | Visibility matrix across own/other/system × private/public |
| `review-authorization.test.ts` | Manager-only policy edit; assignment-bound decisions |
| `reconciliation-trust.test.ts` | No apply path forwards client provider state |
| `cron-registration.test.ts` | Every cron route on disk is scheduled |
| `security-headers.test.ts` | CSP directives; existing headers retained |
| `pdf-font-embedding.test.ts` | PDF path embeds fonts; renderer still blocks the network |
| `no-fabricated-assurance.test.ts` | Zero invented metrics; no unconditional compliance claim |
| `export-lifecycle-guard.test.ts` | Role, origin, and prefetch gates on the transition |
| `autopilot-confirmation.test.ts` | Confirmation gate precedes project creation |
| `auth-hardening.test.ts` | Sealed MFA secrets, TOTP replay, recovery codes, dual login keys |
| `auth-hardening-guards.test.ts` | Setup stages pending secret; admin cannot invent MFA |

### Existing tests updated (not weakened)

| File | Why |
| --- | --- |
| `__tests-isolated/env-settings.test.ts` | Asserted the vulnerable contract using arbitrary env names; now uses an allowlisted name and adds explicit rejection cases for named platform secrets |
| `__tests-isolated/notification-delivery.test.ts` | The fake enforced no unique constraint at all — which is how the production bug hid. It now raises `P2002` like Postgres |
| `__tests__/migration-registry.test.ts` | Added a documented, per-index exemption plus a test proving the exemption does not leak to other migrations |
| `__tests__/proposal-download-format.test.ts` | Added the new `mutationAllowed` input and a case asserting no promotion without it |

---

## 4. Remaining — 2 of 34

H8, H20, and H27 were completed after the first remediation wave.

### H8 — Nineteen sites return raw `err.message` to clients
**Done in `7f8c289`.** Routes now go through `toErrorResponse` / `redactSensitiveText`.

### H20 — Dashboard navigation desyncs the URL
**Done in `145557b`.** Reconciliation lives in `use-view-router`, so a new
`setView` call cannot desync the URL.

### H27 — Auth hardening set
**Implemented this session.** Dual-key login limiter (email + IP); `mfaSecret`
sealed with AES-GCM on write and re-sealed from plaintext on next use;
`pendingMfaSecret` so setup no longer disables the live factor; TOTP last-used
step + hashed recovery codes; scrypt hashes encode `N/r/p/keylen` and rehash
on login. Additive migration `20260822190000_auth_hardening_mfa`.

### H28 — Monetary columns are `Float`
**Effort ~4h, needs a careful data migration.** `schema.prisma:654,689,707,734`
use double precision, contradicting the exact-decimal design the recurring
billing state machine already implements. This is the one change that can lose
data on a live database and should use expand-migrate-contract: add `Decimal`
columns, backfill, dual-write, verify, then drop. **Recommend testing on a Neon
branch first — the Neon CLI is not currently installed in this workspace.**

### Not a code change — credential rotation
`deploy:safety --scope=deploy` reports `.env` present in Git history across four
commits including the initial one, plus historical credentials in `AGENTS.md`,
`scripts/ensure-devtest.ts`, and `DEPLOY_ARABCLUE_COM.md`. **Rotation is the
mitigation**; once rotated the historical values are worthless and a history
rewrite becomes optional cleanup. Not performed here: it is an operator action,
and rewriting `main` history breaks every clone.

---

## 5. Findings corrected during remediation

Three reported findings did not survive verification and were re-scoped rather
than "fixed" as reported.

1. **"Any authenticated member can approve any review."** Not accurate.
   `decideProposalReview` already rejects a caller who is not the assigned
   reviewer (`REVIEW_REVIEWER_MISMATCH`). The real gap was one level up:
   approval-policy editing required only `writer`, so a member could name
   themselves sole approver. That is what was fixed.

2. **"The readiness probe always reports ok."** Overstated. Only the
   `rateLimit` facet is unconditional, and a code comment shows that is a
   deliberate decision for single-node hosts. Left alone. The genuine defect
   beside it — `ensureDatabaseReady` reading `DATABASE_URL` while Prisma prefers
   `POSTGRES_PRISMA_URL` — was fixed.

3. **"Hardcoded budgets and evaluation splits are surfaced as analysis."**
   Partly. `typicalBudget` is only an input placeholder, and `ingestion.ts` uses
   the splits as a documented fallback that records evidence when a detected
   value differs. Only `generators.ts` was a real problem, printing them into
   the delivered document; both locales now label them as a category default.

Two findings were **downgraded out of scope** after confirming the deployment is
Vercel-production-only: the MyFatoorah webhook fail-open and the `crypto.ts`
dev-key fallback both guard on `NODE_ENV !== "production"` and are therefore
unreachable in production. They remain real for local development.

---

## 5b. Late findings from the re-run auth/admin/billing mapper

The mapper covering `auth`, `admin`, `billing` and `cron` errored on its first
attempt and was re-dispatched; it reported after the main remediation pass. It
found two further Criticals in the **same family as C2** — an administrator
reading a platform secret in cleartext — plus a functional break in the
invitation flow. All three are fixed (`5fa4c15`).

| # | Finding | Status |
| --- | --- | --- |
| C5 | Env secrecy derived from a naming heuristic, so `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `REDIS_URL`, `BLOB_READ_WRITE_TOKEN`, `VECTOR_DB_URL` and `WEBHOOK_URL` were served unmasked and unaudited to any ADMIN | fixed |
| C6 | `PATCH /api/admin/env/[key]` accepted `isSecret:false` on any key, letting an ADMIN downgrade `NEXTAUTH_SECRET` then read it — and wrote no audit | fixed |
| H31 | `/api/invitations/accept` missing from the proxy's `PUBLIC_PATHS`, so the unauthenticated invitee the route exists to serve was rejected before it ran | fixed |

C5 and C6 are the third and fourth instance of the pattern this audit is built
around: a naming heuristic where an allowlist belongs. The fix mirrors C2 —
`NON_SECRET_ENV_KEYS` is a positive allowlist, everything else is secret, and
secrecy can be raised by data but never lowered by it.

### Additional High findings from that mapper, not yet addressed

These are **new** and are not counted in the 34 originally approved. They are
recorded here rather than fixed, because they arrived after the remediation
pass and several need design decisions.

| Finding | Location |
| --- | --- |
| SUPER_ADMIN protection nested inside `if (body.role)`, so an ADMIN can send `{active:false}` or `{mfaEnabled:false}` against a SUPER_ADMIN | `admin/users/[id]/route.ts:27` |
| Direct `workspaceMember.create` bypasses the invitation service's seat allowance, token, expiry and invitee consent | `workspaces/route.ts:148` |
| Cron secret accepted from `?secret=`, every cron route exports `GET`, and the comparison is not constant time | `lib/cron-auth.ts:24` |
| ADMIN can rotate the MyFatoorah API key and webhook secret, bypassing the SUPER_ADMIN gate that guards the same rows via `/api/admin/env` | `admin/myfatoorah/route.ts:202` |
| Unauthenticated credential oracle: no audit on failure, no reserved-identity check, email-only rate key, returns the account holder's name | `auth/precheck/route.ts:48` |
| Recurring-charge handler failures are swallowed and fall through to `PROCESSED` + HTTP 200, so the provider never retries an unapplied charge | `billing/webhook/route.ts:178` |
| `take:100` with no cursor and no "already notified" predicate, so logged rows permanently occupy the scan window | `cron/expiry-notifications/route.ts:30` |
| Raw `err.message` returned to the client; `body.apiBase` is an unvalidated fetch target used with a bearer credential | `admin/ai-providers/models/route.ts:42` |
| Eleven of fourteen admin handlers predate the controller: no `try/catch`, no Zod, hand-rolled 403s, Prisma errors escape as 500s | `admin/**` |

---

## 6. One new finding discovered during remediation

Widening the credential scanner (H24) immediately surfaced something the
three-path allowlist could never see, and which was not in the original audit:

> `.env` is present in Git history across four commits including the initial
> commit, and was later untracked.

This is the single most consequential item still open, and it is resolved by
rotation rather than by code.
