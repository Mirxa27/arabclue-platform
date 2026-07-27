# Implementation Plan: Platform Completion

## Overview

Complete the existing Next.js 16 App Router modular monolith in place. The plan sequences additive schema and shared request boundaries before independent domain work, then wires bilingual UI surfaces, cross-cutting analytics and notifications, integrity policies, and final validation. Extend the existing partial services and routes identified in `design.md`; do not create parallel replacement implementations or leave unreachable code.

## Tasks

- [x] 1. Establish migration-safe shared foundations
  - [x] 1.1 Complete the additive Prisma model and SQL baseline
    - Extend `prisma/schema.prisma` with the token digest, analytics event-key/duration, template-version, generated-contract snapshot, recurring checkout/profile, marketplace application, knowledge decision, notification outbox, and query-index fields specified in the design.
    - Rewrite `prisma/migrations/20260726000000_platform_completion/migration.sql` so every statement is additive; remove the existing constraint drop and make every new column nullable or defaulted.
    - Add normalized-email, version, idempotency, active-profile, cursor, stale-presence, and delivery uniqueness/index protections without renaming, narrowing, or deleting existing schema objects.
    - Validate schema and SQL statically only; do not run Prisma migrate, db push, reset, or any direct database mutation.
    - _Requirements: 1.1, 1.4, 2.2, 2.5, 3.1, 4.1, 4.2, 6.1, 6.2, 6.7, 7.1, 9.1, 9.11, 10.2, 11.2, 11.3, 15.7, 16.1, 17.4, 17.5_

  - [x] 1.2 Implement the migration registry, readiness probe, and deployment-safety synchronization
    - Create `src/lib/migration-registry.ts` as the ordered source of migration identifiers, affected capabilities, and reverse action, including all committed migrations and the five named legacy-unapplied migrations.
    - Replace guessed-table readiness logic with a read-only, five-second-bounded `_prisma_migrations` comparison that reports every missing migration separately from liveness and never issues DDL.
    - Extend the deployment-safety scanner to reject migrate-development/apply, db push, and reset commands in build, development, and start scripts.
    - Add executable generation/validation code that keeps the migration table in `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` synchronized with the registry; do not create a hand-maintained second registry.
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.8, 16.9, 19.8_

  - [x] 1.3 Centralize API failures, tenant authorization, and missing-schema handling
    - Extend `src/lib/api-controller.ts`, workspace/auth wrappers, and `src/lib/prisma-missing-table.ts` into one bilingual `ApiFailure` mapper with stable codes and redaction.
    - Map missing-relation errors to HTTP 503 `SCHEMA_MIGRATION_PENDING` with the relation name, and remove route-local 501, empty-success, degraded, or synthetic catalog fallbacks.
    - Require public-account routes to use the validation mapper and tenant routes to resolve session, workspace, role, and resource ownership before reads or writes.
    - Preserve generic bilingual 500 responses for unknown failures without leaking SQL, provider payloads, credentials, tokens, documents, or commercial values.
    - _Requirements: 16.2, 16.7, 18.4, 18.9, 19.2, 19.4, 19.5, 19.9, 19.10_

  - [x] 1.4 Add reusable security, time, hashing, cursor, and provider-boundary primitives
    - Implement per-token salted/versioned digests with constant-time verification, injectable cryptographic randomness, and a bounded legacy unsalted reader.
    - Add injectable UTC clocks, abortable provider deadlines, canonical JSON/hash helpers, and strict versioned base64url keyset cursors that include every sort key and resource scope.
    - Ensure runtime identifiers use `crypto.randomUUID()` or persistence defaults and remove `Math.random()` from production identifier paths.
    - Keep provider and persistence adapters injectable so unit/property tests make no network calls or shared-database mutations.
    - _Requirements: 1.4, 1.6, 2.2, 2.5, 3.1, 4.1, 4.2, 6.2, 6.3, 7.1, 7.2, 9.1, 10.8, 11.6, 13.1, 13.3, 17.5, 19.3_

  - [x] 1.5 Define typed localization and error-message contracts for every completion surface
    - Extend `src/lib/i18n.ts` and its typed dynamic-key manifest with non-empty Arabic/English keys for account, invitation, analytics, clauses, templates, contracts, XLSX, billing, reconciliation, knowledge, comments, history, routing, marketplace, readiness, notifications, and integrity errors.
    - Give both locales identical named interpolation placeholders and action-specific error text; retain Arabic-script requirements except for approved shared identifiers and technical terms.
    - Make feature components consume registered keys rather than adding user-facing literals later.
    - _Requirements: 1.10, 2.10, 4.9, 5.9, 6.10, 7.6, 9.8, 10.6, 11.8, 11.11, 12.10, 12.12, 13.6, 14.4, 14.5, 14.7, 14.8, 15.1, 17.7, 17.8, 17.11, 18.1, 18.2, 18.4, 18.5, 18.9_

  - [x] 1.6 Configure safe completion-test infrastructure
    - Add or retain `fast-check` as an exact devDependency without a caret/tilde, update `bun.lock`, and provide shared generators with at least 100 cases per randomized property.
    - Add a test database guard that fails closed unless `TEST_DATABASE_URL` points to an explicitly isolated database identity; reject the shared/production Neon identity.
    - Configure provider mocks, deterministic clocks/randomness, and one-shot test scripts; no watcher, real email, real charge, or schema mutation is permitted.
    - _Requirements: 9.9, 10.5, 16.5, 19.3, 19.8_

  - [x] 1.7 Write the static property test for additive migration SQL
    - **Property 32: Migration SQL is additive**
    - Add `property-32-migration-sql.test.ts` to parse every migration introduced by this specification and reject drops, renames, resets, pushes, type narrowing, and non-null columns without defaults; also scan build/dev/start scripts.
    - Tag the test `Feature: platform-completion, Property 32: Migration SQL is additive`; use deterministic static cases rather than randomized database execution.
    - **Validates: Requirements 16.1, 16.5, 16.9**

- [x] Checkpoint A — Verify the foundation before domain implementation
  - Platform-completion foundation tests pass (27/27); core API boundary, migration registry, and Property 32 verified.

