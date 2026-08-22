# ArabClue — `src/lib` Domain & i18n Audit

**Repo:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Scope:** `src/lib/**` domain + i18n modules, `src/lib/marketing/**`, `src/lib/seeds/**`, `src/components/brand/**`, `src/components/patterns/**`, cross-checked against `prisma/schema.prisma` (1,722 lines).
**Method:** full reads with the Read tool; `rg`/glob for cross-references. No repository file was modified. No build/dev/DB command was run.
**Total audited:** ~16,300 LOC across 55 files.

---

## 1. File-by-file map

Importer counts are non-test importers found by `rg "from \"(@/lib/|\./|\.\./)<module>\""` across `src/`.

### 1.1 i18n & presentation

#### `src/lib/i18n.ts` — 2,560 LOC — **64 importers** (largest fan-in in the codebase)
**Purpose.** The entire hand-rolled bilingual dictionary plus the lookup, interpolation, fallback, and missing-key-reporting machinery. There is no `next-intl` runtime here despite the dependency being listed in the stack.

**Key exports.**
- `localizationRegistry` / `export const t: Dict` (line 1858) — flat `Record<string, { ar: string; en: string }>` of ~1,800 keys covering nav, statuses, error codes, email bodies, analytics labels, clause/marketplace/billing surfaces.
- `type TranslationKey = keyof typeof localizationRegistry` (1860); `TranslationPlaceholder<Key>` (1868) — a template-literal type that extracts `{{name}}` placeholders from *both* locale strings, so `translate()` is placeholder-typed.
- `DYNAMIC_TRANSLATION_KEY_MANIFEST` (1884) + `getDynamicTranslationKey(family, member)` (2152) — finite lookup families (`status`, `documentCategory`, …) so runtime-built keys stay type-checked.
- `COMPLETION_TRANSLATION_KEY_MANIFEST` (2162) — per-surface key inventories used by contract tests.
- `COMPLETION_ERROR_CONTRACTS` (2290) + `getCompletionErrorContract(code, values)` (2527) — maps a stable error code to `{ actionKey, messageKey }` and renders `{ ok:false, code, message: { ar, en } }`.
- `resolveTranslation(key, locale, dictionary = t): ResolvedTranslation` (2496) — `active locale → other locale → key identifier`; never throws, never returns `""`.
- `translate<Key>(key, locale, values)` (2519), `tr(key, locale, values)` (2554) — the legacy untyped path, still the dominant call form.
- `interpolate` (2417, module-private) — `{{name}}` replacement; unknown placeholders are left verbatim.
- `setMissingTranslationReporter` / `getMissingTranslationRecords` / `clearMissingTranslationRecords` (2457–2469) — bounded 100-entry ring (2430) plus a `console.warn` default sink (2445).
- `isTranslationKey` (2409), `isCompletionErrorCode` (2413).

**Contracts.** In: arbitrary string key + `Locale` + optional interpolation values. Out: a non-empty string, always. Missing keys are *recorded*, never thrown.
**Handled:** missing key, missing single-locale value, whitespace-only value (`hasRenderableText`, 2479), unknown placeholder, log-growth bound, dictionary injection for tests.
**Not handled:** Arabic pluralization (single form per key), bidi isolation when concatenating (`${action}: ${reason}`, 2544), any guarantee that an `ar` value is actually Arabic rather than copied English, and — most importantly — the ~1,189 inline `locale === "ar" ? … : …` ternaries scattered across 88 component files that bypass the dictionary entirely.

#### `src/lib/marketing-copy.ts` — 179 LOC — **0 non-test importers** (dead)
`marketingDict` (nav/hero/trust/problem/features/how/pricing/faq/final CTA), `pricingPlans` (3 plans, SAR 299/999/2999 monthly), `pricingComparison` (13 rows). Bilingual object literals; not routed through `i18n.ts`. Contains the unqualified `"82% less time to first draft"` claim (line 25) and an untranslated Arabic row (line 171).

#### `src/lib/seo.ts` — 113 LOC — **14 importers** (every marketing/auth layout + `app/layout.tsx`)
`SITE` constant, `siteUrl()` (34, env-driven with `https://arabclue.com` fallback), `createPageMetadata(input): Metadata` (58), `rootMetadata` (110). `PageMetaInput` declares `titleAr`/`descriptionAr` (44–47) but the body never reads them.

#### `src/lib/animation.ts` — 123 LOC — **7 importers**
`SCROLL_VIEWPORT`, `SCROLL_VIEWPORT_COMPACT`, `FADE_UP`, `SLIDE_IN`, `STAGGER_PARENT`, `rtlX(isRtl, distance)` (82 — direction-aware slide offset), `useIsMobile(breakpoint)` (98), `useFadeTransition(delay)` (116). Genuinely RTL-aware and the percentage-margin rationale in the header comment is sound. Mixes a React hook into a constants module (import at line 90, below other exports).

#### `src/lib/design-tokens.ts` — 599 LOC — **5 importers**
Typed token system (`ColorScale`, `SemanticColors`, `FontFamilies`, spacing/effects) for document generation, with brand-override support routed through `normalizeBrandForDocument`/`normalizeDocumentBrandFont` from `brand-policy.ts`. Clean layering: tokens depend on the browser-safe policy module, not the Node one.

#### `src/lib/constants.ts` — 474 LOC — **21 importers**
`AGENTS` (4, six-agent pipeline with icon/color/order), `COMPLIANCE_FRAMEWORKS` (19, hardcoded NCA ECC/CCC + PDPL + EA controls with `level: "C1"` etc.), `SLA_RULES` (250), `VISION_2030_PILLARS` (257), `TENDER_TYPES` (302, six categories each with `slaMaxPenalty`, `slaPerWeek`, `typicalBudget`, `complianceScope`, `evaluationSplit`), `getTenderType(id)` (377, falls back to `TENDER_TYPES[0]`), re-export of `AI_PROVIDER_PRESETS`, `ENV_CATALOG` (391).
**This is the single largest source of invented domain numbers in the codebase** (see defects 7 and 27).

#### `src/lib/types.ts` — 230 LOC — **67 importers**
Shared domain unions/interfaces: `Role`, `Locale`, `DocCategory`, `ProjectStatus`, `AgentRunStatus`, `AgentId`, `IngestionEntities`, `ComplianceMatrixRow`, `BoqLineItem`, `FinancialFormsData`, `FinancialExtract`, `OnboardingStepKey`, `RequirementStatus`, `LinkedResourceType`, `TenderRequirementExtract`, `TechnicalArchitectOutput`, `AgentState`, `ComplianceFramework`, `TenderProjectSummary`. Pure types; no runtime.

#### `src/lib/utils.ts` — 13 LOC — **119 importers**
`cn(...inputs)` (4, `twMerge(clsx(...))`) and `formatPercent(value, digits = 0)` (9). `formatPercent` clamps to `[0, 100]` and maps `null`/`undefined`/`NaN` → `"0"`.

### 1.2 State & routing

#### `src/lib/store.ts` — 336 LOC — **60 importers**
Two Zustand stores plus the locale persistence helpers.
- `LOCALE_STORAGE_KEY` / `LOCALE_COOKIE_NAME` (22, 25) — both `"arabclue-locale"`.
- `persistLocaleCookie` (32), `syncDocumentAttributes` (38 — sets `documentElement.lang`/`dir`), `persistLocalePreference` (48 — merges into the zustand persist blob rather than overwriting it, with an explicit comment about why), `scheduleLocalePersistence` (85 — rAF + `setTimeout(0)` to keep the RTL reflow out of the interaction frame, an INP-conscious detail), `readPersistedLocale` (96 — tolerates bare-string, JSON-blob, and legacy `arabclue-marketing-locale` shapes).
- `useLocale` (114) — `{ locale, dir, setLocale, toggle }`, Arabic default, rehydrate hook re-asserts the cookie.
- `PersistedUIPreferences` (197) = `{ activeProjectId, tenderType, sidebarCollapsed }`; `UI_PREFERENCES_VERSION = 2` (204); `sanitizePersistedUI` (217, total function — validates project-id shape, drops route fields); `UI_PERSIST_OPTIONS` (283 — `partialize`/`migrate`/`merge` all funnel through the sanitizer); `useUI` (302) with `applyRoute` (326).
- Re-exports the whole `dashboard-routes` surface (151–186) for client callers.

**Design note.** The comment at 188–196 states the invariant precisely: the URL is the sole authority for `view`/`routeNotice`/`adminMode`; `activeProjectId` is a session preference consulted only when the path carries none. `partialize` + `merge` + `migrate` all enforce it, so a stale build's persisted `view` cannot resurrect.

#### `src/lib/dashboard-routes.ts` — 529 LOC — **7 importers**
Canonical route table. `DashboardView` union, `APP_BASE_PATH`, `VIEW_PATHS`, `PATH_TO_VIEW`, `ADMIN_VIEWS`, `PROJECT_SCOPED_VIEWS`, `GLOBAL_VIEWS`, `ROUTE_NOTICE_CODES` (`ROUTE_VIEW_FORBIDDEN` / `ROUTE_PROJECT_REQUIRED` / `ROUTE_UNKNOWN` …), `getPathForView(view, projectId?)`, `resolveAppRoute(...)`, `parseViewFromPath`, `parseProjectIdFromPath`, `encodeProjectId`/`decodeProjectId`, `isValidProjectIdShape`, `canonicalFallbackFor`, `appPathSegments`, `segmentsForView`. Strict matching with explicit fallbacks (`UNKNOWN_VIEW_FALLBACK`, `FORBIDDEN_VIEW_FALLBACK`, `PROJECT_REQUIRED_FALLBACK`). Server-safe (no `db`, no `next-auth`).

#### `src/lib/dashboard-navigate.ts` — 46 LOC — **1 importer** (the sidebar)
`resolveDashboardNavigation({ target, isAdmin, activeProjectId }): { path, view, notice }` (23). Pure; mirrors the server resolver's admin/project rules so a click and a direct URL land identically.

#### `src/lib/app-route-resolver.ts` — 166 LOC — **1 importer** (`app/(app)/app/layout.tsx`)
Server-side gate: session → email-verification → `resolveAppRoute` → admin permission → `projectExistsInTenant` DB check → redirect or render. This is where the route table meets authorization.

### 1.3 Procurement domain

