# ArabClue — Domain API Audit (`src/app/api/**`)

**Repository:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Scope:** 64 route files / 10,848 LOC across proposals, projects, contracts, documents, clauses, templates, reviews, collaboration, library, knowledge, methodologies, certificates, compliance, sectors, partnerships, business-profile, brand, analytics, stats, bid-history.
**Method:** every in-scope file read in full; supporting `src/lib/*` and `prisma/schema.prisma` read for behavior verification; `src/proxy.ts` (middleware) read to establish the global auth baseline; callers cross-referenced by grep across `src/components`, `src/app`, `src/lib`.
**Read-only audit.** No repository file was modified.

---

## 0. Baseline: the shared control plane

Three mechanisms determine almost every security conclusion in this report. They are summarized once here and referenced throughout.

### 0.1 Global middleware (`src/proxy.ts`)

`withAuth` matches everything except static assets. For any `/api/*` path it enforces, **before the handler runs**:

- `!token && isAppPath(path)` → redirect to `/login` (pages only).
- `token.mustChangePassword` → `403 MUST_CHANGE_PASSWORD` (`src/proxy.ts:119-130`).
- `token.emailVerified === false` → `403 EMAIL_VERIFICATION_REQUIRED` (`src/proxy.ts:135-146`).
- `/api/admin/*` → requires platform `SUPER_ADMIN`/`ADMIN` (`src/proxy.ts:149-154`).
- `authorized` callback → any non-public path requires a token (`src/proxy.ts:160-167`).

**Consequence:** a route that calls raw `getServerSession()` is still covered for authentication, password-change, and email-verification. It is **not** covered for the **MFA step-up gate**, which lives only in `requireSession` (`src/lib/auth.ts:384`: `session.user.mfaEnabled && !session.mfaVerified`). This is the precise delta and the basis of defects **#6** and **#12**.

### 0.2 Auth helpers (`src/lib/auth.ts`)

| Helper | Line | Gate |
|---|---|---|
| `requireSession` | 382 | session + MFA verified + not `mustChangePassword` + email verified |
| `requireAdmin` | 402 | above + platform `SUPER_ADMIN`/`ADMIN` |
| `requireWriter` | 417 | above + `role !== "REVIEWER"` |
| `requireReviewerAction` | 434 | **identical to `requireSession`** — no role check; the real check is inside `decideProposalReview` |
| `isWorkspaceManager` | 453 | membership `OWNER`/`ADMIN`, or platform `SUPER_ADMIN`/`ADMIN` |

