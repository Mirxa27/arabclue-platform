# ArabClue — Implemented Feature Inventory

Audit date: 2026-08-22. Every entry below was verified to exist in code, not
inferred from documentation. "Edge cases" lists behaviour that is genuinely
implemented; known gaps are in [`03-GAP-ANALYSIS.md`](./03-GAP-ANALYSIS.md).

Legend — **Status**: ✅ complete · ⚠️ works with a confirmed defect ·
🚧 implemented but unreachable/unwired.

---

## 1. Identity, access and tenancy

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 1 | Registration | `POST /api/auth/register` | Serializable transaction; issues an HMAC-digested verification token. Duplicate email handled. | ✅ |
| 2 | Email verification | `POST /api/auth/verify-email`, `/verify-email` | Single-use via `consumedAt`, expiry checked inside verification. Globally bypassable by `SKIP_EMAIL_VERIFICATION`. | ⚠️ |
| 3 | Login | NextAuth credentials | Rate limited (10 / 15 min), reserved dev identities blocked in prod, audit on success and failure, `UserSession` row per login. Limiter keyed on email only. | ⚠️ |
| 4 | MFA (TOTP) | `/api/auth/mfa/{setup,verify,disable}` | QR enrolment via `otplib` + `qrcode`; verified at `authorize`. No replay ledger, no recovery codes, secret stored plaintext. | ⚠️ |
| 5 | Password reset | `/api/auth/{forgot,reset}-password` | Digested single-use token, expiry enforced, generic response shape. | ✅ |
| 6 | Password change | `POST /api/auth/password` | Rate limited; `mustChangePassword` forces the flow platform-wide via `proxy.ts`. | ✅ |
| 7 | Session revocation | `UserSession` + `revokeUserSessions()` | `jwt` callback re-validates the row every refresh; claims re-read from DB every 60s. Sessions never swept. | ✅ |
| 8 | Profile & avatar | `/api/auth/{profile,avatar}` | Rate limited; avatar size-checked. | ✅ |
| 9 | Workspace invitations | `/api/invitations`, `/accept`, `/[id]` | Digested token, expiry, single use, role bound at issue. | ✅ |
| 10 | Workspace membership | `/api/workspaces`, `workspace-context.ts` | Tenancy derived from `WorkspaceMember`; `activeWorkspaceId` is a preference that must match a membership. | ✅ |
| 11 | Onboarding progress | `/api/onboarding`, `onboarding-steps.ts` | Step completion persisted per workspace; drives dashboard gating. | ✅ |
| 12 | Return-to after login | `/api/auth/return-to`, `return-to.ts` | Requested `/app` path retained in a signed, httpOnly, 30-minute cookie. | ✅ |

## 2. Tender projects and document ingestion

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 13 | Tender project CRUD | `/api/projects`, `/[id]` | Workspace-scoped; cascade delete of children. Deletion audited as `PROJECT_CREATE`. | ⚠️ |
| 14 | Document upload | `POST /api/documents` | Multipart; PDF via `pdf-parse`, DOCX via `mammoth`, images via `tesseract.js` OCR. 50 MB cap applied downstream of buffering. | ⚠️ |
| 15 | Document versioning | `/api/documents/[id]/versions/**` | Append-only; `compare` and `revert` (revert writes a new version rather than rewinding). Integrity hash per version. | ✅ |
| 16 | Chunking + embedding | `document-chunks.ts` | Chunk, embed, persist for retrieval. Hard cap of 40 chunks per document; sequential embed and write. | ⚠️ |
| 17 | Retrieval | `rag.ts` | Cosine similarity over term vectors; falls back to `localEmbedText` with no provider key. Documented as TF-IDF but has no IDF term. | ⚠️ |
| 18 | Requirements matrix | `/api/projects/[id]/requirements` | Extracted requirements with coverage state. | ✅ |
| 19 | Compliance checks | `/api/compliance`, `seedComplianceChecks` | Seeded per project, updated by the compliance agent. | ✅ |
| 20 | Qualification | `qualification.ts` | Scores eligibility against certificates, staff, past projects. CR/VAT accepted without format validation. | ⚠️ |
| 21 | File serving | `GET /api/files?path=` | Session + workspace-scoped path assertion + 50 MB delivery cap; content-disposition policy. | ✅ |

