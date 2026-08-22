# ArabClue — API Audit: `auth` / `admin` / `billing` / `cron` / platform routes

Repository: `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
Scope: `src/proxy.ts` + 51 route files (5,457 LOC) under `src/app/api/{auth,admin,billing,cron,health,ready,files,notifications,invitations,workspaces,staff,onboarding,restrictions,approval-policy}`.
Method: every in-scope file read in full with the Read tool; callers resolved by ripgrep across `src/components`, `src/app`, `src/hooks`, `e2e`, `scripts`, `vercel.json`. No repository file was modified; no build/test/db command was run.

Findings marked **[NEW]** were verified by reading code in this pass. Items the brief listed as already-known are noted but not re-reported as new.

---

## 0. Request-boundary primitives (read for context, not deeply audited)

### `src/proxy.ts` (177 LOC) — Next.js 16 middleware
Runs before every non-static request. Order of checks:
1. `!token && isAppPath(path)` → redirect to `/login`, persist requested path in signed `RETURN_TO_COOKIE` (30 min).
2. `token.mustChangePassword` → API paths get a hand-rolled `{error, code:"MUST_CHANGE_PASSWORD"}` 403 (not the bilingual `ApiFailure` shape); pages redirect to `/login?changePassword=1`. Allowed: `/login`, `/api/auth/*`.
3. `token.emailVerified === false` → bilingual `EMAIL_VERIFICATION_REQUIRED` 403 for API, redirect to `/verify-email` for pages. Allowlist matched with `String.includes`, not equality.
4. `path.startsWith("/api/admin")` → requires token role `SUPER_ADMIN` or `ADMIN`, else plain `{error:"Forbidden"}` 403.

`authorized` callback returns `true` for `isPublicPath(path)` and for `isAppPath(path)`; otherwise requires a token. `isPublicPath` treats **all** of `/api/auth/*` and **all** of `/api/cron/*` as public.

Matcher: `/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`.

### `src/lib/api-controller.ts` (308 LOC)
- `withTenant(mode, handler, label)` → `requireSession()`, optional `canWriteRole` gate, a second DB read of `emailVerified`, then `getTenantContext(userId)`; errors funnelled through `toErrorResponse`.
- `withAdmin(handler, label)` → `requireSession()` + explicit `SUPER_ADMIN|ADMIN` check (so admin routes do **not** depend on the proxy alone). Note: it does **not** distinguish `SUPER_ADMIN`.
- `withPublicRoute` / `handleRoute` → error mapping only.
- `parseJsonBody` / `parseSearchParams` / `parseWithSchema` → Zod, throwing `RequestValidationError`.
- `requireWorkspaceRole`, `requireTenantRecord`, `requireTenantOwnership` → tenant assertions.

### `src/lib/api-failure.ts` (461 LOC)
Central bilingual mapper. `mapErrorToApiFailure` never echoes `err.message` to a client: unknown throws become a generic `INTERNAL_ERROR` 500. `failureLogRecord` redacts SQL, credentials, bearer tokens, `sk-…` keys, ≥40-char blobs and decimal amounts, truncated to 200 chars. Only `status >= 500` (or `SCHEMA_MIGRATION_PENDING`) is logged. **This is a strong design** — every deviation from it in a route is a finding below.

### `src/lib/auth.ts` (465 LOC)
NextAuth v4 credentials + JWT, 12 h `maxAge`. `authorize()` rate-limits `login:<email>` at 10/15 min, blocks reserved dev identities, verifies password with `verifyPassword`, verifies TOTP when `mfaEnabled`, creates a `UserSession` row (server-side revocation list), audits.
`jwt()` refreshes role/active/mfa/mustChangePassword/email/emailVerified from the DB at most every 60 s and revokes the token when the `UserSession` row is gone or expired.
`requireSession(opts)` returns `null` when: no `user.id`, or `mfaEnabled && !mfaVerified`, or `mustChangePassword` (unless `allowMustChangePassword`); and **throws** `EmailVerificationRequiredError` when unverified (because `getRequestPathForVerificationCheck()` is hard-coded to `""`, the allowlist branch is dead).
`canGrantRole(actor, target)`: `SUPER_ADMIN` → anything; `ADMIN` → anything except `SUPER_ADMIN`/`ADMIN`; everyone else → false.

### `src/lib/rate-limit.ts` (565 LOC)
Sliding window; Redis when `REDIS_URL` is set, in-memory otherwise. `requiresDistributedRateLimit` only fails closed when Redis is actually configured. Two notes for later: the sync `rateLimit()` export has two identical branches (always memory), and in-memory buckets are per-instance, so on Vercel every concurrent lambda gets its own quota.

### `src/lib/cron-auth.ts` (32 LOC)
```ts
const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
if (bearer === secret || headerSecret === secret || querySecret === secret) return null;
```
Requires `CRON_SECRET` ≥ 16 chars (503 `CRON_NOT_CONFIGURED` otherwise). Accepts the secret in a **query string** and compares with `===` (not constant time).

---

## 1. File-by-file map

### 1.A `src/app/api/auth/**`

---

#### `src/app/api/auth/[...nextauth]/route.ts` — 6 LOC
- **Handlers / config:** `GET`, `POST` (NextAuth handler). No `runtime`/`dynamic`/`maxDuration`.
- **Purpose:** Mounts NextAuth v4 with `authOptions`.
- **Imports:** `next-auth`, `@/lib/auth`.
- **Callers:** `next-auth/react` `signIn`/`signOut`; `src/app/login/page.tsx:151` reads `/api/auth/session`.
- **Validation:** NextAuth internal; `authorize()` does manual `trim()/toLowerCase()` — no Zod on the credentials payload.
- **AuthN/Z:** public by design (`isPublicPath` → `/api/auth*`).
- **Edge cases handled:** rate limit, inactive user, reserved dev identity, MFA, session revocation list, bootstrap failure.
- **Not handled:** no account lockout after repeated failures (only a rolling 10/15 min window keyed on email — trivially reset by waiting, and unlimited across distinct emails); no TOTP replay counter.

---

#### `src/app/api/auth/register/route.ts` — 101 LOC
- **Handlers:** `POST` (+ exported `handleRegister` for injection). `export const dynamic = "force-dynamic"`.
- **Purpose:** Self-serve registration; a thin boundary over `AccountService.register`.
- **Imports:** `withPublicRoute`, `jsonApiFailure`, `jsonOk`, `createPrismaAccountService`, `tr`.
- **Callers:** `src/app/register/page.tsx:37`; `e2e/completion/stateful-isolated.spec.ts:20`; unit tests import `handleRegister`.
- **Validation:** none in the route — raw body handed to the service, which returns `REGISTRATION_INVALID` + `fieldPaths`.
- **Output:** `200/201 {ok, code, message{ar,en}, emailDelivery, verificationRequired, account}`; failures 400/409/429 via the bilingual mapper.
- **AuthN/Z:** public.
- **Edge cases handled:** unreadable body → `null` → domain validation; per-source-address rate limit inside the service; reserved-identity-before-uniqueness ordering.
- **Not handled:** `getClientIp` trusts the first `X-Forwarded-For` entry without checking a trusted-proxy count, so the per-address limit is spoofable by adding a header.

---

#### `src/app/api/auth/precheck/route.ts` — 70 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Validates email+password *before* the NextAuth call so the login page can decide whether to prompt for a TOTP.
- **Imports:** `db`, `verifyPassword`, `getBootstrapContext`, `parseJsonBody`+`authPrecheckSchema` (from `@/lib/validation`, the `{ok,response}` variant), `withPublicRoute`, `rateLimitAsync`.
- **Callers:** `src/app/login/page.tsx:71`.
- **Validation:** Zod `authPrecheckSchema` = `{email, password:min(1)}`.
- **Output:** `200 {ok:true, mfaRequired, name}` / `401 {ok:false,error:"invalid_credentials"}` / 429|503 `{error}`.
- **AuthN/Z:** public.
- **Edge cases handled:** inactive user → same 401 as unknown user; rate limit 20/15 min keyed on `precheck:<email>`.
- **Not handled:** no audit entry on failure (unlike `authorize()`), no reserved-development-identity check, no `mustChangePassword`/`emailVerified` consideration, no IP-based limit, and it returns the account holder's real `name` on success.

---

#### `src/app/api/auth/forgot-password/route.ts` — 90 LOC
- **Handlers:** `POST` (+ `handleForgotPassword`). `dynamic = "force-dynamic"`.
- **Purpose:** Requests a password-recovery token.
- **Callers:** `src/app/forgot-password/page.tsx:32`.
- **Validation:** delegated to `RecoveryService.requestRecovery`.
- **Output:** always `202`-style `{ok:true, code, message{ar,en}}` regardless of whether the address exists (deliberate anti-enumeration); `RECOVERY_RATE_LIMITED` with `retryAfterSeconds` otherwise.
- **AuthN/Z:** public.
- **Edge cases handled:** unknown/invalid address shares the success body; rate limit keyed on the **normalized email** (`recovery:req:<email>`), so one attacker cannot lock out an unrelated victim's *IP*, but can burn a specific victim's request budget.
- **Not handled:** no source-address (IP) limb on the limiter, so a single host can enumerate/spam many addresses at `limit` each.

---

#### `src/app/api/auth/reset-password/route.ts` — 92 LOC
- **Handlers:** `POST` (+ `handleResetPassword`). `dynamic = "force-dynamic"`.
- **Purpose:** Consumes a recovery token and replaces the password.
- **Callers:** `src/app/reset-password/page.tsx:54`.
- **Output:** `{ok:true, code, message}`; `RECOVERY_TOKEN_INVALID` / `RECOVERY_PASSWORD_REJECTED` (+`fieldPaths`) / `RECOVERY_RATE_LIMITED`.
- **AuthN/Z:** public; token is the only authority.
- **Edge cases handled:** rate limit keyed on **source address** here (`recovery:reset:<ip>`), atomic hash-replace + token-consume + session revocation inside the service.
- **Not handled:** no per-token attempt counter — the IP limb is bypassed by rotating `X-Forwarded-For`.

---

#### `src/app/api/auth/verify-email/route.ts` — 84 LOC
- **Handlers:** `POST` (+ `handleVerifyEmail`). `dynamic = "force-dynamic"`.
- **Purpose:** Consumes an email-verification token.
- **Callers:** `src/app/verify-email/page.tsx:37`; allow-listed in `proxy.ts` and `auth.ts`.
- **Output:** `{ok, code, message, userId, verifiedAt}`; `VERIFICATION_TOKEN_INVALID` / `VERIFICATION_RATE_LIMITED`.
- **AuthN/Z:** public; token is the only authority.
- **Note:** returns `userId` on success — a token holder learns the internal user id (low impact, but it is an identifier the caller did not otherwise have).
- **Not handled:** there is **no resend-verification route in scope**; `/verify-email` can only consume, never re-request.

---

#### `src/app/api/auth/password/route.ts` — 72 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Self-service password change; clears `mustChangePassword`.
- **Callers:** `src/components/dashboard/settings-panel.tsx:164`; `src/app/login/page.tsx:179` (forced-change flow).
- **Validation:** Zod `passwordChangeSchema` = `{currentPassword:min(1), newPassword:min(10).max(200)}`.
- **AuthN/Z:** `requireSession({allowMustChangePassword:true})` — MFA step-up still enforced.
- **Output:** `{ok:true, mustChangePassword:false}`; `PASSWORD_INCORRECT` 400; rate limit 5/15 min per user.
- **Edge cases handled:** current-password re-verification, audit `PASSWORD_CHANGE` at `WARN`.
- **Not handled:** **does not revoke other sessions** (`revokeUserSessions` exists in `auth.ts` and is not called); no password-history/breach check beyond length; `newPassword` may equal `currentPassword`.

---

#### `src/app/api/auth/profile/route.ts` — 144 LOC
- **Handlers:** `GET`, `PATCH`. `dynamic = "force-dynamic"`.
- **Purpose:** Read/update own profile (name, locale, email).
- **Callers:** `src/components/dashboard/settings-panel.tsx:77` (GET), `:108` (PATCH).
- **Validation:** Zod `profileUpdateSchema` (at least one of name/email/locale; `currentPassword` required when `email` present).
- **AuthN/Z:** `GET` uses `requireSession({allowMustChangePassword:true})`; `PATCH` uses plain `requireSession()`.
- **Output:** `{user:{…}}`; `PASSWORD_INCORRECT` 400, `EMAIL_ALREADY_IN_USE` 409, `RESOURCE_NOT_FOUND` 404.
- **Edge cases handled:** no-op update short-circuits; uniqueness check; audit `PROFILE_UPDATE` with changed field names only.
- **Not handled:** an email change **does not reset `emailVerified`**, does not send a verification message to the new address, does not revoke sessions, and does not re-apply `isProductionBlockedDevelopmentIdentity`. Uniqueness is checked with a read-then-write (racy; only the DB unique index saves it, and a `P2002` would surface as a generic 500).

---

#### `src/app/api/auth/avatar/route.ts` — 106 LOC
- **Handlers:** `POST` (multipart). `dynamic = "force-dynamic"`.
- **Purpose:** Upload a profile avatar into workspace-scoped storage.
- **Callers:** `src/components/dashboard/settings-panel.tsx:131`.
- **Validation:** manual — `file instanceof File`, MIME allow-list (`png|jpeg|webp`), `1 ≤ size ≤ 2 MiB`, then `validateAndNormalizeLogoImage` (magic-byte/decode validation) and a re-check that `image.mimeType === file.type`.
- **AuthN/Z:** `requireSession()`; storage keyed by `getTenantContext(userId).workspace.id`.
- **Output:** `{user, avatarUrl}` where `avatarUrl = /api/files?path=<storagePath>`.
- **Edge cases handled:** decode failure → 400; rate limit 10/15 min per user; audit entry.
- **Not handled:** the body is read into memory via `formData()` before any size check, so the 2 MiB limit is enforced *after* buffering; the previous avatar object is never deleted (unbounded storage growth).

---

#### `src/app/api/auth/return-to/route.ts` — 35 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Reads and clears the signed deep-link cookie set by `proxy.ts`.
- **Callers:** `src/app/login/page.tsx:34`.
- **Validation:** `verifyReturnTo` (HMAC verification of the cookie).
- **AuthN/Z:** **none** — public because it lives under `/api/auth`. Acceptable (the cookie is the caller's own), but it is an unauthenticated, uncached, `force-dynamic` endpoint with no rate limit.
- **Note:** clears the cookie with `secure: NODE_ENV === "production"` whereas `proxy.ts` sets it with `secure: req.nextUrl.protocol === "https:"` — an attribute mismatch behind a TLS-terminating proxy in a non-production deployment.

---

#### `src/app/api/auth/mfa/setup/route.ts` — 77 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Generate a TOTP secret + QR.
- **Callers:** `src/components/dashboard/settings-panel.tsx:190`.
- **Validation:** manual (`body.currentToken?.trim()`), no Zod; unreadable body → `{}`.
- **AuthN/Z:** `requireSession({allowMustChangePassword:true})`; when `user.mfaEnabled`, a valid current TOTP is required (`MFA_ROTATION_TOKEN_REQUIRED` 403).
- **Output:** `{otpauthUrl, qrDataUrl, message}` — note `otpauthUrl` **contains the raw base32 secret** despite the comment claiming otherwise.
- **Edge cases handled:** rotation requires the current token; rate limit 5/15 min; audit `MFA_SETUP`.
- **Not handled:** **writes `{mfaSecret: <new>, mfaEnabled: false}` before the new secret is proven**, so an abandoned rotation silently leaves the account with MFA off; no password re-authentication for enrollment.

---

#### `src/app/api/auth/mfa/verify/route.ts` — 83 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Confirm the TOTP and flip `mfaEnabled = true`.
- **Callers:** `src/components/dashboard/settings-panel.tsx:220`.
- **Validation:** local Zod `{token: /^\d{6}$/}`; on failure returns `zodErrorResponse` (`{error:"Validation failed", issues:[…]}`) — **a different response shape from the bilingual `ApiFailure` contract used everywhere else**.
- **AuthN/Z:** `requireSession({allowMustChangePassword:true})`.
- **Output:** `{ok:true, mfaEnabled:true}`; `MFA_NOT_SET_UP` 400, `MFA_TOKEN_INVALID` 400.
- **Edge cases handled:** rate limit 5/15 min; audits a failed verify as `LOGIN_FAILED`.
- **Not handled:** no replay protection (no last-used-step persisted); no recovery codes issued on enable.

---

#### `src/app/api/auth/mfa/disable/route.ts` — 71 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Turn MFA off.
- **Callers:** `src/components/dashboard/settings-panel.tsx:247`.
- **Validation:** Zod `mfaDisableSchema` = `{currentToken: /^\d{6}$/}`.
- **AuthN/Z:** `requireSession()` + valid current TOTP.
- **Output:** `{ok:true, mfaEnabled:false}`; clears `mfaSecret`.
- **Edge cases handled:** rate limit 5/15 min; audit at `WARN`.
- **Not handled:** **no password re-authentication** — a session with a live `mfaVerified` JWT plus one TOTP code (or a session obtained from a device the user left open) can permanently strip MFA; no email notification to the account holder.

**MFA sub-system note:** ripgrep for `recoveryCode|backupCode|mfaRecovery|recovery_codes` across the whole repository returns **no matches** — there is no MFA recovery-code facility at all.

---

### 1.B `src/app/api/admin/**`

Common to every file below except `myfatoorah` and `billing/reconcile`: **no `try/catch`, no `withAdmin`, no bilingual mapper**. They call `requireAdmin()` and answer `{error:"Forbidden"}` 403 for a null session (conflating 401 and 403), and let any thrown Prisma/`EmailVerificationRequiredError` escape to Next.js's default 500.

---

#### `src/app/api/admin/users/route.ts` — 84 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** List all platform users (with subscription + relation counts); create a user.
- **Callers:** `src/components/admin/security.tsx:163` (GET), `:787` (POST).
- **Validation:** POST — manual truthiness on `email|name|password` only. **No Zod, no password policy, no email format check.**
- **AuthN/Z:** `requireAdmin()` + `canGrantRole(session.user.role, role)` for the requested role. Proxy also gates `/api/admin`.
- **Output:** `{users}` / `{user}` (password hash stripped).
- **Edge cases handled:** role-grant privilege check; audit `USER_CREATE` at `WARN`; `passwordHash` removed from the response.
- **Not handled:** `await req.json()` unguarded (malformed body → 500); duplicate email → Prisma `P2002` → 500 instead of 409; the created user gets **no workspace, no membership, no `activeWorkspaceId`**, `mustChangePassword` is never set, and `emailVerified` is left at its default; `isProductionBlockedDevelopmentIdentity` is not applied; GET is unpaginated and eagerly loads `subscription.plan` + five `_count` aggregates for every user.

---

#### `src/app/api/admin/users/[id]/route.ts` — 140 LOC
- **Handlers:** `PATCH`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** Change a user's role/active/mfaEnabled/locale and optionally assign a plan; soft-delete (deactivate).
- **Callers:** `src/components/admin/security.tsx:204` (PATCH), `:229` (DELETE), `:796` (PATCH right after create).
- **Validation:** none — raw `body.role`, `body.active`, `body.mfaEnabled`, `body.locale`, `body.planId`, `body.billingCycle`.
- **AuthN/Z:** `requireAdmin()`; `canGrantRole` **and** the `SUPER_ADMIN`-protection check are both nested inside `if (body.role)`.
- **Output:** `{user}` / `{ok:true}`; 404 for unknown id.
- **Edge cases handled:** session revocation on privilege change; self-deactivation blocked in `DELETE`; audit at `CRITICAL`.
- **Not handled:** a request that omits `role` skips **all** protection — an `ADMIN` can send `{active:false}` or `{mfaEnabled:false}` against a `SUPER_ADMIN`; `PATCH` does not block self-deactivation (only `DELETE` does); `{mfaEnabled:true}` can be set on a user with no `mfaSecret`, permanently locking them out (`authorize()` returns `null` when `mfaEnabled && !mfaSecret`); the plan grant writes a subscription but is **not** reflected in the audit `details`; `currentPeriodEnd` is computed as `new Date(y, m+1, d)`, which rolls over for month-end dates (31 Jan → 3 Mar).

---

#### `src/app/api/admin/audit/route.ts` — 47 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Paginated audit trail plus action/severity summaries.
- **Callers:** `src/components/admin/audit.tsx:159` (`?limit=200`).
- **Validation:** none — `action`, `severity` go straight into the Prisma `where`; `limit = Number(param)`.
- **AuthN/Z:** `requireAdmin()`.
- **Not handled:** `?limit=abc` → `Number("abc") = NaN` → `Math.min(NaN,500) = NaN` → `take: NaN` → Prisma throws → unhandled 500; `?limit=-1` silently reverses the page; the two `groupBy` calls scan the **entire** `auditLog` table on every request with no time bound; there is no cursor, only `take`.

---

#### `src/app/api/admin/overview/route.ts` — 80 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Admin KPI dashboard (11 parallel counts + 2 group-bys + a 24 h count).
- **Callers:** `src/components/admin/overview.tsx:30`.
- **Validation:** n/a. **AuthN/Z:** `requireAdmin()`.
- **Not handled:** 14 uncached full-table aggregate queries per request on a `force-dynamic` route; no caching, no `revalidate`.

---

#### `src/app/api/admin/plans/route.ts` — 54 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** List/create subscription plans.
- **Callers:** `src/components/admin/billing.tsx:217` (POST); `src/components/admin/security.tsx:172` (GET).
- **Validation:** **none** on POST — `priceMonthly`, `maxProposals`, … accepted as any JSON value. (Contrast: `plans/[id]` PATCH *does* bound-check the same fields.)
- **AuthN/Z:** `requireAdmin()` — no `SUPER_ADMIN` distinction for creating priced products.
- **Not handled:** negative or string prices; no uniqueness check on `name`; `featuresJson` accepted as an arbitrary string.

---

#### `src/app/api/admin/plans/[id]/route.ts` — 89 LOC
- **Handlers:** `PATCH`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** Update a plan (field allow-list + numeric bounds) or hard-delete it.
- **Callers:** `src/components/admin/billing.tsx:195`.
- **Validation:** `ALLOWED_PLAN_FIELDS` allow-list + `>= 0` / `>= -1` numeric bounds. Good relative to the rest of `admin/`.
- **Not handled:** `DELETE` is a hard delete with **no check for existing subscriptions** — either an FK violation surfaces as an unhandled 500 or a cascade silently removes live subscriptions; the delete is audited as `PLAN_UPDATE` (there is no `PLAN_DELETE` action), so the trail misreads; unknown id → `P2025` → 500 instead of 404.

---

#### `src/app/api/admin/env/route.ts` — 130 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Read/write the encrypted `EnvSetting` store that backs runtime configuration.
- **Callers:** `src/components/admin/env-settings.tsx:134` (GET), `:148` (GET `?reveal=1`), `:166` (POST).
- **Validation:** manual; `isSecret` inferred from `key.includes("KEY"|"SECRET"|"PASSWORD")` when not supplied.
- **AuthN/Z:** `requireAdmin()` for read/write; `requireSuperAdmin()` additionally for `?reveal=1`; `SUPER_ADMIN` additionally for writing a secret or a `CRITICAL_ENV_KEYS` key; `DATABASE_URL` writes blocked when `NODE_ENV=production && VERCEL`.
- **Output:** `{settings:[{…, value, isMasked}], catalog}`.
- **Edge cases handled:** reveal is audited at `WARN`; critical writes audited at `CRITICAL`.
- **Not handled:** the masking decision is `s.isSecret && !reveal`, i.e. it trusts a **mutable database column** rather than the key name. See defects #1 and #2 — non-`*KEY*`/`*SECRET*` rows such as `DATABASE_URL` are seeded with `isSecret:false` and are therefore returned in plaintext to any `ADMIN`, unmasked and unaudited.

---

#### `src/app/api/admin/env/[key]/route.ts` — 73 LOC
- **Handlers:** `PATCH`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** Rotate the envelope encryption of a setting, edit its metadata, or delete it.
- **Callers:** `src/components/admin/env-settings.tsx:191`.
- **Validation:** none — `body.rotate`, `body.category`, `body.description`, `body.isSecret` used raw.
- **AuthN/Z:** **`requireAdmin()` only.** No `SUPER_ADMIN` gate and no `CRITICAL_ENV_KEYS` gate, unlike the sibling `POST /api/admin/env`.
- **Not handled:** the generic-update branch (lines 43–52) writes **no audit entry at all**; `DELETE` will happily remove `ARABCLUE_ENC_KEY`, `NEXTAUTH_SECRET` or `DATABASE_URL` for a plain `ADMIN`; unknown key on `DELETE` → `P2025` → 500.

---

#### `src/app/api/admin/myfatoorah/route.ts` — 237 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Admin Payments → MyFatoorah pane: masked config, recent webhook events, save/rotate credentials, connection test, webhook-signature self-test.
- **Callers:** `src/components/admin/myfatoorah.tsx:73/86/121/151`.
- **Validation:** none — the body is cast to a TypeScript type with no runtime check; `action` is a free string.
- **AuthN/Z:** `withAdmin` (so `ADMIN` **or** `SUPER_ADMIN`).
- **Output:** `jsonOk({...})` with masked secrets; failures via the bilingual mapper (`jsonError` intentionally drops the raw message).
- **Edge cases handled:** masked secrets in `GET`; `test_connection` failure → 502 with a generic body; audit on save/rotate at `WARN` and on `test_connection`.
- **Not handled:** rotating `MYFATOORAH_API_KEY` / `MYFATOORAH_WEBHOOK_SECRET` requires only `ADMIN` here, while writing the very same rows through `POST /api/admin/env` requires `SUPER_ADMIN` — the stricter gate is bypassable through this route; `await req.json()` unguarded → mapped to a 500 rather than a 400; `body.mode` is not checked against `MYFATOORAH_ENV_URLS` before `resolveMyFatoorahBaseUrl`; `test_webhook_signature` accepts a fully caller-controlled `data` object and returns the canonical string used for signing.

---

#### `src/app/api/admin/billing/route.ts` — 104 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Platform revenue/usage dashboard; create a manual billing record (topup/usage/refund) and bump quota counters.
- **Callers:** `src/components/admin/billing.tsx:182` (GET).
- **Validation:** **none** on POST.
- **AuthN/Z:** `requireAdmin()`.
- **Not handled:** `totalRevenue` is summed from only the **50 most recent** `billingRecord` rows (`take: 50` at line 18, reduced at lines 33-35) so the reported figure is wrong for any workspace with more history; `allSubs` is an unbounded `findMany` including `plan` and `user`; POST accepts an arbitrary `userId` (FK error → 500), an arbitrary negative `amount`, an arbitrary `status` (so a `PAID` record can be fabricated), and increments `proposalsUsed`/`tokensUsed` through `updateMany` with no idempotency key, so a retried request double-applies.

---

#### `src/app/api/admin/ai-providers/route.ts` — 184 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** List AI provider connections (+ engine assignment map, connection templates); create a connection.
- **Callers:** `src/components/admin/ai-providers.tsx:75` (GET), `:1179` (POST).
- **Validation:** manual coercion (`String()`, `Number()`, `Boolean()`); no Zod, no bounds.
- **AuthN/Z:** `requireAdmin()`.
- **Edge cases handled:** cannot activate without a `modelId`; `deactivateConflictingProviders` enforces one active provider per engine; audit `AI_PROVIDER_CREATE`.
- **Not handled:** `Number(body.contextWindow)` can be `NaN` → persisted as `NaN`/Prisma error; `new Date(String(body.modelsFetchedAt))` can be `Invalid Date` → Prisma throws → 500; `apiBase` and `apiKeyEnvKey` are stored verbatim from the caller with no allow-list.

---

#### `src/app/api/admin/ai-providers/[id]/route.ts` — 181 LOC
- **Handlers:** `PATCH`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** Update a connection (allow-listed fields), assign engines, activate; delete an inactive connection.
- **Callers:** `src/components/admin/ai-providers.tsx:89/120/144`.
- **Validation:** `ALLOWED_FIELDS` allow-list, but **no type or range validation** on the allowed values.
- **Edge cases handled:** cannot leave an active connection without a model; engine-conflict deactivation; separate `AI_PROVIDER_ACTIVATE` audit at `WARN`.
- **Not handled:** `DELETE` on an unknown id passes the `existing?.isActive` guard (optional chaining on `null`) and then throws `P2025` → 500 instead of 404; the audit stores `details: { changes: data }`, echoing every submitted value into the audit log.

---

#### `src/app/api/admin/ai-providers/models/route.ts` — 187 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`, **`maxDuration = 60`**.
- **Purpose:** Fetch a live model list from a provider API and cache it on the connection row.
- **Callers:** `src/components/admin/ai-providers.tsx:186/683/1133`.
- **Validation:** none — `FetchBody` is a cast, not a schema.
- **AuthN/Z:** `requireAdmin()`.
- **Output:** `{models, source, fetchedAt, cached}`; soft failure serves `cache_stale`; hard failure 400 (`API_KEY_MISSING`) or 422 (`UPSTREAM_MODELS_FAILED`); catch-all 500.
- **Edge cases handled:** `req.json().catch(() => ({}))`; stale-cache fallback; distinct codes for missing key vs upstream failure.
- **Not handled:** the catch-all at lines 40–47 returns `err.message` verbatim to the client, and the 400/422 branch returns the raw upstream `message` (lines 179) — both bypass the central redacting mapper; `body.apiBase` is an unvalidated, caller-supplied URL that the server then fetches with a bearer credential attached (SSRF / credential-exfiltration primitive, amplified by the already-known arbitrary-`process.env` read in `resolveProviderApiKey`); `refreshAll` loops **every** provider row sequentially with network calls under a 60 s budget.

---

#### `src/app/api/admin/billing/reconcile/route.ts` — 453 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`. **No `maxDuration`.**
- **Purpose:** Compare local `PaymentCheckout` state against MyFatoorah and apply corrections (single, bulk, or legacy sweep).
- **Callers:** `src/components/admin/billing-reconciliation.tsx:138` (GET), `:158`/`:218` (POST).
- **Validation:** query params bounded by `Math.min/max`; **the request body is not validated at all**.
- **AuthN/Z:** `withAdmin` — correct 401/403 separation and central error mapping.
- **Output:** `jsonOk(report)` / `jsonOk(result)`; `BILLING_PROVIDER_UNCONFIGURED` 503; `RECONCILE_ALREADY_APPLIED` 409.
- **Edge cases handled:** provider-unconfigured pre-check; per-item 10 s `withProviderDeadline`; batched concurrency of 5; idempotency check on the legacy single path (`status === "PAID" && billingRecord.status === "PAID"`); audit on bulk-apply and on the legacy sweep.
- **Not handled:**
  - keyset pagination mixes sort keys — `orderBy: [{createdAt:"desc"},{id:"desc"}]` but the cursor predicate is only `id: { lt: cursor }` (lines 110, 124), so pages can skip or duplicate rows whenever `id` ordering diverges from `createdAt` ordering;
  - `body.items` has **no length cap** and `applyReconciliationBulk` (`src/lib/billing.ts:943`) iterates it sequentially;
  - the single-apply branch at lines 326–331 accepts a caller-supplied `providerResult` exactly like the already-known bulk path — both write payment state from request data without re-querying the provider;
  - `GET` can issue up to 200 provider calls at concurrency 5 with a 10 s deadline each (worst case ≈ 400 s) with no `maxDuration` declared;
  - the single-apply and bulk-apply paths that succeed via `applyReconciliation` are audited, but the *explicit-`providerResult` single* path (lines 326–341) writes **no audit entry**.

---

### 1.C `src/app/api/billing/**`

---

#### `src/app/api/billing/route.ts` — 45 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Billing panel payload — public plans, the caller's subscription, last 30 billing records, last 10 PENDING/PAID checkouts, and whether MyFatoorah is configured.
- **Callers:** `src/components/dashboard/billing-panel.tsx:99`.
- **Validation:** n/a. **AuthN/Z:** `withTenant("session")`.
- **Tenant scoping:** every query is keyed on `session.user.id` — **not** on `workspace.id`, unlike the rest of the tenant surface. Billing is therefore a per-user concept while entitlements are consumed per workspace.
- **Not handled:** `checkouts` returns whole `paymentCheckout` rows (including `paymentUrl` and `errorMessage`), not a projection.

---

#### `src/app/api/billing/checkout/route.ts` — 256 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Create a `BillingRecord` + `PaymentCheckout`, ask MyFatoorah for an invoice, optionally start a recurring profile, return the hosted payment URL.
- **Callers:** `src/components/dashboard/billing-panel.tsx:119`.
- **Validation:** Zod `billingCheckoutSchema` (`planId`, `billingCycle`, `billingMode`, `locale`).
- **AuthN/Z:** `withTenant("session")` **plus** an explicit `resolveEmailVerifiedClaim` re-check.
- **Output:** `{checkoutId, paymentUrl, invoiceId, amount, currency, billingMode, recurringProfileId}`; failures via `ApiError` → bilingual mapper (the raw provider message is *not* echoed because `code` is absent, so the mapper falls back to the generic body).
- **Edge cases handled:** free plans rejected; plan must be `isActive && isPublic`; `customerReference` is 12 random bytes; failed checkout is marked `FAILED` on both rows; recurring failure is a hard error (no silent fallback to single-cycle) and is audited at `ERROR`.
- **Not handled:**
  - **no rate limit** — every call creates two DB rows and one outbound MyFatoorah invoice;
  - **not transactional** — `billingRecord.create` → `paymentCheckout.create` → provider call are three separate statements, so a mid-sequence failure orphans a `PENDING` `BillingRecord`;
  - the recurring branch creates a `Subscription` with `status:"PENDING"` (lines 149–159) that is **not** rolled back when `startRecurringProfile` subsequently throws;
  - no check for an existing `PENDING` checkout, so a user can accumulate unlimited pending invoices (which the reconcile sweep then re-queries against the provider);
  - `session.user.workspaceId` may be `""` (the session callback defaults it) and is passed to `startRecurringProfile` unvalidated.

---

#### `src/app/api/billing/callback/route.ts` — 81 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Browser return-from-provider surface; resolves and fulfils the checkout.
- **Callers:** `src/app/billing/callback/page-client.tsx:40`.
- **Validation:** manual; `paymentId|PaymentId|Id`, `ref`, `status` read from the query string.
- **AuthN/Z:** `withTenant("session")` + rate limit 10 / 5 min per user + an ownership pre-check on `ref`.
- **Output:** `jsonOk(result)`; 400 when neither key is present; 403 on ownership mismatch (audited at `WARN`).
- **Edge cases handled:** `status=error` short-circuit; ownership mismatch audited.
- **Not handled:**
  - the route accepts a `paymentId`-only call (line 47 explicitly allows it) and forwards it as `fulfillCheckout({paymentId, customerReference: undefined})`, but `fulfillCheckout` (`src/lib/billing.ts:32-49`) only resolves a checkout by `checkoutId`, `customerReference` or `invoiceId` — **there is no `paymentId` lookup branch**, so that path can only ever return `checkout_not_found`;
  - consequently the "post-fulfill ownership verification (in case paymentId path)" at lines 72–77 is unreachable, and as written it is a check-*after*-write anyway;
  - a state-mutating operation is exposed as `GET`, which is prefetchable and reachable by top-level cross-site navigation under `SameSite=Lax`.

---

#### `src/app/api/billing/webhook/route.ts` — 323 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`. Listed in `PUBLIC_PATHS` in `proxy.ts`.
- **Purpose:** MyFatoorah Webhook V2 receiver — signature verification, durable event receipt, recurring-charge handling, checkout fulfilment.
- **Callers:** MyFatoorah (external); URL surfaced by `GET /api/admin/myfatoorah`.
- **Validation:** manual field extraction from an untyped `Data` object; no Zod.
- **AuthN/Z:** HMAC signature only (`verifyWebhookSignature`; the known fail-open-without-secret-outside-production behaviour applies).
- **Output:** `jsonOk({...})` in every processed branch; 400 invalid JSON; 401 invalid signature.
- **Edge cases handled:** the event row is created **after** signature verification (so an unsigned flood writes nothing); `processingStatus === "PROCESSED"` short-circuits duplicates; `attempts` incremented; `payloadRedacted` stores only `Object.keys(Data)` plus status strings; `fulfillCheckout` is itself idempotent (`billing.ts:55-57` returns early when the checkout is already `PAID`); the outer catch marks the row `FAILED` and rethrows so the provider retries.
- **Not handled:**
  - **`handleRecurringChargeSuccess` / `handleRecurringChargeFailure` failures are swallowed** (lines 178–181, 212–214) and control falls through to the default branch at lines 247–254, which marks the event `PROCESSED` and answers HTTP 200 — the provider will never retry a charge the platform failed to apply;
  - a `RECURRING_UPDATES` success event without an `Invoice.Id` skips `handleRecurringChargeSuccess` entirely (line 154 requires `invoiceId`) and is likewise recorded `PROCESSED`;
  - there is no transaction or advisory lock around find-then-create on `eventFingerprint`, so two concurrent deliveries race and one dies on a unique-constraint 500;
  - `signatureValid: true` is hard-coded (line 90) — the column can never record a failure;
  - no rate limit and no body-size bound on a public endpoint that reads the full body with `req.text()`.

---

#### `src/app/api/billing/recurring/route.ts` — 39 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** List the caller's recurring profiles.
- **Callers:** `src/components/dashboard/billing-panel.tsx:110`.
- **Validation:** `status` query param passed through unvalidated.
- **AuthN/Z:** `withTenant("session")`; scoping by `session.user.id` inside `getUserRecurringProfiles`.
- **Output:** an explicit field projection (good — no provider tokens leak).

---

#### `src/app/api/billing/recurring/[id]/cancel/route.ts` — 56 LOC and `.../resume/route.ts` — 56 LOC
- **Handlers:** `POST` each. `dynamic = "force-dynamic"`.
- **Purpose:** Cancel / resume a recurring profile at the provider.
- **Callers:** `src/components/dashboard/billing-panel.tsx:146` / `:167`.
- **Validation:** none beyond the path parameter.
- **AuthN/Z:** `withTenant("writer")` + `resolveEmailVerifiedClaim` re-check + `getRecurringProfileById(id, session.user.id)` ownership check → 404 for a foreign or missing profile (correctly does not distinguish the two).
- **Not handled:** `throw new ApiError(err.message, err.httpStatus)` omits the third `code` argument, so the mapper falls back to `legacyFailureBody(null)` and the caller receives a generic `INTERNAL_ERROR` body with a domain-specific status — the `RecurringBillingError.code` is discarded (contrast `checkout/route.ts:206-211`, which maps it correctly); **no rate limit** on a route that makes an outbound provider call per request; the `req` parameter is unused.

---

### 1.D `src/app/api/cron/**`, `health`, `ready`, `files`

All four cron routes share the same shape: `dynamic = "force-dynamic"`, `maxDuration = 60`, `authorizeCron(req)` as the first statement, and `export async function GET(req) { return POST(req) }`. `proxy.ts` treats `/api/cron/*` as public, so `authorizeCron` is the only gate.

---

#### `src/app/api/cron/analytics-retention/route.ts` — 41 LOC
- **Handlers:** `POST`, `GET`→`POST`. **Purpose:** archive analytics events older than 90 days into daily summaries.
- **Callers:** none — **absent from `vercel.json` crons** (already known).
- **AuthN/Z:** `authorizeCron`. **Output:** `{ok, archivedEventCount, summaryBucketCount, cutoff, time}`; 500 `{ok:false, error: err.name}`.
- **Note:** this is the only cron route that returns `err.name` rather than `err.message` — the correct behaviour; the other three are inconsistent with it.

---

#### `src/app/api/cron/billing-reconcile/route.ts` — 38 LOC
- **Handlers:** `POST`, `GET`→`POST`. **Purpose:** `reconcilePendingCheckouts({olderThanMinutes:5, limit:50})`.
- **Callers:** `vercel.json` `15 5 * * *` (daily 05:15 UTC).
- **Not handled:** the 500 branch returns `err.message` verbatim (line 28); a daily run with `limit: 50` cannot drain a backlog larger than 50 pending checkouts per day.

---

#### `src/app/api/cron/expiry-notifications/route.ts` — 223 LOC
- **Handlers:** `POST`, `GET`→`POST`. **Purpose:** email workspace OWNER/ADMIN about certificates and subscriptions expiring within 30 days, deduped through `ExpiryNotificationLog`.
- **Callers:** `vercel.json` `0 6 * * *`.
- **Validation:** n/a. **AuthN/Z:** `authorizeCron`.
- **Edge cases handled:** dedupe key `workspaceId+kind+resourceId+channel` with `resourceId` carrying the expiry date, so a renewed certificate re-notifies; inactive users filtered; `escapeHtml` applied to every interpolated value; skipped sends still write a log row when email is unconfigured.
- **Not handled:**
  - **no `try/catch` at all** — any Prisma failure escapes as an unhandled 500 mid-run with partial side effects already committed;
  - both scans are `take: 100` with **no cursor and no "not yet notified" predicate**, so once 100 already-notified rows sit at the head of the `expiresAt asc` ordering they permanently occupy the window and the 101st record is never notified;
  - `workspaceId` for the subscription branch falls back to `sub.userId` when the user owns no workspace (line 131), writing a **user id into a `workspaceId` column**;
  - N+1 — one `expiryNotificationLog.findUnique` plus one `workspaceMember` query per row, up to ~400 round-trips inside a 60 s budget;
  - a `sendEmail` hard failure writes no log row and no backoff state, so the same address is retried on every run forever;
  - the `errors[]` array returned to the caller carries raw provider error strings.

---

#### `src/app/api/cron/notification-dispatch/route.ts` — 47 LOC
- **Handlers:** `POST`, `GET`→`POST`. **Purpose:** drain the `NotificationDelivery` email outbox (batch 50) via `dispatchPendingNotificationEmails`.
- **Callers:** `vercel.json` `30 5 * * *` — **once per day**.
- **Not handled:** the file's own docstring states a *30-minute delivery deadline* (requirements 17.4–17.6), which a daily schedule cannot satisfy — a notification queued at 05:31 waits ~24 h; the 500 branch returns `err.message` verbatim (line 37); `batchSize: 50` per day caps throughput at 50 emails/day.

---

#### `src/app/api/health/route.ts` — 12 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`. Public.
- **Purpose:** liveness only. Returns `{ok:true, service, time}` with no database access. Correct and minimal; `e2e/completion/health-ready.spec.ts` asserts it leaks no schema detail.

---

#### `src/app/api/ready/route.ts` — 146 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`. **Public** (`PUBLIC_PATHS`).
- **Purpose:** readiness probe — database `SELECT 1`, migration-ledger comparison, secret presence, active AI provider count, MyFatoorah config, storage/rate-limit/cron infrastructure, Redis reachability, Resend presence.
- **Callers:** `e2e/completion/health-ready.spec.ts:23`; load balancers.
- **Output:** 200 or 503 with a full `checks` map plus a `schema` block listing unapplied migration names and affected capabilities.
- **Edge cases handled:** every probe is individually wrapped; the migration read is bounded and never truncated; Redis is only probed when `requiresDistributedRateLimit()` says it is mandatory.
- **Not handled:** the database failure branch returns `err.message.slice(0, 120)` (line 34) to an **unauthenticated** caller — Prisma/Postgres connection errors routinely carry the host, port, and database name; the successful response is a detailed infrastructure fingerprint (migration names, secret presence, provider counts, payment environment, storage and rate-limit backends) available to anyone on the internet; there is no rate limit on a public endpoint that performs four or more backend round-trips per call.

---

#### `src/app/api/files/route.ts` — 59 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** serve stored upload bytes, workspace-scoped.
- **Callers:** `src/components/dashboard/document-matrix.tsx:299`, `document-file-viewer.tsx:60/65`, and every `avatarUrl`/`logoUrl` produced by `auth/avatar` and the brand pipeline.
- **Validation:** `searchParams.getAll("path").length !== 1` (blocks parameter pollution) → `assertWorkspaceStoragePath(path, workspace.id)`.
- **AuthN/Z:** `requireSession()` (so MFA step-up and `mustChangePassword` are enforced) + `getTenantContext` + a second workspace assertion inside `readWorkspaceStoredFile`.
- **Output:** raw bytes with `Content-Type`, `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, and `Content-Disposition: attachment` for every non-inline extension. **This is the best-hardened response in the audited surface.**
- **Edge cases handled:** traversal, absolute paths, cross-workspace paths and duplicate `path` params are all rejected as 404 (regression-tested in `src/lib/__tests__/brand-logo.test.ts` and `brand-route-security.test.ts`); 50 MiB delivery cap.
- **Not handled:** the whole file is buffered into heap (`new Uint8Array(bytes)`) rather than streamed, so a 50 MiB delivery costs 50 MiB of memory per concurrent request; **no rate limit** on an authenticated I/O-bound endpoint; no `ETag`/`Range` support; the 401 body is hand-rolled (`{error:"Unauthorized"}`) instead of the bilingual contract.

---

### 1.E `invitations`, `workspaces`, `notifications`, `staff`, `onboarding`, `restrictions`, `approval-policy`

---

#### `src/app/api/invitations/route.ts` — 127 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** list pending invitations (keyset-paginated) and create one; every rule lives in `Invitation_Service`.
- **Callers:** none found in `src/components`/`src/app` — the invitation **creation** UI appears not to be wired up (the only invite path exercised by the UI is `POST /api/workspaces`).
- **Validation:** Zod `listQuerySchema` for the query; the body is passed raw to the service, which returns `REQUEST_VALIDATION_FAILED` with `fieldPaths`.
- **AuthN/Z:** `withTenant("session")` for `GET`, `withTenant("writer")` for `POST`; the service additionally checks `actor.membershipRole`/`platformRole`.
- **Output:** `{invitations, pageSize, nextCursor}` / `{ok, code, emailDelivery, invitation}`. **No raw token is ever returned.**
- **Edge cases handled:** cursor is workspace-bound (`decodeInvitationCursor(cursor, workspace.id)`) so a cursor from another tenant is rejected; seat allowance enforced (`SEAT_LIMIT_REACHED`, 429); token stored as a digest with a TTL.

---

#### `src/app/api/invitations/[id]/route.ts` — 52 LOC
- **Handlers:** `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** revoke a pending invitation.
- **Callers:** none found.
- **AuthN/Z:** `withTenant("writer")`; owner/admin authorization and tenant scoping delegated to the service. Clean.

---

#### `src/app/api/invitations/accept/route.ts` — 63 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** consume an invitation token; creates an account when the invited address has none (`accountCreated: result.createdUser`).
- **Callers:** `src/app/invite/page.tsx:78`; mocked in `e2e/completion/support/mocks.ts:77`.
- **Validation:** delegated (`INVITATION_ACCEPTANCE_INVALID` + `fieldPaths`).
- **AuthN/Z:** `withPublicRoute` with an **optional** session read via `getServerSession(authOptions)` — one of only four routes in the repository that call `getServerSession` directly.
- **Edge cases handled by the service:** serializable transaction re-reading token/address/account/membership/role/seat state; `ALREADY_A_MEMBER` still consumes the token; `ACCOUNT_EXISTS` → 401 so the invitee must sign in first; seat limit → 429.
- **Not handled:** `/api/invitations/accept` is **not** in `proxy.ts`'s `PUBLIC_PATHS`, so `withAuth`'s `authorized` callback (`return !!token`) rejects the unauthenticated request the route was written to serve — see defect #4. Because the session is read with `getServerSession` rather than `requireSession`, a `mustChangePassword` / pending-MFA session would also be accepted as an actor if the proxy were ever bypassed.

---

#### `src/app/api/workspaces/route.ts` — 176 LOC
- **Handlers:** `GET`, `PATCH`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** active workspace + member list + all memberships; switch active workspace or edit the legal profile; add an existing user to the workspace.
- **Callers:** `sidebar.tsx:112/290`, `topbar.tsx:59`, `account-onboarding.tsx:356`, `knowledge-review-controls.tsx:68`, `knowledge-approval-queue.tsx:149`.
- **Validation:** `POST` uses Zod `workspaceInviteSchema` (`email`, `role: "ADMIN"|"MEMBER"`, default `MEMBER`). `PATCH` uses **no schema at all** — `req.json().catch(() => ({}))` then raw field spreads. `workspaceSwitchSchema` is imported at line 10 and never used.
- **AuthN/Z:** `GET`/`PATCH` = `withTenant("session")`; `POST` = `withTenant("writer")` + `isWorkspaceManager`. `PATCH`'s profile branch additionally rejects `REVIEWER` and requires `isWorkspaceManager`.
- **Edge cases handled:** `setActiveWorkspace` returns `null` for a workspace the caller is not a member of → 404; already-a-member returns `{alreadyMember:true}` instead of erroring; audit on both mutations.
- **Not handled:**
  - `POST` writes `db.workspaceMember.create` directly, **bypassing `Invitation_Service` and therefore the seat allowance** that the service enforces at `src/lib/invitation-service.ts:786-788` — this is a plan-quota bypass;
  - the invitee is added with **no consent step and no notification**;
  - `PATCH` writes `crNumber`, `vatNumber`, `name`, `nameAr` with no type, length, or format validation, and these values flow into generated proposals and letterheads;
  - `GET` returns every workspace member's `email` **and `mfaEnabled`** to any member, including `REVIEWER`, and neither member query has a `take`.

---

#### `src/app/api/notifications/route.ts` — 173 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** merge the persisted in-app inbox with derived certificate-expiry, pending-review, and onboarding alerts, minus per-user dismissals.
- **Callers:** `topbar.tsx:87`; `e2e/completion/dashboard-mocks.spec.ts:138`.
- **AuthN/Z:** `withTenant("session")`; every query is scoped by `workspace.id` and/or `userId`. **Tenant isolation here is correct.**
- **Edge cases handled:** `isPrismaMissingTable` soft-skip keeps derived alerts working before the inbox migration lands; `normalizeHref` constrains hrefs; dismissals applied to both persisted and derived items.
- **Not handled:** `db.certificate.findMany` (lines 40–46) has **no `take`** — a workspace with thousands of certificates returns them all and builds an item per row.

---

#### `src/app/api/notifications/dismiss/route.ts` — 60 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** read / write per-user notification dismissals.
- **Callers:** `src/hooks/use-dismissed-notifications.ts:24/33/70`.
- **Validation:** Zod `{id?, ids?: string[] (max 200)}`.
- **AuthN/Z:** `withTenant("session")`, scoped by `userId`.
- **Edge cases handled:** dedupe via `Set`; a single `db.$transaction` of upserts; 500-row read cap.
- **Not handled:** `throw new ApiError("Validation failed", 400)` omits a `code`, so the mapper emits a generic `INTERNAL_ERROR` body with a 400 status and no `fieldPaths` — the client cannot tell what was wrong.

---

#### `src/app/api/staff/route.ts` — 107 LOC
- **Handlers:** `GET`, `POST`, `PATCH`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** workspace staff roster used by the requirements matrix.
- **Callers:** `account-onboarding.tsx:651/656/689`; `requirements-matrix.tsx:79`.
- **Validation:** Zod `staffMemberSchema` (full on `POST`, `.partial()` on `PATCH`).
- **AuthN/Z:** `withTenant("session")` read, `withTenant("writer")` writes; `PATCH`/`DELETE` re-read with `findFirst({id, workspaceId})` before mutating. **Tenant isolation correct.**
- **Not handled:** `PATCH`/`DELETE` then mutate by `where:{id}` alone (a benign TOCTOU given the preceding scoped read); `GET` has no `take`; `PATCH`'s validation failure again drops the field paths (`new ApiError("Validation failed", 400)` with no code).

---

#### `src/app/api/onboarding/route.ts` — 62 LOC
- **Handlers:** `GET`, `PATCH`. `dynamic = "force-dynamic"`.
- **Purpose:** onboarding progress and step definitions.
- **Callers:** `account-onboarding.tsx:166/1268`; `views.tsx:739`.
- **Validation:** Zod `onboardingPatchSchema`. **AuthN/Z:** `withTenant("session"|"writer")`, workspace-scoped. Correct.
- **Not handled:** `JSON.parse(existing.completedSteps)` (line 50) is unguarded — a malformed stored value throws a `SyntaxError` mapped to a generic 500.

---

#### `src/app/api/restrictions/route.ts` — 53 LOC
- **Handlers:** `GET`, `POST`, `DELETE`. `dynamic = "force-dynamic"`.
- **Purpose:** workspace bid restrictions.
- **Callers:** `account-onboarding.tsx:1225/1244`.
- **Validation:** Zod `restrictionSchema`. **AuthN/Z:** `withTenant("session"|"writer")` with scoped pre-reads. Correct.
- **Not handled:** `POST` does not call `computeOnboardingSteps` although `DELETE` in the sibling `staff` route does and the import is present here but unused — the "restrictions reviewed" onboarding step can go stale; no `take` on `GET`.

---

#### `src/app/api/approval-policy/route.ts` — 88 LOC
- **Handlers:** `GET`, `PUT`. `dynamic = "force-dynamic"`.
- **Purpose:** read and replace the workspace proposal-approval chain.
- **Callers:** `account-onboarding.tsx:1060/1079`.
- **Validation:** Zod `approvalPolicySchema`; each `step.reviewerId` is verified to be a current workspace member before any write.
- **AuthN/Z:** `withTenant("writer")` only — **`isWorkspaceManager` / `requireWorkspaceRole(WORKSPACE_MANAGER_ROLES)` is not applied**, so any non-`REVIEWER` member (e.g. a `MEMBER`/`BIDDER`) can replace the whole approval chain, including reducing it to a single step naming themselves.
- **Edge cases handled:** the replace is one `$transaction` (upsert policy → `deleteMany` steps → `createMany`); reviewer membership validated; `stepRole` defaults with the last step as `FINAL`.
- **Not handled:** no audit entry for a change to the approval chain (contrast `workspaces PATCH`, which audits a far less sensitive change); no concurrency guard, so two simultaneous `PUT`s can interleave delete/create.

---

## 2. Cross-cutting observations

### 2.1 Routes using `getServerSession` directly instead of `requireSession` / `withTenant` / `withAdmin`
Grep across `src/app/api` finds exactly four, of which **one is in scope**:

| Route | In scope | Consequence |
|---|---|---|
| `src/app/api/invitations/accept/route.ts:27` | yes | MFA step-up and `mustChangePassword` are not enforced on the actor; only the proxy stands between a half-authenticated session and the acceptance transaction |
| `src/app/api/collaboration/presence/route.ts:78,121` | no | — |
| `src/app/api/proposals/builder/route.ts:13,63` | no | — |
| `src/app/api/platform-agent/extension/download/route.ts:20` | no | — |

Two in-scope routes call `requireSession()` directly rather than `withTenant` — `src/app/api/files/route.ts:16` and every `src/app/api/auth/*` route. These *do* get the MFA/`mustChangePassword` gates (they are inside `requireSession`), but they hand-roll their error bodies instead of using the bilingual mapper.

### 2.2 Expensive or security-sensitive routes with no rate limiting

| Route | What it costs per call |
|---|---|
| `POST /api/billing/checkout` | 2 DB inserts + 1 outbound MyFatoorah invoice creation |
| `POST /api/billing/recurring/[id]/cancel` and `/resume` | 1 outbound provider mutation each |
| `POST /api/billing/webhook` | public; full body read + DB writes (mitigated: the row is only written after signature verification) |
| `GET /api/ready` | public; `SELECT 1` + migration-ledger read + provider count + MyFatoorah config read + optional Redis ping |
| `GET /api/files` | authenticated; up to 50 MiB read fully into heap |
| `POST /api/admin/ai-providers/models` | outbound provider fetch, `maxDuration = 60`; `refreshAll` multiplies it by the provider count |
| `GET`/`POST /api/admin/billing/reconcile` | up to 200 outbound provider calls |
| `POST /api/invitations` | **sends an email** — `rateLimit` appears nowhere in `src/lib/invitation-service*.ts`; `sourceAddress` is collected for audit only |
| `GET /api/notifications` | unbounded `certificate.findMany` |
| `GET /api/auth/return-to` | public, `force-dynamic`, HMAC verify |

By contrast the auth surface is consistently limited: login 10/15 min, precheck 20/15 min, password 5/15 min, profile 20/15 min, avatar 10/15 min, MFA setup/verify/disable 5/15 min each, recovery request/reset via `RECOVERY_*_RATE_LIMIT`, billing callback 10/5 min.

Two structural caveats: (a) all in-memory buckets are per-instance, so on Vercel each concurrent lambda carries its own quota unless `REDIS_URL` is set; (b) every IP-keyed limiter derives the address from the first `X-Forwarded-For` entry with no trusted-proxy depth, so it is client-spoofable.

### 2.3 Cron authentication
`authorizeCron` is applied identically and as the first statement in all four routes, and it fails closed (503 `CRON_NOT_CONFIGURED`) when `CRON_SECRET` is missing or shorter than 16 characters. Three weaknesses:
1. **The secret is accepted from the query string** (`cron-auth.ts:24`), and every cron route exports `GET` that delegates to `POST`, so the entire cron surface is reachable through a URL that gets recorded in CDN logs, proxy logs, browser history and `Referer` headers.
2. Comparison is `===`, not `crypto.timingSafeEqual`.
3. Only three of the four routes are registered in `vercel.json`; `analytics-retention` is absent (already known).

### 2.4 Token lifecycle (verification / reset / invitation)
All three are owned by domain services, and the route layer never echoes a raw token.

| Property | Verification | Recovery | Invitation |
|---|---|---|---|
| Single-use | service consumes the token in the same serializable transaction | service consumes + revokes all sessions atomically | consumed even on `ALREADY_MEMBER` (`invitation-service.ts:1119-1126`) |
| Expiry | yes (expired → `VERIFICATION_TOKEN_INVALID`) | yes | `INVITATION_TOKEN_TTL_MS` |
| Hashed at rest | not verified in this pass | not verified in this pass | yes — `createTokenDigest({randomness})` |
| Enumeration | uniform `VERIFICATION_TOKEN_INVALID` for unknown/expired/consumed | `/forgot-password` always returns the same success body | `TOKEN_INVALID` uniform |

Gaps: `/api/auth/verify-email` returns `userId` on success; there is **no resend-verification route** in the scope, so a lost verification mail is unrecoverable through the API; the reset limiter is keyed on a spoofable client IP with no per-token attempt counter.

### 2.5 MFA
- **Enrollment** (`mfa/setup` → `mfa/verify`) is authorized by session alone — no password re-authentication. `setup` persists `{mfaSecret: new, mfaEnabled: false}` *before* proving the new secret, so an abandoned rotation silently turns MFA off.
- **Disable** requires one current TOTP and a session; no password, no email notification.
- **Replay protection: none.** `verifyMfaToken` (`src/lib/mfa.ts:8-20`) calls `verifySync` with no last-used-step persistence, so the same 6-digit code is reusable inside its window at login, at rotation, and at disable.
- **Recovery codes: none.** `recoveryCode|backupCode|mfaRecovery|recovery_codes` has zero matches repository-wide. A user who loses their authenticator can only be recovered by an administrator flipping `mfaEnabled` through `PATCH /api/admin/users/[id]` — which itself does not clear `mfaSecret`.
- An administrator can set `{mfaEnabled:true}` on a user with no `mfaSecret`, which permanently denies login (`auth.ts:176-182`).

### 2.6 Admin routes — state, audit, and SUPER_ADMIN separation

| Route | Mutates platform-wide state | Audited | Role separation |
|---|---|---|---|
| `users POST` | yes (creates an account) | `USER_CREATE` WARN | `canGrantRole` ✓ |
| `users/[id] PATCH` | yes (role/active/MFA/plan) | `ROLE_CHANGE` CRITICAL | **broken when `role` is omitted** |
| `users/[id] DELETE` | yes | `USER_DEACTIVATE` CRITICAL | SUPER_ADMIN protected ✓ |
| `plans POST` | yes (priced product) | `PLAN_CREATE` | ADMIN only |
| `plans/[id] PATCH` | yes | `PLAN_UPDATE` | ADMIN only |
| `plans/[id] DELETE` | yes (hard delete) | mislabelled `PLAN_UPDATE` | ADMIN only |
| `env POST` | yes | `ENV_UPDATE` WARN/CRITICAL | SUPER_ADMIN for secret/critical ✓ |
| `env GET ?reveal=1` | no | `ENV_UPDATE` WARN | `requireSuperAdmin` ✓ (**bypassable — defects #1/#2**) |
| `env/[key] PATCH` | yes | **rotate branch only** | **ADMIN only — no critical-key gate** |
| `env/[key] DELETE` | yes (removes a secret) | `ENV_UPDATE` WARN | **ADMIN only** |
| `myfatoorah POST` | yes (payment credentials) | `ENV_UPDATE` WARN | **ADMIN only — inconsistent with `env POST`** |
| `billing POST` | yes (money + quota) | `BILLING_CHANGE` WARN | ADMIN only |
| `billing/reconcile POST` | yes (payment state) | bulk + legacy only | ADMIN only |
| `ai-providers POST/PATCH/DELETE` | yes | create/update/activate/delete | ADMIN only |
| `ai-providers/models POST` | writes model cache | **none** | ADMIN only |
| `audit GET`, `overview GET` | no | n/a | ADMIN only |

`canGrantRole` is used correctly in `users POST` and in the `body.role` branch of `users/[id] PATCH`. The `SUPER_ADMIN`-only concept is otherwise applied only to `env` reveal and secret writes, and both of those gates are reachable around.

### 2.7 Billing: checkout → callback → webhook → fulfilment
1. `POST /api/billing/checkout` writes `BillingRecord(PENDING)` + `PaymentCheckout(PENDING)` with a 12-byte random `customerReference`, then calls `sendPayment` with `callBackUrl=…&ref=<customerReference>`, `webhookUrl=/api/billing/webhook`, and `userDefinedField=checkout.id`.
2. The browser returns to `/billing/callback` → `GET /api/billing/callback?...&ref=…`, which enforces session, rate limit and ownership-by-`ref`, then calls `fulfillCheckout`.
3. MyFatoorah posts to `/api/billing/webhook`, which verifies the HMAC, writes a durable `PaymentWebhookEvent` keyed on a fingerprint, and calls `fulfillCheckout` for paid invoices.
4. `fulfillCheckout` (`src/lib/billing.ts:26-…`) resolves by `checkoutId | customerReference | invoiceId`, returns early when already `PAID` (idempotent), and asserts the paid amount/currency against the stored order.

**Can the callback be forged?** Not for a foreign checkout: the caller must hold a session, and a supplied `ref` must belong to that user. The residual weaknesses are that the `paymentId`-only branch is dead (defect #12) and that the post-fulfil ownership test is a check-after-write.
**Idempotency/concurrency:** state transitions are idempotent at the `fulfillCheckout` level and duplicate-suppressed at the webhook level, but there is no transaction or lock around the webhook's find-then-create, and the recurring branch can mark an unapplied charge `PROCESSED` (defect #5).
**Entitlement grant condition:** amount + currency must match the stored order, and the checkout must not already be `PAID`.

### 2.8 Invitations and role escalation
`POST /api/invitations` → `Invitation_Service`, which checks `actor.membershipRole`/`platformRole`, the seat allowance, a hashed single-use token with a TTL, and binds acceptance to the invited address (`ACCOUNT_EXISTS` → 401 forces the invitee to sign in). Acceptance re-reads token/address/account/membership/role/seat inside a serializable transaction.
`POST /api/workspaces` is a **second, unguarded invite path**: `workspaceInviteSchema` caps the granted role at `ADMIN|MEMBER` (so no `OWNER` escalation), but there is no seat check, no token, no consent and no expiry — a workspace manager simply materialises a membership.

### 2.9 Tenant isolation
Correct and consistent in `notifications`, `notifications/dismiss`, `staff`, `onboarding`, `restrictions`, `approval-policy`, `invitations` (including a workspace-bound pagination cursor), `files` (double-checked: `assertWorkspaceStoragePath` plus a second assertion inside `readWorkspaceStoredFile`), and `workspaces GET`.
`billing`, `billing/recurring*`, and `billing/callback` scope by **`session.user.id`, not `workspace.id`** — deliberate, but it means billing and entitlements use different tenancy keys. `admin/*` is platform-wide by design.

### 2.10 Error responses leaking internal detail
The central mapper never echoes a thrown message. Five in-scope places bypass it:

| Location | Leak |
|---|---|
| `admin/ai-providers/models/route.ts:42` | `err.message` in a 500 body |
| `admin/ai-providers/models/route.ts:179` | raw upstream fetch message in a 400/422 body |
| `ready/route.ts:34` | `err.message.slice(0,120)` from a DB failure, **unauthenticated** |
| `cron/billing-reconcile/route.ts:28`, `cron/notification-dispatch/route.ts:37` | `err.message` (cron-secret gated) |
| `cron/expiry-notifications/route.ts:107,191,208` | provider error strings in the returned `errors[]` |

Logging: `src/lib/auth.ts` writes the submitted **email address** into `console.warn` on every rejected login (lines 117, 152, 164, 178) and into `audit()` details. That is PII in application logs on an unauthenticated path, and it is not routed through `redactSensitiveText`. `admin/ai-providers/[id]/route.ts:141` stores the entire submitted `data` object in the audit trail.

---

## 3. Gaps and defects

### CRITICAL

**1. [CRITICAL] security — `src/app/api/admin/env/route.ts:39` (with `src/lib/bootstrap.ts:317-320`) — plaintext `DATABASE_URL` (and `REDIS_URL`) returned to any `ADMIN` without the SUPER_ADMIN reveal gate**
```ts
value: s.isSecret && !reveal ? maskSecret(plain) : plain,
```
Masking is decided by the `isSecret` column, which `bootstrap.ts` derives from a name heuristic:
```ts
isSecret: e.key.includes("KEY") || e.key.includes("SECRET") || e.key.includes("PASSWORD"),
```
`"DATABASE_URL"` matches none of those, so its row is seeded with `isSecret: false` while `valueEncrypted = encryptValue(process.env.DATABASE_URL)` (`bootstrap.ts:309-310`). A plain `GET /api/admin/env` by any `ADMIN` therefore returns the full Neon connection string — user, password, host, database — unmasked, with **no `?reveal=1`, no `requireSuperAdmin()` check, and no audit entry** (the audit at lines 47-55 only fires when `reveal` is set). `REDIS_URL` and `VECTOR_DB_URL` have the same shape.
**Fix:** decide masking from a server-side classification, not a mutable column — e.g. mark every `ENV_CATALOG` entry with an explicit `isSecret` boolean (`DATABASE_URL`, `REDIS_URL`, `VECTOR_DB_URL`, `NEXTAUTH_SECRET`, `ARABCLUE_ENC_KEY`, `JWT_SECRET`, all `*_API_KEY`) and treat any key not in the catalog as secret by default. Never return a decrypted value unless `reveal` **and** `requireSuperAdmin()` both hold, and audit every decrypted read.

**2. [CRITICAL] security — `src/app/api/admin/env/[key]/route.ts:43-52` — an `ADMIN` can downgrade any secret to non-secret and then read it, bypassing the SUPER_ADMIN reveal gate**
```ts
const updated = await db.envSetting.update({
  where: { key },
  data: { category: body.category ?? undefined, description: body.description ?? undefined,
          isSecret: body.isSecret ?? undefined, lastEditedBy: session.user.id },
});
```
The handler is gated by `requireAdmin()` only (line 15) — there is no `requireSuperAdmin()` and no `CRITICAL_ENV_KEYS` check, unlike the sibling `POST /api/admin/env:83`. So `PATCH /api/admin/env/MYFATOORAH_API_KEY {"isSecret": false}` followed by `GET /api/admin/env` returns the plaintext API key to a non-super administrator. This branch also writes **no audit entry**, so the downgrade is invisible. `DELETE` on the same route will remove `ARABCLUE_ENC_KEY`, `NEXTAUTH_SECRET` or `DATABASE_URL` for the same role.
**Fix:** require `SUPER_ADMIN` for any write or delete on this route; refuse `isSecret: false` outright (secrecy should be catalog-derived, not caller-supplied); refuse `DELETE` for `CRITICAL_ENV_KEYS`; audit every branch.

### HIGH

**3. [HIGH] security — `src/app/api/admin/users/[id]/route.ts:27-42` — the SUPER_ADMIN protection is nested inside `if (body.role)`, so an `ADMIN` can deactivate or de-MFA a `SUPER_ADMIN`**
```ts
if (body.role) {
  if (!canGrantRole(session.user.role, targetRole)) { … 403 }
  if (before.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") { … 403 }
}
const updated = await db.user.update({ where: { id },
  data: { role: body.role ?? undefined, active: body.active ?? undefined,
          mfaEnabled: body.mfaEnabled ?? undefined, locale: body.locale ?? undefined } });
```
`PATCH /api/admin/users/<super-admin-id> {"active": false}` omits `role`, skips both guards, and disables the platform owner (then `revokeUserSessions` logs them out). `{"mfaEnabled": false}` strips their second factor. The sibling `DELETE` gets this right (line 116, outside any conditional).
**Fix:** hoist the `before.role === "SUPER_ADMIN"` check out of the `if (body.role)` block so it applies to every field; also reject self-deactivation in `PATCH` as `DELETE` already does; and refuse `mfaEnabled: true` when the target has no `mfaSecret` (it makes login impossible — `src/lib/auth.ts:176-182`).

**4. [HIGH] correctness — `src/proxy.ts:29-57` vs `src/app/api/invitations/accept/route.ts:24-25` — the public invitation-acceptance API is blocked by the proxy for the unauthenticated invitees it exists to serve**
`isPublicPath` lists `/api/health`, `/api/ready`, `/api/billing/webhook`, `/api/auth*`, `/api/cron*`, `/_next`, `/favicon`, `/samples`, the extension config and two downloads. `/api/invitations/accept` is not among them, so `authorized: ({token}) => … return !!token` returns `false` and `withAuth` redirects the request to `/login`. Yet the route is `withPublicRoute`, reads the session optionally, and returns `accountCreated: result.createdUser` — it is explicitly designed to create an account for an invitee who has none, and `/invite` is itself in `PUBLIC_AUTH_PAGE_PATHS` (`src/lib/marketing/site-pages.ts:149`). The client at `src/app/invite/page.tsx:78` will receive the login page instead of JSON.
**Fix:** add `/api/invitations/accept` to `PUBLIC_PATHS` in `src/proxy.ts` (it is already token-authenticated at the application layer), and add an end-to-end test that accepts an invitation with no session cookie.

**5. [HIGH] correctness — `src/app/api/billing/webhook/route.ts:178-181, 212-214, 247-254` — a failed recurring-charge application is recorded `PROCESSED` and answered 200, so the provider never retries**
```ts
} catch (err) {
  console.error("[webhook] Failed to handle recurring charge success:", err);
  // Continue to update event status
}
```
Control leaves the `if (isSuccessfulCharge …)` block, both remaining branches are false for an `ACTIVE`/`COMPLETED` status, and execution reaches the default handler at line 247, which sets `processingStatus: "PROCESSED"`, `disposition: "recurring_active"`, `processedAt` and returns `jsonOk`. MyFatoorah treats 200 as delivered. The same path is taken when `handleRecurringChargeFailure` throws, and when a successful `RECURRING_UPDATES` event carries no `Invoice.Id` (line 154 requires `invoiceId`). Net effect: the customer is charged at the provider and the local subscription is never extended, with no retry and no alert.
**Fix:** on a handler exception, set `processingStatus: "FAILED"` with the error, and rethrow so `handleRoute` answers 5xx and the provider retries; treat "success event with no invoice id" as `FAILED`/`RECEIVED` rather than `PROCESSED`.

**6. [HIGH] security — `src/app/api/workspaces/route.ts:148-159` — direct membership creation bypasses the seat allowance and the invitation flow**
```ts
const member = await db.workspaceMember.create({
  data: { workspaceId: workspace.id, userId: invitee.id, role: parsed.data.role },
  …
});
```
`Invitation_Service` treats the seat allowance as a hard gate — `if (seatAllowanceExhausted(usage)) return { ok:false, status:429, code:"SEAT_LIMIT_REACHED" }` (`src/lib/invitation-service.ts:786-788`), enforced again at acceptance (line 1115). This route performs no such check, issues no token, sets no expiry, and adds the user without any consent step or notification. Any workspace `OWNER`/`ADMIN` (or any platform `ADMIN`, via `isWorkspaceManager`) can therefore exceed the paid seat count indefinitely.
**Fix:** delete this handler and route the UI (`sidebar.tsx:290`, `account-onboarding.tsx:356`) at `POST /api/invitations`; or, at minimum, call the same seat-allowance check and write an invitation record before creating the membership.

**7. [HIGH] security — `src/lib/cron-auth.ts:24-26` plus the `GET` alias in all four cron routes — the cron secret is accepted in a query string and compared non-constant-time**
```ts
const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
if (bearer === secret || headerSecret === secret || querySecret === secret) return null;
```
Every cron route also exports `export async function GET(req) { return POST(req) }`, so `GET /api/cron/expiry-notifications?secret=<CRON_SECRET>` sends production email, and `GET /api/cron/billing-reconcile?secret=…` drives payment-state changes. A URL carrying the secret is persisted by CDN and proxy access logs, browser history, and `Referer` headers on any subsequent navigation. `===` on a secret is also a timing oracle.
**Fix:** drop the `secret` query parameter entirely (Vercel Cron sends `Authorization: Bearer`), and compare with `crypto.timingSafeEqual` over equal-length buffers.

**8. [HIGH] security — `src/app/api/admin/ai-providers/models/route.ts:40-47, 179 and 135-140` — raw error messages returned to the client, and a caller-controlled outbound fetch target**
```ts
return NextResponse.json(
  { error: err instanceof Error ? err.message : "Models endpoint failed", models: [], code: "INTERNAL" },
  { status: 500 }
);
```
Both this catch-all and the soft-failure branch (`error: message`, line 179) return the raw thrown text, bypassing `redactSensitiveText`/`mapErrorToApiFailure`; upstream HTTP client errors routinely embed the request URL and response body. Separately, `apiBase` comes straight from the request body (line 106/119) and is handed to `fetchLiveProviderModels` with a credential resolved from `apiKeyEnvKey`. Combined with the already-known arbitrary-`process.env` read in `resolveProviderApiKey`, an administrator (or anyone who can CSRF one, since there is no CSRF token on these JSON endpoints) can direct the server to POST an arbitrary environment variable as a bearer token to an arbitrary host.
**Fix:** wrap the handler in `withAdmin` and let the central mapper build the body; allow-list `apiBase` against the known provider hosts (as `resolveMyFatoorahBaseUrl` already does for payments) and reject private/link-local targets; restrict `apiKeyEnvKey` to a fixed catalog.

**9. [HIGH] security — `src/app/api/auth/precheck/route.ts:48-68` — an unauthenticated credential-validation oracle with weaker controls than the login path**
```ts
const valid = await verifyPassword(password, user.passwordHash);
if (!valid) return NextResponse.json({ ok:false, error:"invalid_credentials" }, { status:401 });
return NextResponse.json({ ok: true, mfaRequired: user.mfaEnabled, name: user.name });
```
Compared with `authorize()` in `src/lib/auth.ts`, this route: writes **no audit entry** on failure (so brute force against it is invisible in the audit trail); does not apply `isProductionBlockedDevelopmentIdentity`; ignores `mustChangePassword` and `emailVerified`; permits 20 attempts per 15 min versus login's 10; is keyed **only** on the email address, so password spraying across many accounts from one host is unthrottled; and discloses the account holder's real `name` plus their MFA posture on success.
**Fix:** audit every failure with the same `LOGIN_FAILED` action, add a source-address limb to the limiter, apply the reserved-identity check, and reduce the success body to `{ok:true, mfaRequired}`.

**10. [HIGH] security / missing-feature — MFA has no recovery codes and `setup` disables MFA before the replacement is proven**
`src/app/api/auth/mfa/setup/route.ts:53-56`:
```ts
await db.user.update({ where: { id: user.id }, data: { mfaSecret: secret, mfaEnabled: false } });
```
An abandoned rotation (user scans nothing, closes the tab) leaves the account with MFA switched off and a secret nobody holds. There is no compensating control, because `recoveryCode|backupCode|mfaRecovery|recovery_codes` has **zero matches repository-wide**: a user who loses their authenticator cannot self-recover, and an administrator "fix" via `PATCH /api/admin/users/[id] {mfaEnabled:false}` leaves the stale `mfaSecret` in place. Neither `setup` nor `verify` nor `disable` requires password re-authentication, so a single hijacked session plus one observed TOTP is enough to strip or re-enroll the second factor.
**Fix:** stage the new secret in a separate `pendingMfaSecret` column and only promote it (and only then set `mfaEnabled`) in `mfa/verify`; issue single-use hashed recovery codes on enable and accept them at login and at disable; require the current password for enroll, rotate and disable; email the account holder on every MFA state change.

**11. [HIGH] correctness — `src/app/api/cron/expiry-notifications/route.ts:30-37, 111-122` — the 100-row scan window is permanently occupied by already-notified records**
```ts
const certs = await db.certificate.findMany({
  where: { expiresAt: { not: null, lte: in30 }, revokedAt: null },
  take: 100, orderBy: { expiresAt: "asc" },
});
```
The query has no cursor and no predicate excluding rows already present in `ExpiryNotificationLog`; deduplication happens *inside* the loop (line 43-56) after the 100 slots are already spent. Once a hundred certificates sit at the head of the `expiresAt asc` ordering with a log row each, every subsequent run skips all 100 and notifies nobody — the 101st expiring certificate is never emailed. The subscription scan (line 120) has the identical shape. With the cron running once a day (`vercel.json:22-24`) there is no second pass.
**Fix:** exclude already-logged rows in the query (a `NOT EXISTS` against `ExpiryNotificationLog`, or a `lastNotifiedAt` column) and paginate with a keyset cursor until the batch is exhausted or the time budget is spent.

**12. [HIGH] reliability — `src/app/api/cron/notification-dispatch/route.ts` + `vercel.json:25-28` — a daily cron cannot satisfy the route's own 30-minute delivery deadline**
The docstring states: *"sends them via Resend with a 10-second provider timeout and at most three attempts within the 30-minute delivery deadline (requirements 17.4–17.6)"*, but the schedule is `"30 5 * * *"` — once per day — and `batchSize: 50`. A notification queued at 05:31 is delivered roughly 24 hours later, and the outbox drains at most 50 messages per day.
**Fix:** schedule at `*/5 * * * *` (or drive the outbox from a queue), raise the batch size, and add an alert when the oldest `PENDING` row exceeds the deadline.

**13. [HIGH] security — `src/app/api/approval-policy/route.ts:36` — any non-`REVIEWER` member can rewrite the proposal approval chain, unaudited**
```ts
export async function PUT(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
```
`withTenant("writer")` only excludes `REVIEWER`. Neither `isWorkspaceManager` nor `requireWorkspaceRole(WORKSPACE_MANAGER_ROLES)` is applied, so an ordinary `MEMBER`/`BIDDER` can `PUT` a single-step policy naming themselves as `FINAL` reviewer and thereafter self-approve tenders — the core governance control of the product. The transaction deletes every existing step (line 61) and writes no audit entry, in contrast with `workspaces PATCH`, which audits a company-name change.
**Fix:** add `requireWorkspaceRole(ctx, WORKSPACE_MANAGER_ROLES)` (or `isWorkspaceManager`) at the top of `PUT`, write a `CONFIG_CHANGE` audit entry recording the before/after chain, and reject a policy in which the acting user is the sole reviewer.

**14. [HIGH] security — `src/app/api/admin/myfatoorah/route.ts:202-217` — payment credentials are rotatable by `ADMIN`, bypassing the `SUPER_ADMIN` gate that guards the same rows elsewhere**
```ts
if (body.apiKey?.trim()) { await upsertSecret("MYFATOORAH_API_KEY", body.apiKey.trim(), …); }
if (body.webhookSecret?.trim()) { await upsertSecret("MYFATOORAH_WEBHOOK_SECRET", …); }
```
`POST /api/admin/env` refuses to write any key containing `KEY` or `SECRET` unless `session.user.role === "SUPER_ADMIN"` (line 83), but `withAdmin` here admits plain `ADMIN`. Writing a new `MYFATOORAH_WEBHOOK_SECRET` lets the actor forge webhook signatures; writing `MYFATOORAH_API_KEY` redirects live payments.
**Fix:** require `SUPER_ADMIN` for the `save`/`rotate` actions on this route so both write paths to the same rows share one privilege boundary.

### MEDIUM

**15. [MEDIUM] security — `src/app/api/auth/password/route.ts:54-57` — a password change does not revoke other sessions**
```ts
await db.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
```
`revokeUserSessions(userId)` exists (`src/lib/auth.ts:462-464`) and is used by the admin routes, but not here. A user who changes their password because they suspect compromise leaves every existing 12-hour JWT session — including the attacker's — fully valid, because the `jwt` callback only revokes when the `UserSession` row is gone.
**Fix:** call `revokeUserSessions(user.id)` (optionally preserving the current `session.sessionToken`) inside the same transaction as the hash update.

**16. [MEDIUM] security — `src/app/api/auth/profile/route.ts:88-101` — an email change keeps the account verified and does not revoke sessions**
```ts
data.email = nextEmail;
```
The update writes the new address with no reset of `emailVerified`, no verification token issued to the new address, no notification to the old address, no `isProductionBlockedDevelopmentIdentity` check, and no session revocation — even though the address is the recovery identifier used by `/api/auth/forgot-password`. Uniqueness is a read-then-write (line 95), so a concurrent pair of requests is resolved only by the database unique index, and the resulting `P2002` surfaces as a generic 500 rather than the `EMAIL_ALREADY_IN_USE` 409 the code intends.
**Fix:** on an address change set `emailVerified = false`, issue a verification token to the new address, notify the old one, revoke sessions, apply the reserved-identity check, and catch `P2002` to return 409.

**17. [MEDIUM] security — `src/app/api/ready/route.ts:34` — a database error message and a full infrastructure fingerprint are served to unauthenticated callers**
```ts
detail: err instanceof Error ? err.message.slice(0, 120) : "unavailable",
```
`/api/ready` is in `PUBLIC_PATHS`. Prisma connection failures carry the host, port and database name; the healthy response additionally discloses unapplied migration names, affected capabilities, whether `NEXTAUTH_SECRET`/`ARABCLUE_ENC_KEY` are configured, the active AI-provider count, the MyFatoorah environment, and the storage and rate-limit backends. There is no rate limit on an endpoint that performs four or more backend round-trips per call.
**Fix:** return a fixed `"unavailable"` token publicly and keep the detail in the server log; move the `schema`/`checks` detail behind an admin session or a shared operator token; add a modest rate limit.

**18. [MEDIUM] correctness — `src/app/api/admin/billing/route.ts:16-18, 33-35` — `totalRevenue` sums only the 50 most recent billing records**
```ts
db.billingRecord.findMany({ orderBy: { createdAt: "desc" }, take: 50, … })
…
const revenue = records.filter((r) => r.status === "PAID").reduce((sum, r) => sum + r.amount, 0);
```
The same `records` array feeds both the "recent records" table and the headline revenue figure, so `stats.totalRevenue` silently becomes a rolling 50-row total. `allSubs` on line 22 is meanwhile an unbounded `findMany` with `plan` and `user` included.
**Fix:** compute revenue with `db.billingRecord.aggregate({ _sum: { amount: true }, where: { status: "PAID" } })` and paginate the subscription list.

**19. [MEDIUM] correctness — `src/app/api/admin/billing/reconcile/route.ts:110, 124, 206-209` — keyset pagination filters on `id` while ordering by `createdAt`**
```ts
...(cursor ? { id: { lt: cursor } } : {}),
…
orderBy: [{ createdAt: "desc" }, { id: "desc" }],
```
The cursor predicate constrains only the secondary sort key. Whenever `id` ordering diverges from `createdAt` ordering — backfilled rows, clock skew, bulk imports — pages skip or repeat checkouts, so the reconciliation sweep can permanently miss a mismatched payment. `src/lib/billing.ts:497` has the same defect and a comment asserting the invariant that does not hold.
**Fix:** use a compound cursor: `OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }]`, and encode both fields in the cursor token.

**20. [MEDIUM] reliability — `src/app/api/admin/billing/reconcile/route.ts:303-307` — the bulk item array is unvalidated and uncapped**
```ts
if (body.items && Array.isArray(body.items) && body.items.length > 0) {
  const result = await applyReconciliationBulk({ items: body.items, adminUserId: session.user.id });
```
Element shape is never checked (`providerResult` is a TypeScript-only assertion), and `applyReconciliationBulk` (`src/lib/billing.ts:943`) iterates sequentially with a DB transaction per item. A 50,000-element array runs until the function is killed, having applied a partial prefix. The route also declares no `maxDuration`, while the `GET` report can issue up to 200 provider calls at concurrency 5 with a 10 s deadline each (worst case ≈ 400 s).
**Fix:** parse the body with a Zod schema that caps `items` at `RECONCILE_MAX_LIMIT` and validates each `providerResult`; declare an explicit `maxDuration`; return a cursor when the budget is exhausted.

**21. [MEDIUM] correctness — `src/app/api/billing/callback/route.ts:47, 66-77` with `src/lib/billing.ts:32-49` — the `paymentId`-only callback path can never resolve a checkout**
```ts
if (!paymentId && !ref) { return jsonError("paymentId or ref is required", 400); }
…
const result = await fulfillCheckout({ paymentId, customerReference: ref ?? undefined });
```
`fulfillCheckout` resolves a checkout by `checkoutId`, then `customerReference`, then `invoiceId` — there is no `paymentId` branch. A callback carrying only `paymentId`/`Id` (the parameter MyFatoorah actually appends) therefore always answers `checkout_not_found`, and the "post-fulfill ownership verification (in case paymentId path)" at lines 72-77 is unreachable. As written that check would also be a check-after-write.
**Fix:** add a `paymentId` lookup to `fulfillCheckout`, and resolve-then-authorize-then-fulfil so the ownership test precedes any mutation. Consider making the fulfilment step a `POST`, since a `GET` is prefetchable and reachable by cross-site top-level navigation under `SameSite=Lax`.

**22. [MEDIUM] reliability — `src/app/api/billing/checkout/route.ts:71-96, 149-159` — unlimited, non-transactional checkout creation with an orphaned `PENDING` subscription**
There is no rate limit on a handler that performs two inserts and one outbound MyFatoorah invoice creation, and no check for an existing `PENDING` checkout, so a user can mint unbounded pending invoices (which the reconcile sweep then re-queries against the provider on every run). The three writes are not wrapped in a transaction, so a failure between them orphans a `PENDING` `BillingRecord`; and the `Subscription` created with `status: "PENDING"` at lines 149-159 is not removed when `startRecurringProfile` throws at line 162 — only the checkout and billing record are marked `FAILED` (line 189).
**Fix:** rate-limit per user; reuse or expire an existing `PENDING` checkout for the same plan; wrap the local writes in `db.$transaction`; roll back the placeholder subscription in the recurring catch block.

**23. [MEDIUM] correctness — `src/app/api/workspaces/route.ts:76, 95-103` — the workspace legal profile is written with no validation**
```ts
const body = await req.json().catch(() => ({}));
…
...(body.crNumber !== undefined ? { crNumber: body.crNumber } : {}),
...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber } : {}),
```
`crNumber` (commercial registration) and `vatNumber` are Saudi legal identifiers that flow into generated proposals and letterheads, yet no type, length or format check is applied; a non-string value reaches Prisma and becomes an unhandled 500. `workspaceSwitchSchema` is imported at line 10 and never used, and the switch branch hand-rolls a `typeof` check instead.
**Fix:** add a `workspaceProfileSchema` (CR = 10 digits, VAT = 15 digits, bounded names) and route both `PATCH` branches through `parseJsonBody`.

**24. [MEDIUM] maintainability — eleven `admin/*` handlers have no `try/catch` and do not use `withAdmin`, so Prisma errors escape as unhandled 500s and 401 is reported as 403**
Affected: `admin/users/route.ts:12,46`, `admin/users/[id]/route.ts:14,108`, `admin/audit/route.ts:10`, `admin/overview/route.ts:10`, `admin/plans/route.ts:12,24`, `admin/plans/[id]/route.ts:31,75`, `admin/env/route.ts:13,65`, `admin/env/[key]/route.ts:15,60`, `admin/ai-providers/route.ts:26,70`, `admin/ai-providers/[id]/route.ts:52,157`, `admin/billing/route.ts:11,65`. Each begins:
```ts
const session = await requireAdmin();
if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```
`requireAdmin` returns `null` both for "no session" and for "wrong role", collapsing 401 into 403; it can also *throw* `EmailVerificationRequiredError`, which nothing here catches. Concrete unhandled paths verified: duplicate email on `users POST` (`P2002`), unknown id on `plans/[id] DELETE`, `env/[key] DELETE` and `ai-providers/[id] DELETE` (`P2025`, which the `existing?.isActive` optional chain at `ai-providers/[id]:162` fails to intercept), and `take: NaN` on `audit GET`.
**Fix:** convert all eleven to `withAdmin(...)`, which already separates 401 from 403 and routes every throw through the bilingual mapper.

**25. [MEDIUM] correctness — `src/app/api/admin/audit/route.ts:15, 23, 30-37` — unvalidated `limit` and two unbounded aggregates per request**
```ts
const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
… take: Math.min(limit, 500),
```
`?limit=abc` yields `take: NaN` and a Prisma failure; `?limit=-1` reverses the page. Both `groupBy` calls then scan the entire `auditLog` table with no time bound on every request, on a route the admin UI polls at `?limit=200`.
**Fix:** parse the query with Zod (`coerce.number().int().min(1).max(500)`), add a `createdAt` window to the summaries, and cache or precompute them.

**26. [MEDIUM] correctness — `src/app/api/admin/plans/[id]/route.ts:79-88` — plans are hard-deleted with no subscription check and the wrong audit action**
```ts
await db.subscriptionPlan.delete({ where: { id } });
await audit({ …, action: AUDIT_ACTIONS.PLAN_UPDATE, details: { action: "DELETE" }, severity: "WARN" });
```
Nothing checks `_count.subscriptions` (which the sibling `GET` already selects), so the call either fails on a foreign key as an unhandled 500 or cascades into live subscriptions. The audit trail records the deletion as `PLAN_UPDATE`, so a search for plan deletions finds nothing.
**Fix:** refuse deletion while subscriptions reference the plan (offer `isActive:false` instead), and add a distinct `PLAN_DELETE` audit action.

**27. [MEDIUM] security — `src/app/api/admin/billing/route.ts:64-93` — an entirely unvalidated money-and-quota write**
```ts
const record = await db.billingRecord.create({ data: { userId: body.userId, type: body.type ?? "TOPUP",
  amount: body.amount ?? 0, …, status: body.status ?? "PAID", … } });
if (body.type === "TOPUP" || body.type === "USAGE") {
  await db.subscription.updateMany({ where: { userId: body.userId },
    data: { proposalsUsed: { increment: body.proposalsIncluded ?? 0 }, tokensUsed: { increment: body.tokensIncluded ?? 0 } } });
}
```
`userId` is unchecked (a bad value is an FK 500), `amount` may be negative, `status` may be any string including `PAID`, and the quota increment carries no idempotency key so a retried request double-applies. The audit entry records the amount but not the quota delta.
**Fix:** validate with Zod (known `userId`, non-negative `amount`, enumerated `type`/`status`), require an idempotency key, and perform the record insert and the counter update in one transaction.

**28. [MEDIUM] reliability — `src/app/api/files/route.ts:35-51` — whole-file buffering with no rate limit**
```ts
bytes = await readWorkspaceStoredFile(storagePath, workspace.id, { maxBytes: MAX_DELIVERED_FILE_BYTES });
…
return new NextResponse(new Uint8Array(bytes), { headers: { …policy.headers, "Content-Length": String(bytes.length) } });
```
`MAX_DELIVERED_FILE_BYTES` is 50 MiB and the buffer is copied into a `Uint8Array`, so a single delivery peaks near 100 MiB of heap; a handful of concurrent large downloads will exhaust a function. There is no rate limit, no `Range` support, and no `ETag` — and because every avatar and brand logo is served through this route with `Cache-Control: private, no-store`, each page render re-reads the object. (The security posture of this route is otherwise the strongest in the audited surface.)
**Fix:** stream the body (`ReadableStream` from the storage adapter), support `Range` and conditional requests, and rate-limit per user.

**29. [MEDIUM] maintainability — `ApiError` thrown without a `code` collapses four distinct failures into a generic `INTERNAL_ERROR` body**
`src/app/api/billing/recurring/[id]/cancel/route.ts:51` and `.../resume/route.ts:51`:
```ts
if (err instanceof RecurringBillingError) { throw new ApiError(err.message, err.httpStatus); }
```
With `code` omitted, `mapErrorToApiFailure` (`src/lib/api-failure.ts:429`) falls through to `legacyFailureBody(null)`, which returns the generic internal message with the domain's status — so the caller sees a 409 or 502 whose body says "an internal error occurred". `RecurringBillingError.code` is discarded even though `checkout/route.ts:206-211` shows the correct pattern. Same shape at `notifications/dismiss/route.ts:34` and `staff/route.ts:72` (`new ApiError("Validation failed", 400)`), which also drop the Zod `fieldPaths`.
**Fix:** always pass the registered completion code (and `fieldPaths` for validation failures) as the third `ApiError` argument.

**30. [MEDIUM] correctness — `src/app/api/admin/users/route.ts:63-73` — an administrator-created user has no workspace and no forced password change**
```ts
const created = await db.user.create({ data: { email: …, name: body.name, passwordHash, role,
  mfaEnabled: body.mfaEnabled ?? false, locale: body.locale ?? "ar", active: true } });
```
No `Workspace`, no `WorkspaceMember`, and no `activeWorkspaceId` are created, so `getTenantContext` has nothing to resolve on the user's first request; `mustChangePassword` is not set, so the administrator-chosen password persists indefinitely; `emailVerified` is left at its default; and there is no password-strength requirement at all (`body.password` is only checked for truthiness on line 49), in contrast with the self-service `passwordChangeSchema`, which demands ten characters.
**Fix:** create the account, workspace, membership and `activeWorkspaceId` in one transaction (reuse `Account_Service`), set `mustChangePassword: true`, and validate the payload with Zod including the shared password policy.

### LOW

**31. [LOW] security — `src/app/api/auth/avatar/route.ts:47` — the multipart body is fully buffered before the size check, and superseded avatars are never deleted**
`await req.formData()` materialises the upload in memory; the `file.size > MAX_BYTES` test on line 55 only runs afterwards, so the 2 MiB limit does not bound memory. `saveUpload` writes a new object on every upload and the previous `avatarUrl` target is never removed, growing workspace storage without bound (and counting against `maxStorageGb`).
**Fix:** reject on `Content-Length` before reading, and delete the prior object after a successful update.

**32. [LOW] security — `src/lib/auth.ts:117, 152, 164, 178` — the submitted email address is written to `console.warn` on every failed login**
```ts
console.warn("[auth] authorize rejected: bad_password", { email });
```
This is unauthenticated-attacker-controlled PII in application logs, on the one code path a credential-stuffing run exercises most; it does not pass through `redactSensitiveText`. `admin/ai-providers/[id]/route.ts:141` similarly stores the entire submitted `data` object in the audit trail.
**Fix:** log a hash or a partially masked address, and keep the full value only in the structured `audit()` record.

**33. [LOW] security — `src/proxy.ts:81-86` and `src/lib/auth.ts:75-79` — the verification allowlist is matched by substring**
```ts
return VERIFICATION_ALLOWED.some((allowed) => lower.includes(allowed.toLowerCase()));
```
Any path merely *containing* `/api/auth/session` or `/verify-email` is admitted for an unverified session. Impact is currently nil because `/api/auth/*` is public anyway, but the predicate will silently admit any future route whose path embeds one of these strings.
**Fix:** compare with equality (or a `startsWith` on an exact segment boundary).

**34. [LOW] reliability — `src/app/api/billing/webhook/route.ts:71-80` — find-then-create on `eventFingerprint` is not atomic**
Two concurrent deliveries of the same event both read `null` and both attempt `create`; one dies on the unique constraint and returns 500, prompting a further provider retry. Line 90 also hard-codes `signatureValid: true`, so that column can never record a rejection.
**Fix:** replace the read/create pair with a single `upsert` (or `create` inside a `P2002` catch) and drop or populate the `signatureValid` column meaningfully.

**35. [LOW] correctness — `src/app/api/admin/users/[id]/route.ts:73, 81` — `currentPeriodEnd` is computed with a rolling-over `Date` constructor**
```ts
currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
```
For 31 January this produces 3 March. The value is also always one month ahead even when `billingCycle` is `YEARLY`.
**Fix:** clamp to the last valid day of the target month and honour the billing cycle.

**36. [LOW] correctness — `src/app/api/restrictions/route.ts:5` — `computeOnboardingSteps` is imported and never called**
`POST` and `DELETE` change restriction state without recomputing onboarding progress, although `staff/route.ts:57,104` does exactly that after equivalent mutations, so the "restrictions reviewed" step can report stale status.
**Fix:** call `computeOnboardingSteps(workspace.id)` after both mutations, or remove the import.

**37. [LOW] reliability — `src/app/api/onboarding/route.ts:49-51` — unguarded `JSON.parse` of a stored column**
```ts
...(existing?.completedSteps ? JSON.parse(existing.completedSteps) : {}),
```
A malformed stored value throws a `SyntaxError` mapped to a generic 500 with no indication of the real cause, and the workspace's onboarding becomes permanently un-updatable.
**Fix:** parse defensively and fall back to `{}`.

**38. [LOW] performance — unbounded list queries on tenant read paths**
`notifications/route.ts:40-46` (`certificate.findMany`, no `take`), `workspaces/route.ts:23-37` (both member queries, no `take`), `staff/route.ts:29-32`, `restrictions/route.ts:11-14`, `approval-policy/route.ts:20-23`, and on the admin side `admin/users/route.ts:15-41` and `admin/billing/route.ts:22-28`.
**Fix:** add `take` with a cursor to each.

**39. [LOW] security — `src/app/api/workspaces/route.ts:26-36` — every member's `email` and `mfaEnabled` is disclosed to every member**
`mfaEnabled` per colleague tells an attacker inside a workspace exactly which account to target. `approval-policy/route.ts:20-23` exposes the same member list (without `mfaEnabled`).
**Fix:** drop `mfaEnabled` from the member projection, and restrict the address list to workspace managers.

**40. [LOW] maintainability — three response shapes coexist for failures**
The bilingual `ApiFailure` (`{ok:false, code, message:{ar,en}, error}`) is the documented contract, but `src/app/api/auth/mfa/verify/route.ts:45` returns `zodErrorResponse`'s `{error:"Validation failed", issues:[…]}`, `src/proxy.ts:121-124` returns `{error:"Password change required", code:"MUST_CHANGE_PASSWORD"}`, `src/proxy.ts:152` returns `{error:"Forbidden"}`, and every `admin/*` route plus `files/route.ts:18` returns a bare `{error:"…"}`. Clients cannot rely on one parser.
**Fix:** route all of them through `jsonApiFailure` / the proxy's `bilingualFailureBody` helper (already present at `proxy.ts:21-26`).

**41. [LOW] maintainability — `src/lib/rate-limit.ts:352-357` — the synchronous `rateLimit()` export has two identical branches**
```ts
if (redisClient?.isReady) { return memoryRateLimit(opts); }
return memoryRateLimit(opts);
```
The `isReady` test is dead code. No in-scope route uses this export (they all use `rateLimitAsync`), but the shape invites a caller to assume distributed behaviour it does not provide.
**Fix:** delete the branch and rename the export to make the in-memory semantics explicit.

**42. [LOW] correctness — `src/app/api/auth/return-to/route.ts:25-31` — the clearing cookie's `secure` attribute does not match the setter's**
`proxy.ts:110` sets it with `secure: req.nextUrl.protocol === "https:"`; this route clears it with `secure: process.env.NODE_ENV === "production"`. On a non-production deployment behind TLS the two disagree.
**Fix:** derive `secure` from the request protocol in both places.

**43. [LOW] security — IP-derived rate-limit keys trust an unvalidated `X-Forwarded-For`**
`register/route.ts:84-88`, `forgot-password/route.ts:78-82`, `reset-password/route.ts:80-84`, `verify-email/route.ts:67-71`, `invitations/route.ts:50-54`, `invitations/[id]/route.ts:15-19`, `invitations/accept/route.ts:18-22` all take `forwarded.split(",")[0]`. A client that supplies its own `X-Forwarded-For` header resets any address-keyed limiter (notably the password-reset limiter, which has no other limb).
**Fix:** derive the address from a fixed trusted-proxy depth (right-most entry on Vercel) rather than the left-most.

---

## 4. Needs verification (not confirmed in this pass)

1. **Verification and recovery token hashing at rest.** `Invitation_Service` demonstrably stores a digest (`createTokenDigest`); the equivalent guarantee for `account-service-prisma.ts` (email verification) and `recovery-service-prisma.ts` (password reset) was not read in this pass. If either stores a raw token, a database read grants account takeover.
2. **Webhook fingerprint stability.** `webhookEventFingerprint` (`src/lib/myfatoorah.ts:664`) includes the signature header in the hash material. Idempotency holds only if MyFatoorah's HMAC is deterministic across retries; if the provider ever adds a nonce or timestamp, retries produce distinct fingerprints and events are processed twice.
3. **`SubscriptionPlan → Subscription` referential action.** Whether `plans/[id] DELETE` (defect #26) fails on a foreign key or cascades depends on `prisma/schema.prisma`, which was not read.
4. **`AIProviderConfig.metadata`.** `metadata` appears in `ALLOWED_FIELDS` (`admin/ai-providers/[id]/route.ts:44`); if the Prisma model has no such field, any request including it throws.
5. **`ExpiryNotificationLog.workspaceId` foreign key.** Whether the `?? sub.userId` fallback (defect #11's second limb, line 131) merely corrupts the dedupe namespace or hard-fails on an FK constraint depends on the schema.
6. **CSRF posture of the admin JSON endpoints.** None of the audited routes carries a CSRF token; NextAuth's own CSRF protection covers only `/api/auth/*`. Whether a cross-site `fetch` can reach them depends on `SameSite` on the session cookie (NextAuth's default is `lax`, which would block a cross-site `POST`) — this was not verified against the deployed cookie configuration.
7. **`resolveMyFatoorahBaseUrl` behaviour for an invalid `mode`.** `admin/myfatoorah/route.ts:188` passes an unvalidated `body.mode`; whether it throws or silently defaults was not read.