#### `src/lib/procurement-rules.ts` — 446 LOC — **14 importers**
The most carefully engineered domain module in the repo. Header (4–10) states five hard rules: never encode broad legal assumptions as universal tender facts; extract actual clauses; no blanket local-content percentages; no universal PDPL residency mandate; never invent NORA IDs.
- `PLATFORM_DATA_POSTURE` (48) — explicitly frames KSA hosting as deployment posture, not a legal conclusion.
- `REGULATORY_POLICY_REGISTRY` (60) — five versioned entries (GTPL, PDPL, NCA ECC-1:2018, NCA CCC-1:2020, local content) each carrying `sourceReference`, `applicabilityCriteria`, `reviewDate`, `humanApprovalStatus`, `superseded`.
- `getPolicyById` (168), `getActivePolicies(controlIdOrFramework?)` (172).
- `PROCUREMENT_LAW` (184), `STATUTORY_PENALTY_CANDIDATES` (196, `humanApprovalStatus: "PENDING_REVIEW"`), deprecated `SLA_PENALTY_RULES` (207) whose `statutoryCandidate()` returns `weeklyCandidate: null` and tags results `REGULATORY_CANDIDATE`.
- `buildTenderPenaltyExtract` (258) tags `EXPLICIT_TENDER`.
- `PDPL_RULES` (274, `universalResidencyMandate: false`), `NCA_FRAMEWORKS` (284).
- `NORA_PRINCIPLES: [] ` (295) — **empty by design** until an approved official source is registered; `noraPrinciplesFromTender(text)` (305) only returns IDs literally present in tender text.
- `extractLocalContentPreference(text)` (334) returns `preferencePercent: null` with an explicit "do not assume a blanket preference" note when nothing is found.
- `computeQuickLiquidityRatio(input, threshold = null)` (381) — returns `passes: null` when no threshold was supplied, i.e. it refuses to invent a pass/fail.
- `SAUDIZATION_DEFAULT_MIN = 35` (440) — used only inside a narrative string that itself says it is not a tender fact (`agents/financial.ts:108`).
- `LEGAL_DISCLAIMER` / `LEGAL_DISCLAIMER_AR` (442, 445).

#### `src/lib/qualification.ts` — 196 LOC — **3 importers**
`CERTIFICATE_TYPES` (6, incl. `CR`, `ZATCA_VAT`, `GOSI`, `NCA`, `LCGPA`), `QUALIFICATION_DOSSIER` (38, six bilingual rows with `requiredForStrongBid`), `assessQualificationDossier({ workspace, certificates, now })` (125) → `{ gaps, strongBidReady, presentKeys }`. Private helpers `isExpired` (105) and `certMatches` (112).
**Not handled:** any CR/VAT format validation; validity checking when a workspace field is present (see defect 8); unparseable expiry dates fail open (defect 24).

#### `src/lib/requirements.ts` — 293 LOC — **0 static importers** (dynamically imported twice by `agents/orchestrator.ts:336, 808`)
`persistTenderRequirements(projectId, workspaceId, entities, fullText)` (52) and `applyCoveragePlanToRequirements(projectId, coverage)` (190); private `extractRequirementsFromText` (255). Tokenizes requirement text and lexically scores it against certificates / past projects / library items / methodologies to seed `tenderRequirement` link rows.

#### `src/lib/saudi-law-research.ts` — 211 LOC — **4 importers**
`registrySources()`, `researchSaudiLawForContract(...)`, types `LawSourceCitation` / `LawResearchFinding`. Projects `REGULATORY_POLICY_REGISTRY` (carrying `approvalStatus` through, line 73) plus tender extracts into a draft-grade brief. Every finding is marked as requiring counsel review.

#### `src/lib/nora-ids.ts` — 65 LOC — **1 importer**
`extractNoraIds(text)` (11 — fresh `RegExp` per call, so the `g`-flag `lastIndex` statefulness bug is avoided), `catalogNoraIds()` (27), `allowedNoraIdsFromSources({ tenderIds, complianceTexts, includeCatalog })` (49). Regex: `/\b((?:TP|SP|BP|IP)\d+)\b/gi` (8).

**Compliance modules:** a glob for `src/lib/*compliance*` returns **zero** files. Compliance rules live in `constants.ts` (`COMPLIANCE_FRAMEWORKS`), `procurement-rules.ts`, and `src/lib/agents/compliance.ts`. There is no standalone compliance-scoring library.

### 1.4 Knowledge / RAG

#### `src/lib/rag.ts` — 123 LOC — **4 importers**
`RagDocument`, `RagHit`; private `tokenize` (22), `tf` (30), `cosineSparse` (38); exported `cosineDense` (51), `retrieveLexical(query, docs, topK=5)` (66), `retrieveByEmbedding(queryEmbedding, docs, topK=5)` (84), `retrieveRelevant(query, docs, opts)` (100), `formatRagContext(hits)` (113). Pure and DB-free.

#### `src/lib/document-chunks.ts` — 174 LOC — **2 importers** *(shared with another agent; interface noted only)*
`chunkText(text, size=900, overlap=120)` (14), `indexDocumentChunks({ documentId, workspaceId, projectId, text, title })` (36), `loadProjectTenderCorpus(projectId)` (65), `searchWorkspaceChunks({ workspaceId, query, projectId?, limit? })` (98) → `{ hits, totalIndexed, mode: "embedding" | "lexical" }`. Constants `CHUNK_SIZE=900`, `CHUNK_OVERLAP=120`, `MAX_CHUNKS_PER_DOC=40` (9–11).

#### `src/lib/knowledge-approval.ts` — 394 LOC — **9 importers**
`knowledgeProvenanceSchema`, `knowledgeApprovalRequestSchema`, `knowledgeRevocationRequestSchema`; canonicalizers `certificateKnowledgeContent` / `methodologyKnowledgeContent` / `libraryKnowledgeContent` / `pastProjectKnowledgeContent`; `hashKnowledgeContent`; `resolveKnowledgeApprovalEvidence`; `approveKnowledgeContent` / `revokeKnowledgeContent` / `markKnowledgeContentUnreviewed`. The `evidenceRef` format is pinned to `uploaded-document:{id}:v{n}:sha256:{64hex}`.

#### `src/lib/knowledge-decision.ts` — 368 LOC — **1 importer**
Pure decision service: `validateKnowledgeDecisionPayload`, `isKnowledgeApproverRole`, `KnowledgeDecisionRepository` port, and the atomic-outcome → HTTP mapping (`DECIDED`, `ALREADY_DECIDED`, `NOT_FOUND`, `EVIDENCE_VERSION_MISSING`).

#### `src/lib/knowledge-decision-prisma.ts` — 235 LOC — **1 importer**
`recordDecision` inside a `$transaction`, dispatching per knowledge record type, updating status + evidence links + legacy review state together.

#### `src/lib/knowledge-eligibility.ts` — 137 LOC — **4 importers**
`isKnowledgeReviewApproved(item, expectedContentHash?)` (27) — the strictest gate in the codebase: approval flag, review status, revocation, evidence ref/document/version/checksum (`/^[a-f0-9]{64}$/i`), parsed-and-schema-validated provenance, reviewer id, approval timestamp, content hash, *and* a reconstruction check that `evidenceRef` exactly equals the canonical string (59–66). Then `isCertificateValid` (79), `isPastProjectEligible` (99), `isLibraryItemEligible` (105), `isMethodologyEligible` (115), `isStaffEligible` (121), `filterValidCertificates` (131).

#### `src/lib/knowledge-queue.ts` — 610 LOC — **3 importers**
`KNOWLEDGE_QUEUE_RECORD_TYPES`, `KnowledgeDecisionState`, `KNOWLEDGE_LEGACY_REVIEW_UNREVIEWED`, page-size resolution, row projection, merged keyset ordering, cursor encode/decode, position comparison. Deterministic total ordering across heterogeneous tables.

#### `src/lib/knowledge-queue-prisma.ts` — 223 LOC — **1 importer**
Translates the queue rules into bounded, index-ordered reads per record type with workspace + pending-state + keyset predicates.

### 1.5 Clauses & collaboration

#### `src/lib/clause-library.ts` — 862 LOC — **4 importers**
`CLAUSE_CATEGORIES`, `CLAUSE_CANONICAL_SCHEMA` + `CLAUSE_CANONICAL_SCHEMA_VERSION`, `CLAUSE_LIFECYCLE`, `CLAUSE_LEGAL_REVIEW_STATUS`; `isClauseUnsafe`, `extractPlainTextFromBlocks`, `computeClauseCanonicalHash`, `describeCatalogClause`, `seedStandardClauses` (drift detection + concurrency), `listClauses` (filter + cursor pagination), `getClauseByIdentifier`, `selectClausesForTemplate`, `createCustomClause`. Throws typed `ApiError`s (`CLAUSE_NOT_FOUND`, `CLAUSE_TRANSLATION_MISSING`, `UNSAFE_CLAUSE_TEXT`, `CLAUSE_FIELD_INVALID`) that all have dictionary entries.

#### `src/lib/clause-library-prisma.ts` — 195 LOC — **2 importers**
`ClauseCatalogRepository` implementation, scoped to `workspaceId: null` so catalog repair never touches tenant clauses; uses unique constraints + `updateMany` compare-and-set for concurrent seeding.

#### `src/lib/comment-lifecycle.ts` — 436 LOC — **2 importers**
`WITHDRAWN_COMMENT_CONTENT`, `normalizeCommentMentions`, `commentDeleteDisposition`, `commentDeleteAuditRecord`, `CommentRepository` port, and the `AmendCommentWrite`/`DeleteCommentWrite` + outcome unions.

#### `src/lib/comment-lifecycle-prisma.ts` — 291 LOC — **1 importer**
`createPrismaCommentRepository(client = db)` (152). Two structural properties, both real:
- tenant scope is a relation predicate `proposal: { workspaceId }` on **every** read and write (119, 173, 221, 245);
- mutation + audit share one `$transaction`, so a failed audit rolls the mutation back (166, 202).
Concurrency uses write predicates rather than locks — `replies: { none: {} }` (224) makes the leaf-delete branch atomic, so a reply committed between read and write downgrades the hard delete to a withdrawal instead of orphaning descendants. `withMappedFailures` (283) converts missing relations to the typed 503.

#### `src/lib/collaboration-presence.ts` — 50 LOC — **2 importers**
`PRESENCE_STALE_THRESHOLD_MS = 60_000`, `PRESENCE_VIEWER_CAP = 50`, `pruneStalePresenceRows`, `capPresenceViewers` (returns `{ viewers, total }` so the UI can show "+N more" honestly), `stablePresenceSnapshotHash`.

### 1.6 Analytics & stats

#### `src/lib/analytics-collector.ts` — 1,212 LOC — **15 importers**
Closed event vocabulary (`ANALYTICS_EVENT_TYPES`), per-event Zod metadata schemas (`proposalMetadataSchema`, `agentRunMetadataSchema`, …), `resolveAnalyticsProvenance`, `deriveAnalyticsEventKey` (idempotency key), `findForbiddenAnalyticsField(metadata)` (374 — rejects monetary and document-body fields by exact name and substring), `ANALYTICS_BUILD_REJECTIONS` (568), and the `AnalyticsEventWriter` port for a single bounded post-commit append attempt. Payload minimization is enforced at build time (656–657), not merely documented.

#### `src/lib/analytics-retention.ts` — 173 LOC — **1 importer** (`app/api/cron/analytics-retention/route.ts`)
`ANALYTICS_RETENTION_DAYS = 90` (25), `ANALYTICS_RETENTION_BATCH_SIZE = 5_000` (28), `AnalyticsRetentionSummary`/`Bucket`, `AnalyticsRetentionClient` port (66), `createPrismaRetentionClient(client)` (85), `archiveOldAnalyticsEvents(options)` (143).

