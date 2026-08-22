# ArabClue — Core Platform Library Audit (`src/lib/`)

**Repository:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 + PostgreSQL (Neon) · NextAuth v4 · Zod v4 · bun
**Integrations:** MyFatoorah (payments) · Resend (email) · Vercel Blob / local FS (storage) · Redis (optional)
**Audit date:** 2026-08-22
**Method:** Full read of every in-scope file; `prisma/schema.prisma` and `.env.example` read for model/env verification; `.env` inspected for key *names* only (no values). No repository file was modified.

---

## 1. File-by-file map

Line counts are exact (`wc -l`).

### 1.1 Auth / identity / crypto

#### `src/lib/auth.ts` — 464 LOC
**Purpose.** NextAuth v4 configuration (JWT strategy, credentials provider), module augmentation for `Session`/`User`/`JWT`, the unverified-session allowlist, and the server-side authorization helpers used by API routes.
**Exports.** `VERIFICATION_ALLOWLIST: string[]`, `isVerificationAllowedPath(path: string): boolean`, `getRequestPathForVerificationCheck(): string`, `authOptions: NextAuthOptions`, `getSession()`, `requireSession(opts?)`, `requireAdmin(opts?)`, `requireSuperAdmin()`, `requireWriter()`, `requireReviewerAction()`, `canGrantRole()`, `canWriteRole()`, `isWorkspaceManager()`, `revokeUserSessions(userId)`, `EmailVerificationRequiredError`.
**Imports.** `next-auth`, `next-auth/providers/credentials`, `./db`, `./password` (`verifyPassword`), `./mfa` (`verifyMfaToken`), `./audit`, `./rate-limit` (`rateLimitAsync as rateLimit`), `./production-identities`, `./email-verification-policy`.
**Imported by.** Nearly every route under `src/app/api/**`, plus `api-controller.ts`.
**Contract.** `authorize()` receives `{email, password, mfaToken}` and returns a `User` object (whose fields become JWT claims) or `null`. The `jwt` callback re-validates `UserSession` rows and refreshes claims from the DB every `CLAIMS_REFRESH_MS` (60 s).
**Handled.** Sliding-window login limit; reserved development identity blocking; inactive-user rejection; MFA gate; `mustChangePassword` propagation; session revocation via `UserSession` lookup; claim refresh.
**Not handled.** No IP dimension on the login limiter (§4.9); no timing equalization for unknown users (§4.19); MFA failures are not audited (§4.30); no session cap or expired-row sweep (§4.43); the verification allowlist is substring-matched (§4.5).

#### `src/lib/password.ts` — 43 LOC
**Purpose.** scrypt password hashing/verification and the bootstrap-admin password reader.
**Exports.** `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>`, `getBootstrapAdminPassword(): string | null`.
**Imports.** `node:crypto` (`scrypt`, `randomBytes`, `timingSafeEqual`), `util.promisify`.
**Imported by.** `auth.ts`, `account-service.ts`, `recovery-service.ts`, `invitation-service.ts`, `bootstrap.ts`, `src/app/api/auth/password/route.ts`.
**Contract.** Encoded form is `scrypt$<hex salt>$<hex 64-byte key>`. Minimum plaintext length 10. Unknown/placeholder formats verify to `false` (fail-closed).
**Handled.** `timingSafeEqual` with a length pre-check; explicit rejection of `$argon2id$demo$` and `placeholder` hashes.
**Not handled.** Cost parameters are Node defaults and are not encoded in the hash, so there is no rehash-on-login upgrade path (§4.14). No pepper.

#### `src/lib/mfa.ts` — 35 LOC
**Purpose.** TOTP secret generation, token verification, and enrollment QR rendering.
**Exports.** `generateMfaSecret(): string`, `verifyMfaToken(secret, token): boolean`, `buildMfaQrDataUrl({email, secret, issuer?})`.
**Imports.** `otplib` (`generateSecret`, `generateURI`, `verifySync`), `qrcode`.
**Imported by.** `auth.ts`, `src/app/api/auth/mfa/{setup,verify,disable}/route.ts`.
**Handled.** Whitespace stripping in the submitted token; exceptions swallowed to `false`.
**Not handled.** No explicit `window`/`step`; no used-code ledger, so a code is replayable for its whole validity window (§4.7); no recovery codes anywhere in the codebase; the secret is persisted in plaintext (§4.6).

#### `src/lib/crypto.ts` — 66 LOC
**Purpose.** AES-256-GCM envelope for `EnvSetting` values, secret masking, and the production secret assertion.
**Exports.** `encryptValue(plaintext): string`, `decryptValue(ciphertext): string`, `maskSecret(value): string`, `rotateEncryption(ciphertext): string`, `assertProductionSecrets(): void`.
**Imports.** `crypto`.
**Imported by.** `env-settings.ts`, `bootstrap.ts`, `src/app/api/admin/env/**`.
**Contract.** Ciphertext is `base64(iv):base64(authTag):base64(ct)` with a 12-byte random IV. Master key = `sha256(ARABCLUE_ENC_KEY)`.
**Handled.** Authenticated encryption (GCM tag verified on decrypt); random per-message IV; production hard-fail when the key is absent.
**Not handled.** Non-production hardcoded key fallback (§4.2); single-round SHA-256 as the KDF (§4.14 note); no key-version marker and silent `""` on decrypt failure (§4.11); `assertProductionSecrets` covers only two variables (§4.47).

#### `src/lib/tokens.ts` — 83 LOC
**Purpose.** Legacy raw-token helpers plus slug and base-URL utilities.
**Exports.** `generateRawToken(bytes?, randomness?)`, `hashToken(raw)` *(deprecated)*, `slugify(input)`, `randomSuffix(len?, randomness?)`, `buildWorkspaceSlug(name, randomUuid?)`, `getAppBaseUrl(): string`.
**Imports.** `node:crypto`, `./token-digest`, `./runtime-id`.
**Imported by.** `account-service.ts`, `recovery-service.ts`, `invitation-service.ts`, `bootstrap.ts`.
**Handled.** Randomness length validation and `Uint8Array` shape assertions; Unicode-aware slugification with an ASCII fallback of `"ws"`.
**Not handled.** `getAppBaseUrl()` prefers `NEXT_PUBLIC_APP_URL`, while `myfatoorah.appBaseUrl()` prefers `NEXTAUTH_URL` — opposite precedence (§4.48).

#### `src/lib/token-digest.ts` — 298 LOC
**Purpose.** Versioned token issuance and verification. This is the strongest module in the audit.
**Exports.** `CURRENT_TOKEN_DIGEST_VERSION`, `LEGACY_TOKEN_DIGEST_VERSION`, `MAX_RAW_TOKEN_LENGTH`, `MAX_LEGACY_TOKEN_AGE_MS`, `nodeCryptographicRandomSource`, `IssuedTokenDigest`, `StoredTokenDigest`, `TokenDigestLookup`, `LegacyTokenReadPolicy`, `createTokenDigest(options?)`, `issueTokenDigest` (alias), `getTokenDigestLookup(raw)`, `verifyTokenDigest(raw, stored, options?)`, `hashLegacyToken(raw)`.
**Imports.** `node:crypto`, `./time`.
**Imported by.** `tokens.ts`, `account-service.ts`, `recovery-service.ts`, `invitation-service.ts` and their Prisma adapters.
**Contract.** Raw token is `ac.v1.<base64url salt>.<base64url secret>`; stored digest is `HMAC-SHA256(salt, "arabclue:token-digest:v1\0" || secret)`. 32-byte salt and 32-byte secret by default (256 bits of entropy).
**Handled.** Constant-time comparison of both salt and digest; strict base64url round-trip validation; length bounds (16–64 bytes) on both components; expiry checked before comparison; legacy SHA-256 tokens accepted only under an explicit `LegacyTokenReadPolicy` with a ≤7-day age ceiling and an optional sunset date; a malformed `ac.`-prefixed token is rejected rather than silently downgraded to the legacy path.
**Not handled.** Nothing material. Single-use enforcement lives in the callers (`consumedAt` columns), not here.

#### `src/lib/account-service.ts` — 888 LOC
**Purpose.** Domain service for self-serve registration and email verification, written against injected ports.
**Exports (selection).** `REGISTRATION_FIELD_BOUNDS`, `REGISTRATION_RATE_LIMIT`, `VERIFICATION_RATE_LIMIT`, `VERIFICATION_EMAIL_DEADLINE_MS`, `AccountRepository`, `AccountEmailProvider`, `AccountAuditSink`, `createAccountService(deps)`, `DuplicateAccountEmailError`, error/result unions.
**Imports.** `./token-digest`, `./time`, `./provider-timeout`, `./production-identities`, `./email-verification-policy`, `./tokens`, `./password`, `./account-verification-email`, `./rate-limit`.
**Imported by.** `account-service-prisma.ts`, `src/app/api/auth/register/**`, `src/app/api/auth/verify-email/**`, tests.
**Handled.** Field bounds; strict email syntax; per-email and per-IP registration limits; reserved development identity blocking; provider deadlines on email delivery; uniform responses that do not disclose whether the address already exists.
**Not handled.** Email delivery is best-effort — when Resend is unconfigured the flow still reports success (§4.33).

#### `src/lib/account-service-prisma.ts` — 325 LOC
**Purpose.** Prisma/Resend adapters for the account service.
**Exports.** `createPrismaAccountRepository()`, `createResendAccountEmailProvider()`, `createPrismaAccountAuditSink()`, `createPrismaAccountService()`.
**Handled.** `$transaction` with `isolationLevel: "Serializable"` for user + workspace + membership + token creation; `P2002` mapped to `DuplicateAccountEmailError`; missing-table errors mapped to `SchemaMigrationPendingError`.

#### `src/lib/account-verification-email.ts` — 133 LOC
**Purpose.** Bilingual (ar/en) verification email body construction.
**Exports.** `VERIFICATION_LINK_EXPIRY_HOURS`, `buildVerificationEmailContent(...)`.
**Handled.** HTML escaping of interpolated values; the raw token appears only in the link, never in the subject or in log lines.