## 3. AI agents

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 22 | Six-agent pipeline | `POST /api/agents/run` | Ingestion → Compliance → Technical → Financial → Drafting → Law. Quota + ownership + zero-document preflight; `after()`-wrapped so work survives response flush; `maxDuration = 300`. | ✅ |
| 23 | Deterministic fallback | `llm/index.ts` | **Entire product works with zero API keys.** Every agent computes a rule-based result first; LLM enrichment is strictly optional. | ✅ |
| 24 | Run status | `GET /api/agents/status` | Polling (no SSE). Persists `agentStates` after every transition; resumes stalled runs. | ✅ |
| 25 | Run cancel | `POST /api/agents/cancel` | Writes `CANCELLED`; orchestrator observes at checkpoints. Does not abort in-flight model calls. | ⚠️ |
| 26 | Platform copilot | `POST /api/platform-agent/chat` | `ToolLoopAgent`, ~40 tools, `stepCountIs(28)`, streaming with `abortSignal: req.signal`. Tools consult `denyWrite`/`denyAdmin`. | ✅ |
| 27 | Copilot missions | `/api/platform-agent/missions/**` | Durable mission + message + attachment records; pulse endpoint for progress. | ✅ |
| 28 | Autopilot | `/missions/[id]/autopilot` | Heuristic classification; above a confidence floor creates a project and starts a pipeline. No human approval gate; trusts `body.activeProjectId`. | ⚠️ |
| 29 | Chrome extension bridge | `/api/platform-agent/extension/**` | Config probe (public), authenticated ingest and copilot, on-the-fly ZIP packing of the extension. | ⚠️ |
| 30 | Realtime voice | `/api/platform-agent/realtime/{setup,tools}` | Mints a short-lived provider token; ships tool *schemas* to the browser and proxies execution server-side. Execution bypasses Zod validation. | ⚠️ |
| 31 | Standalone AI endpoints | `/api/ai/{compliance-analyze,contract-draft,proposal-optimize,vendor-match}` | Deterministic engines with optional LLM enrichment; all carry provenance and legal disclaimers. No token quota applied. | ⚠️ |
| 32 | Provider management | `/api/admin/ai-providers/**` | Multi-provider config, model catalog cache, engine-specific → `DEFAULT` → any-active resolution. Secrets encrypted at rest. | ⚠️ |

## 4. Proposals

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 33 | Proposal generation | Drafting agent → `GeneratedProposal` | Bilingual AR/EN body, versioned. | ✅ |
| 34 | Structured builder | `/api/proposals/builder`, `proposal-builder-*` | Section-based bilingual authoring. Bypasses the version table, snapshot invalidation, writer role, and transactions. | ⚠️ |
| 35 | Markdown studio | `markdown-studio-editor.tsx` | MDXEditor with live letterhead-accurate preview via escaping `markdownToHtml`. | ✅ |
| 36 | Versioning | `/api/proposals/[id]/versions/**` | Append-only, compare, revert. | ✅ |
| 37 | Snapshot integrity | `proposal-snapshot-*`, `contract-render-snapshot.ts` | Canonical JSON + hash; strict Zod, 2 MB budget, hash recomputed and compared on load. | ✅ |
| 38 | Review workflow | `/api/reviews`, `/[id]` | `decideProposalReview` runs five preconditions in one transaction; reviewers bound to an exact `(submissionHash, version, snapshotHash, revision)` tuple. Route authorization does not check role. | ⚠️ |
| 39 | Validation gate | `validation-gate.ts` | Deterministically blocks export on pricing placeholders and invented identifiers. | ✅ |
| 40 | Export lifecycle | `/api/proposals/[id]/download` | Real optimistic concurrency: `updateMany` guarded by `updatedAt` **and** snapshot hash, `count !== 1` → 409. State mutation performed on `GET`. | ⚠️ |
| 41 | Export formats | same route | PDF, HTML, XLSX (exceljs), PPTX (pptxgenjs), ZIP bid package + manifest. Admission-controlled by `document-export-guard`. | ⚠️ |
| 42 | Financial / BoQ | `/api/proposals/[id]/financial`, `generateBoQXLSX` | Bill of quantities workbook; literal strings so a leading `=` cannot become a formula. | ✅ |
| 43 | Obligations | `/api/proposals/[id]/obligations` | Extracted obligation tracking. | ✅ |
| 44 | Submit | `/api/proposals/[id]/submit` | Guarded by the validation gate and approval binding. | ✅ |