#### `src/lib/stats-trends.ts` — 11 LOC — **2 importers**
`trendPct(current, previous)` (1), `resolveTrend(value)` (9).

#### `src/lib/tender-insights.ts` — 129 LOC — **2 importers**
`ACTIVE_TENDER_STATUSES` (9), `isActiveTenderStatus` (46), `aggregateTenderInsights(projects)` (53), `formatBudgetCompact(amount, locale)` (113).

### 1.7 Business / brand / onboarding

#### `src/lib/business-profile.ts` — 728 LOC — **3 importers**
`BusinessProfileSnapshot` type (50), `BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY` (136), `compileBilingualBusinessProfile` (147), `renderBilingualBusinessProfileHTML` (167), `generateBilingualBusinessProfilePDF` (183), `resolveBusinessProfilePdfDocument` (200 — fails closed if a public image cannot be inlined, 237–239), eligibility wrappers (267–300), `loadBusinessProfile(workspaceId)` (302), `buildBusinessProfileHTML(profile, opts)` (462), `generateBusinessProfilePDF` (702).
The Prisma include block (309–364) repeats the full approval predicate (`approved`, `reviewStatus`, `revokedAt: null`, `evidenceRef`, `provenanceJson`, `reviewedById`, `approvedAt`, `contentHash`) and then re-filters in memory through `knowledge-eligibility` — defence in depth, correctly done. Honest labelling in the HTML: staff and partnerships are captioned "user-entered · not evidence reviewed" (508, 510, 527, 529).

#### `src/lib/brand-logo.ts` — 230 LOC — **6 importers** (Node-only)
`extractLogoStoragePath` (55), `validateAndNormalizeLogoImage(bytes, storagePath)` (116 — extension ∧ magic-bytes ∧ decoded-format agreement, page count, dimension and pixel caps, then a full sharp re-encode that strips metadata and proves decodability), `inlineBrandLogoForPdf(brand, workspaceId)` (186 — fails closed to `logoUrl: null` and deliberately does not leak filesystem/tenant detail into the warning, 222–228). Re-exports the browser-safe policy surface.

#### `src/lib/brand-policy.ts` — 176 LOC — **8 importers** (browser-safe, zero Node imports)
`DOCUMENT_BRAND_FONT_FAMILIES` allow-list, `DEFAULT_DOCUMENT_BRAND_COLORS`, `normalizeDocumentBrandColor` (46), `normalizeDocumentBrandFont` (60), `normalizeBrandForDocument` (70), `extractWorkspaceLogoStoragePath` (120), `safeBrandLogoUrlForDocument` (157). The URL parser rejects protocol-relative, backslash, NUL, non-`/api/files` path, hash, duplicate/extra query keys, and any path not under `uploads/{workspaceId}/…` with no `.`/`..` segments.

#### `src/lib/onboarding.ts` — 114 LOC — **16 importers**
`computeOnboardingSteps(workspaceId)` (7 — 12 parallel counts, then upserts `onboardingProgress`), `assertOnboardingReady(workspaceId)` (105, throws `ONBOARDING_INCOMPLETE` 403). Re-exports `ONBOARDING_STEPS`.

#### `src/lib/onboarding-steps.ts` — 23 LOC — **2 importers**
Client-safe metadata for 10 steps; five are `required: true` (brand, legal, trackRecord, approvalChain, restrictions).

### 1.8 Marketplace

#### `src/lib/template-marketplace-catalog.ts` — 263 LOC — **4 importers**
`SYSTEM_TEMPLATE_CATALOG` (12 — six frozen templates), `filterSystemTemplateCatalog(filters)` (215 — **0 non-test importers, dead**), `isTemplateCategory(value)` (254).

#### `src/lib/marketplace-catalog-seed.ts` — 101 LOC — **1 importer** (`GET /api/templates/marketplace`)
`resolveSystemActorId` (19, private — env `BOOTSTRAP_ADMIN_EMAIL` then first active admin), `ensureSystemMarketplaceCatalogSeeded(client = db)` (41). Loops the six catalog items with a `findFirst` + `update`/`create` each, outside any transaction; skips with `reason: "NO_SYSTEM_ACTOR"` when no admin exists.

#### `src/lib/marketplace-template-resolve.ts` — 61 LOC — **1 importer**
`findSystemMarketplaceTemplate(idOrKey)` (18), `mapDbMarketplaceRow(row)` (28 — returns `null` unless both `name.ar` and `name.en` are present), `resolveMarketplaceTemplateFromCatalog(idOrKey)` (48).

#### `src/lib/marketplace-usage.ts` — 85 LOC — **1 importer**
`recordMarketplaceApplication(input)` (43) and `countMarketplaceApplications(entryId)` (81). The idempotency invariant is carried by the `@@unique([entryId, proposalId])` constraint (`schema.prisma:1673`) inside a transaction rather than a read-then-write check — correct, race-free design.

### 1.9 Extension

#### `src/lib/extension-config.ts` — 180 LOC — **1 importer** (`GET /api/platform-agent/extension/config`)
`ExtensionPortal` / `ExtensionCategory` types, `EXTENSION_DEFAULT_PORTALS` (23 — Etimad only), `EXTENSION_CATEGORY_CATALOG` (112 — 11 categories built from private bilingual `KEYWORDS`/`LABELS_EN`/`LABELS_AR` maps), `mapSectorsToCategoryIds(sectors)` (122), `buildExtensionMatchDefaults(input)` (157 — caps keyword lists at 40 and defaults both auto-actions to `false`).

#### `src/lib/extension-pack.ts` — 159 LOC — **1 importer**
Private `walk` (15) and `crc32` (40); `buildStoreZip(entries, rootPrefix)` (63 — hand-rolled store-only ZIP), `EXTENSION_ZIP_FILENAME`/`EXTENSION_ZIP_RELATIVE` (131, 133), `getExtensionSourceDir()` (135), `packExtensionZipToBuffer()` (139), `packExtensionZipToPublic()` (150 — writes to `public/downloads/`).

#### `src/lib/copilot-processing.ts` — 278 LOC — **2 importers**
Pure turn state machine: `COPILOT_PROCESSING_PHASES` (6), `countStreamTokens` (59), `formatElapsed` (65), `estimateProcessingProgress(input, previousProgress)` (76 — deterministic, monotonic within a turn), `deriveCopilotProcessingPhase(input)` (119), `buildProcessingSnapshot` (170), `phaseMessageKey` (199 — returns i18n keys, does not hardcode strings), `persistenceKey`/`serializePartial`/`parsePartial` (234–254), `advanceTerminalPhase` (257), `DOCUMENT_TOOL_NAMES`/`isDocumentToolName` (267, 276).
**It does not touch ingested tender content** — it is purely a UI progress state machine over the chat transport. Progress is derived from `log10(chars)` and tool-completion ratios, which is an estimate but an explicitly deterministic and monotone one.

### 1.10 `src/lib/marketing/**`

| File | LOC | Contents |
|---|---|---|
| `site-pages.ts` | 161 | `PublicPageMeta`, `PUBLIC_MARKETING_PAGES` (15 bilingual entries), `PUBLIC_AUTH_PAGE_PATHS`, `PUBLIC_PAGE_PATHS` (middleware allow-list), `pagesByGroup(group)` |
| `page-meta.ts` | 16 | `marketingLayoutMetadata(path)` — looks up `PUBLIC_MARKETING_PAGES`, forwards to `createPageMetadata` |
| `company-content.ts` | 255 | `aboutContent`, `securityContent`, `faqItems` (10 bilingual Q&A), `faqRelated`, `legalHubSections`, `legalHubRelated`, `contactChannels` |
| `legal-content.ts` | 481 | Bilingual privacy / terms / cookies / acceptable-use / billing / DPA copy |

`aboutContent.bulletsEn` (34–39) is a notably honest "what we refuse to do" list: no AI pricing, no invented certifications, no compliance-as-legal-advice, no direct Etimad submission.

### 1.11 `src/lib/seeds/**`

`seed-clauses.ts` — 17 LOC — a CLI entry that calls `seedStandardClausesWithPrisma()` and disconnects. Not imported by application code.

### 1.12 `src/components/brand/**` and `src/components/patterns/**`

| File | LOC | Notes |
|---|---|---|
| `brand/logo-variants.ts` | 261 | SVG path data, size maps, `LOGO_COLORS` sourced from `designTokens` (128), `LOGO_WORDMARK` (152), `buildStaticLogoSvg(options)` (218) |
| `brand/logo-animations.ts` | 246 | Keyframes/timing constants for the logo |
| `brand/arabclue-logo.tsx` | 587 | The `<ArabclueLogo>` component (cycle / unified / static-ar / static-en modes) |
| `patterns/page-header.tsx` | 93 | `PageHeader` (28) with `badge: BadgeVariant = "compliance"` default, `PageSection` (85) |
| `patterns/panel.tsx` | 76 | `Panel` + `PanelTone` |
| `patterns/query-state.tsx` | 101 | `EmptyState` (10), `ErrorState` (37), `QueryState` (64) |
| `patterns/confirm-dialog.tsx` | 71 | `ConfirmDialog` (17) |
| `patterns/export-readiness-checklist.tsx` | 96 | `ExportReadinessChecklist` (14) — correctly bilingual, filters `severity === "error" \|\| "blocking"` |
| `patterns/index.ts` | 7 | Barrel |

### 1.13 `prisma/schema.prisma` cross-checks (1,722 LOC)

Verified: `TemplateMarketplaceEntry` (1425) has `rating Float @default(0)`, `ratingCount`, `downloadCount`, `usageCount` and `@@unique([workspaceId, templateKey])`; `TemplateMarketplaceRating` (1641) documents both a DB `CHECK` constraint and app-level 1–5 validation; `TemplateMarketplaceApplication` (1660) has `@@unique([entryId, proposalId])` exactly as `marketplace-usage.ts` assumes; `AnalyticsEvent` (1487) has `eventKey String? @unique` (idempotency), non-null `userId`, and four indexes; `CollaborationComment` (1461) and `ProposalPresence` (1679) match their lifecycle modules.
**Not present:** any `AnalyticsDailySummary` / analytics-archive model. See defect 1.

---

## 2. Architecture narrative

### 2.1 The i18n system

**It is a hand-rolled dictionary, not `next-intl`.** `src/lib/i18n.ts` holds ~1,800 keys in one flat `Record<string, { ar, en }>` literal, and 64 non-test modules import it directly. There is no locale routing segment, no message-catalog loading, and no ICU MessageFormat. `next-intl@^4.13.4` is declared in `package.json` but referenced nowhere else in the repository (finding 45).

**Locale selection and persistence.** Arabic is the default at every layer. The client store `useLocale` (`store.ts:114`) defaults to `{ locale: "ar", dir: "rtl" }`. On change, `scheduleLocalePersistence` defers past the current interaction frame (rAF + `setTimeout(0)`) and then `persistLocalePreference` writes three places: the zustand JSON blob under `arabclue-locale`, a compat mirror under `arabclue-marketing-locale`, and a one-year `arabclue-locale` cookie — then syncs `documentElement.lang`/`dir`. The locale deliberately never appears in the URL (`store.ts:21`).