#### `src/lib/recovery-service.ts` — 752 LOC
**Purpose.** Password-recovery domain service (request, validate, reset).
**Exports (selection).** `RECOVERY_TOKEN_TTL_MS`, `RECOVERY_EMAIL_BOUNDS`, `RECOVERY_PASSWORD_BOUNDS`, `RECOVERY_REQUEST_RATE_LIMIT`, `RECOVERY_TOKEN_SUBMISSION_RATE_LIMIT`, `RecoveryRepository`, `RecoveryEmailProvider`, `RecoveryAuditSink`, `createRecoveryService(deps)`.
**Handled.** Anti-enumeration: the request endpoint returns the same accepted response whether or not the address exists; prior tokens invalidated on a new request; token TTL; separate rate limits for request and submission; all sessions revoked on reset.
**Not handled.** Same silent-email caveat as registration (§4.33).

#### `src/lib/recovery-service-prisma.ts` — 290 LOC
**Purpose.** Prisma/Resend adapters for recovery.
**Exports.** `prismaRecoveryRepository`, `resendRecoveryEmailProvider`, `platformRecoveryAuditSink`, `createPrismaRecoveryService()`.
**Not handled.** The reset transaction does not set `isolationLevel: "Serializable"` even though the surrounding comments describe serializable semantics (see *Needs verification* §5.1).

#### `src/lib/email-verification-policy.ts` — 29 LOC
**Purpose.** The `SKIP_EMAIL_VERIFICATION` policy switch.
**Exports.** `isEmailVerificationSkipped(env?)`, `resolveEmailVerifiedClaim(storedVerified, env?)`.
**Imported by.** `auth.ts`, `account-service.ts`, `proxy.ts` consumers, download routes.
**Not handled.** No production guard on the flag (§4.3).

#### `src/lib/production-identities.ts` — 24 LOC
**Purpose.** Detect production runtimes and reserved `@arabclue.local` development identities.
**Exports.** `isProductionRuntime(env?)`, `isReservedDevelopmentIdentity(email)`, `isProductionBlockedDevelopmentIdentity(email, env?)`.
**Handled.** Treats either `NODE_ENV === "production"` **or** any truthy `VERCEL` as production — deliberately broader than the `NODE_ENV`-only checks used elsewhere, which is the correct posture (and highlights the inconsistency in `crypto.ts` and `myfatoorah.ts`).

#### `src/lib/return-to.ts` — 134 LOC
**Purpose.** Signed, HttpOnly retention of the requested app path across sign-in (Requirement 14.10).
**Exports.** `RETURN_TO_COOKIE`, `RETURN_TO_MAX_AGE_SECONDS`, `isRetainableAppPath(value)`, `signReturnTo(path, now?)`, `verifyReturnTo(value, now?)`.
**Imports.** `./dashboard-routes` (`isAppPath`); Web Crypto only, so it runs in both the middleware and Node runtimes.
**Handled.** HMAC-SHA256 over `expiresAt.base64url(path)`; constant-time signature comparison; rejects absolute and protocol-relative URLs, backslashes, `..`, and values over 512 chars; re-validates the decoded path after signature verification; returns `null` when `NEXTAUTH_SECRET` is absent (fail-closed).
**Not handled.** Nothing material.

### 1.2 Tenancy / authorization / limits

#### `src/lib/workspace-context.ts` — 141 LOC
**Purpose.** Resolve the caller's active workspace from membership.
**Exports.** `TenantContext`, `getTenantContext(userId)`, `assertWorkspaceMatch(resourceWorkspaceId, tenantWorkspaceId)`, `setActiveWorkspace(userId, workspaceId)`.
**Imported by.** `api-controller.ts` (`withTenant`), and directly by many routes.
**Contract.** Prefers `User.activeWorkspaceId` when a matching `WorkspaceMember` row exists; otherwise falls back to the oldest membership and repairs `activeWorkspaceId`; otherwise **creates** a workspace with the caller as `OWNER`.
**Handled.** Membership is always re-checked against the database — the `activeWorkspaceId` claim alone is never trusted.
**Not handled.** The auto-provision branch turns "membership revoked" into "new OWNER workspace" and bypasses the plan's `maxWorkspaces` (§4.38).

#### `src/lib/quotas.ts` — 97 LOC
**Purpose.** Plan-limit enforcement before billable actions.
**Exports.** `QuotaExceededError` (`code: "DOCUMENTS" | "PROPOSALS" | "TOKENS" | "INACTIVE"`), `assertWithinQuota(userId, kind, extra?)`, `bumpUsage(userId, kind, amount?)`.
**Contract.** Reads `Subscription` by `userId` (unique) with its `plan`; a limit of `<= 0` means unlimited.
**Not handled.** Per-user rather than per-workspace accounting with an ADMIN bypass (§4.25); storage checks also gated on the token quota (§4.26); wrong error code for storage overflow (§4.27); non-atomic check-then-increment with a swallowed increment (§4.28).

#### `src/lib/rate-limit.ts` — 564 LOC
**Purpose.** Sliding-window limiter over Redis (atomic Lua) with an in-memory fallback, plus a distributed lease primitive.
**Exports.** `requiresDistributedRateLimit(requested, env?)`, `rateLimit(opts)` *(sync, unused)*, `rateLimitAsync(opts)`, `describeRateLimitDenial(result)`, `probeDistributedRateLimitBackend(timeoutMs?)`, `redisReconnectAllowed(...)`, `acquireDistributedLease(...)`, `releaseDistributedLease(...)`, `DistributedLeaseAdmission`.
**Imported by.** `auth.ts`, `account-service.ts`, `contract-draft-admission.ts`, `document-export-guard.ts`, `src/app/api/ready/route.ts`, and ten auth/billing routes.
**Handled.** Atomic `ZADD`/`ZREMRANGEBYSCORE` Lua script with `PEXPIRE`; connect/command deadlines (1 s) and an acquire ceiling (2 s); generation counters so a stale client cannot resurrect itself; explicit `backend: "redis" | "memory" | "unavailable"` in the result; 503-vs-429 mapping in `describeRateLimitDenial`.
**Not handled.** Without `REDIS_URL` the limiter is per-instance memory and `requiresDistributedRateLimit` returns `false`, so nothing fails closed (§4.8). The sync `rateLimit` export is dead code with two identical branches (§4.40).

#### `src/lib/guardrails.ts` — 205 LOC
**Purpose.** LLM input/output guardrails: pricing-request refusal, PII redaction, grounding confidence, toxicity filtering.
**Exports.** `PRICING_REFUSAL_MESSAGE`, `detectPricingRequest`, `detectPricingSuggestion`, `applyInputPiiFilter`, `redactPii`, `applyPricingInputGuardrails`, `estimateGroundingConfidence`, `failsToxicityFilter`, `applyOutputGuardrails`.
**Handled.** Bilingual (Arabic/English) regex families for pricing and PII; output rewriting rather than hard failure.
**Not handled.** Regex-only detection — inherently bypassable; this is an assistive control, not a security boundary.

#### `src/lib/audit.ts` — 106 LOC
**Purpose.** Append-only audit log writer plus the canonical action vocabulary.
**Exports.** `AuditContext`, `audit(ctx)`, `AUDIT_ACTIONS` (48 constants).
**Contract.** `details` is `JSON.stringify`-ed into a text column. Any event at `WARN` or above (plus `ARTIFACT_DOWNLOAD` and `PROPOSAL_GENERATE`) additionally fires `notifyWebhook`.
**Not handled.** Errors are swallowed (§4.29); `details` is forwarded verbatim to an external webhook without redaction (§4.17); no size bound on the serialized payload.

#### `src/lib/cron-auth.ts` — 31 LOC
**Purpose.** Shared-secret authorization for cron endpoints.
**Exports.** `authorizeCron(req): NextResponse | null` (`null` means authorized).
**Handled.** Fails closed with 503 when `CRON_SECRET` is absent or shorter than 16 characters.
**Not handled.** Accepts the secret from the query string and compares with `===` (§4.15).

#### `src/lib/invitation-service.ts` — 1218 LOC
**Purpose.** Workspace invitation domain service (create, list, revoke, accept).
**Exports (selection).** `INVITATION_TOKEN_TTL_MS`, `INVITATION_EMAIL_BOUNDS`, `INVITATION_PAGE_SIZE_MAX`, `InvitationRepository`, `InvitationEmailProvider`, `InvitationAuditSink`, `createInvitationService(deps)`, error/result unions.
**Imports.** `./token-digest`, `./keyset-cursor`, `./time`, `./provider-timeout`, `./production-identities`, `./tokens`, `./password`, `./invitation-email`, `./invitation-roles`.
**Handled.** Manager-role authorization (`OWNER`/`ADMIN` only); seat-limit enforcement; TTL; single-use via `consumedAt`; revocation via `revokedAt`; workspace-scoped keyset pagination; provider deadlines on delivery.

#### `src/lib/invitation-service-prisma.ts` — 661 LOC
**Purpose.** Prisma/Resend adapters for invitations.
**Exports.** `createPrismaInvitationRepository()`, `createResendInvitationEmailProvider()`, `createPrismaInvitationAuditSink()`, `createPrismaInvitationService()`.
**Handled.** `Serializable` transactions; `InvitationTokenRaceError` on concurrent acceptance; users created through an invitation are marked `emailVerified: true` (they proved control of the address by receiving the token).

#### `src/lib/invitation-email.ts` — 151 LOC / `src/lib/invitation-roles.ts` — 66 LOC
Bilingual invitation email construction (`buildInvitationEmailContent`, `buildInvitationUrl`, `INVITATION_LINK_EXPIRY_DAYS`) and the role vocabulary (`INVITATION_TARGET_ROLES = [ADMIN, MEMBER]`, `INVITATION_MANAGER_ROLES = [OWNER, ADMIN]`, `canManageInvitations`, type guards). Target roles deliberately exclude `OWNER`, so an invitation cannot mint a second owner. Both are clean.

### 1.3 Data / infrastructure