- [ ] 2. Complete account creation, recovery, and workspace invitations
  - [x] 2.1 Implement transactional registration and email verification
    - Complete the registration/verification domain service with exact field bounds, reserved-identity-before-uniqueness ordering, normalized uniqueness, rolling rate limits, and serializable user/workspace/writer-membership/token creation.
    - Issue one 24-hour salted verification token, consume it once, keep raw tokens out of persistence/API/logs, and map configured, unconfigured, failure, and 30-second timeout delivery branches to the required statuses and audits after commit.
    - Return the exact persisted state and stable codes without rolling back account records when post-commit email fails.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8, 1.9, 1.11, 1.12, 1.13_

  - [x] 2.2 Enforce unverified-session gating and expose account routes safely
    - Complete `/api/auth/register`, `/verify-email`, and public account pages with strict schemas and the shared bilingual response contract.
    - Update `src/proxy.ts`, NextAuth callbacks, and server page guards so unverified users reach only verification, sign-out, and the minimum session-refresh path; deny APIs with 403 and redirect pages before protected rendering/data fetches.
    - Refresh the current NextAuth session claim after successful verification and preserve anti-token-leak logging.
    - _Requirements: 1.5, 1.6, 1.7, 1.10, 18.3, 18.4, 19.4_

  - [ ] 2.3 Implement credential-recovery request and reset flows
    - Implement normalized anti-enumeration recovery requests, active/verified eligibility, one 60-minute salted token, invalidation of earlier tokens, email-locale selection, and exact configured/unconfigured/rate-limit behavior.
    - Place password replacement, token consumption, all session revocations, and `PASSWORD_RESET` audit creation in one serializable transaction; reject bad token/password paths without consuming the token or changing sessions.
    - Complete strict public routes and forms while excluding raw tokens from API, logs, and audits.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_


  - [x] 2.4 Make invitation creation, listing, revocation, and acceptance atomic
    - Correct invitation roles and input bounds; create/revoke/replace pending invitations with seven-day salted tokens, bounded keyset pages, delivery state, owner/admin authorization, and seat-limit checks scoped to `Tenant_Context`.
    - Re-read token, email, user, membership, role, and seat state inside serializable acceptance transactions for both account-creation and authenticated-existing-user paths.
    - Consume already-member tokens without changing roles, preserve pending tokens on email mismatch/invalid acceptance data, and return exact stable error codes without exposing token material.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [ ] 2.5 Build bilingual account, recovery, verification, and invitation surfaces
    - Extend existing public/application components to submit the real routes, render field-path errors and delivery states, and provide pending-invitation list/revoke/accept controls.
    - Consume the predeclared localization keys, use logical CSS properties, preserve server-first Arabic/RTL behavior, and avoid embedding token or configuration details in the UI.
    - Keep account and invitation redirects canonical and accessible at narrow/mobile widths.
    - _Requirements: 1.5, 1.10, 2.10, 3.2, 3.3, 3.7, 18.3, 18.5, 18.6_

  - [ ] 2.6 Add account, recovery, and invitation example/integration tests
    - Cover transaction rollback at every write boundary, exact status/code contracts, reserved/duplicate ordering, timeout branches, rate limits, session revocation, unverified proxy behavior, seat races, pagination, email mismatch, and localized forms.
    - Use mocked persistence/providers for routine tests and the guarded isolated database only for normalized uniqueness and serializable conflict behavior.
    - _Requirements: 1.1-1.13, 2.1-2.10, 3.1-3.11_

  - [x] 2.7 Write the property test for side-effect-free invalid registration
    - **Property 17: Invalid registration is side-effect free**
    - Generate duplicate-normalized, reserved, and out-of-bounds registration payloads and assert the specified code plus unchanged user/workspace/member/token repositories.
    - Tag the test `Feature: platform-completion, Property 17: Invalid registration is side-effect free` and run at least 100 generated cases.
    - **Validates: Requirements 1.2, 1.3, 1.11**

  - [ ] 2.8 Write the cross-token single-use property test
    - **Property 18: Consumed tokens are single-use**
    - Generate verification, recovery, and invitation tokens; consume each once, resubmit it, and assert the applicable invalid result with no protected-record mutation.
    - Tag the test `Feature: platform-completion, Property 18: Consumed tokens are single-use` and run at least 100 generated cases.
    - **Validates: Requirements 1.6, 1.7, 2.3, 2.4, 3.9**

- [ ] 3. Complete real activity analytics collection and reporting
  - [x] 3.1 Enforce the closed analytics vocabulary and minimized event constructor
    - Make `ANALYTICS_EVENT_TYPES` the sole Zod/type source for writers, aggregation, and UI labels.
    - Complete typed event-specific constructors that resolve one workspace/actor, accept only identifiers/counts/nonnegative integer durations, derive stable event keys, and exclude document/commercial payloads.
    - Implement one bounded post-commit append attempt with unique-key idempotence, no retry, and origin-response preservation on failure.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.10, 4.12_

  - [ ] 3.2 Wire analytics to every committed proposal, agent, and document origin
    - Extend existing proposal create/edit/review/export, agent transition, document upload/version, and version-revert code paths to call the typed collector after successful commit.
    - Derive event keys from persisted mutation/revision/transition identifiers, compute terminal duration from stored start time, and never coalesce distinct committed mutations.
    - Preserve each origin response if analytics fails and make successful events queryable within five seconds.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.12_

  - [ ] 3.3 Implement tenant-scoped analytics aggregation and range validation
    - Complete pure reference aggregation plus scoped queries for a maximum 366-day `[start,end)` range, all vocabulary counts, adjacent equal-period differences, and earliest-start/earliest-terminal whole-millisecond medians.
    - Return explicit empty-range semantics with zero counts/differences and null medians; reject missing, malformed, reversed, or oversized ranges before querying.
    - Route missing schema through the shared 503 guard instead of returning synthesized successful metrics.
    - _Requirements: 4.7, 4.8, 4.10, 4.11, 16.7_

  - [ ] 3.4 Complete the bilingual analytics dashboard
    - Bind the dashboard to the real API contract and render every vocabulary metric, axis/legend/unit, previous-period difference, unavailable median, loading/error, and empty state from localization keys.
    - Preserve AR/EN and RTL/LTR parity without random or fixture metrics.
    - _Requirements: 4.8, 4.9, 18.5, 19.1, 19.3_

  - [ ]* 3.5 Add analytics origin, route, and aggregation tests
    - Test every required mutation/transition origin, one-attempt failure behavior, five-second visibility, strict vocabulary/range codes, empty ranges, tenant scoping, duration pairing, and previous-period boundaries with deterministic clocks.
    - _Requirements: 4.1-4.12_

  - [ ]* 3.6 Write the analytics provenance/minimization property test
    - **Property 15: Analytics event provenance and minimization**
    - Generate request/background origins and payload candidates; assert uniquely resolved workspace provenance and absence of monetary/document-body fields for every accepted event.
    - Tag the test `Feature: platform-completion, Property 15: Analytics event provenance and minimization` and run at least 100 generated cases.
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 3.7 Write the analytics reference-model property test
    - **Property 16: Analytics aggregates match the reference model**
    - Generate tenant-separated event sets and valid date ranges; compare every count, median, difference, and empty indicator against a simple in-memory reference implementation.
    - Tag the test `Feature: platform-completion, Property 16: Analytics aggregates match the reference model` and run at least 100 generated cases.
    - **Validates: Requirements 4.7, 4.8**