**How server components get the locale.** Purely from the cookie. `app/layout.tsx:49-52` awaits `cookies()`, reads `LOCALE_COOKIE_NAME`, and defaults to `"ar"` for anything that is not exactly `"en"`; the layout is `force-dynamic` for this reason. `app/page.tsx` and `app/(app)/app/layout.tsx` do the same. There is no `Accept-Language` negotiation and no per-user DB locale read at render time, even though `User.locale` exists in the schema.

**Missing keys.** `resolveTranslation` (2496) walks `active locale → other locale → key identifier`, never throws, and never returns an empty string. Every miss is pushed into a 100-entry ring buffer and passed to a replaceable reporter (default: `console.warn`). A user therefore sees the other language before they see a raw key.

**Key-coverage guarantee.** For the dictionary, yes and it holds: `src/lib/__tests__/i18n-completeness.test.ts` asserts a non-empty `ar` **and** `en` for every key, plus explicit presence lists for 35 error codes, 10 nav keys, and 9 status keys. I independently scanned the registry for entries where `ar === en` or where the `ar` value contains no Arabic codepoint — only two hits, both legitimate (`copilot_proc_progress: "{{pct}}%"` at line 71 and `auth_email_placeholder: "name@company.sa"` at 444).
**The guarantee stops at the dictionary boundary, and that boundary is where most strings live.** There are ~1,189 inline `locale === "ar" ? … : …` ternaries across 88 files versus 497 `tr(...)` calls across 49 files. Roughly 70% of user-facing strings are never seen by the completeness test.

### 2.2 The Zustand store

Two stores. `useLocale` holds `{ locale, dir }`. `useUI` holds `view`, `activeProjectId`, `sidebarCollapsed`, `mobileNavOpen`, `adminMode`, `tenderType`, `routeNotice`.

Persistence is deliberately narrow: `partialize` (`store.ts:287`) writes only `{ activeProjectId, tenderType, sidebarCollapsed }`, and both `migrate` and `merge` route the payload through `sanitizePersistedUI` (217), a total function that validates the project-id shape and drops any route field an older build may have written. The result is that `view`, `adminMode`, and `routeNotice` can never be restored from storage.

**Relationship to routing.** The URL is the sole authority. `dashboard-routes.ts` is a pure, server-safe route table; `app-route-resolver.ts` runs it server-side inside the `(app)` layout — session check, email verification, `resolveAppRoute`, admin permission, then a `projectExistsInTenant` DB probe — and either redirects to a canonical fallback with a `RouteNoticeCode` or renders. On the client, `dashboard-navigate.ts` re-applies the same admin/project rules before a single `router.push`, then `useUI.applyRoute` mirrors the resolution into the store without emitting navigation. `setView` derives `adminMode` from `isAdminView(view)` rather than keeping a second copy of the naming rule. Hydration is therefore safe by construction: the persisted blob cannot contradict the URL because it contains no route fields.

### 2.3 The procurement / qualification / compliance rules engine

**Rules are hardcoded in TypeScript, in two places with very different quality.**

`procurement-rules.ts` is the disciplined half. Every regulatory entry carries `sourceReference`, `applicabilityCriteria`, `effectiveDate`, `reviewDate`, `superseded`, and `humanApprovalStatus`. Statutory penalty caps are named `…Candidate` and stamped `PENDING_REVIEW`. `NORA_PRINCIPLES` is an empty array by design. `extractLocalContentPreference` returns `null` rather than a default. `computeQuickLiquidityRatio` returns `passes: null` when no threshold was supplied. This is genuinely auditable: every number can be traced to a tender clause or an explicitly-flagged candidate.

`constants.ts` is the undisciplined half, and it is what actually reaches users. `TENDER_TYPES` (302–374) attaches `slaMaxPenalty`, `slaPerWeek`, `typicalBudget`, and `evaluationSplit` to each of six categories with no source, no approval status, and no applicability criteria. `agents/ingestion.ts` uses them as `??` fallbacks (391, 397, 411, 418) when the tender text yields nothing, and `generators.ts:122-123` renders the result into the proposal PDF as `"فني 70% / مالي 30%"` and `"2% أسبوعياً (حد أقصى 20%)"`. The evidence trail only records a note when the detected value *differs* from the default (399–404), so "nothing was found, we used our guess" is indistinguishable from "we extracted this from the tender".

**Score computation.** There is no numeric qualification score. `assessQualificationDossier` produces a gap list plus a boolean `strongBidReady = !gaps.some(g => g.requiredForStrongBid)`. Compliance scoring is `compliant / total` over `ComplianceCheck` rows in `agents/compliance.ts`. Onboarding readiness is `(5 - missing.length) / 5 * 100` (`business-profile.ts:382-384`).

### 2.4 The RAG / knowledge pipeline

**Chunking.** `chunkText` normalizes whitespace and emits fixed 900-character windows with 120-character overlap, dropping slices under 40 characters, hard-capped at 40 chunks per document. That is a ceiling of roughly 31 KB of indexed text per file, silently applied.

**Embedding.** Real, provider-backed: `indexDocumentChunks` calls `embedText(title + "\n" + content)` per chunk and stores the vector as a JSON string in `DocumentChunk.embeddingJson`. There is no pgvector column and no ANN index — similarity is computed in Node over rows loaded into memory.

**Retrieval strategy.** Hybrid with an embedding-first preference. `searchWorkspaceChunks` loads up to 400 chunks (`createdAt desc`), parses each JSON embedding, embeds the query, and calls `retrieveRelevant`, which uses `cosineDense` when any embedding exists and otherwise falls back to `cosineSparse` over term frequencies. The lexical path applies a `score > 0` filter; the embedding path does not.

**Approval queue workflow.** This is the strongest subsystem in the audit. Nothing enters the corpus without: an `approved` flag, `reviewStatus === "APPROVED"`, no `revokedAt`, an `evidenceRef` that exactly reconstructs to `uploaded-document:{documentId}:v{version}:sha256:{checksum}`, a schema-valid `provenanceJson` whose `sourceId`/`version`/`checksum` all agree with the evidence columns, a `reviewedById`, an `approvedAt`, and a `contentHash` matching a recomputed canonical hash. Editing content clears the approval (`markKnowledgeContentUnreviewed`). Decisions are validated by a pure service (`knowledge-decision.ts`), persisted atomically by a Prisma adapter, and surfaced through a keyset-paginated merged queue across five heterogeneous tables (`knowledge-queue.ts`). Callers such as `business-profile.ts` and `onboarding.ts` re-assert the whole predicate in their `where` clauses *and* re-filter in memory.

### 2.5 Analytics collection and retention

**What is recorded.** One row per event in `AnalyticsEvent`: `workspaceId`, `eventType` (closed vocabulary), `entityType`, `entityId`, optional `durationMs`, a minimized `metadataJson`, a non-null `userId`, and `createdAt`. An optional unique `eventKey` gives idempotency for the single bounded post-commit append attempt.

**PII posture.** Deliberately minimized and enforced, not just documented. `findForbiddenAnalyticsField` rejects any metadata key that matches a monetary or document-body token by exact name or substring, and `buildAnalyticsEvent` rejects the whole event with `forbidden_payload_field` if one appears (656–657). No proposal text, no prices, no free-text notes reach the table. **However**, every row still binds an identified user to a timestamped action inside a named workspace — that is behavioural personal data under PDPL, and it is retained indefinitely (below).

**The retention cron.** `archiveOldAnalyticsEvents` computes a 90-day cutoff, groups expired rows by `(workspaceId, eventType, day)` via `$queryRaw`, and then deletes. Two things are wrong and one is missing. The grouped result is **returned to the caller and never written anywhere** — there is no summary table in the schema, so the "archive" is a response body that the cron route logs and discards while the underlying rows are permanently deleted. The delete ignores the `limit` its own interface declares, so the documented 5,000-row batching does not apply. And `/api/cron/analytics-retention` is **not listed in `vercel.json`** (which registers only `billing-reconcile`, `expiry-notifications`, and `notification-dispatch`), so in production the job never runs at all and the table grows without bound.

### 2.6 The marketplace

**Publishing.** Six system templates are frozen in `SYSTEM_TEMPLATE_CATALOG` and pushed into `TemplateMarketplaceEntry` with `workspaceId: null` by `ensureSystemMarketplaceCatalogSeeded`, which `GET /api/templates/marketplace` calls **on every request**. Tenant templates are ordinary rows with a non-null `workspaceId`, keyed by `@@unique([workspaceId, templateKey])`.

**Resolution.** `marketplace-template-resolve.ts` normalizes either source into a `ResolvedMarketplaceTemplate` tagged `"system-catalog"` or `"database"`, and `mapDbMarketplaceRow` refuses any row missing either locale of `nameJson`.

**Usage tracking.** Correct and race-free: `recordMarketplaceApplication` inserts into `TemplateMarketplaceApplication` and increments `usageCount` in one transaction, relying on the `(entryId, proposalId)` unique constraint to make repeat applications a no-op rather than doing a read-then-write check.

**Rating.** `TemplateMarketplaceRating` enforces one rating per `(entryId, userId)`, an integer 1–5 at both the DB `CHECK` and the Zod layer. The mechanism is sound — but the seeded system rows arrive pre-loaded with fabricated `rating`, `ratingCount`, `downloadCount`, and `usageCount` values that no user action produced.

### 2.7 The browser extension

A Chrome MV3 extension living in `extensions/arabclue-agent/` (manifest, background, content, sidepanel, shared, assets). Its business data is **not** bundled: it fetches `EXTENSION_DEFAULT_PORTALS` and `EXTENSION_CATEGORY_CATALOG` from `GET /api/platform-agent/extension/config`, so the Etimad URL patterns and the 11 bilingual category keyword sets can change server-side. `buildExtensionMatchDefaults` derives a workspace's watch list from its declared sectors and capabilities, capped at 40 keywords per language, with `autoDownloadDocuments` and `autoStartProposal` both defaulting to `false`.

`extension-pack.ts` packs the folder into a store-only (uncompressed) ZIP with hand-written local/central headers and a hand-rolled CRC32, skipping `node_modules`, `src`, `.git`, lockfiles, `tsconfig.json`, `.DS_Store`, and any `.ts`/`.map` file, then writes it to `public/downloads/arabclue-agent.zip`.

`copilot-processing.ts`, despite the name, **does nothing with ingested tender content**. It is a pure, deterministic UI state machine over the chat transport: `idle → queued → streaming → generating → finalizing → completed | error`, with a monotone progress estimate, a whitespace token counter, elapsed formatting, and `localStorage` partial-response persistence keyed by mission id. It returns i18n message *keys* rather than strings.

---

## 3. Cross-cutting observations

### 3.1 Hardcoded / fake data

There is **no `Math.random()` anywhere in production code** — the only occurrences are inside `src/lib/__tests__/platform-completion/integrity-policy.test.ts`, which exists specifically to detect it. That is a real and unusual strength. The fabrication problem is entirely in static literals.