| File | LOC | Purpose | Notable |
|---|---|---|---|
| `db.ts` | 28 | Prisma client singleton | Prefers `POSTGRES_PRISMA_URL`, falls back to `DATABASE_URL`; singleton cached only outside production |
| `ensure-db.ts` | 28 | Connectivity gate | Validates **`DATABASE_URL` only** — diverges from `db.ts` (§4.12) |
| `env-settings.ts` | 41 | Decrypted settings reader | `getDecryptedEnv`, `getProviderApiKey`, `resolveProviderApiKey`; `process.env` wins over the DB row |
| `bootstrap.ts` | 439 | Idempotent seed of workspace/admin/plans/providers | Calls `assertProductionSecrets()`; disables reserved identities in production; result cached |
| `schema-guard.ts` | 160 | Maps Prisma missing-schema errors to HTTP 503 | `schemaGuard`, `withSchemaGuard`, `schemaMigrationPendingResponse` |
| `schema-sql.ts` | 2 | Generated SQL snapshot | **Zero importers, stale** (§4.41) |
| `prisma-missing-table.ts` | 67 | Detects P2021/P2022/P2010 | `SchemaMigrationPendingError` |
| `migration-readiness.ts` | 233 | Read-only `_prisma_migrations` ledger check | 3 s timeout; distinguishes connectivity failure from an unreadable ledger |
| `migration-registry.ts` | 356 | Declarative migration → capability → table map | Source of truth for readiness and the runbook |
| `migration-runbook.ts` | 267 | Keeps the deploy runbook in sync with the registry | `validateMigrationRunbook`, `renderMigrationLedger` |
| `migration-sql-policy.ts` | 837 | Static additive-only SQL policy | Region-aware comment/literal masking, then `DROP`/`ALTER TYPE` detection |
| `runtime-id.ts` | 30 | `systemRandomUuid`, `createRuntimeId` | Delegates to `globalThis.crypto.randomUUID` |
| `provider-timeout.ts` | 149 | `AbortSignal` deadlines for provider calls | `withProviderDeadline`, `callProviderWithDeadline`, `MAX_PROVIDER_DEADLINE_MS`; clears its timer in `finally` |
| `keyset-cursor.ts` | 278 | Versioned, workspace-scoped cursor codec | Cursors bind resource + workspace, so cross-tenant replay fails |
| `version-history-cursor.ts` | 213 | Concrete codecs for proposal/document/contract/template history | Built on `keyset-cursor.ts` |
| `canonical-json.ts` | 71 | Deterministic JSON + SHA-256 | Throws on cycles and non-finite numbers |
| `time.ts` | 59 | UTC clock port | `systemUtcClock`, `fixedUtcClock`, `utcNow`, `addUtcMilliseconds`, `utcDeadline`, `isExpired`; validates `Number.isSafeInteger` durations |

### 1.4 Files / IO / communications

#### `src/lib/storage.ts` — 284 LOC
**Purpose.** Storage abstraction over Vercel Blob and the local filesystem with strict key canonicalization.
**Exports.** `getUploadRoot()`, `assertStoragePath(p)`, `assertWorkspaceStoragePath(p, workspaceId)`, `ensureUploadDir(workspaceId)`, `sanitizeFilename(name)`, `saveUpload({workspaceId, originalName, bytes})`, `resolveStoragePath(p)`, `resolveWorkspaceStoragePath(p, workspaceId)`, `readStoredFile(p)`, `fileExists(p)`, `readWorkspaceStoredFile(p, workspaceId)`, `workspaceFileExists(p, workspaceId)`.
**Contract.** Keys are always `uploads/<workspaceId>/<filename>` with at least three segments. Blob is selected when `BLOB_READ_WRITE_TOKEN` is present; on Vercel without it the root becomes ephemeral `/tmp/uploads`.
**Handled (this is a well-built guard).** Rejects absolute paths, `\`, NUL, `?`, `#`, scheme-like prefixes, non-canonical forms (`normalized !== input`), and empty/`.`/`..` segments; requires the `uploads` prefix; `resolveWorkspaceStoragePath` re-derives and re-checks containment; local reads use `lstat` + `isFile()` so a symlink entry cannot be followed; filenames are sanitized to `[A-Za-z0-9._- \u0600-\u06FF]` and truncated to 180 chars, then prefixed with a random 8-char id.
**Not handled.** The non-workspace-scoped `readStoredFile`/`fileExists` remain exported and in use (§4.44).

#### `src/lib/safe-zip.ts` — 200 LOC
**Purpose.** In-memory ZIP extraction with slip and bomb defenses.
**Exports.** `ZIP_LIMITS` (200 entries / 25 MB per entry / 80 MB total / ratio 100), `isZipSlip(name)`, `extractSafeZip(bytes, opts?)`, `isZipBuffer(bytes, name, mime)`, `UPLOAD_ALLOWLIST`, `validateUploadAllowlist(name, mime)`.
**Handled.** Nothing from the archive is ever written to disk — only basenames and buffers are returned, which eliminates ZIP-slip at the sink; `isZipSlip` additionally rejects `..`, absolute paths, drive letters, and NUL; `__MACOSX/` and `.DS_Store` skipped; `.zip` is absent from the inner allowlist so recursive bombs cannot nest.
**Not handled.** The entry is fully decompressed *before* its size is checked (§4.13); the ratio guard reads JSZip private internals (§4.37); `application/octet-stream` skips MIME validation (§4.36).

#### `src/lib/file-delivery-policy.ts` — 198 LOC
**Purpose.** Classify stored files and derive safe response headers.
**Exports.** `StoredFilePreviewKind`, `StoredFileResponsePolicy`, `GENERATED_HTML_PREVIEW_SANDBOX`, `PDF_PREVIEW_USES_SANDBOX`, `sanitizeDownloadFilename`, `classifyStoredFilePreviewKind`, `createPdfPreviewObjectUrl`, `createHtmlPreviewObjectUrl`, `createStoredFileResponsePolicy`.
**Handled.** Extension-driven classification into `pdf | image | text | binary`; unknown types fall back to `application/octet-stream` with `Content-Disposition: attachment`; a restrictive CSP with a sandbox for generated HTML previews; filename sanitization for the `Content-Disposition` header.

#### `src/lib/outbound-webhook.ts` — 68 LOC
**Purpose.** Optional outbound notification of audit/mission events to `WEBHOOK_URL`.
**Exports.** `OutboundWebhookPayload`, `dispatchOutboundWebhook(input)`, `notifyWebhook(input)`.
**Handled.** Zod-validated payload; `http(s)` protocol check; 8-second `AbortSignal.timeout`; no-op when unset.
**Not handled.** No private-range denylist and no payload signature (§4.18); fire-and-forget without `waitUntil` (§4.32).

#### `src/lib/email.ts` — 74 LOC
**Purpose.** Resend wrapper with a logged no-op fallback.
**Exports.** `sendEmail({to, subject, html, text?})`, `isEmailConfigured()`.
**Not handled.** Silently skips delivery when `RESEND_API_KEY` is absent (§4.33) and logs the recipient address in that path (§4.34). The default sender is the shared `onboarding@resend.dev` sandbox identity.

#### `src/lib/notification-service.ts` — 844 LOC / `src/lib/notification-ids.ts` — 3 LOC
Transactional at-most-once notification delivery (`sendTransactionalNotification`, `getNotificationRecipients`, `notifyReviewRequested`, `notifyReviewDecision`, `notifySubscriptionPastDue`, `notifySubscriptionFailed`, `dispatchPendingNotificationEmails`) backed by `NotificationDelivery` + `InAppNotification`, with HTML escaping throughout. `notification-ids.ts` exports only `onboardingNotificationId(missingSteps)`. See *Needs verification* §5.2 regarding event-id determinism.

### 1.5 Billing

#### `src/lib/myfatoorah.ts` — 691 LOC
**Purpose.** Gateway adapter: payment creation, status inquiry, recurring management, webhook verification.
**Exports (selection).** `MYFATOORAH_ALLOWED_BASE_URLS`, `MYFATOORAH_ENV_URLS`, `sarToMinorUnits`, `minorUnitsToSar`, `resolveMyFatoorahBaseUrl`, `environmentFromUrl`, `getMyFatoorahPublicConfig`, `sendPayment`, `initiatePayment`, `getPaymentStatus`, `createRecurringPayment`, `listRecurringPayments`, `cancelRecurringPayment`, `resumeRecurringPayment`, `testMyFatoorahConnection`, `WEBHOOK_V2_SIGNATURE_FIELDS`, `buildWebhookV2CanonicalString`, `signWebhookV2Canonical`, `verifyWebhookSignature`, `webhookEventFingerprint`, `amountsMatch`, `appBaseUrl`.
**Handled.** Base URL allowlisted against six official hosts, so a tampered setting cannot redirect API traffic (a genuine SSRF guard); sandbox URLs rejected when `NODE_ENV === "production"`; SAR-only enforcement; per-event canonical-field signing per the V2 spec; `timingSafeEqual` with a length pre-check; the public config endpoint exposes only booleans and a hostname.
**Not handled.** Signature verification fails open without a secret outside production (§4.1); currency comparison fails open on `null` (§4.20); the idempotency fingerprint includes the caller-supplied signature (§4.21); `isPaid` accepts any historically successful transaction (§4.23); no fetch timeout (§4.31).

#### `src/lib/billing.ts` — 967 LOC
**Purpose.** Checkout fulfillment and reconciliation.
**Exports.** `fulfillCheckout(opts)`, `reconcilePendingCheckouts(opts?)`, `RECONCILE_*` constants, `ReconcileProviderState`, `ReconcileReportItem`, `ReconcileReportResult`, `ReconcileProviderResult`, `ReconcileApplyResult`, `ReconcileBulkApplyResult`, `normalizeProviderState`, `isAmountMismatch`, `getReconciliationReport`, `applyReconciliation`, `applyReconciliationBulk`.
**Handled.** Entitlements are never activated from the redirect alone — `missing_payment_keys` is returned unless a `paymentId` or `invoiceId` can be confirmed with the gateway (a correct and important control); amount/currency mismatch marks the checkout `FAILED` and raises a `CRITICAL` audit event; usage counters reset only on true period renewal; the reconciliation report computes no monetary totals, only stored literals; bounded concurrency (5) and a 10 s per-item deadline.
**Not handled.** The paid-status check and the fulfillment transaction are not a single atomic step (§4.22); the plan label is written to workspaces the payer merely administers (§4.24); dead `shouldReset` expression (§4.39).