- [ ] 4. Complete the standard clause library
  - [x] 4.1 Implement deterministic catalog seeding and canonical drift repair
    - Extend `src/lib/clause-library.ts` to traverse the frozen catalog deterministically, map applicability to mandatory status, compute canonical hashes, upsert by catalog key, and update only drifted catalog fields/version/safety flags.
    - Preserve every workspace custom clause exactly and replace runtime random IDs with cryptographic identifiers.
    - _Requirements: 5.1, 5.2, 5.11, 5.12, 19.3_

  - [ ] 4.2 Complete clause list, custom-create, detail, and selection APIs
    - Enforce category/mandatory filters, deterministic pages of at most 50, active catalog plus workspace custom visibility, writer authorization, and tenant-safe not-found behavior.
    - Validate bilingual lengths, category, selection count, HTML/XML/template syntax, and bidi controls; add mandatory template-family clauses, deduplicate, and order deterministically.
    - Store trimmed bilingual custom text and fixed legal-safety flags without deriving monetary values.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.10, 5.13, 19.4, 19.5, 19.7_

  - [ ] 4.3 Build the bilingual clause browser and insertion flow
    - Connect category/mandatory filters, legal-review/counsel markers, AR/EN side-by-side text, custom-clause creation, and bilingual insertion into the active contract draft.
    - Use only persisted API data and localization keys with logical RTL/LTR styling.
    - _Requirements: 5.4, 5.9, 18.5, 18.6, 19.1_

  - [ ]* 4.4 Add clause service, route, and UI tests
    - Cover drift/no-drift seeding, custom-row preservation, filters/cursors, mandatory insertion, unsafe/missing/oversized text, tenant isolation, exact ordering, and bilingual browser behavior.
    - _Requirements: 5.1-5.13_

  - [ ]* 4.5 Write the clause-seeding idempotence property test
    - **Property 5: Clause seeding is idempotent**
    - Generate valid starting catalog/custom sets and assert two seed runs equal one seed run while every custom row remains unchanged.
    - Tag the test `Feature: platform-completion, Property 5: Clause seeding is idempotent` and run at least 100 generated cases.
    - **Validates: Requirements 5.2, 5.12**

  - [ ]* 4.6 Write the clause canonical-hash property test
    - **Property 6: Clause canonical hash round trip**
    - Generate catalog clauses within declared bounds, seed/read each row, recompute the canonical hash, and assert equality with the stored hash.
    - Tag the test `Feature: platform-completion, Property 6: Clause canonical hash round trip` and run at least 100 generated cases.
    - **Validates: Requirements 5.1, 5.2**

- [ ] 5. Complete template authoring and contract revision history
  - [x] 5.1 Define canonical template schemas and pure validation
    - Implement strict TypeScript/Zod models for keys, bilingual titles/sections, ordered nodes, text/number/date/single-choice variables, and clause bindings with all stated bounds.
    - Canonically serialize by sorted object keys while preserving section/array order; reject reserved/catalog keys, missing translations, undeclared references, and unreferenced declarations.
    - Force legal-review, counsel-required, and non-executable values internally and expose no money variable type.
    - _Requirements: 6.1, 6.5, 6.6, 6.7, 6.9, 6.12, 6.13, 19.4, 19.7_

  - [ ] 5.2 Implement atomic template create, update, and retirement commands
    - Extend existing template persistence instead of duplicating it; create template/version 1 atomically, apply same-hash no-op updates, create exactly current+1 for changed hashes, and map unique races to `TEMPLATE_VERSION_CONFLICT`.
    - Retire without deleting versions/contracts, preserve all immutable rows, and scope every lock/read/write to `Tenant_Context` and writer role.
    - _Requirements: 6.1, 6.2, 6.7, 6.8, 6.11, 6.13, 6.14_

  - [ ] 5.3 Complete template CRUD, version-list, version-detail, and preview routes
    - Add strict route schemas, tenant-safe composite lookups, deterministic descending keyset pages capped at 50, exact persisted version detail, retirement exclusion, and stable error contracts.
    - Reuse the existing preview renderer and keep content from different versions isolated.
    - _Requirements: 6.3, 6.4, 6.8, 6.10, 6.11, 6.12_

  - [ ] 5.4 Build the workspace template editor and history UI
    - Connect ordered bilingual section editing, allowed variable declarations, clause binding, save/conflict/retire behavior, immutable history, and accepted-edit preview refresh within three seconds.
    - Render safety badges and AR/EN directions from localization keys; do not expose executable/legal overrides.
    - _Requirements: 6.3, 6.4, 6.7, 6.8, 6.10, 18.5, 18.6_

  - [ ] 5.5 Persist complete immutable generated-contract revisions
    - Extend contract mutations to hash variable values, selected clause IDs, template version, and bilingual document specification and append next revisions in the same transaction only when the hash changes.
    - Persist full frozen inputs, author/time/hash, template reference, and legal-safety fields; retain all prior revisions.
    - _Requirements: 7.1, 7.5, 7.6_

  - [ ] 5.6 Complete contract revision list, detail, integrity, and comparison APIs
    - Add capped descending keyset lists, exact revision reads, recomputed-hash integrity checks, empty-history semantics, and tenant-safe not-found behavior.
    - Implement article-level AR/EN diffs with added/removed/modified/unchanged classifications; self-comparison returns unchanged entries and performs no monetary arithmetic.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9_

  - [ ] 5.7 Build the bilingual contract revision history and comparison surface
    - Connect list/load-more/detail/compare controls to persisted revisions, display required safety badges, and render Arabic/English diffs side by side with correct direction.
    - _Requirements: 7.2, 7.3, 7.6, 7.8, 18.5, 18.6_

  - [ ]* 5.8 Add template and contract transaction/route/UI tests
    - Cover every validation code, same-hash updates, conflict races, retirement retention, preview timing, pagination, integrity failure, self/dual comparison, no-history behavior, safety badges, and tenant isolation.
    - _Requirements: 6.1-6.14, 7.1-7.9_

  - [ ]* 5.9 Write the template variable-set property test
    - **Property 7: Template variables equal template references**
    - Generate accepted bilingual templates and assert declared variable names equal references across all AR/EN section nodes.
    - Tag the test `Feature: platform-completion, Property 7: Template variables equal template references` and run at least 100 generated cases.
    - **Validates: Requirements 6.5, 6.6**

  - [ ]* 5.10 Write the template legal-safety invariant property test
    - **Property 8: Template legal-safety invariants**
    - Generate caller inputs including attempted overrides and assert every persisted template/version is unreviewed, counsel-required, and non-executable.
    - Tag the test `Feature: platform-completion, Property 8: Template legal-safety invariants` and run at least 100 generated cases.
    - **Validates: Requirements 6.7**

  - [ ]* 5.11 Write the monotonic template-history property test
    - **Property 9: Template history is monotonic**
    - Generate valid create/update/same-hash/retire command sequences and assert version count never decreases and all prior versions stay readable.
    - Tag the test `Feature: platform-completion, Property 9: Template history is monotonic` and run at least 100 generated sequences.
    - **Validates: Requirements 6.2, 6.8**

  - [ ]* 5.12 Write the contract self-comparison property test
    - **Property 10: Contract self-comparison is unchanged**
    - Generate integrity-valid revisions and assert self-comparison contains only unchanged AR/EN articles and no monetary difference field.
    - Tag the test `Feature: platform-completion, Property 10: Contract self-comparison is unchanged` and run at least 100 generated cases.
    - **Validates: Requirements 7.3, 7.5**

  - [ ]* 5.13 Write the shared keyset traversal property test
    - **Property 19: Keyset traversal has no duplicates or omissions**
    - Generate template-version, contract-revision, knowledge-queue, proposal-version, and document-version datasets; follow valid cursors and compare exact ordered identity sets.
    - Tag the test `Feature: platform-completion, Property 19: Keyset traversal has no duplicates or omissions` and run at least 100 generated datasets per adapter.
    - **Validates: Requirements 6.3, 7.2, 11.6, 13.1, 13.3**

  - [ ]* 5.14 Write the template version-operation property test
    - **Property 25: Template version operation is monotonic and idempotent**
    - Generate current/submitted canonical content pairs; assert changed hashes append exactly current+1 and equal hashes append no row and return current unchanged.
    - Tag the test `Feature: platform-completion, Property 25: Template version operation is monotonic and idempotent` and run at least 100 generated cases.
    - **Validates: Requirements 6.2, 6.4**

  - [ ]* 5.15 Write the concurrent-template-update property test
    - **Property 26: Concurrent template updates have one winner**
    - Use the guarded isolated PostgreSQL harness or a transaction-faithful repository to generate competing accepted updates; assert one persisted next version and one deterministic conflict response.
    - Tag the test `Feature: platform-completion, Property 26: Concurrent template updates have one winner` and run at least 100 generated pairs where cost permits.
    - **Validates: Requirements 6.14**