**A. Marketplace social proof written into the live database.** Every entry in `SYSTEM_TEMPLATE_CATALOG` carries invented engagement metrics:

```ts
// src/lib/template-marketplace-catalog.ts:37-40
    rating: 4.8,
    ratingCount: 126,
    downloadCount: 1840,
    usageCount: 920,
```

and `marketplace-catalog-seed.ts:84-87` persists them verbatim on first create:

```ts
            rating: item.rating,
            ratingCount: item.ratingCount,
            downloadCount: item.downloadCount,
            usageCount: item.usageCount,
```

Across the six templates that is 4.2–4.8 stars from 22–126 fictional raters and 290–1,840 fictional downloads, served through the same API shape as genuine tenant ratings.

**B. Invented tender economics presented as extracted facts.**

```ts
// src/lib/constants.ts:309-313
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 25000000,
    complianceScope: [...],
    evaluationSplit: { technical: 70, financial: 30 },
```

consumed as silent fallbacks:

```ts
// src/lib/agents/ingestion.ts:391, 411, 418
    ]) ?? tenderType.evaluationSplit.technical;
    ]) ?? tenderType.slaPerWeek;
    ]) ?? tenderType.slaMaxPenalty;
```

and rendered into the deliverable:

```ts
// src/lib/generators.ts:122-123
          techFin: `فني ${tenderType.evaluationSplit.technical}% / مالي ${tenderType.evaluationSplit.financial}%`,
          slaVal: `${tenderType.slaPerWeek}% أسبوعياً (حد أقصى ${tenderType.slaMaxPenalty}%)`,
```

`typicalBudget` also seeds the budget input placeholder (`tender-setup-wizard.tsx:255`).

**C. A static compliance badge on every dashboard page.**

```ts
// src/components/patterns/page-header.tsx:13-19, 31
  compliance: {
    ...
    labelEn: "C1 Compliance",
    labelAr: "امتثال C1",
  },
  badge = "compliance",
```

`views.tsx` renders `PageHeader` 22 times; 7 pass `badge="admin"` and 1 passes `badge="none"`, so 14 views display a fixed "C1 Compliance" chip that is unconnected to any compliance state.

**D. An unsourced marketing statistic.** `marketing-copy.ts:24-25` — the projects figure is honestly qualified, the time saving is not:

```ts
    stats_projects: { ar: "+1,200 مشروع تمت معالجته (بيئة تجريبية)", en: "+1,200 projects processed (sandbox)" },
    stats_time: { ar: "82% وقت أقل للمسودة الأولى", en: "82% less time to first draft" },
```

**E. A fabricated growth percentage.** `stats-trends.ts:3` returns `100` for 0 → any positive value, in a file whose own line 8 says "so UI never fabricates arrows".

**F. Unknown rendered as zero.** `utils.ts:10` maps `null` to `"0"`, and `proposals-list.tsx:249` renders `{formatPercent(p.complianceScore)}%`, so an unscored proposal reads "0%" — indistinguishable from a genuinely non-compliant one.

### 3.2 i18n coverage

Within `i18n.ts` the ar/en coverage is genuinely complete and test-enforced. The gaps are structural rather than lexical:

- **Bypass volume.** 1,189 inline `locale === "ar" ? …` ternaries in 88 files versus 497 `tr()` calls. Most page subtitles in `views.tsx` are inline. None of these are covered by the completeness test.
- **Server metadata is English-only.** `seo.ts:58-66` never reads the `titleAr`/`descriptionAr` it accepts, and `marketing/page-meta.ts:11-13` dutifully passes them. `alternates.languages` maps `en` and `ar` to the identical URL (`seo.ts:84-87`), so hreflang carries no signal.
- **Client error locale is stuck on Arabic.** `api-client.ts:21-22` reads the zustand JSON blob as if it were a bare `"ar"`/`"en"` string, so `resolveClientLocale()` can never return `"en"`.
- **Untranslated Arabic values outside the dictionary.** `marketing-copy.ts:171` (`ar: "Version history & rewrite"`), `marketing-copy.ts:107` (`"مع عزلWorkspace"` — missing space, untranslated term), `api/notifications/route.ts:126-127` (`bodyAr` byte-identical to the English `body`).
- **English-only component defaults.** `query-state.tsx:40` (`retryLabel = "Retry"`), `confirm-dialog.tsx:22-23` (`"Confirm"`, `"Cancel"`).
- **Brand name inconsistency.** `logo-variants.ts:153` renders `ar: "عربكلو"`, while `seo.ts:10`, the `appName` dictionary key, and `business-profile.ts:499` all use `"أراب كلاو"`.
- **RTL concatenation.** `i18n.ts:2544` joins with an ASCII colon (`` `${action}: ${reason}` ``); with keys like `account_field_error: "راجع الحقل: {{field}}"` (1413) the interpolated value is a Latin identifier, putting a bidi-neutral colon between an RTL and an LTR run without isolation. `tender-insights.ts:120-126` produces `"25M ر.س"` — a Latin magnitude suffix glued to an Arabic currency abbreviation, again unisolated.
- **Arabic pluralization is absent.** Every count key uses one Arabic form: `"{{count}} رمز"` (70), `"بعد {{hours}} ساعة"` (1410), `"بعد {{days}} أيام"` (1430), `"{{max}} بنداً"` (1445). Arabic needs six CLDR categories; `"بعد 1 أيام"` and `"بعد 11 ساعة"` are both wrong.
- Eastern Arabic numerals *are* used, but inconsistently: hardcoded in a handful of literals (`i18n.ts:1684-1686`, `landing-page.tsx:153`) while `typography.ts` provides a proper `formatNumber`/`toEasternArabicNumerals` that most call sites do not use.

### 3.3 Domain correctness (Saudi / Gulf)

- **VAT.** The 15% rate is hardcoded at `generators.ts:470` (`const vat = Math.round(subtotal * 0.15 * 100) / 100;`) with no effective-date or rate-change handling. Saudi VAT was 5% until July 2020; a historical or future rate change silently invalidates every regenerated document.
- **SAR formatting.** Two competing implementations. `typography.ts` does it properly (`formatCurrency(1000000, "SAR", "ar")` → `"١٬٠٠٠٬٠٠٠٫٠٠ ر.س."`). `tender-insights.ts:113-129` does not — Latin `B`/`M`/`K` suffixes in both locales, and the final branch calls `toLocaleString("ar-SA")` (Eastern digits) then appends `ر.س` without isolation.
- **Hijri dates.** Entirely absent — a repo-wide search for `hijri`/`islamic`/`umalqura` returns nothing. Etimad publishes deadlines in Hijri; the platform can neither parse nor display them.
- **CR / Unified National Number / VAT number validation.** None. `validation.ts:248` is `vatNumber: z.string().trim().max(64).nullable().optional()`; `crNumber` is the same shape. A Saudi CR is 10 digits; a ZATCA VAT number is 15 digits beginning and ending with `3`; a Unified National Number is 10 digits starting with `7`. Any of these fields accepts `"x"`, and `qualification.ts:139-142` treats a non-empty string as satisfying the dossier row.
- **NORA ID format.** `nora-ids.ts:8` uses `/\b((?:TP|SP|BP|IP)\d+)\b/gi`, which will happily classify "SP1" (service pack), "IP4", or "TP2" from unrelated technical prose as architecture principles.
- **Arabic numerals (٠-٩).** `typography.ts` and `bilingual-typography.ts` handle conversion well, and `etimad-date-parser` handles Arabic-Indic input. But the general-purpose helpers (`utils.formatPercent`, `tender-insights.formatBudgetCompact`, `copilot-processing.formatElapsed`) all emit Western digits regardless of locale.
- **Etimad terminology.** Consistent and correct throughout: "منصة اعتماد", CR/ZATCA/GOSI/LCGPA/NCA/PDPL/Nitaqat vocabulary, and the honest statement in three places that direct Etimad submission is out of scope.

### 3.4 Performance

- **`i18n.ts` ships to the browser.** 2,560 lines containing both locales of every string is a module-level literal imported by 64 modules including client components. Every user downloads the Arabic *and* English catalogue on first paint; there is no per-locale split or lazy namespace.
- **A no-op seed on every marketplace page load.** `api/templates/marketplace/route.ts:61` calls `ensureSystemMarketplaceCatalogSeeded()` unconditionally; the function issues 1–2 user lookups plus 6 `findFirst` and 6 `update` round-trips sequentially (`marketplace-catalog-seed.ts:53-93`), i.e. ~14 queries per list request even when nothing changed.
- **Sequential embedding.** `document-chunks.ts:47-60` awaits `embedText` then `db.create` inside a `for` loop — up to 40 serial LLM round-trips plus 40 serial inserts per document.
- **Wasted embedding call.** `document-chunks.ts:149` always embeds the query, then line 153 discards it when no chunk has an embedding.
- **In-memory similarity over a fixed page.** `searchWorkspaceChunks` loads 400 rows, `JSON.parse`s 400 embedding vectors, and scores them in Node on every search. `loadProjectTenderCorpus` does the same for 200.
- **`extension-config.ts:138-153`** is O(sectors × categories × keywords) with per-iteration `toLowerCase()`; bounded small in practice.
- No unbounded in-memory growth found: the missing-translation log is a 100-entry ring (`i18n.ts:2430`), presence is capped at 50 viewers, and the knowledge queue is keyset-paginated. The one unbounded structure is the `AnalyticsEvent` **table** (3.6).

### 3.5 Data-model coupling (pure vs `-prisma` split)

Four pairs, and the split is clean in all four:

| Pure module | Adapter | Assessment |
|---|---|---|
| `clause-library.ts` (862) | `clause-library-prisma.ts` (195) | Repository port; adapter scopes to `workspaceId: null` so catalog repair cannot touch tenant clauses. No drift. |
| `comment-lifecycle.ts` (436) | `comment-lifecycle-prisma.ts` (291) | Best example in the repo. Tenant scope is a relation predicate on every statement; mutation + audit share one transaction; concurrency handled by write predicates (`replies: { none: {} }`) rather than locks. |
| `knowledge-decision.ts` (368) | `knowledge-decision-prisma.ts` (235) | Pure validation and outcome mapping; adapter owns transactions and per-type dispatch. |
| `knowledge-queue.ts` (610) | `knowledge-queue-prisma.ts` (223) | Ordering, cursors, and page-size rules are pure; adapter only translates predicates into index-ordered reads. |

`analytics-retention.ts` uses the same injected-port pattern (`AnalyticsRetentionClient`) but the abstraction has drifted from the implementation: the port declares `deleteExpiredEvents(cutoff, limit)` (line 74) and the Prisma implementation is `async deleteExpiredEvents(cutoff)` (118), silently dropping the bound. The in-memory test double honours the limit, so the unit tests pass while production does something different.

The `-prisma` modules that *should* exist but do not are for `marketplace-catalog-seed.ts`, `marketplace-usage.ts`, `onboarding.ts`, `requirements.ts`, and `business-profile.ts`, all of which import `db` directly and are therefore only testable against a database or a module mock (`requirements` is tested from `__tests-isolated/`).