#### `src/lib/recurring-billing.ts` — 1926 LOC / `recurring-billing-prisma.ts` — 708 LOC / `recurring-billing-state.ts` — 615 LOC
The recurring subsystem is the most carefully engineered billing code in the repository. `recurring-billing-state.ts` exports `OCCUPYING_RECURRING_STATES`, `RECURRING_AMOUNT_TOLERANCE`, `isRecurringBillingCycle`, `resolveRecurringTransition`, `normalizeRecurringProfileState`, `readStoredPlanAmount`, `parseExactDecimalLiteral`, `amountWithinProviderTolerance`, `currencyEquals` — amounts are parsed from exact decimal literals rather than floats, and the transition table is explicit. `recurring-billing.ts` exports `createRecurringBillingService` plus `startRecurringProfile`, `cancelRecurringProfile`, `resumeRecurringProfile`, `handleRecurringChargeSuccess`, `handleRecurringChargeFailure` against `RecurringBillingRepository` and `RecurringProviderAdapter` ports. `recurring-billing-prisma.ts` supplies `Serializable` Prisma adapters. See *Needs verification* §5.3–5.5.

#### `src/lib/marketing-plans.ts` — 98 LOC
Static marketing plan catalogue: `MARKETING_PLANS`, `findPlan(id)`, `formatSar(value)`. Presentation only — not an authorization source.

### 1.6 API plumbing / validation

| File | LOC | Exports | Notes |
|---|---|---|---|
| `api-controller.ts` | 307 | `jsonOk`, `jsonFailure`, `jsonApiFailure`, `jsonError`, `toErrorResponse`, `withTenant`, `withAdmin`, `handleRoute`, `withPublicRoute`, `parseJsonBody`, `parseSearchParams`, `parseWithSchema`, `requireWorkspaceRole`, `requireTenantRecord`, `requireTenantOwnership` | `withTenant` composes session → tenant context → handler and centralizes error mapping |
| `api-client.ts` | 58 | `ApiClientError`, `apiJson` | Client-side fetch that surfaces the bilingual message |
| `api-failure.ts` | 460 | `ApiError` + typed subclasses, `resolveFailureStatus`, `apiFailure`, `mappedApiFailure`, `internalFailure`, `zodFieldPaths`, `validationFailure`, `schemaPendingFailure`, `redactSensitiveText`, `failureLogRecord`, `mapErrorToApiFailure`, `legacyFailureBody` | Includes an explicit `redactSensitiveText` pass before logging — a good pattern that `audit.ts` does not reuse |
| `api-failure-message.ts` | 89 | `BilingualMessage`, `ApiFailure`, `isApiFailure`, `selectApiFailureMessage`, `selectApiFailureCode` | Dependency-free, safe for client bundles |
| `api-types.ts` | 339 | ~40 `Api*` DTOs | Types only |
| `validation.ts` | 315 | ~30 Zod schemas plus `zodErrorResponse`, `parseJsonBody` | Bounded strings throughout |
| `validation-gate.ts` | 343 | `ValidationIssue`, `ValidationReport`, `stripApprovedTechnicalTokens`, `assessDocumentLanguagePurity`, `validateProposalOutput`, `assertExportAllowed`, `formatValidationToast` | Deterministic export gate: placeholders, pricing language, invented NORA IDs, unapproved evidence, missing disclaimers |

### 1.7 Production posture

- **`production-readiness.ts` (66 LOC)** — `ReadinessCheck`, `ProductionInfrastructureEnvironment`, `productionInfrastructureReadiness(env)`. Storage is fail-closed on Vercel without Blob; cron is fail-closed in production; **rate limiting is hardcoded `ok: true`** (§4.8).
- **`production-integrity-scanner.ts` (293 LOC)** — static scanner for stub responses, runtime fixtures, monetary computation in UI code, hardcoded user-visible literals (via the TypeScript parser for JSX), synthetic success on missing schema, and orphaned capabilities.
- **`capability-reachability-manifest.ts` (201 LOC)** — `CAPABILITY_REACHABILITY_MANIFEST` documents each capability's inbound edge so the scanner can prove reachability.
- **`src/proxy.ts` (176 LOC)** — the Next.js middleware: `withAuth` wrapper, `isPublicPath`, `isPasswordChangeAllowed`, `isVerificationAllowedPath`, return-to cookie issuance, forced password change, unverified-session gating, and admin API role checks.

---

## 2. Architecture narrative

### 2.1 Authentication end to end

**Registration.** `POST /api/auth/register` → `account-service.ts`. Field bounds and a strict email regex run first, then a per-email and per-IP `rateLimitAsync` check, then `isProductionBlockedDevelopmentIdentity`. The Prisma adapter creates `User` + `Workspace` + `WorkspaceMember` + `VerificationToken` inside one `Serializable` transaction; `P2002` becomes `DuplicateAccountEmailError`, which the service converts into the *same* response shape as a successful registration, so the endpoint does not disclose address existence. The verification token is issued by `createTokenDigest()` — 256-bit secret, stored only as `HMAC-SHA256(salt, secret)` in `VerificationToken.tokenHash` (unique) with `hashSalt` and `hashVersion` columns.

**Email verification.** The raw token travels only inside the email link. `POST /api/auth/verify-email` looks the record up by `getTokenDigestLookup` (an indexed equality probe), then `verifyTokenDigest` re-checks expiry and compares salt and digest in constant time. Single use is enforced by the `consumedAt` column. **Bypass:** `SKIP_EMAIL_VERIFICATION` short-circuits the entire gate — `resolveEmailVerifiedClaim` returns `true` regardless of the stored column, so both the JWT claim and the middleware gate are neutralized. That flag is present in the working `.env`.

**Login.** `authorize()` in `auth.ts` runs: rate limit (`login:<email>`, 10 per 15 min) → reserved-identity check → `getBootstrapContext()` → user lookup → `verifyPassword` (scrypt) → MFA when enabled → `UserSession` row creation → audit. The returned object becomes the JWT payload.

**Session.** JWT strategy, 12-hour `maxAge`. On every `jwt` callback the middleware-visible token is re-validated against the `UserSession` table, which is what makes server-side revocation (`revokeUserSessions`) effective; claims are refreshed from the database every 60 seconds. `proxy.ts` enforces public paths, the forced password change, the unverified-session gate, and admin API roles.

**MFA.** TOTP through `otplib`. The secret is generated at `/api/auth/mfa/setup`, rendered as a QR, and confirmed at `/api/auth/mfa/verify`. It is stored in `User.mfaSecret` as **plaintext**. There is no used-code ledger and no recovery-code mechanism anywhere in the repository, so a lost authenticator means administrator intervention.

**Password reset.** `recovery-service.ts` issues a `RecoveryToken` with the same digest machinery, invalidates prior tokens, and always returns the same accepted response. Reset revokes all sessions.

**Invitation acceptance.** `invitation-service.ts` issues a digest token bound to `(workspaceId, email, role)`, restricted to `ADMIN`/`MEMBER` targets and creatable only by `OWNER`/`ADMIN`. Acceptance is a `Serializable` transaction that sets `consumedAt`, creates the membership, and marks a newly created user `emailVerified: true` — correct, since receiving the token proves address control.

### 2.2 Tenancy

`workspaceId` is never taken from the request. `withTenant` in `api-controller.ts` calls `getTenantContext(session.user.id)`, which resolves the workspace from a `WorkspaceMember` row — the `activeWorkspaceId` claim is only a *preference* that must still match a membership. Resource access then goes through `assertWorkspaceMatch` or `requireTenantRecord`/`requireTenantOwnership`. Keyset cursors are workspace-scoped, so a cursor cannot be replayed across tenants. Storage keys are `uploads/<workspaceId>/...` and re-validated on every read.

Two role systems coexist and are frequently conflated: the platform role on `User.role` (`SUPER_ADMIN | ADMIN | BIDDER | REVIEWER | FINANCE`) and the workspace role on `WorkspaceMember.role` (`OWNER | ADMIN | MEMBER`). `requireAdmin`/`requireWriter` read the *platform* role; `canManageInvitations` reads the *workspace* role. Entitlements (`Subscription`) hang off `userId`, not `workspaceId`, which is the root of the quota gaps below.

### 2.3 Rate limiting

Redis is used only when `REDIS_URL` is set, via an atomic Lua sliding window with 1-second command deadlines and generation-guarded reconnects. Without `REDIS_URL`, `requiresDistributedRateLimit` returns `false` and every limiter silently becomes a per-process `Map`. On Vercel — where each concurrent invocation may be a separate isolate — that means the login limit is effectively unbounded, and `production-readiness.ts` reports `rateLimit.ok = true` regardless, so no operator signal exists. When Redis *is* configured and then fails, the limiter correctly fails closed with `backend: "unavailable"` and a 503.

### 2.4 Billing

**Checkout.** `POST /api/billing/checkout` creates a `PaymentCheckout` (`PENDING`) with a unique `customerReference`, then `sendPayment` returns the hosted invoice URL. **Callback.** `/api/billing/callback` and the webhook both call `fulfillCheckout`, which re-queries `GetPaymentStatus` and refuses to activate anything without a gateway-confirmed `paymentId`/`invoiceId`. Amount and currency are compared against the stored checkout; a mismatch marks the row `FAILED` and raises a `CRITICAL` audit event. On success one transaction marks the checkout `PAID`, updates the `BillingRecord`, upserts the `Subscription`, and syncs the plan label onto the payer's workspaces. **Webhook.** `verifyWebhookSignature` builds the V2 canonical string from the event-specific field list and compares HMACs in constant time; `webhookEventFingerprint` provides the idempotency key. **Recurring.** `recurring-billing.ts` drives an explicit state machine over `MyFatoorahRecurringProfile` with exact-decimal amounts and provider tolerance comparison. **Reconciliation.** A cron endpoint (guarded by `authorizeCron`) sweeps `PENDING` checkouts older than five minutes, and an admin surface offers a report plus single/bulk apply through `applyReconciliation`.