- [ ] Checkpoint B — Verify content authoring and history foundations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement validation-gated structured XLSX export
  - [x] 6.1 Build a pure workbook-plan compiler
    - Convert validated compiled-layout blocks into an ordered manifest-first workbook plan with one representable-sheet item per TABLE/KPI/EVIDENCE_REGISTER/COMMERCIAL_HANDOFF block and one manifest row per narrative/bullet/diagram block.
    - Allocate sanitized deterministic unique names from block keys within 31 characters, align Arabic row 1 and English row 2 labels, preserve literal value types, and map nulls to bilingual not-available markers.
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.7, 8.10, 8.11_

  - [ ] 6.2 Implement the ExcelJS serializer and XLSX download response
    - Serialize the plan with manifest worksheet first, locale direction on every sheet, no formulas, and literal commercial/KPI strings exactly as stored.
    - Wire `format=xlsx` into the existing download route and preserve authoritative-engine, revision, preset, and snapshot-hash headers matching the manifest.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.10_

  - [ ] 6.3 Apply the existing validation and approval gate before workbook creation
    - Run channel validation, approval-chain checks, bilingual label checks, structured-snapshot checks, pricing-language checks, unresolved-placeholder checks, and regulatory verification before constructing any worksheet or bytes.
    - Return existing stable bilingual diagnostics with block/field/channel and emit no artifact on failure.
    - _Requirements: 8.6, 8.9, 8.11, 8.12, 18.10, 19.6, 19.7_

  - [ ]* 6.4 Add XLSX planner, byte round-trip, route, and validation tests
    - Read serialized bytes back with ExcelJS and assert sheet order/names/directions, two header rows, manifest metadata/hash, non-representable rows, literal cell types, null markers, headers, and zero bytes on every blocked path.
    - _Requirements: 8.1-8.12_

  - [ ]* 6.5 Write the workbook completeness property test
    - **Property 11: XLSX block/manifest completeness**
    - Generate valid snapshots/layouts and assert manifest-first order, exactly one representable worksheet per block in layout order, and exactly one manifest record per non-representable block.
    - Tag the test `Feature: platform-completion, Property 11: XLSX block/manifest completeness` and run at least 100 generated cases.
    - **Validates: Requirements 8.1, 8.4, 8.5**

  - [ ]* 6.6 Write the no-monetary-formulas property test
    - **Property 12: XLSX contains no monetary formulas**
    - Generate commercial/KPI values and inspect every serialized cell to assert literal/not-available values and absence of formula-producing monetary cells.
    - Tag the test `Feature: platform-completion, Property 12: XLSX contains no monetary formulas` and run at least 100 generated workbooks.
    - **Validates: Requirements 8.7, 8.10**

  - [ ]* 6.7 Write the cross-export validation-gate property test
    - **Property 24: Validation gate blocks every invalid export**
    - Generate pricing language, unresolved placeholders, and unverified regulatory identifiers across each export channel; assert the required diagnostic and zero artifact bytes.
    - Tag the test `Feature: platform-completion, Property 24: Validation gate blocks every invalid export` and run at least 100 generated cases.
    - **Validates: Requirements 8.9, 19.6**

  - [ ]* 6.8 Write the explicit-XLSX-null property test
    - **Property 27: XLSX nulls are explicit**
    - Generate null commercial amount/currency/KPI positions and assert each serialized cell contains the bilingual marker and is neither empty nor zero.
    - Tag the test `Feature: platform-completion, Property 27: XLSX nulls are explicit` and run at least 100 generated cases.
    - **Validates: Requirements 8.10**