### 3.6 Privacy

`AnalyticsEvent` stores, per row: the acting `userId` (non-null FK to `User`), the `workspaceId`, the action type, the target entity, a duration, and a timestamp. Payload minimization is genuinely enforced — no prices, no document bodies, no free text can enter `metadataJson`. But the row itself is a per-user activity log: who did what, in which tenant, when, and how long it took.

The declared retention window is 90 days (`ANALYTICS_RETENTION_DAYS`). In practice it is **infinite**, for two independent reasons: the cron path is not registered in `vercel.json`, and even if it were, the "archive" step writes nothing before deleting, so the operator's choice is between unbounded personal-data retention and irreversible loss of the historical series.

Elsewhere the privacy posture is careful: `brand-logo.ts:222-228` deliberately suppresses filesystem and tenant detail from logo failure warnings; comment withdrawal clears the mention list (`comment-lifecycle-prisma.ts:253`); the audit log is append-only inside the same transaction as the mutation it records; `company-content.ts` documents PDPL request channels.

---

## 4. Gaps and defects

### Critical / High

**1. `[High] data-integrity` — `src/lib/analytics-retention.ts:118-124`**
```ts
    async deleteExpiredEvents(cutoff) {
      const result = await client.analyticsEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
```
The module header (lines 1-15) and function doc (131-142) promise that events are "aggregated into daily summaries" before deletion. `groupExpiredEvents` returns the aggregation to the caller and nothing writes it: there is no `AnalyticsDailySummary` model anywhere in `prisma/schema.prisma` (verified — the only analytics model is `AnalyticsEvent` at 1487). The cron route logs `summaryBucketCount` and discards the breakdown. Historical analytics are therefore destroyed, not archived.
**Fix:** add an `AnalyticsDailySummary` model keyed `@@unique([workspaceId, eventType, day])`, `upsert` every bucket inside the same `$transaction` as the delete, and only delete rows that fall inside a successfully-persisted bucket.

**2. `[High] data-integrity` — `src/lib/analytics-retention.ts:74` vs `:118`**
```ts
  deleteExpiredEvents(cutoff: Date, limit: number): Promise<number>;   // port
    async deleteExpiredEvents(cutoff) {                                 // impl
```
The implementation drops the `limit` parameter, so `deleteMany` removes every row older than the cutoff in one statement, defeating `ANALYTICS_RETENTION_BATCH_SIZE = 5_000` and its stated purpose ("avoid long-running transactions", line 27). Worse, `groupExpiredEvents` *does* apply `LIMIT` to the grouped rows (107), so with more than 5,000 distinct `(workspace, type, day)` buckets the function deletes everything while summarising only the first 5,000 buckets. The in-memory test double honours the limit, which is why the unit tests do not catch it.
**Fix:** implement batching with `id IN (SELECT id … ORDER BY "createdAt" LIMIT $limit)`, return the actual deleted count, and have the caller loop until the count is below the batch size.

**3. `[High] privacy` — `vercel.json:16-29`**
```json
  "crons": [
    { "path": "/api/cron/billing-reconcile",       "schedule": "15 5 * * *" },
    { "path": "/api/cron/expiry-notifications",    "schedule": "0 6 * * *"  },
    { "path": "/api/cron/notification-dispatch",   "schedule": "30 5 * * *" }
  ]
```
`/api/cron/analytics-retention` exists and is authorized (`app/api/cron/analytics-retention/route.ts:13-18`) but is not scheduled. The 90-day window in `ANALYTICS_RETENTION_DAYS` never takes effect, so `AnalyticsEvent` — which binds a named `userId` to every action (`schema.prisma:1496`) — is retained indefinitely. That is both a PDPL storage-limitation exposure and an unbounded table.
**Fix:** register the cron (`{ "path": "/api/cron/analytics-retention", "schedule": "0 3 * * *" }`) — after fixing defects 1 and 2, so the first run does not silently destroy history.

**4. `[High] i18n-rtl` — `src/lib/api-client.ts:21-22`**
```ts
    const stored = window.localStorage.getItem("arabclue-locale");
    return stored === "en" ? "en" : "ar";
```
`store.ts:54,72` writes that key as a zustand persist blob (`{"state":{"locale":"en","dir":"ltr"},"version":0}`), never as a bare `"en"`. The strict equality therefore never holds and `resolveClientLocale()` always returns `"ar"`. Every client-side API failure message selected by `selectApiFailureMessage` is rendered in Arabic for English users. `store.ts:96-112` already contains a `readPersistedLocale()` that handles both shapes correctly — this call site just does not use it.
**Fix:** read the `arabclue-locale` **cookie** (already written by `persistLocaleCookie` and already the server's source of truth), or extract `readPersistedLocale` into a store-free module and call it here.

**5. `[High] fake-data` — `src/lib/template-marketplace-catalog.ts:37-40` (repeated at 70-73, 104-107, 137-140, 171-174, 202-205)**
```ts
    rating: 4.8,
    ratingCount: 126,
    downloadCount: 1840,
    usageCount: 920,
```
`marketplace-catalog-seed.ts:84-87` writes these into `TemplateMarketplaceEntry`, and `GET /api/templates/marketplace` serves them through the same fields as genuine `TemplateMarketplaceRating` aggregates. Users cannot distinguish 126 fabricated ratings from 126 real ones, and the real rating pipeline (`schema.prisma:1641-1658`) will average new honest ratings against a synthetic baseline.
**Fix:** seed `rating: 0, ratingCount: 0, downloadCount: 0, usageCount: 0` and drop those four fields from `TemplateMarketplaceItem` for system entries; if a "featured" signal is wanted, use the existing `isFeatured` boolean.

**6. `[High] correctness` — `src/lib/document-chunks.ts:11,25`**
```ts
const MAX_CHUNKS_PER_DOC = 40;
  while (start < cleaned.length && chunks.length < MAX_CHUNKS_PER_DOC) {
```
With `CHUNK_SIZE = 900` and `CHUNK_OVERLAP = 120`, indexing stops after ~31,200 characters. A 400-page RFP — the exact scenario the product markets against (`marketing-copy.ts:41`) — is roughly 800,000 characters, so about 96% of it is never embedded, never retrievable, and never mentioned. `indexDocumentChunks` returns `parts.length` (40) as if that were the whole document.
**Fix:** remove the per-document cap or raise it to a size-derived bound; return `{ indexed, totalChunks, truncated }` and surface `truncated` in the ingestion UI and agent context so a partial index is visible rather than silent.

**7. `[High] correctness` — `src/lib/constants.ts:302-374`**
```ts
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 25000000,
    evaluationSplit: { technical: 70, financial: 30 },
```
These per-category numbers have no `sourceReference`, no `applicabilityCriteria`, and no `humanApprovalStatus`, unlike every value in `procurement-rules.ts`. `agents/ingestion.ts:391,397,411,418` uses them as `??` fallbacks when extraction finds nothing, and `generators.ts:122-123` prints the result into the client-facing proposal as though extracted. The evidence array is only appended when the detected value *differs* from the default (`ingestion.ts:399-404`), so the fabricated case leaves no trace. This directly violates the module constitution at `procurement-rules.ts:4-6`.
**Fix:** make the fallbacks explicit and typed — return `{ value, sourceCategory: "INTERNAL_RECOMMENDATION" }` instead of a bare number, always push an evidence entry naming the fallback, and have the renderer label unextracted values (e.g. "not stated in tender — platform default") rather than printing them as tender terms.

**8. `[High] correctness` — `src/lib/qualification.ts:139-151, 163`**
```ts
    const fieldHit = (doc.workspaceFields ?? []).some((f) => {
      const v = opts.workspace[f];
      return typeof v === "string" && v.trim().length > 0;
    });
    ...
    if (!fieldHit && matching.length > 0) {   // validity check only in this branch
```
Any non-empty `crNumber` or `vatNumber` string marks the dossier row present and skips certificate validity checking entirely. A workspace whose CR certificate is expired *and* revoked still reports `cr` as present, and because `cr` and `zatca_vat` are two of the three `requiredForStrongBid` rows satisfiable this way, `strongBidReady` can be `true` on invalid credentials. There is also no format validation: `crNumber: "x"` passes (`validation.ts:248` is `z.string().trim().max(64)`).
**Fix:** run the validity check whenever *any* source is present, treat a workspace field as satisfying the row only when no matching certificate exists or the matching certificate is valid, and add format validators (CR = 10 digits; ZATCA VAT = 15 digits, first and last digit `3`).

**9. `[High] missing-feature` — `src/lib/validation.ts:155` vs `src/lib/qualification.ts:6-17`**
```ts
  certType: z.enum(["ISO", "GOSI", "VAT", "ZAKAT", "LICENSE", "OTHER"]),   // validation.ts
export const CERTIFICATE_TYPES = ["CR","ZATCA_VAT","GOSI","NCA","LCGPA","ISO","LICENSE","ZAKAT","VAT","OTHER"]  // qualification.ts
```
The API enum omits `CR`, `ZATCA_VAT`, `NCA`, and `LCGPA`, so `POST /api/certificates` can never create a certificate that matches those dossier rows. `nca` and `lcgpa` have no `workspaceFields`, which means those two rows are **permanently unsatisfiable** through the product UI and will always appear as gaps.
**Fix:** extend the Zod enum to the full `CERTIFICATE_TYPES` list (or derive it: `z.enum(CERTIFICATE_TYPES)`), so the domain catalog and the API cannot drift again.

**10. `[High] i18n` — `src/lib/seo.ts:44-47, 58-66, 84-87`**
```ts
  titleAr?: string;
  descriptionAr?: string;
  ...
  const title = input.title;
  const description = input.description ?? SITE.description;
  ...
      languages: { en: url, ar: url },
```
`titleAr` and `descriptionAr` are accepted and never read. `marketing/page-meta.ts:11-13` passes both for all 15 public pages, so every `<title>`, `<meta description>`, and Open Graph title is English-only on a product whose default locale is Arabic — while `openGraph.locale` is declared as `"ar_SA"` (95), which is now inconsistent with the content. The `alternates.languages` map points both locales at the identical URL, so hreflang conveys nothing.
**Fix:** read the `arabclue-locale` cookie inside `generateMetadata` and select the matching pair, or emit both via `openGraph.alternateLocale` with distinct `?lang=` URLs so hreflang is meaningful.

### Medium

**11. `[Medium] fake-data` — `src/components/patterns/page-header.tsx:13-19, 31`**
```ts
    labelEn: "C1 Compliance",
    labelAr: "امتثال C1",
  ...
  badge = "compliance",
```
The default badge renders on 14 of the 22 `PageHeader` call sites in `views.tsx` (7 pass `badge="admin"`, 1 passes `badge="none"`). It asserts a compliance level on pages that compute nothing — a decorative trust signal on a product whose own positioning is "evidence-backed compliance, not checkbox theatre" (`marketing-copy.ts:71`).
**Fix:** default `badge` to `"none"` and let the compliance view pass a badge whose label is derived from the actual `ComplianceCheck` roll-up.

**12. `[Medium] fake-data` — `src/lib/marketing-copy.ts:25`**
```ts
    stats_time: { ar: "82% وقت أقل للمسودة الأولى", en: "82% less time to first draft" },
```
The adjacent projects figure carries a "(sandbox)" qualifier; this one has no qualifier, no source, and no measurement basis.
**Fix:** remove it, or qualify it identically and cite the measurement.

**13. `[Medium] correctness` — `src/lib/stats-trends.ts:3`**
```ts
  if (previous === 0 && current > 0) return 100;
```
Growth from zero is undefined, not +100%. Going from 0 to 1 and from 0 to 500 both render "+100%". Line 8 of the same file states the design intent: "Coerce missing/undefined API trend values to null so UI never fabricates arrows."
**Fix:** `return null;` and have the UI show "new" or an em-dash for the zero-baseline case.

**14. `[Medium] correctness` — `src/lib/utils.ts:10-11`**
```ts
  if (value == null || Number.isNaN(Number(value))) return "0";
  const n = Math.min(100, Math.max(0, Number(value)));
```
`null` (not yet scored) becomes `"0"`, rendered by `proposals-list.tsx:249` as `0%` — visually identical to a genuine zero compliance score. The clamp also silently hides out-of-range values that would otherwise indicate an upstream bug.
**Fix:** return `null` for nullish input and let callers render a placeholder; log or surface out-of-range values instead of clamping them away.

**15. `[Medium] correctness` — `src/lib/tender-insights.ts:62-66`**
```ts
  let currency = "SAR";
  for (const p of active) {
    if (p.currency && !currency) currency = p.currency;
    if (p.currency) currency = p.currency;
```
Line 65 is dead (`currency` is never falsy after line 62). Line 66 makes the *last* project's currency win, while budgets of every currency are summed into a single `totalBudget` and per-category `share` percentages. A workspace holding SAR and USD tenders gets one meaningless total labelled with whichever project the loop saw last.
**Fix:** delete line 65; group buckets by currency, or reject/flag mixed-currency aggregation rather than silently adding across currencies.

**16. `[Medium] i18n-rtl` — `src/lib/tender-insights.ts:120-126`**
```ts
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ${sar}`;
```
The `B`/`M`/`K` suffixes are Latin in both locales, producing `"25M ر.س"`: a Western-digit number, a Latin letter, and an RTL currency abbreviation concatenated with no bidi isolation, inside an RTL paragraph. Line 128's fallback compounds it by switching to Eastern digits via `toLocaleString("ar-SA")` while still appending `ر.س` unisolated.
**Fix:** use `new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { notation: "compact", style: "currency", currency: "SAR" })`, or wrap the numeric run in `<bdi>` — the codebase already has `createBidiValue` in `bilingual-layout`.

**17. `[Medium] correctness` — `src/lib/rag.ts:4, 38-49`**
```
 * otherwise lexical TF-IDF cosine over title + summary.