Monetary amounts are `Float` (double precision) in `PaymentCheckout`, `BillingRecord`, `SubscriptionPlan`, and `Subscription` — which contradicts both the "minor units" comment in `myfatoorah.ts` and the exact-decimal discipline in `recurring-billing-state.ts`.

### 2.5 Storage

Vercel Blob is used when `BLOB_READ_WRITE_TOKEN` is present (private access, no random suffix, explicit `application/octet-stream`); otherwise files go to `<cwd>/uploads`, or to ephemeral `/tmp/uploads` on Vercel without a Blob token. Every key is canonicalized by `assertStoragePath` and, on the safe paths, re-bound to the caller's workspace by `assertWorkspaceStoragePath`. Retrieval routes resolve through `resolveWorkspaceStoragePath` and serve with headers from `file-delivery-policy.ts`.

### 2.6 Environment handling

Fail-fast covers exactly two variables: `assertProductionSecrets()` (called from `bootstrap.ts`) requires `NEXTAUTH_SECRET` and `ARABCLUE_ENC_KEY` in production. Everything else degrades silently: no `RESEND_API_KEY` → all transactional email is skipped while the flows report success; no `REDIS_URL` → in-memory limits; no `BLOB_READ_WRITE_TOKEN` on Vercel → ephemeral storage; no `CRON_SECRET` → every cron endpoint returns 503 (fail-closed, but silent); no `MYFATOORAH_WEBHOOK_SECRET` outside production → **unsigned webhooks accepted**.

`.env.example` (58 lines) declares only `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ARABCLUE_ENC_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`. It omits `RESEND_API_KEY`, `EMAIL_FROM`, `REDIS_URL`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `WEBHOOK_URL`, `POSTGRES_PRISMA_URL`, `SKIP_EMAIL_VERIFICATION`, and every `MYFATOORAH_*` key — so an operator following it will deploy without cron authorization, without distributed rate limiting, and without durable storage.

---

## 3. Cross-cutting security review

**Password hashing.** scrypt with Node's defaults (N=16384, r=8, p=1), 16-byte random salt, 64-byte output, `timingSafeEqual` comparison. OWASP's current scrypt guidance is N=2^17. The encoded hash carries no parameters, so raising the cost later cannot be rolled out incrementally. Verification is fail-closed for unrecognized formats.

**Token generation and storage.** Verification, recovery, and invitation tokens all use `token-digest.ts`: 256-bit secrets, HMAC-SHA256 digests with per-token salts, constant-time comparison, expiry enforced inside `verifyTokenDigest`, `@unique tokenHash` for indexed lookup, and `consumedAt` for single use. Legacy SHA-256 tokens are readable only under an explicit, time-boxed policy. This is a genuinely strong design and no defect was found in it. By contrast, session tokens (`UserSession.token`) and MFA secrets (`User.mfaSecret`) are stored in plaintext, and `CRON_SECRET` is compared with `===`. **No MFA recovery codes exist.**

**MFA.** `verifySync` is called without a `window` or `step` and there is no record of consumed codes, so a code observed by an attacker remains usable for its entire validity window. Enrollment and disable are session-authenticated and rate-limited, and disable requires the current password (`mfaDisableSchema`).

**`crypto.ts`.** AES-256-GCM is authenticated and the IV is a fresh 12 random bytes per message — both correct. The weaknesses are the key: single-round `sha256(passphrase)` rather than a KDF, a hardcoded fallback key outside production, no key-version marker in the ciphertext, and a `catch` that converts every decryption failure into `""`.

**MyFatoorah webhook.** Signature verification is correct *when a secret is configured*: event-specific canonical fields, HMAC-SHA256, length pre-check, `timingSafeEqual`. Three gaps: it returns `true` when no secret is configured outside production; the replay fingerprint mixes in the attacker-supplied signature header; and a `null` `paidCurrency` passes the currency check. Amount validation against the local order is present and correct in shape. Out-of-order delivery is partially mitigated because `fulfillCheckout` always re-queries the gateway rather than trusting the webhook body.

**SSRF.** The MyFatoorah adapter is properly allowlisted to six official hosts. `outbound-webhook.ts` accepts any `http(s)` URL from `WEBHOOK_URL`, including `127.0.0.1` and `169.254.169.254`; because the value is operator-supplied this is a low-probability SSRF but a real egress control gap, and the payload carries no signature for the receiver to verify. The one place where a *user*-influenced value reaches an outbound request is `apiKeyEnvKey`/`apiBase` on AI providers, which any platform `ADMIN` can set.

**Zip handling.** ZIP-slip is structurally eliminated (nothing is written to disk; only basenames are returned) and additionally checked by `isZipSlip`. Entry count, per-entry size, total size, and compression ratio limits all exist. The bomb defense is nonetheless incomplete because `file.async("nodebuffer")` fully materializes an entry before its size is compared, and the ratio pre-check depends on undocumented JSZip internals.

**Storage path traversal.** `assertStoragePath` is thorough: it rejects absolute paths, backslashes, NUL, `?`, `#`, scheme prefixes, and any input that is not already canonical, then requires the `uploads` prefix and at least three segments; `resolveStoragePath` re-checks containment against the root; local reads use `lstat` + `isFile()` so symlinks are not followed. Content types are derived from the extension by `file-delivery-policy.ts`, with unknown types forced to `application/octet-stream` + `attachment` and a sandboxed CSP for generated HTML.

**User enumeration.** Registration and forgot-password return uniform responses — well done. Login does not: the scrypt verification runs only when the user exists, producing a measurable timing difference, and the audit/log records distinguish `not_found_or_inactive` from `bad_password`.

**Sensitive data in logs.** `auth.ts` writes raw email addresses to stdout and into `AuditLog.details` on every failed login; `email.ts` logs the recipient and subject when Resend is unconfigured; `audit.ts` forwards the entire `details` object to `WEBHOOK_URL` without redaction. `api-failure.ts` has a `redactSensitiveText` helper that these paths do not use. No secret *values* were found in log statements.

**Fail-open logic in authorization or verification paths.** Four instances: `verifyWebhookSignature` (no secret, non-production); `amountsMatch` (null currency); `requiresDistributedRateLimit` (no `REDIS_URL`); and `resolveEmailVerifiedClaim` (`SKIP_EMAIL_VERIFICATION`). `decryptValue` returning `""` on failure is a fifth, indirect one, because an empty secret is what triggers the webhook fail-open.

---

## 4. Gaps and defects

### Critical

**1. [Critical] security — `src/lib/myfatoorah.ts:603-605` — webhook signature verification fails open when no secret is configured.**
```ts
if (!webhookSecret) {
  return process.env.NODE_ENV !== "production";
}
```
Any deployment where `NODE_ENV` is not exactly `"production"` — a self-hosted or Hostinger node, a Docker image with the variable unset, a staging box — accepts **any unsigned webhook body**. Because `fulfillCheckout` is reachable from the webhook, an unauthenticated attacker who knows or guesses a `customerReference` can drive subscription state. This also triggers when `ARABCLUE_ENC_KEY` is rotated, since `decryptValue` then returns `""` (defect 11).
*Fix:* remove the environment-dependent branch and always `return false` when the secret is missing. Gate any local testing behind an explicit `MYFATOORAH_WEBHOOK_INSECURE=1` opt-in that `assertProductionSecrets()` rejects, and use `isProductionRuntime()` from `production-identities.ts` rather than a bare `NODE_ENV` comparison.

**2. [Critical] security — `src/lib/crypto.ts:11-20` — hardcoded master-key fallback outside production.**
```ts
return crypto.createHash("sha256").update("arabclue-insecure-dev-only").digest();
```
Every `EnvSetting` row — MyFatoorah API key, webhook secret, LLM provider keys — is encrypted with a key derived from a constant that is committed to the repository whenever `NODE_ENV !== "production"`. Anyone with database read access on such an instance recovers all provider secrets, and this is the same environment class that also disables webhook verification.
*Fix:* generate an ephemeral random key per process instead of a constant (so dev still works but nothing persists readably), or require `ARABCLUE_ENC_KEY` unconditionally. Use `isProductionRuntime()` for the environment test.

### High

**3. [High] security — `src/lib/email-verification-policy.ts:19` — `SKIP_EMAIL_VERIFICATION` has no production guard, and it is set in the working `.env`.**
```ts
return parseFlag(env.SKIP_EMAIL_VERIFICATION);
```
`resolveEmailVerifiedClaim` returns `true` regardless of `User.emailVerified`, which neutralizes the JWT claim (`auth.ts:219`), the middleware gate (`proxy.ts:135`), and the `requireSession` check (`auth.ts:395`). `grep -o '^[A-Z_]*=' .env` confirms the key is present locally, and `.env.example` does not document it — so an operator copying the working environment forward carries the bypass into production without a signal.
*Fix:* throw from `isEmailVerificationSkipped` when `isProductionRuntime()` is true and the flag is set, add the variable to `.env.example` with a warning, and assert it in `assertProductionSecrets()`.

**4. [High] security — `src/lib/env-settings.ts:36-37` — admin-controlled `apiKeyEnvKey` reads arbitrary process environment variables.**
```ts
if (apiKeyEnvKey?.trim()) {
  const custom = await getDecryptedEnv(apiKeyEnvKey.trim());
```
`getDecryptedEnv` does `process.env[key]` with no allowlist. `apiKeyEnvKey` and `apiBase` are both editable via `PATCH /api/admin/ai-providers/[id]` (`ALLOWED_FIELDS`, line 21-22), which is gated by `requireAdmin()` — i.e. any platform `ADMIN`, not only `SUPER_ADMIN`. Setting `apiKeyEnvKey: "NEXTAUTH_SECRET"` (or `ARABCLUE_ENC_KEY`, `DATABASE_URL`, `CRON_SECRET`) and `apiBase` to an attacker-controlled host causes the next LLM call to send `Authorization: Bearer <that secret>` off-box. That is full privilege escalation from `ADMIN` to session forgery and secret compromise.
*Fix:* validate `apiKeyEnvKey` against an allowlist derived from `model-catalog.ts` (`/^[A-Z0-9_]+_API_KEY$/` at minimum, plus an explicit denylist of platform secrets), and restrict `apiBase` to a per-provider host allowlist.