- [ ] 7. Complete recurring billing and operator reconciliation
  - [x] 7.1 Implement exact-value recurring state and persistence rules
    - Scope recurring profiles/intents to workspace subscription, copy stored plan cycle amount/currency and 30/365-day interval without accepting a client amount, and model allowed DRAFT/ACTIVE/SUSPENDED/CANCELLED transitions.
    - Use exact decimal/string comparison only for provider validation; introduce no price, total, refund, proration, margin, or commercial calculation.
    - Enforce one draft/active profile per subscription and stable checkout/webhook idempotency through repository constraints and commands.
    - _Requirements: 9.1, 9.3, 9.5, 9.6, 9.7, 9.10, 9.11, 19.7_

  - [ ] 7.2 Complete recurring checkout and provider finalization
    - Validate writer role and monthly/yearly plan, reserve an idempotent checkout intent, call the real MyFatoorah recurring adapter with retry count 3 and a 30-second deadline, then finalize exactly one draft profile after rechecking state.
    - Return configured/unconfigured/rejected/missing-ID/timeout codes and bilingual single-cycle action without profile/billing/subscription mutation on failure.
    - _Requirements: 9.1, 9.2, 9.9, 9.11, 19.2_

  - [ ] 7.3 Harden recurring webhook verification and idempotent state updates
    - Reuse canonical signature verification, fingerprint deduplication, exact currency, 0.01 amount tolerance, profile state, and tenant/subscription checks before mutation.
    - In one transaction append one billing record and extend from the later stored end/charge time on success, or mark past due and store a bounded failure reason/timestamp on failure; record failed verification with no billing/subscription side effect.
    - _Requirements: 9.3, 9.4, 9.7, 9.10, 9.12_

  - [ ] 7.4 Implement cancel and resume commands and routes
    - Resolve tenant/writer before profile reads, reject invalid local states, call provider with a 30-second deadline outside the database transaction, recheck state before finalization, and change local state only after provider success.
    - Derive next-charge date solely from stored latest charge/creation timestamp plus stored interval and calculate no refund or proration.
    - _Requirements: 9.5, 9.6, 9.13_

  - [ ] 7.5 Build the bilingual recurring-billing console
    - Display the workspace profile's stored interval, exact amount/currency text, derived next date, state, valid-state actions, provider-unavailable/single-cycle option, and empty state from real APIs and localization keys.
    - _Requirements: 9.2, 9.8, 9.9, 18.5, 18.6, 19.1_

  - [ ] 7.6 Complete reconciliation report/apply services and routes
    - Restrict to administrator/super-administrator; keyset-page pending checkouts older than five minutes (default 50, max 200), query provider with ten-second per-item deadlines and bounded concurrency, and continue after item errors.
    - Apply each result in a serializable, conditionally pending transaction: captured/matching writes paid+billing+audit, mismatch writes failed+critical audit, other terminal writes failed+audit, unresolved writes nothing, and repeat returns `RECONCILE_ALREADY_APPLIED`.
    - Return stored monetary literals and counts only; compute no monetary total or difference.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8, 10.9, 19.7_

  - [ ] 7.7 Build the admin reconciliation UI
    - Make the existing admin billing panel call report/apply APIs, render required stored columns and run counts, preserve unresolved items, update rows after apply, and localize every label/state/error in AR/EN with RTL parity.
    - _Requirements: 10.1, 10.6, 10.7, 10.8, 10.9, 18.5, 18.6, 19.11_

  - [ ]* 7.8 Add recurring and reconciliation state-machine/integration tests
    - Cover configuration, timeout, provider rejection, state conflicts, duplicate fingerprints, amount/currency mismatch, later-date extension, no-proration behavior, report selection/order/bounds, item-error continuation, mismatch/terminal/unresolved applies, admin gates, and rollback.
    - Use provider mocks and guarded isolated database semantics; never contact MyFatoorah or mutate shared Neon.
    - _Requirements: 9.1-9.13, 10.1-10.9_

  - [ ]* 7.9 Write the recurring-webhook idempotence property test
    - **Property 13: Recurring webhook idempotence**
    - Generate verified successful event/repetition sequences and assert exactly one billing record and one period extension.
    - Tag the test `Feature: platform-completion, Property 13: Recurring webhook idempotence` and run at least 100 generated sequences.
    - **Validates: Requirements 9.3, 9.7**

  - [ ]* 7.10 Write the reconciliation-idempotence property test
    - **Property 14: Reconciliation idempotence**
    - Generate pending captured/matching checkouts and repeated apply sequences; assert one state change, at most one billing row, and deterministic repeat rejection.
    - Tag the test `Feature: platform-completion, Property 14: Reconciliation idempotence` and run at least 100 generated cases.
    - **Validates: Requirements 10.2, 10.3**

  - [ ]* 7.11 Write the current-recurring-profile property test
    - **Property 28: One current recurring profile per subscription**
    - Generate checkout sequences across subscription states and assert at most one DRAFT/ACTIVE profile plus zero provider calls/writes when one already exists.
    - Tag the test `Feature: platform-completion, Property 28: One current recurring profile per subscription` and run at least 100 generated sequences.
    - **Validates: Requirements 9.1, 9.11**

  - [ ]* 7.12 Write the invalid-recurring-webhook property test
    - **Property 29: Invalid recurring webhooks are side-effect free**
    - Generate invalid signatures, out-of-tolerance amounts, and currency mismatches; assert unchanged subscription, no billing row, and failed-verification disposition.
    - Tag the test `Feature: platform-completion, Property 29: Invalid recurring webhooks are side-effect free` and run at least 100 generated cases.
    - **Validates: Requirements 9.10, 9.12**

- [ ] 8. Complete knowledge approval and collaboration lifecycle
  - [x] 8.1 Implement normalized knowledge projections, merged ordering, and keyset pages
    - Map Certificate, PastProject, MethodologyAsset, ContentLibraryItem, and StaffMember to one queue row, scoped to tenant and pending state.
    - Merge/sort by submitted timestamp descending then record type/id ascending, expose default 25/max 50 pages, strict composite cursors, independent total, and explicit expiry/evidence markers.
    - _Requirements: 11.1, 11.6, 11.7_

  - [ ] 8.2 Implement first-decision-wins knowledge commands
    - Resolve concrete model adapters and owner/admin authorization, conditionally update only pending records in serializable transactions, and return recorded decision metadata on conflicts.
    - Approval binds the exact current document version/checksum or fails atomically; rejection validates/stores trimmed 1–1000 character AR/EN reasons.
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.7, 11.9, 11.10_

  - [ ] 8.3 Build the approver-reachable knowledge queue
    - Connect queue/count, load-more, approve evidence selection, bilingual reject dialog, immediate query invalidation, and polling no slower than five seconds while open.
    - Render total, markers, columns, actions, conflict state, and empty state from localization keys with RTL parity.
    - _Requirements: 11.1, 11.8, 11.11, 18.5, 18.6, 19.11_

  - [x] 8.4 Implement comment amendment and reply-preserving deletion
    - Add strict tenant-scoped PATCH/DELETE handlers; permit edits only by author on unresolved/non-withdrawn comments and preserve immutable fields/replies.
    - Hard-delete leaf comments or withdraw/empty/clear mentions on parents while retaining descendants; place mutation and `COMMENT_DELETE` audit in one transaction and honor owner/admin override only for deletion.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10, 12.11_

  - [ ] 8.5 Complete edited/withdrawn comment UI behavior
    - Wire edit/delete controls and confirmations to real routes; preserve reply trees and render edited/withdrawn/timestamp/error indicators from localization keys in AR/EN.
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.12, 18.5, 18.6_

  - [ ] 8.6 Replace process-local presence with tenant-scoped durable SSE polling
    - Make `ProposalPresence` the source of truth; authenticate/authorize before subscription/heartbeat, rate heartbeats to 30 seconds, prune rows older than 60 seconds, and poll at most every three seconds.
    - Emit initial state within two seconds and changed stable-hash snapshots within five seconds, capped at 50 distinct viewers plus total; clean timers on disconnect and route missing schema through the shared guard.
    - _Requirements: 12.7, 12.8, 12.9, 16.7_

  - [ ]* 8.7 Add knowledge, comments, and presence tests
    - Cover all five record adapters, ordering/cursor/count, evidence races, bilingual rejection validation, decision conflicts/roles, edit/delete authorization, transaction/audit rollback, durable cross-instance presence, stale pruning, timing bounds, cap/total, and tenant isolation.
    - _Requirements: 11.1-11.11, 12.1-12.12_

  - [ ]* 8.8 Write the reply-preserving-withdrawal property test
    - **Property 21: Parent withdrawal preserves replies**
    - Generate comment trees with direct/nested replies; delete a parent and assert descendants unchanged, retained parent, empty content/mentions, and withdrawn state.
    - Tag the test `Feature: platform-completion, Property 21: Parent withdrawal preserves replies` and run at least 100 generated trees.
    - **Validates: Requirements 12.4**