`requireWriter` is the only write gate, and it is coarse: it excludes exactly one role (`REVIEWER`). There is no distinction between "may edit a proposal" and "may cascade-delete a whole tender project" (defect **#23**).

### 0.3 Tenant controller (`src/lib/api-controller.ts` + `src/lib/workspace-context.ts`)

`withTenant(mode, handler, label)` resolves session → `getTenantContext(userId)` → `{ workspace, membershipRole, userId, session }` and funnels every throw through `toErrorResponse`, producing a bilingual `ApiFailure` body. `getTenantContext` reads the **active workspace from the database**, not from the JWT, so it is not subject to stale-claim problems.

Routes fall into three tiers, and the tier predicts the defect density almost perfectly:

- **Tier A — `withTenant` + Zod + service layer** (contracts/*, knowledge, collaboration comments `[id]`, reviews `[id]`, marketplace list, sectors/partnerships/bid-history). Near-zero defects.
- **Tier B — `requireSession`/`requireWriter` + manual `getTenantContext` + hand-rolled `NextResponse.json`** (proposals `[id]/*`, documents/*, projects `[id]`, brand, business-profile). Correct tenant scoping, but consistently leaks internal error text and drifts from the bilingual failure contract.
- **Tier C — raw `getServerSession` + `session.user.workspaceId` claim** (proposals/builder, collaboration/presence). Highest defect density; both are in the defect list.

---

## 1. File-by-file map

> Format per file: **path — LOC** · handlers/segment config · purpose · key deps · callers · validation · output · authN/authZ · edge cases.
> "Callers" were obtained by grepping `fetch("/api/...")` and `apiJson(...)` across `src/components`, `src/app`, `src/lib`, plus `src/lib/capability-reachability-manifest.ts`.

---

### 1.1 Proposals

#### `src/app/api/proposals/route.ts` — 29 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Lists all proposals in the caller's workspace, optionally filtered by `projectId`.
- **Deps:** `@/lib/db`, `withTenant`, `jsonOk`.
- **Callers:** `contracts-panel.tsx:72-73`, `proposals-list.tsx:78`, `version-history.tsx:425`.
- **Validation:** none — `projectId` read raw from `searchParams` and injected into `where`.
- **Output:** `{ proposals: [...] }`, 200. `omit` excludes `structuredSnapshot`/`contractRenderSnapshot` only.
- **AuthZ:** `withTenant("session")`; `where.workspaceId = workspace.id` — tenant-safe.
- **Not handled:** no `take`/pagination; **full `contentMd`/`contentMdAr` markdown bodies are serialized for every proposal in the workspace** (defect **#13**). Unowned `projectId` silently yields `[]` rather than 404 (acceptable, not a leak).

#### `src/app/api/proposals/[id]/route.ts` — 229 LOC
- **Handlers:** `GET`, `PATCH`. `dynamic = "force-dynamic"`.
- **Purpose:** Read one proposal (with last 3 versions) and apply markdown/status edits.
- **Deps:** `requireSession`/`requireWriter`, `getTenantContext`, `assertWorkspaceMatch`, `proposalPatchSchema`, `audit`, analytics collector.
- **Callers:** `proposal-editor.tsx:121,235`, `contract-studio.tsx:226`, `contracts-panel.tsx:88`, `reviews-queue.tsx:97,147`.
- **Validation:** Zod `proposalPatchSchema` on PATCH.
- **Output:** `{ proposal }` / `{ error }`; 200/401/403/404/500.
- **AuthZ:** `requireSession` (GET, L24) / `requireWriter` (PATCH, L72) + `assertWorkspaceMatch`.
- **Edge cases handled:** version bump + `ProposalVersion` append; snapshot invalidation on content change.
- **Not handled:** leaks `err.message` at **L60** and **L225** (defect **#10**).

#### `src/app/api/proposals/[id]/download/route.ts` — 1,214 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`, **`maxDuration = 60` … actually `120`** (L74).
- **Purpose:** The export engine — renders a proposal/contract to `zip|pdf|html|xlsx|xlsx-matrix|ea-matrix|xlsx-boq|boq|slides|pptx` and, for an authoritative export of an `APPROVED` proposal, transitions it to `EXPORTED`.
- **Deps:** `requireSession`, `resolveEmailVerifiedClaim`, `rateLimitAsync`, `documentExportGate`, generators (`@/lib/generators`), obligation state, compliance gate, `audit`, analytics.
- **Callers:** `document-preview-frame.tsx:163,168`; `orchestrator.ts:863-888,1198-1203` emits `downloadPath` placeholders; `capability-reachability-manifest.ts:153`.
- **Validation:** `resolveProposalDownloadFormat` allowlist on `?format`; locale enum.
- **Output:** binary/HTML with `Content-Disposition`, `X-Contract-Lifecycle`, `X-Legal-Review-Status`, `X-Contract-Executable`; 200/400/401/403/409/429/5xx.
- **AuthZ:** `requireSession` (**L166**) + explicit email-verification re-check (L170) + per-user rate limit 10/min (L177) + `getTenantContext`.
- **Edge cases handled (well):** optimistic concurrency on the lifecycle transition — `updateMany` guarded by `updatedAt` **and** snapshot hash/revision (L1035-1055), returning `409 EXPORT_STATE_CHANGED` when `count !== 1`; export admission gate; complete-bound-review-chain requirement (L155-158).
- **Not handled:** **a `GET` performs the state mutation** and is gated by `requireSession`, not `requireWriter` (defect **#1**). Leaks `err.message` at L514, L1208.

#### `src/app/api/proposals/[id]/snapshot/route.ts` — 803 LOC
- **Handlers:** `GET`, `PUT`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Read / write / hydrate the immutable `structuredSnapshot` (and contract render snapshot) that binds an approved proposal to the exact bytes reviewed.
- **Deps:** snapshot validators, identity/evidence diagnostics, `audit`.
- **Callers:** `proposal-workflow-integrity.test.ts:40` (integrity mirror); driven server-side by the submit/export path.
- **Validation:** rich domain validation producing bilingual `diagnostics` (L355, L381, L397, L496, L519, L535, L651, L672, L684, L696) — these are *intended* contract output, not leaks.
- **Output:** snapshot payload + diagnostics; 200/400/403/404/409/500.
- **AuthZ:** session + workspace scoping inside handlers.
- **Not handled:** the three top-level catch blocks return raw `error.message` (**L764, L781, L798**) — defect **#10**.

#### `src/app/api/proposals/[id]/submit/route.ts` — 430 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Submits a proposal into the review chain, binding reviewers to the snapshot hash/revision.
- **Deps:** `withTenant("writer")` (**L43**), review-chain service, notification service, analytics.
- **Callers:** `contracts-panel.tsx:120`, `proposals-list.tsx:83`.
- **Validation:** Zod.
- **AuthZ:** `withTenant("writer")` — tenant + role enforced by the controller.
- **Edge cases handled:** snapshot binding recorded at submit time so post-submit edits invalidate the chain (verified against `proposalMatchesReviewBinding` in `proposal-review-service.ts:82`).

#### `src/app/api/proposals/[id]/financial/route.ts` — 123 LOC
- **Handlers:** `GET` (`withTenant("session")`, L17), `PUT`/`PATCH` (`withTenant("writer")`, L43).
- **Purpose:** Financial forms attached to a proposal.
- **Callers:** `proposal-editor.tsx:130,403`.
- **Validation:** `financialFormsSchema`. **AuthZ:** controller-enforced. No defects found.

#### `src/app/api/proposals/[id]/obligations/route.ts` — 215 LOC
- **Handlers:** `GET` (session, L28), `POST` (writer, L66), `PATCH` (writer, L144). `dynamic = "force-dynamic"`.
- **Purpose:** Contract obligation register — extract, list, and update obligation states.
- **Callers:** `contract-studio.tsx:315,356,381`.
- **Validation:** Zod. **AuthZ:** `withTenant`. `contractObligationState.findMany` (L43) is proposal-scoped and bounded in practice. No defects found.

#### `src/app/api/proposals/[id]/rewrite/route.ts` — 217 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** LLM-assisted rewrite of a proposal section.
- **Deps:** `requireWriter` (**L33**), LLM provider with deterministic fallback, `audit`.
- **Callers:** `proposal-editor.tsx:267`.
- **AuthZ:** `requireWriter` + workspace match.
- **Note:** synchronous LLM call in the request path; no `maxDuration` declared, so the platform default applies (see §2.9).

#### `src/app/api/proposals/[id]/validate/route.ts` — 108 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Pre-submission validation — restrictions + compliance checks for the proposal's project.
- **Deps:** `requireSession` (L20), `db.restriction.findMany` (L33), `db.complianceCheck.findMany` (L37).
- **Callers:** `proposal-editor.tsx:140`, `contracts-panel.tsx:103`.
- **AuthZ:** session + workspace match on the parent proposal before the child queries.
- **Not handled:** both `findMany` calls are unbounded (project-scoped, so bounded in practice).

#### `src/app/api/proposals/[id]/versions/route.ts` — 130 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Keyset-paginated version list (desc), metadata only.
- **Deps:** `requireSession` (L27), `decodeProposalVersionCursor`/`encodeProposalVersionCursor` — cursors are **scoped to `workspaceId` + `proposalId`** (L55-59), so a cursor cannot be replayed across tenants. Good design.
- **Callers:** `version-history.tsx:255`.
- **Validation:** manual `limit` clamp (1..50, default 20, L48-51); cursor validated by decoder.
- **AuthZ:** session + `assertWorkspaceMatch` (L39) before the version query.
- **Not handled:** `err.message` leak at **L126**.

#### `src/app/api/proposals/[id]/versions/[version]/route.ts` — 88 LOC
- **Handlers:** `GET`. Immutable revision detail incl. full `contentMd`.
- **AuthZ:** `requireSession` (L17) + `assertWorkspaceMatch` (L40); version fetched by composite key `proposalId_version` so no cross-proposal read.
- **Not handled:** `err.message` leak at **L84**.

#### `src/app/api/proposals/[id]/versions/compare/route.ts` — 49 LOC
- **Handlers:** `GET`. `?a=&b=`.
- **Callers:** `proposal-editor.tsx:450`, `contract-studio.tsx:285`, `reviews-queue.tsx:112`, `version-history.tsx:488`.
- **AuthZ:** `requireSession` (L14) + ownership check (L23).
- **Not handled:** **no `try/catch` anywhere in the file** — any throw escapes to the Next.js default error response instead of the bilingual `ApiFailure` contract (defect **#43**).

#### `src/app/api/proposals/[id]/versions/[version]/revert/route.ts` — 134 LOC
- **Handlers:** `POST`.
- **Callers:** `proposal-editor.tsx:428`, `contract-studio.tsx:260`, `version-history.tsx:524`.
- **AuthZ:** `requireWriter` (L21) + ownership.
- **Edge cases handled:** revert appends a *new* version rather than rewinding (append-only history preserved).
- **Not handled:** no `try/catch` (defect **#43**).

#### `src/app/api/proposals/builder/route.ts` — 200 LOC
- **Handlers:** `GET` (L13), `POST` (L62).
- **Purpose:** Save/load the structured section-based proposal builder document.
- **Deps:** **`getServerSession(authOptions)` directly** (L2, L13, L63), `db`, `audit`, analytics collectors.
- **Callers:** `proposal-builder.tsx:124,141`.
- **Validation:** `Array.isArray(sections)` only (L70); each element cast `(s: any)` (L122).
- **Output:** `{ ok, proposalId, workspaceId, version, sections }`; 400/401/404/500.
- **AuthZ:** authenticated only — **no role check, no MFA gate, workspace taken from the JWT claim `session.user.workspaceId`** (L85, L107, L154).
- **Not handled:** the single densest cluster of defects in the audit — **#6** (authz/MFA), **#7** (cross-tenant `projectId`), **#8** (non-transactional delete+recreate), **#18** (version bump without a `ProposalVersion` row or snapshot invalidation), **#19** (unbounded/unvalidated `sections`), **#20** (`metadata.title.en` TypeError).

---

### 1.2 Projects

#### `src/app/api/projects/route.ts` — 88 LOC
- **Handlers:** `GET` (L10), `POST` (L54). `dynamic = "force-dynamic"`.
- **Purpose:** List/create tender projects with `_count` rollups, latest agent run, and a compliance score.
- **Callers:** `projects-list.tsx:76`, `topbar.tsx:69`, `tender-setup-wizard.tsx:93`, `agent-workflow.tsx:184`.
- **Validation:** `projectCreateSchema` on POST; `etimadRef` auto-generated via `crypto.randomUUID()` when absent (L64-65).
- **AuthZ:** `withTenant("session")` / `withTenant("writer")`; `where.workspaceId` — tenant-safe.
- **Not handled:** unbounded list (L12) and an **N+1** `complianceCheck.findMany` per project (**L32-47**) — defect **#14**.

#### `src/app/api/projects/[id]/route.ts` — 116 LOC
- **Handlers:** `GET` (L22), `PATCH` (L44), `DELETE` (L88). `dynamic = "force-dynamic"`.
- **Purpose:** Read / update / delete one tender project.
- **Callers:** `projects-list.tsx:82` (DELETE), `agent-workflow.tsx:184`, `etimad-workflow-cockpit.tsx:247`.
- **Validation:** `projectPatchSchema` on PATCH.
- **AuthZ:** `requireSession` / `requireWriter` / `requireWriter` + `loadOwnedProject(id, workspace.id)`.
- **Not handled:** DELETE is `requireWriter` only despite cascading to documents/proposals/contracts (defect **#23**); DELETE writes `AUDIT_ACTIONS.PROJECT_CREATE` (**L103**, defect **#22**); `err.message` leaks at L32, L81, L112.

#### `src/app/api/projects/[id]/requirements/route.ts` — 69 LOC
- **Handlers:** `GET` (L13), `PATCH` (L37). `dynamic = "force-dynamic"`.
- **Purpose:** Tender requirement matrix with coverage summary.
- **Callers:** `requirements-matrix.tsx:51,108`.
- **Validation:** `requirementPatchSchema`, plus a manual `body.id` extraction (L44) that is then re-scoped by `findFirst({ id: reqId, projectId })` (L46) — **no IDOR**.
- **AuthZ:** `withTenant` + `assertWorkspaceMatch` on the parent project.
- **Not handled:** unbounded `findMany` (L19) with three in-memory `filter` passes for the summary (defect **#33**).

---

### 1.3 Contracts — the strongest subsystem

#### `src/app/api/contracts/drafts/route.ts` — 382 LOC
- **Handlers:** `POST` (L376), `GET` (L380). `dynamic = "force-dynamic"`.
- **Purpose:** Persist and list contract drafts. **Reference implementation for the whole codebase.**
- **Deps:** dependency-injected `ContractDraftRouteDependencies` (L32-67) with a `productionDependencies` binding (L69-93) — fully unit-testable (`src/lib/__tests__/contract-draft-route.test.ts`).
- **Callers:** `contract-template-catalog.tsx:115,170,284`.
- **Validation:** content-type must be `application/json` (L135); `Content-Length` sanity + budget check **before** reading (L146-169); post-read byte-length re-check (L184); Zod `contractDraftWriteSchema` (L208) with per-issue paths returned.
- **AuthZ:** `requireWriter` for POST, `requireSession` for GET; workspace from `getTenantContext`; `projectId` ownership verified via `projectExists(workspaceId, projectId)` (L82-88, L254-263).
- **Edge cases handled:** rate-limit admission with `Retry-After` (L264-276); cursor pagination; integrity-failure exclusion count surfaced to the client.
- **Minor:** unauthenticated POST returns **403** rather than 401 (L247) — defect **#38**.

#### `src/app/api/contracts/drafts/[id]/route.ts` — 276 LOC
- **Handlers:** `GET` (L254), `PATCH` (L262), `DELETE` (L270).
- **Validation:** strict id regex `/^[A-Za-z0-9_-]{1,200}$/u` (L92, L139, L214) + Zod body.
- **AuthZ:** `requireSession`/`requireWriter`; every persistence call takes `workspaceId` — tenant-safe.
- **Not handled:** no rate-limit admission on PATCH/DELETE, unlike POST on the sibling route (defect **#41**).

#### `src/app/api/contracts/instances/[id]/versions/route.ts` — 58 LOC
`GET`, `dynamic="force-dynamic"`. `withTenant("session")`; `listContractVersions({ contractId, workspaceId, cursor, take })` — cursor pagination, workspace-scoped. Caller: `contract-revision-history.tsx:53`. Clean.

#### `src/app/api/contracts/instances/[id]/versions/compare/route.ts` — 59 LOC
`GET`, `?a=&b=`. `withTenant("session")`; `compareContractRevisions({ contractId, workspaceId, revA, revB })`. Zod query schema; error issues echoed in the 400 message (domain validation, acceptable). Caller: `contract-revision-history.tsx:72`. Clean.

#### `src/app/api/contracts/instances/[id]/versions/[revision]/route.ts` — 49 LOC
`GET`. `parseInt` + `Number.isFinite` + `>= 1` guard **before** `withTenant` (L17-24). Workspace-scoped fetch. Clean.

#### `src/app/api/contracts/templates/route.ts` — 56 LOC
`GET`. Static catalog projection (`CONTRACT_TEMPLATE_KEYS`). `requireSession` (L42) + `getTenantContext` (used only to stamp `workspaceId` in the response). Caller: `contract-template-catalog.tsx:91`. Clean.

#### `src/app/api/contracts/templates/[key]/preview/route.ts` — 283 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`, **`maxDuration = 60`** (L18).
- **Purpose:** Compile a catalog contract template with bindings and render HTML or PDF.
- **Deps:** DI dependencies object (L39-100), `documentExportGate`, `audit`.
- **Validation:** `.strict()` Zod (L22-27) with bounded record keys (`max(160)`); 256 KiB request budget checked pre- and post-read (L129-151).
- **AuthZ:** `requireSession` (L71) + `getTenantContext`; PDF path acquires an export permit and always releases it in `finally` (L272-274).
- **Edge cases handled:** `BLOCKED` compilation → 422 with diagnostics; lifecycle headers stamped on every response.
- **Not handled:** raw `error.message` in the 503 body (L266); route param `key` interpolated unsanitized into `Content-Disposition` (L232, L252-254) — defect **#36**.

#### `src/app/api/contracts/workspace-templates/route.ts` — 84 LOC
`GET` (`withTenant("session")`, L13), `POST` (`withTenant("writer")`, L53). Zod list-query and submission schemas. Cursor pagination. Callers: `workspace-template-editor.tsx:76,102`. Clean.

#### `src/app/api/contracts/workspace-templates/[id]/route.ts` — 98 LOC
`GET`/`PATCH`/`DELETE`; all `withTenant` with `workspaceId` passed into every service call. DELETE is a **retire** (soft delete), returning `lifecycle`. Callers: `workspace-template-editor.tsx:140,178`. Clean.

#### `src/app/api/contracts/workspace-templates/[id]/preview/route.ts` — 115 LOC
- **Handlers:** `GET`. `dynamic = "force-dynamic"`.
- **Purpose:** Render tenant-authored template content to bilingual HTML.
- **AuthZ:** `withTenant("session")`; both the template lookup (L38-41) and the raw row fallback (L63-74, incl. `isSystem: false`) are workspace-scoped — tenant-safe.
- **Not handled:** **HTML is assembled by raw string concatenation of tenant-authored `titleAr`/`titleEn`/text nodes and `section.key` with no escaping** (L87-98) — defect **#21**.

#### `src/app/api/contracts/workspace-templates/[id]/versions/route.ts` — 53 LOC
`GET`; Zod query, cursor pagination, workspace-scoped. Caller: `workspace-template-editor.tsx:94`. Clean.

#### `src/app/api/contracts/workspace-templates/[id]/versions/[version]/route.ts` — 40 LOC
`GET`; `getTemplateVersion({ workspaceId, templateId, versionId })`; 404 when absent. Clean.

---

### 1.4 Documents

#### `src/app/api/documents/route.ts` — 136 LOC
- **Handlers:** `GET` (L16), `POST` (L40). `dynamic = "force-dynamic"`, **`maxDuration = 60`** (L14).
- **Purpose:** List workspace documents; upload a new document (multipart) through the ingestion pipeline.
- **Deps:** `requireSession`/`requireWriter`, `assertWithinQuota`, `ingestDocumentForWorkspace`, `assertWorkspaceMatch`, analytics.
- **Callers:** `file-ingestion.tsx:93-94,118`, `document-matrix.tsx:73`, `topbar.tsx:78`, `version-history.tsx:409`, `agent-workflow.tsx:212`, `knowledge-review-controls.tsx:51`, `knowledge-approval-queue.tsx:131`.
- **Validation:** content-type prefix check (L62); `file instanceof File` (L71); `projectId` required and ownership-checked (L89-99); **`docCategory` is `String(...) as DocCategory` with no enum validation** (L77).
- **Output:** `{ documents }` / `{ document }`; 400/401/402 (quota)/403/404/500.
- **AuthZ:** session/writer + `workspaceId` scoping + project ownership. Tenant-safe.
- **Edge cases handled:** plan quota → 402 with code; MIME allowlist and 50 MB cap enforced downstream in `ingestDocumentForWorkspace`.
- **Not handled:** `req.formData()` (L69) + `file.arrayBuffer()` (L81) buffer the entire upload **before** any size check (defect **#24**); HTTP status derived from a regex over the error message and the message returned verbatim (L131-134, defects **#10**/**#26**); list is unbounded and eagerly includes 10 versions per document plus counts.

#### `src/app/api/documents/[id]/route.ts` — 155 LOC
- **Handlers:** `GET` (L31), `PATCH` (L131), `DELETE` (L55). `dynamic = "force-dynamic"`.
- **Purpose:** Read/patch/delete a single document.
- **Callers:** `document-matrix.tsx:86`.
- **Validation:** `documentPatchSchema`.
- **AuthZ:** `requireSession`/`requireWriter` + a `loadOwnedDoc(id, workspaceId)` helper — tenant-safe.
- **Not handled:** `loadOwnedDoc` eagerly includes **all** versions even for DELETE/PATCH (defect **#39**); `err.message` leaks at L43, L119, L151.

#### `src/app/api/documents/[id]/versions/route.ts` — 290 LOC
- **Handlers:** `GET` (L54), `POST` (L151). `dynamic = "force-dynamic"`.
- **Purpose:** List document versions (keyset, `take: limit + 1` at L96) and append a new version.
- **Callers:** `version-history.tsx:92`; `capability-reachability-manifest.ts:131`.
- **AuthZ:** `requireSession`/`requireWriter` + ownership. Author hydration batched via a single `user.findMany` (L121) — **no N+1**.
- **Edge cases handled:** checksum recorded per version; cursor scoped like the proposal equivalent.

#### `src/app/api/documents/[id]/versions/[version]/route.ts` — 110 LOC
- **Handlers:** `GET`. `?includeBytes=1` returns base64 file bytes after checksum verification.
- **AuthZ:** `requireSession` (L22) + ownership; `readWorkspaceStoredFile` re-asserts the storage path is inside the workspace prefix (path-traversal safe).
- **Not handled:** `includeBytes` reads the whole file and base64-encodes it (+33 % memory) with **no `maxBytes` cap and no rate limit** (L71-83) — defect **#30**.

#### `src/app/api/documents/[id]/versions/compare/route.ts` — 67 LOC
`GET`. `requireSession` (L31) + ownership; `documentVersion.findMany` (L49) restricted to the two requested versions. Caller: `version-history.tsx:487`. Clean.

#### `src/app/api/documents/[id]/versions/[version]/revert/route.ts` — 172 LOC
`POST`. `requireWriter` (L25) + ownership; revert appends a new version rather than mutating history. Caller: `version-history.tsx:498`. Clean.

---

### 1.5 Clauses

#### `src/app/api/clauses/route.ts` — 88 LOC
- **Handlers:** `GET`, `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Browse the standard-clause catalog (system clauses `workspaceId: null` + workspace custom clauses) and create a custom clause.
- **Deps:** `@/lib/clause-library` — `listClauses`, `createCustomClause`.
- **Callers:** `clause-browser.tsx:122,131`.
- **Validation:** delegated. `createCustomClause` (`clause-library.ts:760`) is thorough: workspace required, both AR+EN mandatory, `MAX_CLAUSE_LENGTH` bound, title ≤ 500, `isUnsafeClauseText` screening, catalog-declared category enum.
- **AuthZ:** `withTenant`; `listClauses` composes `OR: [{workspaceId: null}, {workspaceId}]` (`clause-library.ts:561-574`) — tenant-safe, and `take` is clamped to `MAX_CLAUSE_LIST_TAKE = 50` (L542).
- **Minor:** body fields coerced with `.toString()` before reaching the validator (defect **#40**).
- **Note:** an earlier hypothesis that a missing clause returns `200 { clause: null }` was checked and is **false** — `getClauseByIdentifier` throws `ApiError(..., 404)` (`clause-library.ts:615, 634, 645`).

#### `src/app/api/clauses/[id]/route.ts` — 20 LOC
`GET`. `withTenant` + `getClauseByIdentifier(identifier, workspaceId)`, which builds an explicit 4-branch `OR` pairing each identifier form with `workspaceId: null` or the caller's workspace (`clause-library.ts:622-636`). **Correctly scoped** — this is the pattern the marketplace routes should have used.

#### `src/app/api/clauses/select/route.ts` — 37 LOC
`POST`. `withTenant("session")`. Guards `Array.isArray(body.clauseIds)` (L12) and `length > MAX_CLAUSE_SELECT_IDS` (100) (L18); `selectClausesForTemplate` receives `workspaceId`. Caller: `clause-browser.tsx:161`. Minor: `body.templateFamily?.toString()` (L16).

---

### 1.6 Templates (marketplace)

#### `src/app/api/templates/marketplace/route.ts` — 203 LOC
- **Handlers:** `GET` (L59), `POST` (L153). `dynamic = "force-dynamic"`.
- **Purpose:** Browse the template marketplace (system + public + own-workspace entries) and publish an entry.
- **Callers:** `template-marketplace.tsx:97`, `marketplace-publish-dialog.tsx:96`.
- **Validation:** Zod; `take: parsed.pageSize` (L106) — **paginated**.
- **AuthZ:** `withTenant("session"/"writer")`; the **list** query composes visibility correctly.
- **Not handled:** page offset is unbounded (deep-offset scans).

#### `src/app/api/templates/marketplace/[id]/route.ts` — 133 LOC
- **Handlers:** `GET` (L25), `DELETE` (L96).
- **Callers:** `template-marketplace-card.tsx:84,201`.
- **AuthZ:** DELETE is correct — it re-checks `row.workspaceId !== workspaceId` → 403 (L110-112). **GET is not**: the `OR` at L30-38 leads with a bare `{ id }` (defect **#2**).

#### `src/app/api/templates/marketplace/[id]/rate/route.ts` — 110 LOC
- **Handlers:** `POST` (L44), `GET` (L94).
- **Callers:** `template-marketplace-card.tsx:167`.
- **Validation:** `.strict()` Zod, integer 1–5 (L15-19).
- **Edge cases handled:** rating upsert + average recomputation in a single `$transaction` (L50-75) — correct.
- **Not handled:** `resolveEntry` (L21-31) repeats the bare `{ id }` branch (defect **#4**).

#### `src/app/api/templates/marketplace/[id]/use/route.ts` — 285 LOC
- **Handlers:** `POST` (L181). `withTenant("writer")`.
- **Purpose:** Materialize a marketplace template into the caller's workspace — either append sections to an existing proposal or create a new draft proposal.
- **Callers:** `template-marketplace-card.tsx:132`.
- **AuthZ:** the *destination* is correctly scoped (`generatedProposal.findFirst({id, workspaceId})` L67-70; `tenderProject.findFirst({id, workspaceId})` L125-128). The *source* is not — `resolveDbTemplate` L37-46 (defect **#3**).
- **Not handled:** section application is a loop of individual `create` calls (L83-102) / `Promise.all` of creates (L145-160) with no transaction (defect **#28**).

---

### 1.7 Reviews

#### `src/app/api/reviews/route.ts` — 32 LOC
`GET`. `withTenant("session")`; `where: { reviewerId: userId, status: "PENDING", proposal: { workspaceId } }` — doubly scoped. Caller: `reviews-queue.tsx:57`. Minor: no `take` (L9).

#### `src/app/api/reviews/[id]/route.ts` — 104 LOC
- **Handlers:** `PATCH`. `dynamic = "force-dynamic"`.
- **Purpose:** Approve/reject a review step.
- **Callers:** `reviews-queue.tsx:66`.
- **Validation:** `reviewDecisionSchema` via `parseJsonBody`.
- **AuthZ:** `requireReviewerAction()` (L28) is only a session check — **but the real enforcement is correct and lives in `decideProposalReview`** (`proposal-review-service.ts:44-88`), which inside a `$transaction` verifies workspace (L54), reviewer identity (L61), `PENDING` status (L68), active proposal state (L75), and the snapshot binding (L82), plus contract/structured snapshot validity. This is the most rigorous authorization path in the audit.
- **Not handled:** `err.message` leak (L102). Notification is genuinely fire-and-forget (L74-91) — a floating promise, acceptable but unobservable on failure.

---

### 1.8 Collaboration

#### `src/app/api/collaboration/comments/route.ts` — 155 LOC
- **Handlers:** `GET` (L44), `POST` (L103).
- **Callers:** `collaboration-comments.tsx:64,86`.
- **Validation:** Zod `commentListSchema` / `commentCreateSchema`; `parentId: z.string().optional()` (L26) — **shape only, no relational check**.
- **AuthZ:** `withTenant("session")` + `loadOwnedProposal(proposalId, workspaceId)` (L51, L110) — the *proposal* is verified, the *parent comment* is not (defect **#5**).
- **Not handled:** unbounded comments and unbounded nested `replies` include (L56-68) — defect **#29**.

#### `src/app/api/collaboration/comments/[id]/route.ts` — 148 LOC
- **Handlers:** `PATCH` (L84), `DELETE` (L121).
- **Callers:** `collaboration-comments.tsx:136,173`.
- **Validation:** `.strict()` Zod (L30-34); length bounds deliberately deferred to the service so the failure carries `COMMENT_CONTENT_INVALID`.
- **AuthZ:** exemplary — `actorFrom` (L38-49) assembles `{userId, workspaceId, membershipRole, isWorkspaceManager}` and the lifecycle service enforces author-only amend and author-or-manager delete, with reply-preserving withdrawal. Clean.

#### `src/app/api/collaboration/comments/[id]/resolve/route.ts` — 66 LOC
- **Handlers:** `POST`.
- **Callers:** `collaboration-comments.tsx:205`.
- **AuthZ:** `withTenant("session")` + workspace ownership via the parent proposal (L38) — **but no author or manager check** (defect **#11**).
- **Not handled:** no already-resolved conflict, no un-resolve, and the update (L42) and audit (L47) are not in a transaction.

#### `src/app/api/collaboration/presence/route.ts` — 226 LOC
- **Handlers:** `GET` (L78), `POST` (L121).
- **Purpose:** Live presence — who is viewing/editing which section of a proposal; supports `navigator.sendBeacon` (text/plain bodies accepted, L127).
- **Callers:** `collaboration-presence.tsx:82,110,169`.
- **Deps:** **`getServerSession(authOptions)` directly** (L2, L78, L121).
- **Validation:** manual; `sectionKey` accepted as an arbitrary unbounded string (L207, L212).
- **AuthZ:** authenticated; `workspaceId` compared against the **JWT claim** `session.user.workspaceId` (L94, L160, L206). Proposal ownership *is* re-verified against the DB (L101-104, L157-160), which limits the blast radius.
- **Not handled:** MFA gate bypassed; stale-claim window (`CLAIMS_REFRESH_MS = 60_000`, `auth.ts:85`); no rate limit on a heartbeat endpoint; stale-row cleanup is a `deleteMany` on every GET (L26).

---

### 1.9 Library / Knowledge / Methodologies / Certificates

These four share one design: a knowledge record with a **content hash**, a review state (`UNREVIEWED`/`APPROVED`/`REVOKED`), and the rule that any substantive edit re-computes the hash and forces the record back to unreviewed.

#### `src/app/api/library/route.ts` — 248 LOC
`GET` (L20), `POST` (L30), `PATCH` (L67), `DELETE` (L200). `withTenant("session"/"writer")`, all workspace-scoped. Callers: `requirements-matrix.tsx:93`, `account-onboarding.tsx:302`.
Validation: `libraryItemSchema` on POST; `libraryItemSchema.partial()` on PATCH (**L75**) — no `.strict()`, and the handler then reads unvalidated `body.approved` / `body.provenance` / `body.reason` (defect **#27**). Approval requires `isWorkspaceManager`. GET returns full `bodyMd` for every row (defect **#31**).

#### `src/app/api/methodologies/route.ts` — 234 LOC
Same shape: `GET` (L20), `POST` (L30), `PATCH` (L63), `DELETE` (L186). `methodologySchema.partial()` at **L71** (defect **#27**). Caller: `account-onboarding.tsx:290`.

#### `src/app/api/certificates/route.ts` — 263 LOC
`GET` (L20), `POST` (L30), `PATCH` (L72), `DELETE` (L215). Callers: `account-onboarding.tsx:351,378,412,551`, `requirements-matrix.tsx:65`.
Approval flow is careful: `substantiveEdit && typeof body.approved === "boolean"` → 400 `KNOWLEDGE_REVIEW_EDIT_CONFLICT` (L104-110); approve/revoke require `isWorkspaceManager` (L115, L143); approval requires checksummed workspace evidence (L123-129).
**Defect #9 lives here:** `filePath` participates in the content hash (L91) and in the substantive-edit set (L101) but is **absent from the `update.data` object** (L168-179).

#### `src/app/api/knowledge/pending-approval/route.ts` — 131 LOC
`GET` (L25), `POST` (L89). `withTenant("session")`, `.strict()` Zod list query (L14-19), keyset pagination, service-layer decisions with `first-decision-wins` semantics and bilingual rejection reasons. `membershipRole` is forwarded to the decision service for authorization (L95). Callers: `knowledge-approval-queue.tsx:116,166,206,622`. Clean; the only note is a legacy alias normalizer (L57-83).

---

### 1.10 Compliance / Sectors / Partnerships / Bid history

#### `src/app/api/compliance/route.ts` — 50 LOC
`GET`. `withTenant("session")`. When `projectId` is supplied the project is ownership-checked first (L13-20) and only then is the narrower `{ projectId }` filter used (L22-24) — **safe, but structurally fragile**: the tenant guarantee lives in a preceding `if` rather than in the query. Caller: `compliance-monitor.tsx:76-77`. Unbounded `findMany` (L26) plus six in-memory `filter` passes for the summary (defect **#32**).

#### `src/app/api/sectors/route.ts` — 52 LOC
`GET`/`POST`/`DELETE`. `withTenant`, Zod `targetSectorSchema`, composite-key upsert `workspaceId_sector` (L26), DELETE re-scoped by `findFirst({id, workspaceId})` (L44-47). Callers: `account-onboarding.tsx:971,994`. Clean.

#### `src/app/api/partnerships/route.ts` — 51 LOC
Identical pattern with `partnershipSchema`. Caller: `account-onboarding.tsx:314`. Clean.

#### `src/app/api/bid-history/route.ts` — 51 LOC
Identical pattern with `bidHistorySchema`. Callers: `account-onboarding.tsx:975,1028`. Clean.

---

### 1.11 Business profile / Brand

#### `src/app/api/business-profile/route.ts` — 43 LOC
`GET`. `requireSession` (L13) + `getTenantContext`; returns the profile plus strict/draft bilingual export readiness with blocking diagnostics. Caller: `business-profile-view.tsx:111`. Clean.

#### `src/app/api/business-profile/export/route.ts` — 345 LOC
- **Handlers:** `GET` (L91). Exports a capability statement / business profile as HTML or PDF.
- **Callers:** `business-profile-view.tsx:182`; unit-tested by `business-profile-export-route.test.ts`.
- **AuthZ:** `requireSession` + workspace resolution (L101).
- **Not handled:** workspace `slug` interpolated unsanitized into `Content-Disposition` (L160, L169, L244, L264, L285, L310, L327) — defect **#35**; raw `error.message` at L289, L330.

#### `src/app/api/brand/route.ts` — 424 LOC
`GET` (L146, `requireSession`), plus `requireWriter`-gated mutations at L171, L203, L273 covering brand profile fields and past projects (`pastProject.findMany` L157). Callers: `brand-setup.tsx:92,205,494,564`, `proposal-editor.tsx:154`, `contract-studio.tsx:119`. Workspace-scoped throughout; no defects found.

#### `src/app/api/brand/logo/route.ts` — 79 LOC
- **Handlers:** `POST`. `dynamic = "force-dynamic"`.
- **Purpose:** Multipart brand-logo upload.
- **Callers:** `brand-setup.tsx:283`.
- **AuthZ:** `requireWriter` (L13) + brand profile from `getTenantContext`.
- **Edge cases handled (well):** MIME allowlist + `size < 1` + 8 MiB cap **before** decoding (L27-37); `validateAndNormalizeLogoImage` re-derives the real type from magic bytes; declared vs. actual MIME must match (L51-56); `saveUpload` writes under the workspace prefix and the URL is served through the tenant-scoped `/api/files` proxy (L64).
- **Not handled:** `req.formData()` (L22) buffers before the size check; the previous logo file is never deleted; no rate limit (defect **#37**).

---

### 1.12 Analytics / Stats

#### `src/app/api/analytics/proposals/route.ts` — 343 LOC
- **Handlers:** `GET`. Proposal funnel metrics with period-over-period comparison and daily buckets.
- **Callers:** `analytics-dashboard.tsx:89`; mirrored by `analytics-origin-route-integration.test.ts`.
- **Validation:** Zod range/date parsing.
- **AuthZ:** tenant-scoped via the analytics origin.
- **Not handled:** both the current (L69) and previous (L89) ranges are loaded fully into memory and aggregated in JS (defect **#16**); daily bucket keys come from UTC ISO strings while the loop advances the cursor with local-time date arithmetic (defect **#17**).

#### `src/app/api/stats/route.ts` — 161 LOC
`GET`. `withTenant("session")` (L9). Dashboard counters. Callers: `charts-panel.tsx:35`, `stat-cards.tsx:26`.
**Not handled:** `agentRun.findMany` (L36) and three separate `complianceCheck.findMany` calls (L40, L72, L79) fetch rows only to `.length`/`.filter` them in memory (defect **#15**).

#### `src/app/api/stats/tender-insights/route.ts` — 41 LOC
`GET`. `withTenant("session")`; selects only `category/budget/currency/status` for active tenders (L14-25) and delegates to a pure aggregator. Caller: `tender-insights-chart.tsx:83`. Clean.

---

## 2. Cross-cutting observations

### 2.1 Tenant (workspace) isolation

**Overall: strong.** Every route resolves a workspace before touching data, and the great majority pass `workspaceId` into the Prisma `where`. Three distinct scoping idioms are in use:

1. `withTenant(...)` → `ctx.workspace.id` in the `where` — the dominant and safest pattern.
2. `requireSession()` + `getTenantContext()` + `assertWorkspaceMatch(row.workspaceId, workspace.id)` — a *post-fetch* comparison. Correct, but it fetches the foreign row before rejecting, so a timing/enumeration signal exists in principle.
3. `getServerSession()` + `session.user.workspaceId` — **the JWT claim**, refreshed only every 60 s (`auth.ts:85`).

**Routes that do NOT scope a query by workspace/ownership:**

| Route | Query | Verdict |
|---|---|---|
| `templates/marketplace/[id]/route.ts:30-38` | `OR: [{ id }, ...]` | **Unscoped — defect #2** |
| `templates/marketplace/[id]/rate/route.ts:22-31` | `OR: [{ id }, ...]` | **Unscoped — defect #4** |
| `templates/marketplace/[id]/use/route.ts:37-46` | `OR: [{ id }, ...]` | **Unscoped — defect #3** |
| `collaboration/comments/route.ts:119` | `parentId` written unchecked | **Unscoped — defect #5** |
| `proposals/builder/route.ts:108` | `projectId` written unchecked | **Unscoped — defect #7** |
| `compliance/route.ts:22-24` | `{ projectId }` alone | Safe *only* because of the guard at L13-20 |
| `collaboration/presence/route.ts:94,206` | claim-based `workspaceId` | Weak — defect #12 |
| `proposals/builder/route.ts:85,107` | claim-based `workspaceId` | Weak — defect #6 |

### 2.2 IDOR risk

Routes accepting an `[id]` and fetching **without** an ownership predicate: the three marketplace routes above. Every other `[id]` route either uses a composite key that includes the parent (`proposalId_version`, `entryId_userId`), or re-scopes via `findFirst({ id, workspaceId })` / `assertWorkspaceMatch`, or delegates to a service that takes `workspaceId` as a mandatory argument.

Two *body-supplied* identifiers are written without any check, which is the same class of bug one level down: `parentId` (comments) and `projectId` (builder).

Mitigating factor for all of these: ids are cuids, so exploitation requires obtaining an id out of band. That lowers likelihood but not severity — the authorization predicate is simply absent.

### 2.3 Input validation consistency

Roughly 70 % of routes use Zod. The remainder is ad hoc. Four distinct problems:

- **Missing `.strict()` on partial updates.** `library/route.ts:75`, `methodologies/route.ts:71`, `certificates/route.ts:80` all use `schema.partial().safeParse(body)`. Unknown keys pass silently, and each handler then reaches around the parsed object to read raw `body.approved`, `body.provenance`, `body.reason` — the review-state machine is driven by *unvalidated* input.
- **Unvalidated enum casts.** `documents/route.ts:77` — `String(form.get("docCategory") || "OTHER") as DocCategory`. A bogus value reaches Prisma and surfaces as a 500.
- **`.toString()` coercion.** `clauses/select/route.ts:16`, `clauses/route.ts` — an object body field becomes `"[object Object]"` and passes length checks.
- **No validation at all.** `proposals/builder/route.ts:70` accepts any array; each element is cast `(s: any)`.

Contrast with the best-in-class: `contracts/templates/[key]/preview/route.ts:22-27` (`.strict()`, bounded record keys), `collaboration/comments/[id]/route.ts:30-34`, `templates/marketplace/[id]/rate/route.ts:15-19`, `knowledge/pending-approval/route.ts:14-19`.

### 2.4 Pagination / unbounded `findMany`

Only **7** `take:` clauses exist across 10,848 LOC (`documents/[id]/versions:96`, `templates/marketplace:106`, `projects:26`, `proposals/[id]:43`, `contracts/instances/.../versions:40`, `documents:32`, `proposals/[id]/versions:78`).

Properly paginated (keyset/cursor): proposal versions, document versions, contract versions, contract drafts, workspace templates, workspace-template versions, knowledge queue, marketplace list, clause list.

**Unbounded list endpoints:** `proposals/route.ts:11` (worst — full markdown bodies), `projects/route.ts:12`, `documents/route.ts:24`, `library/route.ts:21`, `methodologies/route.ts:21`, `certificates/route.ts:21`, `sectors:11`, `partnerships:11`, `bid-history:11`, `compliance:26`, `reviews:9`, `projects/[id]/requirements:19`, `collaboration/comments:56` (plus unbounded nested replies), `stats:36,40,72,79`, `analytics/proposals:69,89`, `stats/tender-insights:14`, `brand:157`.

Most are bounded in practice by tenant size; the ones that matter at scale are proposals, documents, comments, stats, and analytics.

### 2.5 N+1 query patterns

- **`projects/route.ts:32-47`** — one `complianceCheck.findMany` per project inside `Promise.all`. The only true N+1 in scope.
- **`stats/route.ts`** — not an N+1 but the same anti-pattern: four `findMany` calls whose results are only counted/filtered in JS, where `groupBy`/`count` would do the work in Postgres.
- **`templates/marketplace/[id]/use/route.ts:83-102`** — a `create` per section in a loop.
- **`proposals/builder/route.ts:121-139`** — a `create` per section.
- **Correctly batched (worth noting):** `documents/[id]/versions/route.ts:121` and `proposals/[id]/versions/route.ts:101` both hydrate authors with a single `user.findMany`.

### 2.6 File upload handling

| Concern | Status |
|---|---|
| Size limit | `brand/logo:32` — 8 MiB **pre-decode** (good). `documents` — 50 MiB, but enforced downstream in `ingestDocumentForWorkspace` *after* the route has already buffered everything. |
| MIME validation | `brand/logo` — allowlist **plus** magic-byte re-derivation **plus** declared-vs-actual match (L51). `documents` — allowlist inside `validateUploadAllowlist`, based on the client-declared `file.type`. |
| Path traversal | Not reachable. `sanitizeFilename` + `assertWorkspaceStoragePath` in `src/lib/storage.ts` constrain every write and read to the workspace prefix; `readWorkspaceStoredFile` re-asserts on read. |
| Storage location | Workspace-prefixed paths, served through `/api/files?path=...` which re-scopes by tenant. `src/proxy.ts:174` explicitly documents that uploads must not be excluded from the middleware matcher. |
| Cleanup | **Missing.** Replacing a brand logo orphans the previous file. |
| Rate limiting | **Missing** on both upload endpoints. |

### 2.7 Versioning / compare / revert correctness

Three independent version systems, all **append-only** — revert creates a *new* version rather than rewinding, which is the correct choice for an audit-bearing product.

- **Proposals:** `ProposalVersion` keyed `proposalId_version`; cursors bound to `workspaceId + proposalId` (`version-history-cursor.ts`), so a cursor cannot be replayed across tenants. Compare and revert are correct.
- **Documents:** `DocumentVersion` with per-version checksums; compare fetches exactly the two requested rows.
- **Contracts:** revisions behind `contract-versioning.ts`, every entry point taking `workspaceId`.

**The one break in the model** is `proposals/builder/route.ts:96`: it increments `GeneratedProposal.version` but creates no `ProposalVersion` row and does not clear `structuredSnapshot*`. The result is a version number with no history entry and a snapshot whose recorded revision no longer matches the proposal — which the review binding check (`proposal-review-service.ts:82`) and the export gate (`download/route.ts:1044-1052`) will later reject, surfacing to the user as an opaque 409.

Compare and revert for proposals additionally have **no `try/catch`** (§1.1), so any throw bypasses the bilingual failure contract.

### 2.8 Transactions and optimistic concurrency

**Excellent where it exists:**
- `proposal-review-service.ts:48` — the entire review decision, including all five precondition checks, inside one `$transaction`.
- `templates/marketplace/[id]/rate/route.ts:50-75` — upsert + aggregate + denormalized-average update in one transaction.
- `proposals/[id]/download/route.ts:1033-1055` — genuine optimistic concurrency: `updateMany` guarded by `status`, `updatedAt`, **and** the snapshot hash/revision, with `count !== 1` → `409 EXPORT_STATE_CHANGED`. This is the strongest concurrency control in the codebase.
- `collaboration/comments/[id]` — mutation and audit entry commit together per the service contract.

**Missing where it matters:**
- `proposals/builder/route.ts:102` + `121` — `deleteMany` then N `create`s, unprotected. A failure mid-way leaves the proposal with *zero* sections and no way to recover them.
- `templates/marketplace/[id]/use/route.ts:83-102, 145-160` — partial template application on failure.
- `collaboration/comments/[id]/resolve/route.ts:42,47` — update and audit are separate.

No route uses a `version`/`updatedAt` precondition on PATCH except the download transition, so concurrent editors silently last-write-win on proposals, documents, and knowledge records.

### 2.9 Heavy synchronous work and timeout risk

| Route | Work | `maxDuration` | Guard |
|---|---|---|---|
| `proposals/[id]/download` | PDF/XLSX/PPTX/ZIP generation, Playwright | **120** | rate limit 10/min + `documentExportGate` permit |
| `contracts/templates/[key]/preview` | HTML/PDF render | **60** | export permit, released in `finally` |
| `documents` POST | upload + ingestion/extraction | **60** | plan quota |
| `business-profile/export` | HTML/PDF render | **not set** | none |
| `proposals/[id]/rewrite` | LLM call | **not set** | none |
| `contracts/workspace-templates/[id]/preview` | string HTML render | not set | n/a (cheap) |

`business-profile/export` and `proposals/[id]/rewrite` are the two heavy paths with neither a declared duration nor an admission gate. Per the platform defaults noted in the project context the function ceiling is 300 s, so these will not be truncated early — but they are unmetered, unlike every other export path.

### 2.10 Error-response consistency

`src/lib/api-controller.ts` provides `toErrorResponse` / `jsonApiFailure`, which emit a bilingual `ApiFailure` body with a stable code. Every `withTenant` route gets this for free.

The ~20 Tier-B routes that hand-roll `NextResponse.json` do **not**, and 19 of them return `err.message` verbatim (§3, defect **#10**). Two proposal-version routes have no `try/catch` at all. The practical effect is that the same logical failure produces three different response shapes depending on which route the client hit.

---

## 3. Gaps and defects

Severity reflects impact × likelihood in a multi-tenant B2B context. Every item below was confirmed by reading the code at the cited line.

---

### 3.1 High

---

**#1 — [High] security — `src/app/api/proposals/[id]/download/route.ts:162,166,1054`**

```ts
// L162
export async function GET(
// L166
  const session = await requireSession();
// L1054
        data: { status: "EXPORTED" },
```

A **`GET`** request performs a persistent state transition (`APPROVED` → `EXPORTED`), and the only auth gate is `requireSession`.

Two independent problems. First, `requireSession` does not exclude `REVIEWER`, the read-only role — a reviewer can drive an approved proposal into the exported lifecycle state. Second, state-changing GETs are CSRF-reachable: NextAuth session cookies default to `SameSite=Lax`, which *is* sent on top-level navigations, so any external page that navigates or redirects a logged-in user to `/api/proposals/<id>/download?format=pdf` triggers the transition. Link prefetchers, corporate URL scanners, and chat-app unfurlers do the same thing accidentally. The transition is also what gates the "authoritative artifact" lifecycle, so flipping it prematurely is not cosmetic.

*Fix:* split the endpoint. Keep `GET` for non-authoritative rendering (no writes), and move the authoritative export to `POST /api/proposals/[id]/export` guarded by `requireWriter` and the framework's CSRF token. If the URL shape must be preserved short-term, at minimum change L166 to `requireWriter()` and require a non-navigational request (`Sec-Fetch-Mode: cors` / a custom header) before executing the block at L1033-1055.

---

**#2 — [High] security — `src/app/api/templates/marketplace/[id]/route.ts:30-38`**

```ts
    const row = await db.templateMarketplaceEntry.findFirst({
      where: {
        OR: [
          { id },                                              // ← no tenant/visibility predicate
          { templateKey: id, workspaceId },
          { templateKey: id, workspaceId: null, isPublic: true },
          { templateKey: id, isPublic: true },
        ],
      },
```

The three `templateKey` branches each carry a visibility predicate; the leading `{ id }` branch carries none. Any authenticated user who knows an entry's primary key reads another workspace's **private, unpublished** template in full — `nameJson`, `descriptionJson`, `previewJson`, `sectionTypes`, plus publisher identity (L74-76). The retired-entry guard at L48 filters `isRetired`, not `isPublic`, so it does not compensate.

*Fix:* give the id branch the same predicate as the key branches:
```ts
OR: [
  { id, workspaceId },
  { id, workspaceId: null, isPublic: true },
  { id, isPublic: true },
  ...
]
```
`getClauseByIdentifier` (`src/lib/clause-library.ts:622-636`) already does exactly this and is a good in-repo model.

---

**#3 — [High] security — `src/app/api/templates/marketplace/[id]/use/route.ts:37-46`**

```ts
async function resolveDbTemplate(id: string, workspaceId: string) {
  const row = await db.templateMarketplaceEntry.findFirst({
    where: {
      OR: [
        { id },                                              // ← unscoped
        { templateKey: id, workspaceId },
        { templateKey: id, workspaceId: null, isPublic: true },
      ],
    },
```

The same missing predicate, with a worse consequence: this route *materializes* the resolved template's sections into the caller's own workspace (`appendTemplateSections` L83-102, `persistTemplateDraft` L145-160). A cross-tenant private template is not merely read — it is copied into the attacker's proposal and persisted there. Note the inconsistency: the public-by-key branch present in the sibling routes is missing here, so a genuinely public template *cannot* be used by key while a private one *can* be used by id.

*Fix:* apply the #2 fix to `resolveDbTemplate`, and add the `{ templateKey: id, isPublic: true }` branch so legitimate public use works by key.

---

**#4 — [High] security — `src/app/api/templates/marketplace/[id]/rate/route.ts:22-31`**

```ts
async function resolveEntry(id: string, workspaceId: string) {
  const entry = await db.templateMarketplaceEntry.findFirst({
    where: {
      OR: [
        { id },                                              // ← unscoped
```

Third instance of the same missing predicate. `resolveEntry` backs both `POST` (rate) and `GET` (read own rating), so a cross-tenant private entry can be read *and* have its denormalized `rating`/`ratingCount` mutated by an outsider (L69-72).

*Fix:* same as #2. Better: extract one shared `resolveMarketplaceEntry(id, workspaceId, { forWrite })` helper so the predicate exists in exactly one place — the current duplication across three files is why the bug appears three times.

---

**#5 — [High] security — `src/app/api/collaboration/comments/route.ts:105,119`**

```ts
    const { proposalId, sectionKey, content, parentId } = await parseJsonBody(
      request, commentCreateSchema,
    );
    await loadOwnedProposal(proposalId, ctx.workspace.id);   // verifies the PROPOSAL only
    const comment = await db.collaborationComment.create({
      data: { proposalId, sectionKey, content: content.trim(), mentions: [],
              isResolved: false, parentId,                    // ← never verified
              createdBy: ctx.userId },
```

`parentId` is validated as `z.string().optional()` (L26) — shape only. The schema in `prisma/schema.prisma` has a self-referential FK on `CollaborationComment.parentId` with no constraint tying a reply to its parent's proposal, so **any** comment id in the database is accepted.

Two consequences. Attacker-controlled content is attached to a victim workspace's comment tree, and because `GET` eagerly includes `replies` (L61-67), that content **renders inside the victim's thread** — cross-tenant content injection with a plausible social-engineering payload. Symmetrically, a reply can be parented to another workspace's comment to exfiltrate thread structure.

*Fix:* when `parentId` is present, load the parent and require `parent.proposalId === proposalId` (which is already workspace-verified), returning `404`/`ResourceNotFoundError` otherwise. Consider also rejecting replies-to-replies if the UI only renders one nesting level.

---

**#6 — [High] security — `src/app/api/proposals/builder/route.ts:13,63`**

```ts
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

The only route in scope (with `collaboration/presence`) that bypasses the auth helpers. Middleware still covers authentication, `mustChangePassword`, and email verification, so the real gaps are narrower than they first appear — but they are real:

1. **No role check.** `requireWriter` excludes `REVIEWER`; this does not. A read-only reviewer can create proposals and overwrite every section of an existing one.
2. **MFA step-up bypassed.** The `session.user.mfaEnabled && !session.mfaVerified` check exists **only** in `requireSession` (`src/lib/auth.ts:384`) and is absent from `src/proxy.ts`. A user with MFA enabled but not yet verified in this session can write here.

*Fix:* replace both call sites with `requireWriter()` (or convert the route to `withTenant("writer", ...)`, which also fixes #7 by supplying a DB-resolved workspace).

---

**#7 — [High] security — `src/app/api/proposals/builder/route.ts:107-108`**

```ts
      proposal = await db.generatedProposal.create({
        data: {
          workspaceId: session.user.workspaceId,
          projectId: metadata.projectId,     // ← never checked against the workspace
```

`metadata.projectId` is taken from the request body and written straight into the row. Nothing verifies that the project belongs to the caller's workspace. The result is a `GeneratedProposal` in workspace A whose `projectId` points into workspace B — a cross-tenant foreign key.

The downstream damage is what makes this High rather than Medium: routes that reach the project *through* the proposal (`proposals/[id]/validate/route.ts:33,37` queries restrictions and compliance checks by `proposal.projectId`; the download route reads project data for the compliance gate) will then read and render another tenant's project data under an ownership check that only ever examined the proposal.

Note the correct pattern already exists two files away — `templates/marketplace/[id]/use/route.ts:125-128` does `tenderProject.findFirst({ where: { id, workspaceId } })` before using a `projectId`, and `contracts/drafts/route.ts:254-263` does the same via `projectExists`.

*Fix:* before the create, `const project = await db.tenderProject.findFirst({ where: { id: metadata.projectId, workspaceId }, select: { id: true } }); if (!project) return 404;`

---

**#8 — [High] correctness — `src/app/api/proposals/builder/route.ts:102,121-139`**

```ts
      // Delete existing sections and recreate
      await db.proposalBuilderSection.deleteMany({ where: { proposalId } });
      ...
    const createdSections = await Promise.all(
      sections.map((s: any, index: number) =>
        db.proposalBuilderSection.create({ data: { ... } })
      )
    );
```

Destructive delete followed by N independent creates, **outside any transaction**. `Promise.all` rejects on the first failure while the remaining creates continue unsupervised, and nothing rolls back the `deleteMany`. One invalid `sectionType`, one connection blip, or one payload that trips a column limit, and the user's proposal is left with **zero sections** and no recovery path — the prior content was hard-deleted, and (per #18) no `ProposalVersion` snapshot was written either.

*Fix:* wrap the delete and the creates in `db.$transaction`, and prefer `createMany` over N round-trips:
```ts
await db.$transaction(async (tx) => {
  await tx.proposalBuilderSection.deleteMany({ where: { proposalId } });
  await tx.proposalBuilderSection.createMany({ data: sections.map(...) });
  await tx.generatedProposal.update({ where: { id: proposalId }, data: { ... } });
});
```

---

**#9 — [High] correctness — `src/app/api/certificates/route.ts:91,101,165-182`**

```ts
// L91 — filePath feeds the content hash
      filePath: d.filePath !== undefined ? d.filePath : existing.filePath,
// L101 — filePath counts as a substantive edit
      "filePath",
// L165-182 — but the update never writes it
    const item = await db.certificate.update({
      where: { id },
      data: {
        ...(d.certType   !== undefined ? { certType: d.certType } : {}),
        ...(d.name       !== undefined ? { name: d.name } : {}),
        ...(d.number     !== undefined ? { number: d.number } : {}),
        ...(d.issuer     !== undefined ? { issuer: d.issuer } : {}),
        ...(d.issuedAt   !== undefined ? { issuedAt: ... } : {}),
        ...(d.expiresAt  !== undefined ? { expiresAt: ... } : {}),
        ...(d.alertDays  !== undefined ? { alertDays: d.alertDays } : {}),
        ...(d.notes      !== undefined ? { notes: d.notes } : {}),
        ...(reviewData ?? {}),                      // ← no filePath spread
      },
    });
```

`PATCH { id, filePath }` produces three wrong outcomes at once: the submitted `filePath` is silently discarded; `contentHash` is recomputed **from the new value** and persisted via `reviewData`, so the stored hash no longer describes the stored row; and because `filePath` is in the substantive-edit set, an approved certificate is knocked back to `UNREVIEWED` for an edit that never happened.

The last point is the one that hurts operationally — this is a compliance-evidence record. Every downstream integrity check that recomputes the hash from the row (the approval-evidence resolver, the export gate) will now disagree with the stored hash, and the record has lost its approval for no visible reason.

*Fix:* add `...(d.filePath !== undefined ? { filePath: d.filePath } : {}),` to the `data` object. Then audit `library/route.ts:162` and `methodologies/route.ts` for the same class of hash-vs-persisted-field drift — they share this handler shape (the library route does spread `bodyMd` at L162, so it appears correct, but the field lists should be diffed against the hash inputs mechanically rather than by eye).

---

**#10 — [High] security — 19 sites; representative: `src/app/api/documents/route.ts:131-134`**

```ts
    const message = err instanceof Error ? err.message : "unknown";
    const status =
      /rejected|empty file|too large|project not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
```

Raw internal exception text is returned to the client across the whole Tier-B surface:

`reviews/[id]:102` · `documents/[id]:43,119,151` · `documents:131` · `business-profile/export:289,330` · `proposals/[id]:60,225` · `proposals/[id]/versions:126` · `proposals/[id]/versions/[version]:84` · `proposals/[id]/snapshot:764,781,798` · `proposals/[id]/download:514,1208` · `projects/[id]:32,81,112`

Prisma exceptions are the concern: `PrismaClientKnownRequestError.message` embeds model names, column names, constraint names, and often the conflicting values. `PrismaClientInitializationError` can carry connection-string fragments. That hands an authenticated attacker a free schema map, and in a tender-response product the constraint values themselves may be client-confidential.

The `documents` variant compounds it by branching on a **regex over the message** to choose 4xx vs 5xx — a classification that silently breaks whenever an underlying library rewords an error.

*Fix:* route these through the existing `toErrorResponse` in `src/lib/api-controller.ts`, which already produces bilingual coded failures; log the raw error server-side with a correlation id and return only the id plus a stable code. The cleanest version of this fix is to migrate the Tier-B routes to `withTenant`, which removes the hand-rolled catch blocks entirely.

---

### 3.2 Medium

---

**#11 — [Medium] security — `src/app/api/collaboration/comments/[id]/resolve/route.ts:38-45`**

```ts
      if (!comment || comment.proposal.workspaceId !== ctx.workspace.id) {
        throw new ResourceNotFoundError();
      }
      const updated = await db.collaborationComment.update({
        where: { id },
        data: { isResolved: true },
      });
```

Workspace membership is the *only* check. Contrast the sibling route, where amend is author-only and delete is author-or-manager (`comments/[id]/route.ts:38-49`). Resolution is not cosmetic: the amend path treats a resolved comment as a conflict, so **any** workspace member can resolve a colleague's comment and thereby permanently lock its author out of editing it. There is no un-resolve handler to undo it.

Also missing: an already-resolved conflict response, and a transaction around the update (L42) and its audit entry (L47).

*Fix:* restrict to the comment author, the proposal owner, or `isWorkspaceManager(ctx.membershipRole, ctx.session.user.role)` — the helper is already imported by the sibling route. Add an idempotent/409 branch for already-resolved, add a `DELETE`/un-resolve counterpart, and wrap update + audit in `db.$transaction`.

---

**#12 — [Medium] security — `src/app/api/collaboration/presence/route.ts:78,121,94,206`**

```ts
  const session = await getServerSession(authOptions);
  ...
  if (workspaceId !== session.user.workspaceId) { ... }
  ...
        workspaceId: session.user.workspaceId,
```

Same `getServerSession` MFA-gate bypass as #6. Additionally the workspace identity comes from the **JWT claim** rather than `getTenantContext`, and claims refresh only every 60 s (`CLAIMS_REFRESH_MS`, `src/lib/auth.ts:85`) — so for up to a minute after a workspace switch or a membership revocation, presence writes still land in the old workspace.

Blast radius is limited because proposal ownership *is* re-verified against the database (L101-104, L157-160). Two further gaps: this is a heartbeat endpoint called on a timer plus `navigator.sendBeacon` with **no rate limit**, and `sectionKey` is stored with no length bound (L207, L212).

*Fix:* use `requireSession()` + `getTenantContext()`; add a rate limit; bound `sectionKey` with a Zod `z.string().max(200)`.

---

**#13 — [Medium] performance — `src/app/api/proposals/route.ts:11-26`**

```ts
    const proposals = await db.generatedProposal.findMany({
      where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) },
      orderBy: { createdAt: "desc" },
      omit: { structuredSnapshot: true, contractRenderSnapshot: true },
      include: { project: { select: { ... } } },
    });
```

No `take`. The `omit` excludes the two JSON snapshot columns but **not** `contentMd` / `contentMdAr`, so every proposal's full bilingual markdown body is read from Postgres, serialized to JSON, and shipped to the browser. Four callers hit this (`contracts-panel`, `proposals-list`, `version-history`, and the project-filtered variant), and none of them render the body — they render titles and statuses.

For a workspace with a few hundred proposals averaging a few hundred KB of markdown, this is a multi-hundred-megabyte response.

*Fix:* add an explicit `select` covering only the list-view fields, and add cursor pagination consistent with `proposals/[id]/versions/route.ts`.

---

**#14 — [Medium] performance — `src/app/api/projects/route.ts:32-47`**

```ts
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const checks = await db.complianceCheck.findMany({
          where: { projectId: p.id },
          select: { status: true },
        });
```

Classic N+1: one query per project, fanned out concurrently, purely to compute a percentage. With 200 projects that is 201 round-trips and 200 concurrent connections against the pool — on Neon, enough to exhaust it.

*Fix:* one `groupBy`:
```ts
const rows = await db.complianceCheck.groupBy({
  by: ["projectId", "status"],
  where: { project: { workspaceId: workspace.id } },
  _count: { _all: true },
});
```
then fold into a `Map<projectId, {total, compliant}>`. Also add pagination to L12.

---

**#15 — [Medium] performance — `src/app/api/stats/route.ts:36,40,72,79`**

```ts
      db.agentRun.findMany({ ... }),
      db.complianceCheck.findMany({ ... }),
      ...
      db.complianceCheck.findMany({ ... }),
      db.complianceCheck.findMany({ ... }),
```

Four full-table (workspace-scoped) reads whose results are only `.length`-ed and `.filter`-ed in JavaScript. `complianceCheck` is queried three separate times with different predicates. The dashboard is loaded on every app open by two components (`charts-panel.tsx:35`, `stat-cards.tsx:26`), so this is the hottest path in the product.

*Fix:* replace with `db.complianceCheck.groupBy({ by: ["status"], where: { project: { workspaceId } }, _count: true })` and `db.agentRun.count(...)`. One query each, constant payload.

---

**#16 — [Medium] performance — `src/app/api/analytics/proposals/route.ts:69,89`**

```ts
        const events = await db.analyticsEvent.findMany({ ... });
        ...
        const prevEvents = await db.analyticsEvent.findMany({ ... });
```

Both the selected range and the comparison range are pulled fully into memory and bucketed in JS. Analytics event tables grow without bound; a 90-day range on an active workspace is the worst case, and it is exactly the range a dashboard user selects.

*Fix:* aggregate in SQL — `groupBy` on `(eventType, date_trunc('day', createdAt))` via `$queryRaw`, or a materialized daily rollup table refreshed by the existing cron infrastructure.

---

**#17 — [Medium] correctness — `src/app/api/analytics/proposals/route.ts` (daily bucketing)**

Bucket keys are derived from UTC ISO strings while the loop cursor is advanced with local-time date arithmetic. On a non-UTC server, or across a DST boundary, the two disagree: a bucket key can be generated that no event ever maps onto (a phantom zero day) or two loop iterations can collide on one key (a doubled day). The dashboard shows a spurious gap or spike.

*Fix:* pick one timezone and use it for both — either do all arithmetic in UTC (`Date.UTC`, `setUTCDate`), or pass the workspace timezone explicitly and derive both key and cursor from it.

---

**#18 — [Medium] correctness — `src/app/api/proposals/builder/route.ts:90-99`**

```ts
      await db.generatedProposal.update({
        where: { id: proposalId },
        data: { ..., version: { increment: 1 }, updatedAt: new Date() },
      });
```

The version counter advances but **no `ProposalVersion` row is written**, and `structuredSnapshot` / `structuredSnapshotHash` / `structuredSnapshotRevision` are left untouched.

Two failures follow. The version list (`proposals/[id]/versions/route.ts`) shows a gap — `version` is N but only N-1 history rows exist, so revert and compare cannot reach the builder edit. And the stale snapshot's recorded revision no longer matches the proposal, which the review binding check (`proposal-review-service.ts:82`) and the export guard (`download/route.ts:1044-1052`) will both reject later, surfacing as an unexplained 409 far from the edit that caused it.

*Fix:* inside the transaction from #8, append a `ProposalVersion` row and null out the three `structuredSnapshot*` fields, mirroring what `proposals/[id]/route.ts` PATCH already does.

---

**#19 — [Medium] reliability — `src/app/api/proposals/builder/route.ts:70-72,121-139`**

```ts
    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid sections" }, { status: 400 });
    }
    ...
      sections.map((s: any, index: number) =>
```

`Array.isArray` is the entire validation. No length cap, and each element is `any` — `sectionKey`, `sectionType`, `titleJson`, `contentJson` all reach Prisma unvalidated. A 100,000-element array becomes 100,000 concurrent `create` calls (pool exhaustion, memory blow-up); a bad `sectionType` violates the Prisma enum and throws mid-way, triggering the data loss in #8.

*Fix:* a Zod schema — `z.array(sectionSchema).max(200)` with `sectionType: z.enum([...])`, `sectionKey: z.string().min(1).max(200)`, and size bounds on the JSON fields. Add a `Content-Length` budget check like `contracts/drafts/route.ts:146-169`.

---

**#20 — [Medium] correctness — `src/app/api/proposals/builder/route.ts:74-79,93`**

```ts
    if (!proposalId && (!metadata?.projectId || typeof metadata.projectId !== "string")) {
      return NextResponse.json({ error: "Active project is required..." }, { status: 400 });
    }
    ...
          title: metadata.title.en,
```

`metadata` is only required when `proposalId` is **absent**. On the update branch, `metadata.title.en` dereferences an object that was never verified to exist — `POST { proposalId, sections }` throws a `TypeError`, lands in the catch at L193, and is reported as a generic `500 "Internal server error"` for what is plainly a 400.

*Fix:* fold `metadata` into the Zod schema from #19 and make it required on both branches (or make each field optional and guard each read).

---

**#21 — [Medium] security — `src/app/api/contracts/workspace-templates/[id]/preview/route.ts:87-98`**

```ts
      const arabicHtml = content.content.sections
        .map(
          (section) =>
            `<section data-key="${section.key}"><h2>${section.titleAr}</h2><p>${renderNodes(section.contentAr)}</p></section>`
        )
        .join("\n");
```

Tenant-authored `titleAr`/`titleEn`, `section.key`, and every `TEXT` node from `renderNodes` (L13-21) are concatenated into HTML with no escaping. `section.key` sits inside a quoted attribute, so a `"` breaks out into attribute context.

Currently latent: the response is JSON and no component injects it with `dangerouslySetInnerHTML` (checked across `src/components` — the four call sites are `proposal-builder-preview.tsx:254`, `markdown-studio-editor-inner.tsx:179,194`, and two `<style>` tags). But the route is declared reachable in `src/lib/capability-reachability-manifest.ts:61`, the field is named `preview.ar.html`, and its evident purpose is to be rendered. A stored-XSS in a shared workspace template is a tenant-wide account-takeover primitive.

*Fix:* escape every interpolated value. `src/lib/markdown.ts` already exports an `escapeHtml` helper used by `document-layout.ts`, `generators.ts`, and `bilingual-typography.ts` — reuse it rather than adding a fifth implementation.

---

**#22 — [Medium] correctness — `src/app/api/projects/[id]/route.ts:100-107`**

```ts
    await db.tenderProject.delete({ where: { id } });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROJECT_CREATE,   // ← wrong action for a delete
      resource: "TenderProject",
      resourceId: id,
      details: { deleted: true },
    });
```

A copy-paste from the POST handler (`projects/route.ts:81`). The audit log records project **deletions** as **creations**. For a product whose value proposition includes government-tender compliance, the audit trail is a deliverable — any query for "who deleted this project" returns nothing, and the creation counts are inflated by every deletion.

*Fix:* use `AUDIT_ACTIONS.PROJECT_DELETE` (add it to the enum if absent — worth grepping `src/lib/audit.ts`, since its absence may be why the wrong constant was chosen).

---

**#23 — [Medium] security — `src/app/api/projects/[id]/route.ts:93,100`**

```ts
    const session = await requireWriter();
    ...
    await db.tenderProject.delete({ where: { id } });
```

`requireWriter` excludes exactly one role, `REVIEWER`. Every other member — including the most junior `WRITER` — can permanently delete a tender project. Per `prisma/schema.prisma`, `TenderProject` cascades to documents, proposals, agent runs, compliance checks, and requirements, so a single call destroys the entire work product for a tender, including approved proposals and their version history. There is no soft-delete, no confirmation token, and no restore path.

Compare `contracts/workspace-templates/[id]/route.ts:77-98`, where `DELETE` is a **retire** returning `lifecycle`, and `templates/marketplace/[id]/route.ts:110-112`, which requires publisher ownership.

*Fix:* gate on `isWorkspaceManager(membershipRole, session.user.role)` (already imported in several routes) and convert to a soft delete — `deletedAt` plus a filter in the list query — with hard deletion behind an admin path.

---

**#24 — [Medium] reliability — `src/app/api/documents/route.ts:69,81`**

```ts
    const form = await req.formData();
    ...
    const bytes = Buffer.from(await file.arrayBuffer());
```

`formData()` buffers the entire multipart body into memory, and `arrayBuffer()` copies it again. The 50 MB limit and the MIME allowlist live in `ingestDocumentForWorkspace`, which does not run until L101 — by which point ~100 MB of heap is already committed per concurrent upload. `maxDuration = 60` keeps a slow upload alive for the full window.

The correct pattern is present two files away: `brand/logo/route.ts:32` checks `file.size` **before** `arrayBuffer()`, and `contracts/drafts/route.ts:146-169` rejects on `Content-Length` before reading anything.

*Fix:* check `req.headers.get("content-length")` against the 50 MB budget before `formData()`, and re-check `file.size` before `arrayBuffer()`.

---

**#25 — [Medium] correctness — `src/app/api/documents/route.ts:77`**

```ts
    const docCategory = String(form.get("docCategory") || "OTHER") as DocCategory;
```

A bare `as` cast with no runtime validation. `String(...)` guarantees the truthiness check at L83 always passes, so the value flows to Prisma unvalidated; an unrecognized category raises a Prisma enum error, which the catch at L129 turns into a 500 (the regex at L133 does not match it) instead of a 400.

*Fix:* `const parsed = z.nativeEnum(DocCategory).safeParse(form.get("docCategory") ?? "OTHER")` and return a 400 with the allowed values on failure.

---

**#26 — [Medium] reliability — `src/app/api/documents/route.ts:132-133`**

```ts
    const status =
      /rejected|empty file|too large|project not found/i.test(message) ? 400 : 500;
```

HTTP semantics decided by pattern-matching English prose from an exception. Any reword upstream — in `ingestDocumentForWorkspace`, in Prisma, in a dependency — silently reclassifies a client error as a server error (or the reverse), and it will not be caught by tests that assert on the body rather than the status.

*Fix:* have the ingestion layer throw typed errors (it already has `QuotaExceededError` as a model, handled correctly at L52-57) and branch on `instanceof` / an error `code`.

---

**#27 — [Medium] correctness — `library/route.ts:75`, `methodologies/route.ts:71`, `certificates/route.ts:80`**

```ts
    const parsed = libraryItemSchema.partial().safeParse(body);      // library:75
    const parsed = methodologySchema.partial().safeParse(body);      // methodologies:71
    const parsed = certificateSchema.partial().safeParse(body);      // certificates:80
```

None of the three base schemas is `.strict()`, so `.partial()` accepts and discards unknown keys. Each handler then reaches **around** the validated object to read raw request fields — `body.approved` (`certificates:104,114,142`), `body.provenance` (`certificates:127`), `body.reason` (`certificates:152`), and the equivalents in the other two.

So the knowledge review state machine — approve, revoke, invalidate — is driven entirely by **unvalidated** input, while the innocuous content fields get full Zod treatment. A typo'd key is silently ignored rather than rejected, which for `approved` means an intended approval quietly does nothing.

*Fix:* add `.strict()` to the three base schemas in `src/lib/validation.ts` and extend each with the review fields (`approved: z.boolean().optional()`, `provenance`, `reason`) so the handlers read only `parsed.data`.

---

**#28 — [Medium] reliability — `src/app/api/templates/marketplace/[id]/use/route.ts:83-102,145-160`**

```ts
  for (const section of args.sections) {
    if (takenKeys.has(section.sectionKey)) continue;
    nextOrder += 1;
    await db.proposalBuilderSection.create({ data: { ... } });
```

Sequential creates in the append path, `Promise.all` of creates in the draft path (L145-160) — neither transactional. A failure part-way leaves a half-applied template: some sections present, some missing, `sortOrder` gaps, and in the draft path a `GeneratedProposal` row with no sections at all. The `MARKETPLACE_TEMPLATE_USE` audit entry (L104-111) is `.catch(() => undefined)`-swallowed, so the partial application is not even recorded.

*Fix:* wrap each path in `db.$transaction` and use `createMany`.

---

**#29 — [Medium] performance — `src/app/api/collaboration/comments/route.ts:56-68`**

```ts
    const comments = await db.collaborationComment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
        replies: { orderBy: { createdAt: "asc" }, include: { creator: { ... } } },
      },
    });
```

No `take` on the outer query and no `take` on the nested `replies`. Every comment on a proposal, with every reply, with creator records joined at both levels, in one response. A long-running tender with an active review thread produces an unbounded payload — and combined with #5, it is the vehicle that renders injected cross-tenant replies.

*Fix:* cursor-paginate the outer query and cap `replies` with `take: 3` plus a `_count`, exposing a "load more replies" endpoint. `documents/[id]/versions/route.ts:96` is the in-repo pattern.

---

**#30 — [Medium] reliability — `src/app/api/documents/[id]/versions/[version]/route.ts:67-83`**

```ts
  const includeBytes = req.nextUrl.searchParams.get("includeBytes") === "1";
  if (includeBytes) {
      const bytes = await readWorkspaceStoredFile( ... );
      bytesBase64 = Buffer.from(bytes).toString("base64");
```

`readWorkspaceStoredFile` is called with no `maxBytes`, so a 50 MB document (the ingestion ceiling) is read whole and then base64-encoded — roughly 117 MB of heap between the buffer and the string, plus the JSON serialization. There is no rate limit on the endpoint, so a loop over `?includeBytes=1` is a cheap memory-exhaustion primitive for any authenticated member.

*Fix:* pass a `maxBytes` cap and return `413` beyond it; better, stream the bytes as a binary response with `Content-Disposition` instead of embedding base64 in JSON. Add a rate limit mirroring `proposals/[id]/download/route.ts:177-181`.

---

### 3.3 Low

**#31 — [Low] performance — `src/app/api/library/route.ts:21`** — `contentLibraryItem.findMany` selects the full `bodyMd` for every item; the list UI (`requirements-matrix.tsx:93`) shows titles only. *Fix:* explicit `select` without `bodyMd`, or a truncated `summary`.

**#32 — [Low] performance — `src/app/api/compliance/route.ts:26,37-46`** — unbounded `findMany` plus six sequential in-memory `filter` passes over the same array to build the summary. *Fix:* `groupBy` on `status`, or a single reduce.

**#33 — [Low] performance — `src/app/api/projects/[id]/requirements/route.ts:19,23-28`** — unbounded `findMany` plus three `filter` passes. Bounded by requirements-per-project in practice. *Fix:* single reduce; `groupBy` if it grows.

**#34 — [Low] performance — `src/app/api/reviews/route.ts:9`** — no `take` on the pending-review queue. Naturally bounded (one user's pending items) but unbounded by construction.

**#35 — [Low] security — `src/app/api/business-profile/export/route.ts:160,169,244`**

```ts
      "Content-Disposition": `inline; filename="${filename}"`,
      ...
  const slug = workspace.slug || "company";
```
The workspace slug is interpolated into the header without sanitization. A slug containing `"` breaks out of the quoted filename. Exploitability depends on slug validation at workspace creation (outside this scope), and Node's header validation rejects CR/LF, so this is header *confusion* rather than injection. *Fix:* `slug.replace(/[^A-Za-z0-9._-]/g, "-")` before use, and add `filename*=UTF-8''...` for the non-ASCII case.

**#36 — [Low] security — `src/app/api/contracts/templates/[key]/preview/route.ts:232,252-254`** — the route param `key` is interpolated into the `Content-Disposition` filename. Reaching it requires surviving `compileContractTemplateDocument(key, ...)`, which returns `BLOCKED` (→ 422 at L205-216) for unknown keys, so it is likely unreachable. *Fix:* sanitize anyway; the guard is incidental, not intentional.

**#37 — [Low] reliability — `src/app/api/brand/logo/route.ts:22,58-68`** — three small gaps in an otherwise exemplary handler: `formData()` (L22) buffers before the 8 MiB check at L32; the previous logo file is never unlinked when `logoUrl` is overwritten (L65-68), so storage grows without bound; and there is no rate limit. *Fix:* pre-check `Content-Length`; delete the prior `storagePath` after a successful update; add a rate limit.

**#38 — [Low] maintainability — `src/app/api/contracts/drafts/route.ts:247`** — `return responseError("Forbidden", "FORBIDDEN", 403)` when `getWriter()` yields null. That null covers both "not authenticated" and "REVIEWER role", so an unauthenticated caller gets 403 where 401 is correct, and a client cannot distinguish "sign in" from "you lack permission". Same at `contracts/drafts/[id]/route.ts:137,212`. *Fix:* have the dependency distinguish the two cases.

**#39 — [Low] performance — `src/app/api/documents/[id]/route.ts` (`loadOwnedDoc`)** — the shared helper eagerly includes **all** versions, and is used by `DELETE` (L55) and `PATCH` (L131), which never read them. *Fix:* add a `{ withVersions?: boolean }` parameter, defaulting to false.

**#40 — [Low] correctness — `src/app/api/clauses/select/route.ts:16`** — `body.templateFamily?.toString()` converts `{}` to `"[object Object]"` and `[1,2]` to `"1,2"`, both of which then pass downstream string checks. Same coercion pattern in `clauses/route.ts`. *Fix:* Zod-validate the body; `createCustomClause` is already rigorous, so this is only about the route boundary.

**#41 — [Low] reliability — `src/app/api/contracts/drafts/[id]/route.ts:130,205`** — `PATCH` and `DELETE` have no rate-limit admission, while the sibling `POST` does (`contracts/drafts/route.ts:264-276`). Update-heavy abuse bypasses the budget entirely. *Fix:* call `admitContractDraftWrite` on both.

**#42 — [Low] correctness — `src/app/api/collaboration/presence/route.ts:207,212`** — `sectionKey` is persisted with no length bound from a `sendBeacon`-writable endpoint. *Fix:* `z.string().max(200).nullable()`.

**#43 — [Low] reliability — `src/app/api/proposals/[id]/versions/compare/route.ts` and `src/app/api/proposals/[id]/versions/[version]/revert/route.ts`** — neither file contains a single `try`/`catch`. Any throw (including `EmailVerificationRequiredError` from `requireSession`, and every Prisma error) escapes to the Next.js default error response instead of the bilingual `ApiFailure` contract every other route honors. *Fix:* convert both to `withTenant`, which supplies the mapping for free.

---

### 3.4 Needs verification

These are consistent with the code read but depend on runtime or out-of-scope behavior not confirmed in this pass.

1. **Knowledge decision authorization.** `knowledge/pending-approval/route.ts:92-98` uses `withTenant("session")` and forwards `membershipRole` to `createPrismaKnowledgeDecisionService().decide()`. Whether a non-manager member is rejected there was not verified — `src/lib/knowledge-decision-prisma.ts` is another agent's scope. If it is not enforced, this is a High authorization gap, since the sibling routes (`certificates:115,143`) all require `isWorkspaceManager` for the same state transition.
2. **Workspace slug validation.** #35's severity depends on the character set enforced on `Workspace.slug` at creation, which lives outside this scope.
3. **`documents` MIME allowlist strength.** `validateUploadAllowlist` in `src/lib/agents/platform/ingest-document.ts` was read and does enforce an allowlist, but it keys off the client-supplied `file.type`. Whether magic-byte verification happens later in the extraction pipeline was not traced. `brand/logo` does verify content; documents may not.
4. **Marketplace entry id exposure.** #2/#3/#4 require knowing a cuid. Whether entry ids leak into analytics events, audit `details`, or shareable URLs determines real-world exploitability. The primary keys are cuids, so brute force is not viable.
5. **`business-profile/export` and `proposals/[id]/rewrite` timeouts.** Neither declares `maxDuration`. The effective ceiling depends on deployment configuration (`vercel.json` / `vercel.ts`), not read here.
6. **`proposal-builder-preview.tsx:254`** injects `html` via `dangerouslySetInnerHTML`. Whether that string originates from builder section content (which #19 shows is unvalidated) was not traced — if it does, #21's XSS becomes actively exploitable through the builder rather than latent.

---

## Appendix — coverage

All 64 in-scope files were read in full. LOC per file as reported by `wc -l`; total 10,848.

| Area | Files | LOC | Defects |
|---|---|---|---|
| proposals | 14 | 4,090 | 12 |
| contracts | 12 | 1,543 | 3 |
| documents | 6 | 930 | 6 |
| templates (marketplace) | 4 | 731 | 4 |
| collaboration | 4 | 595 | 4 |
| library / methodologies / certificates / knowledge | 4 | 876 | 3 |
| projects | 3 | 273 | 5 |
| brand / business-profile | 4 | 891 | 3 |
| analytics / stats | 3 | 545 | 3 |
| clauses | 3 | 145 | 1 |
| reviews | 2 | 136 | 1 |
| compliance / sectors / partnerships / bid-history | 4 | 204 | 1 |