**5. [High] security — `src/proxy.ts:81-86` and `src/lib/auth.ts:75-79` — the unverified-session allowlist uses substring matching.**
```ts
return VERIFICATION_ALLOWED.some((allowed) => lower.includes(allowed.toLowerCase()));
```
`includes` means any path *containing* an allowlisted string passes. With App Router dynamic segments, a request to `/api/projects/verify-email` or `/api/documents/api/auth/session/x` satisfies the check, so an authenticated-but-unverified session reaches handlers the gate is meant to block. The duplicated implementation in two files also guarantees future drift.
*Fix:* compare with exact equality or a `/`-terminated prefix (`p === allowed || p.startsWith(allowed + "/")`), export the single implementation from `auth.ts`, and import it in `proxy.ts` instead of redeclaring it.

**6. [High] security — `prisma/schema.prisma:50` — TOTP secrets stored in plaintext.**
```prisma
mfaSecret          String?
```
`crypto.ts` provides AES-256-GCM and is used for `EnvSetting`, but not here. Any database read — backup, log, replica, SQL injection elsewhere — yields secrets that let an attacker generate valid second factors indefinitely, silently.
*Fix:* store `encryptValue(secret)` and decrypt in `verifyMfaToken`'s caller; add a migration that re-encrypts existing rows.

**7. [High] security — `src/lib/mfa.ts:11-14` — no TOTP replay protection, no window pinning, no recovery codes.**
```ts
const result = verifySync({ secret, token: token.replace(/\s/g, "") });
```
Nothing records which codes have been used, so a code captured by phishing or shoulder-surfing works until its step expires; the acceptance window is left to the library default rather than being pinned explicitly. Separately, there is no recovery-code path anywhere in the repository, so a lost device requires manual database intervention.
*Fix:* pass explicit `{window: 1, step: 30}`; persist `(userId, code-hash, step)` for the last two steps and reject repeats; add hashed single-use recovery codes issued at enrollment.

**8. [High] security — `src/lib/rate-limit.ts:22-24` with `src/lib/production-readiness.ts:48` — authentication limits silently degrade to per-instance memory with no readiness signal.**
```ts
// rate-limit.ts
return Boolean(env.REDIS_URL?.trim());
// production-readiness.ts
rateLimit: { ok: true, ... }
```
With no `REDIS_URL`, the login limiter is a per-process `Map`. On Vercel each concurrent invocation may run in its own isolate, so the "10 attempts per 15 minutes" ceiling multiplies by the number of live instances and approaches no limit at all under parallel load. The readiness endpoint reports `ok: true` unconditionally, so nothing surfaces the exposure.
*Fix:* return `true` from `requiresDistributedRateLimit` when `isProductionRuntime()` is true, so production without Redis fails closed; make `production-readiness` report `ok: redisConfigured || !production`.

**9. [High] security — `src/lib/auth.ts:107-111` — the login limiter is keyed on the email address alone.**
```ts
const rl = await rateLimit({ key: `login:${email || "unknown"}`, limit: 10, windowMs: 15 * 60 * 1000 });
```
No IP or client dimension, which has two consequences: credential stuffing across many accounts from one source is entirely unlimited (each address gets its own fresh budget), and an attacker can deliberately exhaust a known victim's budget to lock them out for 15 minutes.
*Fix:* enforce two independent limits — a per-email one and a stricter per-IP one — and prefer an exponential backoff or a CAPTCHA step over a hard per-account lockout.

**10. [High] correctness — `prisma/schema.prisma:654-655, 689, 707, 734` — monetary values stored as `Float`.**
```prisma
priceMonthly      Float    @default(0.0) // SAR
amount            Float // SAR
```
`Float` maps to PostgreSQL `double precision`. Repeated arithmetic on binary floating point produces amounts that do not round-trip exactly, and `amountsMatch` masks the drift with a ±0.01 tolerance — which is also the size of a halala rounding error. This contradicts the "stores minor units (halalas) internally" claim in `myfatoorah.ts:10-11` and the exact-decimal-literal discipline in `recurring-billing-state.ts`.
*Fix:* migrate all monetary columns to `Decimal @db.Decimal(12, 2)` (or integer minor units) and remove the tolerance from the local-comparison path, keeping it only for provider-reported values.

**11. [High] reliability — `src/lib/crypto.ts:29, 43-45` — no key version in the ciphertext and silent failure on decrypt.**
```ts
return [iv.toString("base64"), authTag.toString("base64"), enc.toString("base64")].join(":");
...
} catch { return ""; }
```
Rotating `ARABCLUE_ENC_KEY` makes every stored value undecryptable, and because the failure is swallowed, the system reports "MyFatoorah is not configured" instead of raising an error. That empty secret is exactly the input that makes `verifyWebhookSignature` fail open (defect 1). `rotateEncryption()` cannot help, because it has no way to know which key a given ciphertext used.
*Fix:* prefix the ciphertext with a key id (`v1.<keyId>:iv:tag:ct`), keep a small map of active plus previous keys, let `decryptValue` throw a typed `DecryptionFailedError`, and have callers distinguish "not configured" from "cannot decrypt".

**12. [High] reliability — `src/lib/ensure-db.ts:21-26` versus `src/lib/db.ts:9` — divergent database URL resolution breaks login.**
```ts
// db.ts
process.env.POSTGRES_PRISMA_URL?.trim() || process.env.DATABASE_URL?.trim()
// ensure-db.ts
const url = process.env.DATABASE_URL?.trim() ?? "";
if (!url || (!url.startsWith("postgresql://") && ...)) throw new Error(...)
```
A deployment configured with only `POSTGRES_PRISMA_URL` (a supported `db.ts` path) has a perfectly working Prisma client, but `ensureDatabaseReady()` throws. `bootstrap.ts` calls it, and `auth.ts:138-143` rejects **every login** when bootstrap throws. The failure mode is a total, silent authentication outage with only a stdout line to explain it.
*Fix:* extract the resolution into one shared `resolveDatabaseUrl()` and have `ensure-db.ts` validate that value.

**13. [High] security — `src/lib/safe-zip.ts:123-127` — entries are fully decompressed before the size limit is applied.**
```ts
const content = await file.async("nodebuffer");
if (content.length > limits.maxEntryBytes) {
  skipped.push({ name, reason: "entry_too_large" });
```
`maxEntryBytes` (25 MB) is checked only after the whole entry is in memory. A crafted entry whose central-directory metadata evades the ratio pre-check (lines 113-121) can expand to gigabytes and exhaust the function's heap before the check runs — a single-request denial of service on an authenticated upload path.
*Fix:* stream via `file.nodeStream()` and abort once the running byte count exceeds `maxEntryBytes`; also enforce `uncompressedSize` from the central directory as a hard pre-check rather than only as a ratio heuristic.

### Medium

**14. [Medium] security — `src/lib/password.ts:15, 27` — scrypt at Node defaults, with no parameters in the encoded hash.**
```ts
const derived = (await scrypt(plain, salt, 64)) as Buffer;
return `scrypt$${salt}$${derived.toString("hex")}`;
```
Node's defaults are N=16384, r=8, p=1 — one eighth of OWASP's current N=2^17 recommendation, so offline cracking of a leaked hash is roughly eight times cheaper than it should be. Because the cost parameters are not stored, there is no way to raise N and re-hash users progressively at next login. (The same class of issue applies to `crypto.ts:21`, where `sha256(passphrase)` is used as a KDF with no salt or iteration.)
*Fix:* pass `{N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024}`, encode them as `scrypt$N$r$p$salt$hash`, and re-hash on successful login when the stored parameters are below target.

**15. [Medium] security — `src/lib/cron-auth.ts:24, 26` — cron secret accepted in the query string and compared non-constant-time.**
```ts
const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
if (bearer === secret || headerSecret === secret || querySecret === secret) {
```
Query strings are recorded in access logs, CDN logs, and `Referer` headers, so the shared secret leaks into places that do not have secret-grade handling. `===` on strings short-circuits at the first differing byte, which is a (remote, but real) timing oracle.
*Fix:* drop the query-parameter path entirely and compare with `crypto.timingSafeEqual` over fixed-length digests of both values.

**16. [Medium] security — `src/lib/auth.ts:117, 120, 152, 155, 164, 168` — raw email addresses in application logs and audit details.**
```ts
console.warn(`[auth] authorize rejected: ${reason}`, { email });
await audit({ action: AUDIT_ACTIONS.LOGIN_FAILED, details: { email, reason }, ... });
```
Every failed login writes the address to stdout and stores it in `AuditLog.details`. For a Saudi/Gulf B2B product this is PDPL-relevant personal data being duplicated into a log sink with a different retention policy from the user table — and it is then forwarded off-platform by defect 17.
*Fix:* log a stable hash or the `userId`, and reserve the plaintext address for the `AuditLog.userId` relation, which already identifies the subject.

**17. [Medium] security — `src/lib/audit.ts:41-52` — audit details forwarded verbatim to an external webhook.**
```ts
notifyWebhook({ event: `audit.${ctx.action}`, ..., data: { severity, success, ...(ctx.details ?? {}) } });
```
Every `WARN`/`ERROR`/`CRITICAL` event — including `LOGIN_FAILED` with its email, and billing events with amounts and invoice ids — is spread into the outbound payload with no redaction and no allowlist of forwarded fields. `api-failure.ts` already implements `redactSensitiveText` for exactly this purpose and is not used here.
*Fix:* forward only `{event, userId, resource, resourceId, severity, success}` by default, and pass any additional fields through `redactSensitiveText` behind an explicit per-action allowlist.

**18. [Medium] security — `src/lib/outbound-webhook.ts:32-34` — no egress restrictions and no payload signature.**
```ts
if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
  return { ok: false, error: "WEBHOOK_URL must be http(s)" };
}
```
The only check is the scheme, so `http://127.0.0.1:6379`, `http://169.254.169.254/latest/meta-data/`, and any RFC1918 address are all accepted. The value is operator-supplied, which bounds the risk, but a misconfiguration or a compromised admin turns the audit pipeline into an internal-network probe. The receiver also has no way to authenticate the payload.
*Fix:* resolve the host and reject loopback, link-local, and private ranges unless an explicit `WEBHOOK_ALLOW_PRIVATE=1` is set; require `https:` in production; sign the body with HMAC-SHA256 and send it in an `X-ArabClue-Signature` header.