- [ ] 9. Complete full version history and addressable application routing
  - [ ] 9.1 Implement complete proposal/document version list and detail APIs
    - Replace embedded `take: 20` history as the UI source with dedicated tenant-scoped list/detail services and routes using default 20/max 50 strict keyset pages.
    - Return only metadata in lists and exact byte-identical proposal content or immutable document storage/checksum metadata in detail; reject invalid cursors/revisions with stable codes.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.7, 13.8_

  - [ ] 9.2 Implement append-only proposal and document reverts
    - In serializable transactions copy the selected source exactly into max+1, attribute actor/source revision, retain every prior revision, update current metadata, and invoke existing snapshot/review/derived invalidation paths.
    - Enforce writer and tenant checks before content reads and perform no arithmetic over embedded commercial literals.
    - _Requirements: 13.2, 13.5, 13.7, 13.9, 13.10_

  - [ ] 9.3 Build proposal and document history/detail/revert surfaces
    - Connect load-more cursors, exact detail, revert confirmation, oldest-revision indicator, and refreshed current state for both resource types.
    - Localize all labels/errors/empty states and preserve AR/EN direction/content bytes.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.10, 18.5, 18.6_

  - [x] 9.4 Implement a pure canonical dashboard route table
    - Create bidirectional typed mapping for all global and project-scoped `DashboardView` members, project-ID encoding/decoding, canonical fallbacks, and strict unknown-path results separate from Zustand.
    - Remove persisted `view` authority while retaining non-route preferences.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.6_

  - [ ] 9.5 Add the server-resolved `/app/[...segments]` entry and authorization gates
    - Make `/app` and the catch-all share a server entry that authenticates, verifies email, resolves role/project membership, and passes initial view/project/notice before client rendering.
    - Redirect/replace unknown, forbidden admin, unavailable-project, and project-without-context paths to canonical fallbacks without requesting protected data.
    - _Requirements: 14.2, 14.4, 14.5, 14.6, 14.8, 14.9, 19.5_

  - [ ] 9.6 Synchronize navigation, history, locale, and post-login deep links
    - Update `use-view-router`, sidebar controls, and store integration so user selections call `router.push` once, URL changes never repush, and back/forward restores view/project within 300 ms without full reload.
    - Retain validated same-origin requested paths in a signed HttpOnly SameSite=Lax cookie for at most 30 minutes and restore after auth.
    - Preserve locale outside the URL and keep the active path through locale switches.
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 14.7, 14.10, 18.8_

  - [ ]* 9.7 Add history and route-state tests
    - Test list/detail/revert/error/authorization behavior, histories beyond twenty, route mappings, unknown/admin/project fallbacks without protected fetches, exactly-one push, popstate restoration, deep-link expiry/same-origin validation, and locale preservation.
    - _Requirements: 13.1-13.10, 14.1-14.10_

  - [ ]* 9.8 Write the dashboard path round-trip property test
    - **Property 1: Dashboard path round trip**
    - Generate every dashboard view and valid required project context; format then parse and assert identical view/project context.
    - Tag the test `Feature: platform-completion, Property 1: Dashboard path round trip` and run at least 100 generated cases.
    - **Validates: Requirements 14.1, 14.2, 14.6**

  - [ ]* 9.9 Write the unknown-dashboard-path property test
    - **Property 2: Unknown dashboard paths fail safely**
    - Generate noncanonical `/app` paths and assert overview fallback, replace-not-push, and no protected data request.
    - Tag the test `Feature: platform-completion, Property 2: Unknown dashboard paths fail safely` and run at least 100 generated paths.
    - **Validates: Requirements 14.4**

  - [ ]* 9.10 Write the append-only revert property test
    - **Property 20: Revert appends exactly one revision**
    - Generate valid proposal/document histories and source selections; assert count+1, exact source copy, and readability of every previous revision.
    - Tag the test `Feature: platform-completion, Property 20: Revert appends exactly one revision` and run at least 100 generated histories.
    - **Validates: Requirements 13.5**

  - [ ]* 9.11 Write the beyond-twenty history property test
    - **Property 30: Full history remains reachable beyond twenty revisions**
    - Generate finite proposal/document histories including sizes above twenty and assert cursor traversal returns every revision exactly once.
    - Tag the test `Feature: platform-completion, Property 30: Full history remains reachable beyond twenty revisions` and run at least 100 generated histories.
    - **Validates: Requirements 13.10**

- [ ] 10. Complete persisted marketplace lifecycle
  - [ ] 10.1 Implement database-backed marketplace seeding, publish, list, detail, and retire
    - Persist frozen system entries instead of synthesizing runtime catalog data; return schema-pending when storage is absent.
    - Validate bilingual title/description/ordered section bounds, require tenant writer role, return published/retired detail by ID, exclude retired list rows, and permit retirement only by publisher workspace while retaining applied proposal sections.
    - Return one-decimal rating average and zero for no ratings from persisted records.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.8, 15.9, 15.11, 16.7, 19.1, 19.3_

  - [ ] 10.2 Implement transactional marketplace rating and application
    - Upsert exactly one integer 1–5 rating per user/entry and recompute one-decimal average atomically.
    - Enforce writer/tenant/proposal checks and retired-state rejection; create one `(entryId,proposalId)` application marker, proposal sections, and one usage increment atomically, making repeats no-ops.
    - _Requirements: 15.5, 15.6, 15.7, 15.8, 15.10_

  - [ ] 10.3 Build marketplace list/detail/publish/retire/rate/apply UI
    - Connect persisted list/detail lifecycle, ordered bilingual outline, publisher controls, rating replacement, apply idempotence, usage/rating counts, and localized errors/states.
    - Preserve AR/EN parity and issue no synthetic fallback data.
    - _Requirements: 15.1-15.11, 18.5, 18.6, 19.1, 19.11_

  - [ ]* 10.4 Add marketplace service, transaction, route, and UI tests
    - Cover seeding provenance, translation/bound errors, detail/not-found, retirement ownership/retention, rating replacement/range/rounding, application rollback/idempotence, role/tenant guards, and schema-pending behavior.
    - _Requirements: 15.1-15.11_

  - [ ]* 10.5 Write the marketplace-usage idempotence property test
    - **Property 31: Marketplace usage increments once per pair**
    - Generate entry/proposal pairs and repeated application sequences; assert at most one marker and exactly one usage increment.
    - Tag the test `Feature: platform-completion, Property 31: Marketplace usage increments once per pair` and run at least 100 generated cases.
    - **Validates: Requirements 15.7**