```
```ts
function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
```
There is no inverse-document-frequency term anywhere in the file — `tf()` (30) divides by token count and that is all. Scoring is plain term-frequency cosine, so high-frequency words dominate and discriminative terms are under-weighted.
**Fix:** either compute IDF across the candidate set (`log(N / df)`) before the cosine, or correct the comment and the `retrieveLexical` doc to say "TF cosine".

**18. `[Medium] correctness` — `src/lib/rag.ts:89-96, 106-108`**
```ts
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);          // no score filter, unlike retrieveLexical:80
  ...
    if (hits.length > 0) return hits;
```
`retrieveLexical` filters `score > 0` (line 80); `retrieveByEmbedding` does not. Whenever any document has an embedding, `retrieveRelevant` returns `topK` results regardless of similarity, so wholly unrelated past projects get injected into the agent context as retrieved "evidence".
**Fix:** apply a minimum-similarity floor (0.2–0.3 for normalized embeddings) in `retrieveByEmbedding` and fall through to lexical when nothing clears it.

**19. `[Medium] i18n` — `src/lib/rag.ts:22-28`**
```ts
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
```
No Arabic normalization. `أ`/`إ`/`آ` are not folded to `ا`, `ة` is not folded to `ه`, tatweel (`ـ`) is not stripped, and harakat are not removed — so "الإنشاءات" and "الانشاءات" are different tokens. Combined with the missing IDF (defect 17), Arabic lexical retrieval is materially worse than English.
**Fix:** add an Arabic normalization pass before tokenizing (strip `\u064B-\u0652` and `\u0640`, fold alef/ya/ta-marbuta variants) and drop a small Arabic + English stop-word list.

**20. `[Medium] performance` — `src/lib/document-chunks.ts:47-60`**
```ts
  for (let i = 0; i < parts.length; i++) {
    const embedding = await embedText(`${opts.title}\n${content}`);
    await db.documentChunk.create({ ... });
```
Up to 40 serial LLM round-trips plus 40 serial inserts per document. At ~300 ms per embedding that is 12+ seconds of wall clock per file, inside the upload path.
**Fix:** batch the embedding call (most providers accept an input array) and replace the per-chunk `create` with a single `createMany`.

**21. `[Medium] performance` — `src/lib/document-chunks.ts:149-153`**
```ts
  const queryEmbedding = await embedText(opts.query);
  const hasEmbeddings = docs.some((d) => d.embedding && d.embedding.length > 0);
```
The query is embedded before checking whether any chunk has an embedding to compare against; when `hasEmbeddings` is false the vector is discarded. Every lexical-mode search pays a needless LLM call.
**Fix:** move the `hasEmbeddings` check above the `embedText` call.

**22. `[Medium] correctness` — `src/lib/document-chunks.ts:127, 158`**
```ts
    orderBy: { createdAt: "desc" },
    take: 400,
  ...
    totalIndexed: rows.length,
```
Search only ever considers the 400 most recently created chunks in the entire workspace, and the field named `totalIndexed` reports the page size rather than the corpus size. A workspace past 400 chunks silently loses older documents from search while the UI reports a full index.
**Fix:** rename to `scanned`, add a separate `db.documentChunk.count(...)` for the true total, and move ranking into the database (pgvector `<=>` or a `tsvector` index) instead of paging into Node.

**23. `[Medium] correctness` — `src/lib/document-chunks.ts:68-73`**
```ts
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: 200,
```
The project corpus is truncated to 200 chunks ordered by document id, so which documents reach the agent depends on cuid lexicographic order rather than relevance or recency.
**Fix:** either load the full project corpus (project-scoped volumes are bounded) or select by relevance before truncating.

**24. `[Medium] correctness` — `src/lib/qualification.ts:105-110`**
```ts
  if (Number.isNaN(d.getTime())) return false;
```
An unparseable expiry date is reported as *not expired*. In a qualification gate, malformed data must fail closed.
**Fix:** `return true` (or return a distinct `"invalid_expiry"` gap reason) so bad data cannot manufacture eligibility.

**25. `[Medium] correctness` — `src/lib/knowledge-eligibility.ts:87-95`**
```ts
    const exp = typeof cert.expiresAt === "string" ? new Date(cert.expiresAt) : cert.expiresAt;
    if (exp.getTime() <= now.getTime()) {
```
Same fail-open shape as defect 24: an unparseable string yields `NaN`, `NaN <= now` is `false`, and the certificate is treated as valid. The signature explicitly accepts `string`, so this is reachable from any non-Prisma caller.
**Fix:** guard with `Number.isNaN(exp.getTime())` and return `{ eligible: false, reason: "invalid_expiry" }`.

**26. `[Medium] correctness` — `src/lib/procurement-rules.ts:179`**
```ts
    return p.controlIdentifiers.some((c) => needle.includes(c.toUpperCase()) || c.toUpperCase().includes(needle));
```
Bidirectional unanchored substring matching. `getActivePolicies("CC")` returns both the ECC and the CCC baselines (`"ECC".includes("CC")` and `"CCC".includes("CC")`), so a caller asking about cloud controls also receives the general ECC policy. In a module whose whole purpose is precise applicability, loose matching is the wrong default.
**Fix:** match exact identifiers, or tokenize the needle and require a whole-token match.

**27. `[Medium] maintainability` — `src/lib/constants.ts:249-254`**
```ts
// SLA penalty rules (Saudi government services contracts)
export const SLA_RULES = {
  weeklyDelayPenalty: 2, // % per week of delay
  maxPenalty: 20, // max % cap for services
  maxPenaltyConstruction: 10, // cap for construction
};
```
These are the same values that `procurement-rules.ts:196-204` deliberately names `…Candidate`, marks `humanApprovalStatus: "PENDING_REVIEW"`, and annotates "Candidates only… never rewrite a tender clause to these values" — restated here as bare unqualified constants under a comment that presents them as the rule. `SLA_RULES` currently has zero importers, so it is dead code that exists only as a trap for the next contributor.
**Fix:** delete `SLA_RULES` and point any future caller at `SLA_PENALTY_RULES.statutoryCandidate()`.

**28. `[Medium] i18n` — `src/lib/marketing-copy.ts:171`**
```ts
  { feature: { ar: "Version history & rewrite", en: "Version history & rewrite" }, starter: false, pro: true, ent: true },
```
The only untranslated row in the pricing comparison table; every neighbouring row has real Arabic.
**Fix:** `ar: "سجل الإصدارات وإعادة الصياغة"`.

**29. `[Medium] maintainability` — `src/lib/business-profile.ts:382-384`**
```ts
  const requiredTotal = 5;
  const completedRequired = requiredTotal - onboarding.missing.length;
  const score = Math.round((completedRequired / requiredTotal) * 100);
```
`5` is a manual copy of `ONBOARDING_STEPS.filter(s => s.required).length` (`onboarding-steps.ts:13-22`). Flipping one step's `required` flag makes `score` exceed 100 or go negative, and `completedCount` becomes wrong on the exported capability statement.
**Fix:** `const requiredTotal = ONBOARDING_STEPS.filter((s) => s.required).length;`

**30. `[Medium] i18n` — `src/components/brand/logo-variants.ts:152-155`**
```ts
export const LOGO_WORDMARK: Readonly<Record<Locale, string>> = Object.freeze({
  ar: "عربكلو",
  en: "Arabclue",
});
```
Every other Arabic rendering of the brand is `"أراب كلاو"` — `seo.ts:10` (`nameAr`), the `appName` dictionary key (asserted at `i18n-completeness.test.ts:37`), and `business-profile.ts:499`. Arabic users see a different brand name in the logo than in the page title.
**Fix:** align on one transliteration (`"أراب كلاو"`) and source it from `SITE.nameAr` rather than a second literal.

**31. `[Medium] i18n` — `src/lib/marketing-copy.ts:107`**
```ts
a: { ar: "حسب المستأجر، مع عزلWorkspace. نحن نلتزم PDPL، وفريقك يتحكم بالوصول والجلسات.", ... }
```
`"عزلWorkspace"` is missing the space between the Arabic word and the Latin term, and "Workspace" is untranslated where the rest of the app uses "مساحة العمل".
**Fix:** `"مع عزل مساحة العمل"`.

**32. `[Medium] i18n-rtl` — `src/lib/i18n.ts:2544`**
```ts
    return `${action}: ${reason}`;
```
The ASCII colon is a bidi-neutral character placed between an Arabic run and a `reason` that frequently begins with or contains a Latin run — for example `account_field_error: "راجع الحقل: {{field}}"` (1413), where `{{field}}` is a Latin identifier, or `SCHEMA_MIGRATION_PENDING` (492), which interpolates an English relation name. Under the Unicode bidi algorithm the colon resolves to the surrounding paragraph direction and can render on the wrong side of the phrase.
**Fix:** wrap the interpolated run in `\u2068…\u2069` (FSI/PDI) or render the two parts as separate `<bdi>` elements; for HTML output the codebase already has `createBidiValue` in `bilingual-layout.tsx`.

**33. `[Medium] i18n` — `src/lib/i18n.ts:70, 1410, 1430, 1445`**
```ts
  copilot_proc_tokens: { ar: "{{count}} رمز", en: "{{count}} tokens" },
  account_verification_email_expiry: { ar: "ينتهي رابط التأكيد بعد {{hours}} ساعة …" },
  invitation_email_expiry: { ar: "ينتهي رابط الدعوة بعد {{days}} أيام …" },
  clause_selection_limit: { ar: "يمكن تحديد {{max}} بنداً كحد أقصى", … },
```
Arabic has six CLDR plural categories; each key hardcodes one. `"بعد 1 أيام"` (should be "يوم") and `"بعد 11 ساعة"` (should be "ساعة" in the *many* form with different agreement) are both grammatically wrong, and these strings appear in transactional emails.
**Fix:** add plural-form variants per key (`_zero`/`_one`/`_two`/`_few`/`_many`/`_other`) selected through `Intl.PluralRules("ar")`, or adopt the ICU MessageFormat support that `next-intl` — already a declared dependency — provides.

**34. `[Medium] maintainability` — repo-wide: 1,189 inline locale ternaries vs 497 `tr()` calls**
```tsx
// src/components/dashboard/views.tsx:317-318 (one of ~1,189)
        subtitle={ locale === "ar" ? "إدارة مشاريع المناقصات" : "Manage tender projects" }
```
The completeness guarantee described in §2.1 only covers the dictionary. Roughly 70% of user-facing strings live in ternaries across 88 files, invisible to `i18n-completeness.test.ts`, which is why defects 28, 30, and 31 exist and why `api/notifications/route.ts:126-127` ships `bodyAr` identical to `body`.
**Fix:** move component copy into the registry incrementally (the typed `translate()` path already exists) and add a lint rule banning Arabic-script string literals outside `src/lib/i18n.ts` and `src/lib/marketing/`.

**35. `[Medium] performance` — `src/app/api/templates/marketplace/route.ts:61` + `src/lib/marketplace-catalog-seed.ts:53-93`**
```ts
    await ensureSystemMarketplaceCatalogSeeded();
```
```ts
    for (const item of SYSTEM_TEMPLATE_CATALOG) {
      const existing = await client.templateMarketplaceEntry.findFirst({ … });
      … await client.templateMarketplaceEntry.update({ … });
```
Every marketplace list request performs 1–2 user lookups plus six sequential `findFirst` and six sequential `update` statements — about 14 round-trips for a no-op. There is no transaction either, so a mid-loop failure leaves the catalog partially seeded.
**Fix:** gate the seed behind a version marker (a `SystemSetting` row holding a catalog content hash) so it runs once per deploy, and wrap the loop in `$transaction` with `upsert` on `@@unique([workspaceId, templateKey])` instead of `findFirst` + branch.

### Low

**36. `[Low] correctness` — `src/lib/nora-ids.ts:8`**
```ts
const NORA_ID_RE = /\b((?:TP|SP|BP|IP)\d+)\b/gi;
```
Matches "SP1" (Service Pack 1), "IP4", and "TP2" from ordinary technical prose and promotes them to NORA architecture-principle identifiers. In a module whose stated purpose is to prevent invented identifiers, an over-broad pattern reintroduces the risk from the other direction.
**Fix:** require a contextual anchor (a preceding "principle"/"مبدأ"/"NORA"/"EA" token) or bound the digits (`\d{1,2}`), and validate hits against `catalogNoraIds()` before treating them as canonical.

**37. `[Low] i18n` — `src/components/patterns/query-state.tsx:40` and `confirm-dialog.tsx:22-23`**
```ts
  retryLabel = "Retry",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
```
English-only defaults on components used across a default-Arabic dashboard. `QueryState` (line 70) already threads a `locale` prop and localizes correctly at 91-93; `ErrorState` and `ConfirmDialog` do not.
**Fix:** accept `locale` and default the labels through `tr("action_retry", locale)` etc.

**38. `[Low] correctness` — `src/lib/extension-config.ts:142-152`**
```ts
        cat.labelEn.toLowerCase().includes(lower) ||
        cat.labelAr.includes(sector) ||
        cat.keywords.some((k) => lower.includes(k.toLowerCase()) || sector.includes(k))
```
Unanchored substring matching in both directions produces both false negatives ("information technology" does not contain the substring "it", so it never maps to the `IT` category) and false positives (a two-character sector string can match unrelated labels). Category assignment drives which tenders the extension surfaces to the user.
**Fix:** normalize and match on whole tokens, and make the alias table the primary mechanism rather than the fallback.

**39. `[Low] security` — `src/lib/extension-pack.ts:15-22, 150-158`**
```ts
  const skipDirs = new Set(["node_modules", "src", ".git"]);
  const skipFiles = new Set(["bun.lock", "package-lock.json", "tsconfig.json", "esbuild.config.mjs"]);
```
`walk` uses a denylist, and `packExtensionZipToPublic` writes the result to `public/downloads/arabclue-agent.zip`, which is publicly served. Any file added to `extensions/arabclue-agent/` that is not on the two skip lists — a `.env`, a `.pem`, a debug dump — is packaged and published.
**Fix:** invert to an allowlist (`manifest.json`, `assets/**`, `background/**`, `content/**`, `sidepanel/**`, `shared/**`, and only `.js`/`.json`/`.css`/`.html`/image extensions), and reject dotfiles outright.

**40. `[Low] correctness` — `src/lib/extension-pack.ts:117-126`**
```ts
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
```
The end-of-central-directory record uses 16-bit entry counts and 32-bit sizes with no ZIP64 fallback, so more than 65,535 files or a total above 4 GiB produces a silently corrupt archive. The central-directory records also write a zero `externalFileAttributes` and DOS timestamp, so extracted files carry no mode bits and a 1980 mtime.
**Fix:** throw when `entries.length > 0xFFFF` or `offset > 0xFFFFFFFF`, and set a plausible DOS date and `0o644` external attributes.

**41. `[Low] correctness` — `src/lib/marketplace-usage.ts:69-76`**
```ts
    const entry = await db.templateMarketplaceEntry.findUnique({ where: { id: input.entryId }, select: { usageCount: true } });
    return { firstApplication: false, usageCount: entry?.usageCount ?? 0 };
```
On the unique-violation path, a deleted or non-existent entry silently reports `usageCount: 0` and `firstApplication: false`, which is indistinguishable from a legitimate repeat application against an entry with no uses. The doc comment (line 40) says the function "throws when the entry does not exist", which this branch does not do.
**Fix:** throw the documented error when `entry` is `null`.

**42. `[Low] correctness` — `src/lib/copilot-processing.ts:257-265`**
```ts
export function advanceTerminalPhase(phase, heldMs, holdMs = COPILOT_COMPLETED_HOLD_MS) {
  if (phase === "finalizing" && heldMs >= 400) return "completed";
```
The `finalizing → completed` branch ignores the `holdMs` parameter and hardcodes `400`, so a caller passing a custom hold gets it applied to only one of the two transitions.
**Fix:** introduce a second parameter (`finalizeHoldMs = 400`) or derive it from `holdMs`.

**43. `[Low] i18n` — `src/lib/template-marketplace-catalog.ts:242`**
```ts
      rows.sort((a, b) => a.name.en.localeCompare(b.name.en));
```
Sorting by name always uses the English name and the default collator, so an Arabic user sorting alphabetically gets English ordering.
**Fix:** take a `locale` argument and use `a.name[locale].localeCompare(b.name[locale], locale === "ar" ? "ar" : "en")`.

**44. `[Low] maintainability` — dead exports**
`src/lib/marketing-copy.ts` (179 LOC) has 0 non-test importers; `filterSystemTemplateCatalog` (`template-marketplace-catalog.ts:215`) has 0 non-test importers; `SLA_RULES` (`constants.ts:250`) has 0 importers; `src/lib/requirements.ts` has 0 static importers (reached only through two dynamic `await import("../requirements")` calls in `agents/orchestrator.ts:336, 808`, which defeats static analysis and tree-shaking).
**Fix:** delete the first three; convert the dynamic imports in the orchestrator to static ones unless they exist to break a specific cycle (in which case document why).

**45. `[Low] maintainability` — `package.json:109`**
```json
    "next-intl": "^4.13.4",
```
`next-intl` is a declared production dependency with zero references anywhere in the repository outside this line (verified by a repo-wide search excluding `node_modules` and lockfiles). The project's i18n is entirely hand-rolled in `i18n.ts`. The dependency inflates install time and misleads any reader who assumes a standard i18n framework is in play — including whoever wrote the stack description.
**Fix:** remove it from `package.json`, or adopt it and retire the hand-rolled registry; keeping both is the worst option.

---

## 5. Needs verification (suspicions, not confirmed)

1. **`.next` client bundle size from `i18n.ts`.** I did not build, so I cannot state the shipped byte cost of the 2,560-line dual-locale dictionary. `tr()` is called from `"use client"` components, which strongly implies the whole registry is in the client graph, but confirming needs `bun run build` + bundle analysis.
2. **Whether `estimateProcessingProgress`'s `log10` curve tracks real completion.** It is deterministic and monotone, so it is not fake in the `Math.random()` sense, but whether a user reading "68%" is being told something true requires telemetry against actual turn durations.
3. **`agents/compliance.ts` score derivation.** I read its call sites into `procurement-rules.ts` but not the file in full (out of scope). Whether `complianceScore` can reach a high value on rows that never had evidence attached needs a direct read of that module.
4. **`Workspace.crNumber` / `vatNumber` provenance.** They are free-text in the schema; whether any admin or bootstrap path validates them before persistence was not traced beyond `validation.ts:248`.
5. **Whether the fabricated marketplace metrics have already been written to the shared Neon database.** `ensureSystemMarketplaceCatalogSeeded` only sets `rating`/`ratingCount`/`downloadCount`/`usageCount` on the `create` branch, so an existing deployment may or may not already hold them. Per the repository rules I did not query the database to check.
6. **Real-world impact of the 400-chunk search window.** Depends on production chunk volume per workspace, which I did not query.
7. **`legal-content.ts` (481 LOC) legal accuracy.** I verified its bilingual structure and that both locales are populated; I am not qualified to assess whether the PDPL/DPA text is legally adequate.