**19. [Medium] security — `src/lib/auth.ts:150-173` — user-existence timing oracle on login.**
```ts
const user = await db.user.findUnique({ where: { email } });
if (!user || !user.active) { ...; return null; }
const ok = await verifyPassword(password, user.passwordHash);
```
`verifyPassword` (roughly 100 ms of scrypt) runs only when the account exists, so response latency reliably separates registered from unregistered addresses. This undoes the careful anti-enumeration work in the registration and recovery services, which return uniform responses for exactly this reason.
*Fix:* when no user is found, verify against a fixed dummy hash so both branches perform identical work before returning `null`.

**20. [Medium] security — `src/lib/myfatoorah.ts:677-679` — currency validation fails open on a null value.**
```ts
const currencyOk =
  (opts.paidCurrency ?? opts.expectedCurrency).toUpperCase() ===
  opts.expectedCurrency.toUpperCase();
```
When the gateway does not report `PaidCurrency` — which `getPaymentStatus:360` allows, since it reads `InvoiceTransactions[0]?.PaidCurrency` — the expected value is substituted for the observed one and the comparison trivially succeeds. A payment settled in a weaker currency for the same numeric amount would be accepted as matching.
*Fix:* treat `null` as a mismatch and return `false`, or add an explicit `allowMissingCurrency` flag that callers must opt into and that `fulfillCheckout` never sets.

**21. [Medium] security — `src/lib/myfatoorah.ts:664` — the replay fingerprint includes the caller-supplied signature header.**
```ts
const material = `${name}|${ref}|${inv}|${pay}|${rec}|${signatureHeader ?? ""}`;
```
The idempotency key is meant to make duplicate deliveries harmless. Deriving it partly from a request header means the same logical event presented with a different header value produces a different fingerprint and bypasses deduplication — and in the fail-open state of defect 1, the header is fully attacker-chosen.
*Fix:* build the fingerprint only from event-identity fields (`Event.Name`, `Event.Reference`, invoice id, payment id, recurring id) and persist it with a unique constraint.

**22. [Medium] correctness — `src/lib/billing.ts:55-57` and `:185` — non-atomic paid-state transition.**
```ts
if (checkout.status === "PAID") { return { ok: true, checkoutId: checkout.id }; }
...
await db.$transaction(async (tx) => { await tx.paymentCheckout.update({ ... status: "PAID" ... }); ...
```
The guard and the write are separated by two awaits, including a network round trip to MyFatoorah. The callback and the webhook routinely arrive together, so both can observe `PENDING`, both proceed, and the subscription update plus the `SUBSCRIPTION_UPDATE` audit event run twice. The module header claims idempotency that the implementation does not provide.
*Fix:* perform the transition as a conditional write inside the transaction — `updateMany({where: {id, status: "PENDING"}, data: {status: "PAID", ...}})` — and abort the rest of the transaction when `count === 0`.

**23. [Medium] correctness — `src/lib/myfatoorah.ts:346-349` — any historically successful transaction marks an invoice paid.**
```ts
const txOk = (data.InvoiceTransactions ?? []).some((t) =>
  /^(succss|success)$/i.test(t.TransactionStatus ?? ""));
const isPaid = /^paid$/i.test(status) || txOk;
```
`InvoiceTransactions` is a history. An invoice that was later refunded, reversed, or expired still carries its original successful attempt, so `isPaid` returns `true` even when `InvoiceStatus` disagrees. This flows straight into `fulfillCheckout` and `normalizeProviderState`, so reconciliation would re-activate a refunded subscription.
*Fix:* require `InvoiceStatus === "Paid"`, and use the transaction list only to extract `PaymentId`/`PaidCurrency` for the already-paid invoice.

**24. [Medium] correctness — `src/lib/billing.ts:252-260` — plan label written to workspaces the payer only administers.**
```ts
const memberships = await tx.workspaceMember.findMany({
  where: { userId: checkout!.userId, role: { in: ["OWNER", "ADMIN"] } }, ... });
await tx.workspace.updateMany({ where: { id: { in: ... } }, data: { plan: checkout!.plan.name } });
```
A user who is merely an `ADMIN` member of another organization's workspace overwrites that workspace's displayed plan when they pay for their own. It is a cross-tenant write triggered by a payment.
*Fix:* restrict the query to `role: "OWNER"`, or better, move the plan label onto the subscription relation and stop denormalizing it onto `Workspace`.

**25. [Medium] correctness — `src/lib/quotas.ts:19-32` — entitlements are per-user with an administrator bypass.**
```ts
const sub = await db.subscription.findUnique({ where: { userId }, include: { plan: true } });
if (!sub) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") return;
```
The product bills workspaces but meters users. An invited member has no `Subscription` row, so every billable action either hard-fails with `INACTIVE` or, if they hold the platform `ADMIN` role, consumes unlimited resources for free. The workspace owner's paid quota is never shared with their team.
*Fix:* key `Subscription` on `workspaceId` and have `assertWithinQuota` take the tenant context; remove the role-based bypass in favour of an explicit unlimited internal plan.

**26. [Medium] correctness — `src/lib/quotas.ts:70-80` — storage uploads are rejected by the token quota.**
```ts
if (kind === "tokens" || kind === "storage") {
  if (plan.maxTokensPerMonth > 0) {
    const added = extra?.tokens ?? 0;
    if (sub.tokensUsed + added > plan.maxTokensPerMonth) { throw ... "TOKENS" }
```
Including `"storage"` in this branch means a workspace that has exhausted its monthly LLM token budget can no longer upload documents, which are unrelated resources. Users see a token error while trying to attach a tender file.
*Fix:* restrict the branch to `kind === "tokens"`.

**27. [Medium] correctness — `src/lib/quotas.ts:64` — storage overflow reports the wrong error code.**
```ts
`Storage quota exceeded (${Math.round(used / 1024 / 1024)}MB / ${plan.maxStorageGb}GB)`,
"TOKENS"
```
The message says storage and the machine-readable code says tokens. Clients that branch on the code (rather than parsing English prose) route the user to the wrong remediation.
*Fix:* add `"STORAGE"` to the `QuotaExceededError` code union and use it here.

**28. [Medium] reliability — `src/lib/quotas.ts:83-97` — usage increments swallow every error, and check-then-increment is not atomic.**
```ts
} catch {
  // ignore if no subscription
}
```
The bare `catch` hides connection failures and constraint violations as readily as the missing-subscription case it documents, so metering silently stops while the product keeps serving. Separately, `assertWithinQuota` and `bumpUsage` are two independent statements, so concurrent requests all read the same pre-increment counter and collectively overshoot the plan limit.
*Fix:* catch only `P2025`, log everything else, and make the enforcement a single conditional atomic update (`updateMany` with a `where` clause asserting the counter is still below the limit) whose zero-row result means "quota exceeded".

**29. [Medium] reliability — `src/lib/audit.ts:54-57` — audit write failures are swallowed.**
```ts
} catch (err) {
  console.error("[audit] failed to write log", err);
}
```
The module is documented as an "immutable audit trail", but a failed insert during a privilege change or a billing event leaves no durable record — only a stdout line that no alert watches. For a compliance-oriented product this undermines the control the log exists to provide.
*Fix:* keep the request path non-blocking, but queue failed writes to a durable retry sink and emit a metric so the gap is observable.

**30. [Medium] reliability — `src/lib/auth.ts:177-180` — MFA failures are never audited.**
```ts
if (!user.mfaSecret || !mfaToken || !verifyMfaToken(user.mfaSecret, mfaToken)) {
  console.warn("[auth] authorize rejected: mfa_failed", { email, ... });
  return null;
}
```
Every other rejection branch calls `audit(...)`, and `AUDIT_ACTIONS.MFA_FAILED` exists for precisely this event, but this branch only writes to stdout. An attacker who has a valid password and is brute-forcing the second factor produces no audit trail at all — the highest-signal event in the flow is the one that is not recorded.
*Fix:* add an `audit({userId: user.id, action: AUDIT_ACTIONS.MFA_FAILED, severity: "WARN", success: false})` call, and rate-limit MFA submissions separately from password attempts.

**31. [Medium] reliability — `src/lib/myfatoorah.ts:230-238` — no timeout on gateway requests.**
```ts
const res = await fetch(`${cfg.apiUrl}${path}`, { method, headers: {...}, body: ... });
```
`provider-timeout.ts` exists precisely for this and is applied by *some* callers (`billing.ts:539`) but not inside the adapter, so any path that calls `getPaymentStatus` directly — including `fulfillCheckout`, on the user-facing callback — can hang until the platform's function timeout.
*Fix:* wrap the fetch in `callProviderWithDeadline` (or pass `AbortSignal.timeout`) inside `mfRequest` so every call site inherits a bound.

**32. [Medium] reliability — `src/lib/outbound-webhook.ts:64-67` — fire-and-forget dispatch is dropped on serverless.**
```ts
export function notifyWebhook(input: OutboundWebhookPayload): void {
  void dispatchOutboundWebhook(input).catch((err) => { console.warn("[webhook]", err); });
}
```
Vercel freezes the instance once the response is returned, so a promise that is not registered with `waitUntil` is abandoned mid-flight. Webhook delivery is therefore unreliable in exactly the environment the project targets, and the failure is invisible.
*Fix:* use `waitUntil` from `@vercel/functions` when available, or persist the event and dispatch from the existing cron path.

**33. [Medium] reliability — `src/lib/email.ts:20-30` — transactional email silently no-ops when unconfigured, while flows report success.**
```ts
if (!isEmailConfigured()) { console.log("[email] skipped (RESEND_API_KEY not set)", ...); return { skipped: true }; }
```
`grep -o '^[A-Z_]*=' .env` shows no `RESEND_API_KEY`, so in the current environment no verification, recovery, or invitation email is ever delivered — yet registration returns success and recovery returns its uniform accepted response. Users are stranded with no signal, and operators have none either.
*Fix:* have `assertProductionSecrets()` require `RESEND_API_KEY` (and `EMAIL_FROM`) in production, and surface `isEmailConfigured()` in `productionInfrastructureReadiness`.