- [ ] 11. Implement transactional notification delivery
  - [ ] 11.1 Build the notification outbox domain, recipient resolvers, and minimized templates
    - Extend `NotificationDelivery` into a durable outbox with stable persisted-trigger event IDs, unique event/recipient rows, locale/email/template/payload snapshots, attempts/claim/deadline/status fields, and matching in-app notification uniqueness.
    - Implement capped/deduplicated active-step reviewers, proposal author, and active owner/admin recipient resolvers with Arabic locale fallback and explicit no-recipient records.
    - Type templates so only localized event label, title, actor, UTC time, and one canonical link are accepted; enforce 150-character subjects and reject commercial/document/attachment fields.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.7, 17.8, 17.10, 17.11_

  - [ ] 11.2 Wire notification rows into triggering business transactions
    - Add in-app and delivery row creation to proposal submission, review-decision, and subscription past-due/failed transactions using persisted trigger IDs and recipient snapshots.
    - Ensure rollback creates neither row, commit schedules after-commit delivery without changing trigger responses, and duplicate triggers create no duplicate recipients.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.9, 17.10_

  - [ ] 11.3 Implement bounded after-commit delivery and protected retry dispatch
    - Claim pending rows safely across instances, send first attempt within 60 seconds, apply a ten-second provider timeout, and retry at most three times within 30 minutes using conditional/skip-locked-style claims.
    - Protect the retry route with `CRON_SECRET`; record attempts/errors/provider IDs, terminally fail after three, stop forever after success, and record unconfigured-provider state without network calls.
    - _Requirements: 17.4, 17.5, 17.6, 17.9, 19.2_

  - [ ] 11.4 Connect in-app notification UI and canonical links
    - Render real persisted inbox state and minimized localized content, route each notification to its canonical dashboard path, and preserve recipient locale/direction.
    - _Requirements: 17.4, 17.7, 17.8, 17.11, 18.5, 18.6, 19.1, 19.11_

  - [ ]* 11.5 Add notification transaction, dispatcher, and UI tests
    - Cover recipient caps/deduplication, active approval step, locale fallback, rollback, stable IDs, duplicate triggers, first-attempt deadline, provider timeout, retry windows/claims, terminal/success behavior, unconfigured/no-recipient records, payload minimization, and canonical links.
    - _Requirements: 17.1-17.11_

  - [ ]* 11.6 Write the notification-minimization property test
    - **Property 23: Notification bodies are minimized**
    - Generate valid event payloads and assert output contains only permitted fields/link and excludes monetary values, bid values, document text, and attachments.
    - Tag the test `Feature: platform-completion, Property 23: Notification bodies are minimized` and run at least 100 generated cases.
    - **Validates: Requirements 17.7**

  - [ ]* 11.7 Write the notification-delivery idempotence property test
    - **Property 33: Notification delivery is idempotent**
    - Generate stable event/recipient trigger and retry sequences; assert one in-app row, one delivery row, and no provider request after recorded success.
    - Tag the test `Feature: platform-completion, Property 33: Notification delivery is idempotent` and run at least 100 generated sequences.
    - **Validates: Requirements 17.4, 17.5, 17.9**

- [ ] 12. Enforce bilingual, tenant, and production-integrity invariants
  - [ ] 12.1 Make locale and direction server-first and path-preserving
    - Mirror locale persistence to a bounded cookie while retaining the localStorage compatibility mirror; make root/app layouts emit Arabic `lang`/`dir` by default before hydration.
    - Update the language control to synchronize cookie, storage, Zustand, and document attributes within one second without changing the canonical route.
    - Implement locale fallback/logging without empty strings or runtime failures.
    - _Requirements: 14.7, 18.3, 18.8, 18.9_

  - [ ] 12.2 Remove literals/physical-direction CSS and enforce document-language purity
    - Audit every completion component/error/template to consume typed localization keys and logical inline CSS; mirror layouts at 360, 768, and 1280 pixels without overflow.
    - Extend validation-gate language purity/missing-section checks while preserving user-authored content and approved identifiers, numerals, dates, units, and technical terms exactly.
    - _Requirements: 18.1, 18.2, 18.4, 18.5, 18.6, 18.7, 18.10_

  - [ ] 12.3 Add the capability reachability manifest and production-integrity scanners
    - Create a machine-readable manifest linking every introduced/materially extended route/service to a real UI control, authenticated scheduler, or documented external callback.
    - Add narrow static scanners for orphaned capabilities, missing-schema synthetic success, not-implemented/not-supported/coming-soon responses, runtime fixtures/stubs/random display values/artificial delays, user-visible literals, and prohibited monetary computations.
    - Exempt only test files, frozen catalogs, and explicit amount/currency validation comparisons; do not exempt production fallback data.
    - _Requirements: 19.1, 19.2, 19.3, 19.7, 19.10, 19.11_

  - [ ]* 12.4 Add localization, RTL, tenant-boundary, and integrity-policy tests
    - Test typed/dynamic key closure, fallback logging, error shape, initial markup, locale persistence, document-language validation, logical CSS/static literals, source scanners, route reachability, and cross-workspace no-mutation behavior for every introduced route.
    - Include automated viewport assertions at 360/768/1280 and source-policy fixtures only under test directories.
    - _Requirements: 18.1-18.10, 19.1-19.7, 19.9-19.11_

  - [ ]* 12.5 Write the translation-nonempty property test
    - **Property 3: Translation values are non-empty**
    - Iterate every registry key and assert both locales contain non-whitespace values and narrative Arabic entries contain Arabic script where required.
    - Tag the test `Feature: platform-completion, Property 3: Translation values are non-empty`; use deterministic registry enumeration.
    - **Validates: Requirements 18.1**

  - [ ]* 12.6 Write the translation-lookup-closure property test
    - **Property 4: Translation lookup closure**
    - Enumerate literal calls and every value produced by declared dynamic key families; assert every resulting key exists in the registry.
    - Tag the test `Feature: platform-completion, Property 4: Translation lookup closure`; use static/finite exhaustive enumeration.
    - **Validates: Requirements 18.2**

  - [ ]* 12.7 Write the cross-route tenant-isolation property test
    - **Property 22: Tenant isolation is noninterfering**
    - Generate caller/target workspace pairs for every introduced tenant route; assert cross-workspace requests return forbidden/not-found and leave all repositories unchanged.
    - Tag the test `Feature: platform-completion, Property 22: Tenant isolation is noninterfering` and run at least 100 generated cases per route family.
    - **Validates: Requirements 5.10, 6.11, 7.9, 11.7, 12.9, 13.7, 15.8, 19.5**

  - [ ]* 12.8 Write the translation-placeholder-parity property test
    - **Property 34: Translation placeholders have parity**
    - Enumerate every registry pair, parse named placeholders, and assert Arabic/English placeholder sets are identical.
    - Tag the test `Feature: platform-completion, Property 34: Translation placeholders have parity`; use deterministic registry enumeration.
    - **Validates: Requirements 18.1**

  - [ ]* 12.9 Write the capability-reachability property test
    - **Property 35: Introduced capabilities are reachable**
    - Build a static source graph from the manifest and assert every introduced/materially extended route/library entry has a valid inbound UI, scheduler, or external-callback edge whose target exists.
    - Tag the test `Feature: platform-completion, Property 35: Introduced capabilities are reachable`; use deterministic graph validation rather than randomized browser execution.
    - **Validates: Requirements 19.11**