## 5. Contracts

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 45 | System templates | `/api/contracts/templates/**` | Catalog with typed schema, pinned versions, preview render. | ✅ |
| 46 | Workspace templates | `/api/contracts/workspace-templates/**` | Tenant-authored templates, versioned, preview. Preview builds HTML without escaping (latent). | ⚠️ |
| 47 | Template binding | `contract-templates.bindContractTemplate` | Structured `BoundInlineNode` substitution — never string replacement. | ✅ |
| 48 | Drafts & instances | `/api/contracts/{drafts,instances}/**` | Draft admission control, persistence, versioning, compare. | ✅ |
| 49 | Draft labelling | `contract-artifacts.ts` | Every artifact force-labelled DRAFT/UNREVIEWED with the pinned template version. | ✅ |
| 50 | Obligations | `contract-obligations.ts`, `ContractObligationState` | Obligation extraction and state tracking. | ✅ |
| 51 | Bilingual export | `contract-export-bilingual.ts` | Same AST and renderer as proposals. | ✅ |

## 6. Knowledge, library and collaboration

| # | Feature | Surface | Status |
| --- | --- | --- | --- |
| 52 | Clause library | `/api/clauses`, `/[id]`, `/select` | ✅ |
| 53 | Content library | `/api/library` | ✅ |
| 54 | Methodologies | `/api/methodologies` | ✅ |
| 55 | Certificates | `/api/certificates` | ⚠️ `filePath` never persisted |
| 56 | Staff members | `/api/staff` | ✅ |
| 57 | Partnerships | `/api/partnerships` | ✅ |
| 58 | Target sectors | `/api/sectors` | ✅ |
| 59 | Bid history notes | `/api/bid-history` | ✅ |
| 60 | Knowledge approval queue | `/api/knowledge/pending-approval` | ✅ checksums + immutable audit trail |
| 61 | Comments & replies | `/api/collaboration/comments/**` | ⚠️ `parentId` unverified |
| 62 | Comment resolve | `/[id]/resolve` | ⚠️ no un-resolve |
| 63 | Presence | `/api/collaboration/presence` | ⚠️ raw `getServerSession` |
| 64 | Approval policy | `/api/approval-policy`, `ApprovalStep` | ✅ |
| 65 | Restrictions | `/api/restrictions` | ✅ |

## 7. Marketplace, brand and business profile

| # | Feature | Surface | Behaviour | Status |
| --- | --- | --- | --- | --- |
| 66 | Template marketplace | `/api/templates/marketplace/**` | Browse, publish, apply, rate. Missing ownership predicate on three routes; system catalog re-seeded on every GET with fabricated metrics. | ⚠️ |
| 67 | Business profile | `/api/business-profile`, `/export` | Company profile + bilingual capability-statement export. | ✅ |
| 68 | Brand profile & logo | `/api/brand`, `/logo` | Colours hex-regex-gated; logo workspace-scoped and inlined as a `data:` URI for PDF. | ✅ |
| 69 | Letterhead | `letterhead.ts` | Bilingual letterhead bar shared by preview and PDF. | ✅ |

## 8. Billing

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 70 | Subscription plans | `/api/admin/plans/**`, `SubscriptionPlan` | Plan CRUD with quota entitlements. | ✅ |
| 71 | Checkout | `POST /api/billing/checkout` | Creates `PaymentCheckout`, redirects to MyFatoorah. | ✅ |
| 72 | Callback | `/api/billing/callback` | User-facing return; rate limited; non-authoritative. | ✅ |
| 73 | Webhook | `POST /api/billing/webhook` | HMAC-SHA256 canonical V2 signature verified before side effects; durable `PaymentWebhookEvent` keyed on fingerprint for idempotency; amount and currency validated against the stored order. Fails open when no secret is set outside production. | ⚠️ |
| 74 | Recurring billing | `/api/billing/recurring/**` | Explicit state machine over exact decimal literals; create, cancel, resume. | ✅ |
| 75 | Reconciliation | `/api/admin/billing/reconcile`, `cron/billing-reconcile` | Bounded concurrency, 10s per-item provider deadline, cursor pagination. Bulk apply path trusts client-supplied provider state. | ⚠️ |
| 76 | Quotas | `quotas.ts` | Per-plan entitlement metering. Metered per user rather than per workspace. | ⚠️ |