**34. [Medium] security — `src/lib/email.ts:37-42` — recipient addresses logged in the unconfigured path.**
```ts
console.log("[email] skipped (RESEND_API_KEY not set)", { to, subject });
```
The same PDPL concern as defect 16, on a path that is currently always taken. Because subjects are bilingual and contextual ("Verify your ArabClue account"), the pair leaks both identity and intent into the log sink.
*Fix:* log only a recipient hash and a message-type discriminator.

**35. [Medium] maintainability — `.env.example:1-58` — the template omits every operationally required variable.**
It declares only `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ARABCLUE_ENC_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD`. Missing: `RESEND_API_KEY`, `EMAIL_FROM`, `REDIS_URL`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `WEBHOOK_URL`, `POSTGRES_PRISMA_URL`, `SKIP_EMAIL_VERIFICATION`, and all `MYFATOORAH_*` keys. An operator who follows it deploys with no cron authorization, no distributed rate limiting, ephemeral storage, and no email.
*Fix:* document every variable read anywhere in `src/`, grouped as required/optional with the consequence of omission stated inline.

**36. [Medium] security — `src/lib/safe-zip.ts:192-198` — `application/octet-stream` bypasses MIME validation.**
```ts
if (mime && mime !== "application/octet-stream" && !UPLOAD_ALLOWLIST.mimePrefixes.some((p) => mime.startsWith(p)))
```
A client fully controls the declared MIME type, so sending `application/octet-stream` (or an empty string) reduces validation to the filename extension, which the client also controls. No content sniffing is performed anywhere on the upload path. Impact is bounded because `file-delivery-policy.ts` serves unknown types as attachments, but the allowlist provides less assurance than it appears to.
*Fix:* sniff the magic bytes and require the detected type to be consistent with both the declared MIME and the extension.

**37. [Medium] security — `src/lib/safe-zip.ts:109-121` — the compression-ratio guard depends on JSZip private internals.**
```ts
const compressed = (file as { _data?: { compressedSize?: number } })._data?.compressedSize;
```
`_data` is undocumented. If a JSZip upgrade renames or removes it, both values become `undefined`, the `compressed != null` guard short-circuits, and the ratio check silently becomes a no-op — removing the only pre-decompression bomb defense (which defect 13 already shows is the one that matters).
*Fix:* read `uncompressedSize` from the central directory through a supported API, and add a unit test that fails when the metadata is unavailable rather than skipping the check.

**38. [Medium] correctness — `src/lib/workspace-context.ts:70-108` — a caller with no membership is silently given a new OWNER workspace.**
```ts
const workspace = await db.workspace.create({
  data: { ..., members: { create: { userId, role: "OWNER" } } }, ... });
```
`getTenantContext` runs on every tenant-scoped request. When an administrator removes a user from the only workspace they belonged to, the next request does not fail — it provisions a fresh workspace where that user is `OWNER`. Deprovisioning therefore does not deprovision, and the creation path checks no plan limit, so `maxWorkspaces` is bypassed.
*Fix:* create workspaces only from the explicit registration and "create workspace" flows; have `getTenantContext` throw a `TenantAccessForbiddenError` when no membership exists.

### Low

**39. [Low] maintainability — `src/lib/billing.ts:220` — dead, self-contradictory expression.**
```ts
const shouldReset = isExpired || !isPlanChange ? false : false;
```
Both branches evaluate to `false`, and neither `shouldReset` nor `isPlanChange` is read afterwards — the actual behaviour comes from `resetData` on the next line. It reads like an abandoned edit and invites a future reader to "fix" the condition and change billing behaviour by accident.
*Fix:* delete both bindings and keep the `isExpired ? {...} : {}` expression with its explanatory comment.

**40. [Low] maintainability — `src/lib/rate-limit.ts:352-357` — dead branch in an unused export.**
```ts
if (redisClient?.isReady) { return memoryRateLimit(opts); }
return memoryRateLimit(opts);
```
Both arms are identical, and a search across `src/` finds no importer of the synchronous `rateLimit` — every call site imports `rateLimitAsync` (frequently aliased to `rateLimit`, which makes the dead export easy to mistake for the live one).
*Fix:* delete the synchronous export.

**41. [Low] maintainability — `src/lib/schema-sql.ts:2` — stale generated snapshot with no importers.**
```ts
export const SCHEMA_SQL = "\n-- CreateSchema\nCREATE SCHEMA IF NOT EXISTS \"public\";\n...
```
The embedded `User` table lacks `emailVerified`/`emailVerifiedAt`, so the snapshot predates the verification feature; nothing imports the symbol. A future reader may treat it as authoritative.
*Fix:* delete the file, or regenerate it in CI and assert it matches `prisma migrate diff`.

**42. [Low] security — `prisma/schema.prisma:119` — session tokens stored in plaintext.**
```prisma
token     String   @unique
```
`auth.ts:189` generates `crypto.randomUUID()` (122 bits, adequate) and persists it raw. The token is carried inside the signed JWT rather than presented directly by the client, which limits the exposure, but database read access still yields values that pass the revocation check.
*Fix:* store `sha256(token)` and look up by the digest; the value is high-entropy, so a plain hash is sufficient.

**43. [Low] reliability — `src/lib/auth.ts:184-197` — unbounded session table growth.**
Every successful login inserts a `UserSession` row, and rows are removed only by explicit revocation. Nothing sweeps expired rows and there is no per-user cap, so the table grows without bound and the `findUnique` on every JWT refresh gradually slows.
*Fix:* delete expired rows in the existing cron sweep and cap concurrent sessions per user, evicting the oldest.

**44. [Low] security — `src/lib/storage.ts:217-241` — workspace-agnostic read helpers remain exported.**
```ts
export async function readStoredFile(storagePath: string): Promise<Buffer> {
```
`readStoredFile` and `fileExists` validate the key shape but not the tenant, so any caller that passes a path from an untrusted source reads across workspaces. Current usage (`src/lib/agents/ingestion.ts:155-156`) supplies a path from a previously authorized record, so there is no live exploit — but the safe variants (`readWorkspaceStoredFile`) exist and these are the ones an unwary caller will reach for.
*Fix:* make the unscoped variants module-private and migrate `ingestion.ts` to the workspace-scoped versions.

**45. [Low] maintainability — `src/lib/auth.ts:81-83` — placeholder helper returns an empty string.**
```ts
export function getRequestPathForVerificationCheck(): string { return ""; }
```
Callers combining this with `isVerificationAllowedPath` get `"".includes(...)` semantics, which is a confusing dependency for a security-relevant check.
*Fix:* remove it and require callers to pass the real path.

**46. [Low] correctness — `src/lib/ensure-db.ts:27` — `$queryRawUnsafe` used for a constant.**
```ts
await db.$queryRawUnsafe(`SELECT 1`);
```
There is no injection here (the string is a literal), but using the unsafe API for a constant sets a pattern that is dangerous when copied.
*Fix:* use the tagged template `` db.$queryRaw`SELECT 1` ``.

**47. [Low] security — `src/lib/crypto.ts:58-66` — the production secret assertion covers only two variables.**
```ts
if (!process.env.NEXTAUTH_SECRET?.trim()) missing.push("NEXTAUTH_SECRET");
if (!process.env.ARABCLUE_ENC_KEY?.trim()) missing.push("ARABCLUE_ENC_KEY");
```
This is the only fail-fast in the system, and it does not check `CRON_SECRET`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, or assert that `SKIP_EMAIL_VERIFICATION` is off — all of which degrade silently (defects 3, 8, 33).
*Fix:* extend the assertion to every variable whose absence changes a security or delivery guarantee, and reuse `productionInfrastructureReadiness` so the boot check and the readiness endpoint cannot disagree.

**48. [Low] correctness — `src/lib/tokens.ts:78-80` versus `src/lib/myfatoorah.ts:686-688` — two base-URL resolvers with opposite precedence.**
```ts
// tokens.ts
process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000"
// myfatoorah.ts
process.env.NEXTAUTH_URL?.replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000"
```
When the two variables differ — a common split between a public domain and an internal auth origin — verification links point at one origin while payment callbacks point at another, producing broken links or failed returns from the gateway.
*Fix:* export one `getAppBaseUrl()` and use it in both places.

---

## 5. Needs verification

These are unresolved concerns that I could not confirm within this scope; each needs a runtime test or a read of code outside `src/lib/`.

1. **`recovery-service-prisma.ts` isolation level.** The reset and token-creation transactions do not pass `isolationLevel: "Serializable"`, unlike the account and invitation adapters, while nearby comments describe serializable semantics. Whether this permits a concurrent double-reset depends on the surrounding uniqueness constraints and needs a concurrency test.
2. **`notification-service.ts` event-id determinism.** Several notification helpers appear to generate a fresh random `eventId` per call, which would defeat the deduplication unique constraint. Confirming this requires tracing each caller's id construction.
3. **`recurring-billing.ts` charge idempotency.** `handleRecurringChargeSuccess` does not obviously deduplicate on a provider transaction id, so a redelivered `RECURRING_UPDATES` webhook may create two billing records. The repository port may enforce this instead — needs a read of the Prisma adapter's unique constraints.
4. **`recurring-billing.ts` profile/intent ordering.** The intent transition to `FINALIZED` appears to happen after the provider profile is created, so a failure between the two could strand a live provider profile with no local record.
5. **`recurring-billing.ts` payment-method selection.** The execution path appears to take the first available payment method without checking that it supports recurring charges; MyFatoorah returns non-recurring methods in the same list.
6. **`requireWriter` role coverage (`auth.ts:410-431`).** It appears to exclude only `REVIEWER`, which would grant write access to `FINANCE` and `BIDDER`. Confirming the intended matrix requires the product role specification.
7. **`withTenant("writer")` semantics (`api-controller.ts`).** It appears to check the *platform* role rather than the `WorkspaceMember` role, which would let a workspace `MEMBER` with a platform writer role write to workspace resources. Needs a per-route trace.