- [ ] Checkpoint C — Verify all domains and cross-cutting policies
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Integrate and validate the completed platform
  - [ ] 13.1 Run and repair the targeted cross-domain completion test matrix
    - Execute the targeted unit, property, route, transaction, workbook, static-policy, and isolated-database suites in one-shot mode; fix implementation defects rather than weakening assertions.
    - Confirm all 35 design properties have their exact tagged test, randomized properties run at least 100 cases, and all 211 acceptance criteria have example/property/integration coverage.
    - Do not run any Prisma migration, db push, reset, real provider call, or shared-Neon mutation.
    - _Requirements: 1.1-19.11_

  - [ ] 13.2 Pass the mandatory static, type, unit, and production-build gates
    - Run sequentially with no concurrent development server: `bun run lint`, `bunx tsc --noEmit`, `bun run test`, then `bun run build`.
    - Resolve every reported error/failure while preserving stable API contracts, bilingual parity, tenant isolation, additive migrations, and the prohibition on pricing calculations.
    - _Requirements: 16.5, 16.9, 18.1-18.10, 19.3, 19.7, 19.8, 19.10, 19.11_

  - [ ] 13.3 Add the automated completion E2E suite
    - Create one-shot Playwright coverage for registration/verification/recovery/invitation, deep links/back-forward/project/admin guards, analytics empty/real states, clause/template/contract/history flows, XLSX blocking/download metadata, recurring/reconciliation mocked flows, knowledge/comments/presence, marketplace, notifications, and locale persistence.
    - Add AR/EN viewport checks at 360/768/1280 and explicit assertions that protected/unknown routes do not issue forbidden data requests.
    - Guard all stateful E2E setup with an explicitly isolated `TEST_DATABASE_URL`; use mocked provider adapters and never mutate shared Neon.
    - _Requirements: 1.5, 1.10, 2.10, 3.2, 3.3, 4.9, 5.9, 6.10, 7.6, 8.8, 9.8, 10.6, 11.8, 11.11, 12.7, 12.8, 12.12, 13.6, 14.1-14.10, 15.1-15.11, 17.7, 17.8, 17.11, 18.3, 18.5, 18.6, 18.8_

  - [ ] 13.4 Execute final isolated E2E and report-only browser QA
    - Require the user to start `bun run dev` manually against the approved isolated database; never start the long-running server from an automation shell and never run it concurrently with `bun run build`.
    - Run the completion Playwright suite once, then use the `/browse` skill for report-only dogfooding of critical Arabic/English desktop/mobile flows; capture reproducible evidence and repair/re-run any product defect.
    - Verify `/api/health` liveness separately from `/api/ready`, including complete migration-pending output, and confirm no real email/charge or shared-database write occurred.
    - _Requirements: 1.1-19.11_

- [ ] Final checkpoint — Confirm the implementation is execution-complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test-writing tasks in the task runner; implementation tasks and final validation tasks are mandatory.
- Every randomized property test must run at least 100 generated cases and include the exact `Feature: platform-completion, Property N: ...` tag. Static/source/infrastructure properties use exhaustive deterministic checks instead of artificial random repetition.
- Extend existing partial modules and routes in place. Do not create duplicate replacement services, synthetic runtime fallbacks, orphaned handlers, or unreachable libraries.
- Never run `prisma migrate`, `prisma db push`, `prisma migrate reset`, or direct schema/data mutations against the shared Neon database. PostgreSQL-specific tests require an explicit isolated `TEST_DATABASE_URL` guard.
- Automated providers must be mocked: no real MyFatoorah charge and no real email. The production integration paths remain intact behind their configuration boundaries.
- Commercial values are copied and validated exactly as stored. No task may calculate, suggest, recommend, infer, total, discount, prorate, refund, or optimize a bid price or commercial strategy.
- Arabic/English parity, server-first Arabic RTL defaults, logical CSS, tenant isolation, and stable bilingual error contracts apply to every implementation task even when not repeated in the task title.
- For final browser validation, the user manually starts `bun run dev`; automation runs one-shot tests only and never starts a watcher or long-running process.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.4", "1.5", "1.6"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "1.3", "1.7"]
    },
    {
      "id": 2,
      "tasks": ["2.1", "2.4", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "8.4", "9.1", "9.4", "10.1", "11.1"]
    },
    {
      "id": 3,
      "tasks": ["2.2", "2.3", "3.3", "4.2", "5.2", "6.2", "7.2", "7.6", "8.2", "8.6", "9.2", "9.5", "10.2", "11.3", "12.1"]
    },
    {
      "id": 4,
      "tasks": ["2.5", "3.4", "4.3", "5.3", "6.3", "7.3", "7.7", "8.3", "8.5", "9.6", "10.3"]
    },
    {
      "id": 5,
      "tasks": ["2.6", "2.7", "2.8", "4.4", "4.5", "4.6", "5.4", "5.5", "6.4", "6.5", "6.6", "6.7", "6.8", "7.4", "8.7", "8.8", "9.3", "10.4", "10.5"]
    },
    {
      "id": 6,
      "tasks": ["5.6", "5.9", "5.10", "5.11", "5.14", "5.15", "7.5", "9.7", "9.8", "9.9", "11.2"]
    },
    {
      "id": 7,
      "tasks": ["3.2", "5.7", "5.12", "5.13", "7.8", "7.9", "7.10", "7.11", "7.12", "9.10", "9.11", "11.4"]
    },
    {
      "id": 8,
      "tasks": ["3.5", "3.6", "3.7", "5.8", "11.5", "11.6", "11.7", "12.2", "12.3"]
    },
    {
      "id": 9,
      "tasks": ["12.4", "12.5", "12.6", "12.7", "12.8", "12.9"]
    },
    {
      "id": 10,
      "tasks": ["13.3"]
    },
    {
      "id": 11,
      "tasks": ["13.1"]
    },
    {
      "id": 12,
      "tasks": ["13.2"]
    },
    {
      "id": 13,
      "tasks": ["13.4"]
    }
  ]
}
```