## 9. Analytics and notifications

| # | Feature | Surface | Behaviour and edge cases | Status |
| --- | --- | --- | --- | --- |
| 77 | Event collection | `analytics-collector.ts` | Closed event vocabulary; actively strips PII from metadata. | ✅ |
| 78 | Proposal analytics | `/api/analytics/proposals` | Range comparison with bucketing. UTC/local mixing across DST. | ⚠️ |
| 79 | Stats & insights | `/api/stats`, `/tender-insights` | Dashboard aggregates. Counted in JS rather than via `groupBy`. | ⚠️ |
| 80 | Retention | `analytics-retention.ts`, `cron/analytics-retention` | Computes daily summaries then deletes raw events. **Summaries are never persisted and no `AnalyticsDailySummary` model exists.** Currently inert only because the cron is unregistered. | 🚧 |
| 81 | In-app notifications | `/api/notifications`, `/dismiss` | Bell inbox with dismissal state. | ⚠️ |
| 82 | Email notifications | `notification-service.ts` | Bilingual templates, minimised bodies (no commercial or document fields). Every email row insert violates a unique constraint. | ⚠️ |
| 83 | Expiry notifications | `cron/expiry-notifications` (daily 06:00) | Certificate and deadline expiry warnings. | ✅ |
| 84 | Delivery dispatch | `cron/notification-dispatch` (daily 05:30) | Claim-based delivery with retry and backoff. 30-minute deadline against a once-daily cron. | ⚠️ |

## 10. Administration

| # | Feature | Surface | Status |
| --- | --- | --- | --- |
| 85 | Admin overview | `/api/admin/overview` | ⚠️ unconditional compliance banner |
| 86 | User management | `/api/admin/users/**` | ✅ `canGrantRole` prevents ADMIN self-elevation |
| 87 | Plan management | `/api/admin/plans/**` | ✅ |
| 88 | AI provider config | `/api/admin/ai-providers/**` | ⚠️ arbitrary `process.env` read via `apiKeyEnvKey` |
| 89 | Env settings | `/api/admin/env/**` | ✅ AES-256-GCM at rest, write-only secrets |
| 90 | MyFatoorah config | `/api/admin/myfatoorah` | ✅ write-only secrets, connection + signature self-tests |
| 91 | Audit log | `/api/admin/audit`, `AuditLog` | ⚠️ no tenant column, best-effort writes |
| 92 | Security panel | `admin/security.tsx` | ✅ |

## 11. Platform surfaces

| # | Feature | Detail | Status |
| --- | --- | --- | --- |
| 93 | Health / readiness | `/api/health`, `/api/ready` | ⚠️ readiness always reports ok |
| 94 | Bilingual i18n | `i18n.ts` — ~1,800 keys, `{ar, en}` per key; AR/RTL default persisted to `localStorage` | ⚠️ 1,189 inline ternaries bypass the registry |
| 95 | Canonical dashboard routing | `dashboard-routes.ts` + `app-route-resolver.ts` — server-resolved, strict bidirectional path↔view mapping | ⚠️ `setView` desyncs the URL |
| 96 | Theme | `next-themes` light/dark | ✅ |
| 97 | Public marketing + legal | 15 pages behind `PublicShell` | ⚠️ all forced dynamic |
| 98 | Chrome extension | `extensions/arabclue-agent`, packed at build | ✅ |
| 99 | Production integrity scanner | `production-integrity-scanner.ts`, `production-readiness.ts` | ⚠️ 3-path allowlist |
| 100 | Deployment safety gate | `scripts/check-deployment-safety.mjs` | 🚧 never runs in CI |

---

## Summary

**100 distinct features are implemented.** 58 are complete and defect-free as
audited, 39 work but carry a confirmed defect, and 3 are implemented but
unreachable (`analytics-retention` cron, `deploy:safety` in CI,
`scripts/scan-integrity.ts`).

The functional surface is genuinely broad and the hard parts — bilingual
RTL/LTR document generation, snapshot-bound review integrity, deterministic
zero-key AI fallback, webhook idempotency, optimistic concurrency on export —
are implemented properly. The defects are concentrated in the newer parallel
code paths rather than in the core.
