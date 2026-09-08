# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates compliant technical and financial proposal **structure** for Saudi government tenders on Etimad — **never pricing bids**.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma (Postgres) + NextAuth + Playwright PDF + ExcelJS + JSZip + multi-provider LLM + MyFatoorah.

## Status (2026-09-05 production-readiness pass)

### Delivered (this pass)
Six parallel audits (billing, security, UX, AI, activation/analytics, deployment) followed by fixes across eight commits. Verified live in the browser against the shared dev database.

**Blocking defects fixed**
- Signup returned 500 on a cold Neon connection (4 s transaction ceiling); registration now signs the account in and lands in Billing when a plan was chosen. Post-login deep links to non-home views bounced to home (view-router stale-closure push) — fixed.
- PDF text extraction failed for every PDF (pdfjs worker missing from the bundle) and Arabic came back as reversed presentation forms — parser externalised, worker traced into the ingesting routes, `restoreLogicalArabic` restores reading order.
- The signup Starter never expired, recurring checkout paid the wrong invoice, no single-payment fallback — 30-day TRIALING trial with `TRIAL_ENDED`, one-invoice recurring checkout, per-workspace-owner entitlements, plan-gated export formats, token quota.
- Transactional email never delivered (30-minute outbox deadline vs a daily cron) — inline dispatch after commit plus a 26 h deadline. Resend-verification told the truth; admins can mark verified; members can be role-changed and removed.
- Platform agent answered a generic 500 when the default provider key did not resolve — 503 `AI_PROVIDER_UNAVAILABLE` with failover to the next usable provider; privileged tools require approval; document text fenced as untrusted.
- Admin Create User failed by default; autopilot failed silently on incomplete onboarding; `/robots.txt` answered 500.

**Second round (same day)**: billing describes the workspace owner's governing subscription and refuses teammate purchases (`BILLING_OWNER_ONLY`); mid-cycle downgrades answer `DOWNGRADE_AT_RENEWAL` with the date; one "Upgrade plan" toast action on upload/run/download plan limits; shell-level trial banner (last 7 days + after lapse); idle-draft nudge riding the daily deadline cron; admin overview activation funnel (30 days, distinct workspaces) and admin billing "trials to follow up"; contract studio waits for the detail row; phone header no longer clips the wordmark; active-project reconciler only overrules against a fresh list.

**Third round (same day) — AI generation**: live web research (Tavily, `TAVILY_API_KEY`, official Saudi domains boosted, dated `[Sn]` sources) feeds compliance, drafting and the contract agent and a read-only `searchWeb` agent tool; proposal drafting is sectioned (18 sections, pool of 3, ordered stream, per-section continuation/fallback, deterministic requirement-coverage verification + gap fill, `ARABCLUE_DRAFTING_SINGLE_SHOT=1` kill switch); a bounded post-draft AI review lands in `finalArtifact.aiReview`; `POST /api/proposals/[id]/counterpart` generates the other-language draft with fidelity checks (migration `20260905180000_proposal_counterpart`, applied); premium bilingual document chrome (type scale, synchronized cover pair, TOC leaders, continuous tables, running header/footer with real page counts, integrity hash + QR; visual baseline regenerated); generation views redesigned as a control room; shared tender style guide + 52-term glossary and tolerant, schema-checked JSON parsing across the secondary generators.

**Fourth round (same day) — retrieval (RAG)**: document search and the proposal prepare stage run a SQL hybrid instead of an in-app cosine over the 400 most recent chunks: pgvector cosine filtered to the query's dimension plus a generated Arabic-normalized `tsvector` (harakat/tatweel stripped, alef/taa marbuta/alef maqsura folded, every word indexed as written and article-stripped; the query side also strips a glued و and adds stem variants), fused by reciprocal rank with a per-document diversity cap (migration `20260905200000_rag_pgvector`, applied to the dev database; 52/61 legacy vectors backfilled, the 9 without vectors and 2 foreign-dimension vectors are reported as `staleEmbeddings`). Chunking is structure-aware (pages, Arabic/English article and clause headings, paragraphs; 1000-char target, 120 overlap, 400-chunk cap instead of 40) and every chunk carries heading, page and language; embeddings are tagged with the model that produced them. PDF pages reach the chunker as form feeds (pdf-parse's `-- 1 of 3 --` marker lines no longer pollute chunks), the ALL-CAPS heading rule ignores lines with Arabic, and query stemming turns a ta-marbuta singular into its plural instead of a generic stem ("سعودة" no longer meets every "سعودية"). Offline eval harness (`bun run eval:rag`, 20 bilingual labelled queries over `public/samples`, BM25 with per-term prefix idf): p@1 1.00, p@3 1.00, MRR 1.000 with a 0.9 floor pinned in tests. `bun run rag:reindex [--workspace id] [--stale-only]` rebuilds chunks and vectors from storage. HNSW on `embedding` is the documented upgrade past ~50k chunks.

**Fifth round (2026-09-06) — activation analytics, rewrite safety, strict drafting, release**: the registration `account_registered` / `checkout_started` events were rejected by the `AnalyticsEvent.eventType` CHECK constraint (a Postgres error on every signup, swallowed by the collector) — migration `20260905220000_analytics_activation_vocabulary` widens the constraint and the registry/policy tests pin the vocabulary to the collector's list. `POST /api/proposals/[id]/rewrite` answers `PROPOSAL_VERSION_CONFLICT` when the selection no longer appears in the stored document (it used to replace the whole document with the fragment) and `applySectionRewrite` splices by index so `$&`-style sequences in model output survive. In `draftProposalSectioned` a degraded section or a deadline after live sections goes through the real-AI-only guard: strict deployments refuse instead of streaming template slices as model output; permissive ones report `fallback: true` with the first failure kind. Document reader/preview frame: theme-aware surface, expanded reading in an accessible dialog that keeps the reading position, aborted fetches on mode change, bilingual failure copy (browser geometry test behind `DOCUMENT_VIEWER_BROWSER=1`).

**Sixth round (2026-09-07) — Tender Clarification Intelligence (new capability)**: every Etimad tender has an inquiries window, and nobody automates the questions. The new project-scoped view **Tender Clarifications** (`/app/projects/<id>/clarifications`, sidebar workflow group) interrogates the parsed tender chunks: nine deterministic detectors (conflicting deadlines across documents with Gregorian/Hijri parsing, evaluation weights stated differently or not totalling 100, conflicting or uncapped penalty caps, dangling annex references, missing mandatory information, placeholders with signature-line exclusion, mixed currencies, unqualified day counts, risk clauses — unlimited liability, termination without notice, blanket IP transfer) plus a windowed model pass (engine `INGESTION`, relevance-scored windows, pool of two, zod-checked JSON, and a grounding gate that drops any finding whose quotes are not verbatim in the window it read). Findings carry verbatim quotes with document/page/heading and a formal bilingual question; they are upserted by `(projectId, fingerprint)` so a re-run never disturbs triage, edits or recorded answers (migration `20260907000000_tender_clarifications`, position 30; registry and runbook ledger regenerated; applied to the local sandbox database with `prisma db execute`). Triage machine PROPOSED → KEPT/DROPPED → SUBMITTED → ANSWERED with `CLARIFICATION_STATUS_INVALID` on illegal moves; team-authored questions; clarity score (100 − weighted open findings) labelled as derived, not predictive. The clarification letter numbers kept questions with their tender references as Markdown, plain text (for the Etimad inquiries form), and a paired AR|EN document through the existing HTML/PDF engine. **Generation improvement**: the orchestrator loads the kept/submitted/answered rows as a *clarifications register*; sections 8 and 16 receive it as a context slice, the single-shot prompt as a block, and the deterministic proposal lists it under section 16 — open questions become explicit assumptions, answered ones are cited as the entity's dated response. Under `AUTONOMY_REAL_AI_ONLY` the rule findings are still shown (labelled as rules); the UI banner names the model failure kind and states that nothing was fabricated. Persistence lives in `tender-interrogation/repository.ts` with no LLM import so the rate-limit ratchet can tell spending routes from the rest. Also fixed on the way: the tender setup wizard sent `null` for blank saudization/local-content targets and the project schemas refused it, so creating a project with the goals step skipped failed with `REQUEST_VALIDATION_FAILED` (schemas now accept null; regression test). Browser QA against the local sandbox: register → project → upload two sample PDFs → interrogate (5 rule findings on the IT agreement's dangling annexes and masked numbers, clarity 74) → keep/drop/edit → letter as text, paired HTML and a 149 KB PDF; the model pass could not be exercised live (Groq key answers 401, the Azure preset has no endpoint, and the Vercel AI Gateway account is free-tier and refuses the configured model) — the run degraded honestly to `ai.status = unavailable (invalid_response)`. Tests: 76 new (detectors, grounding, windows, prompt, merge, clarity, letter, register, admission, transitions, isolated routes, validation regression); the drafting section registry test now pins the two new slices. Design spec: `docs/superpowers/specs/2026-09-07-tender-clarification-intelligence-design.md`.

**Incident and recovery (2026-09-06/07) — production database reset**: at 19:32 UTC on 09-06 a drift check was run as `prisma migrate diff --from-migrations … --shadow-database-url "$DATABASE_URL"` with the production Neon connection string as the shadow database. That command resets its shadow before replaying the migration folder, so the production schema was dropped and recreated empty; the project is on Neon's Free plan (six-hour history), no external backup existed, and the window closed before a restore was attempted — all tenant rows were lost. Recovery on 09-07, each step read-only or additive: the `_prisma_migrations` ledger was baselined with `migrate resolve --applied` for all 31 declared migrations (`migrate status`: up to date; `/api/ready` green); the five AI provider connections were re-created from the configuration recorded before the reset by `scripts/reseed-ai-providers.ts` (idempotent; keys must be re-entered in Admin → Env Settings). Guards so neither the cause nor the missing net recurs: `scripts/prisma-migrate-diff.mjs` (`bun run db:diff`) is the only path to `migrate diff` and refuses an unset shadow URL, any live `DATABASE_URL*`/`POSTGRES_*`/`PG*` host, the sibling endpoint of the same Neon branch, any `*.neon.tech` host without `SHADOW_DATABASE_ALLOW_NEON=1`, or the production database name (verified: the exact destructive command is refused); `db:push`, `db:push:dev`, `db:migrate` (dev) and `db:reset` removed from `package.json`; `src/lib/database-backup.ts` dumps every table (including `_prisma_migrations`, excluding the transient rate-limit counters) as one gzip'd JSON document to Vercel Blob under `backups/database/` with 30-day retention pruned only after the new dump is durable, and restores by disabling triggers per table, truncating and re-inserting in one transaction (drops the generated `DocumentChunk.tsv`, refuses to overwrite a live database larger than the dump without `--force`); `/api/cron/database-backup` scheduled 04:00 UTC ahead of analytics retention (Hobby window ±1 h), 300 s budget; `bun run db:backup [list | restore <key> [--apply] [--force]]` for operators. Verified: dump → list → restore dry-run against production to local disk and to Blob; first production cron run from the Vercel dashboard wrote `backups/database/2026-09-08T02-29-29-789Z.json.gz` (68 tables). The `neondb_owner` password exposed in chat was rotated in Neon; all eight Production variables embedding it were re-added as sensitive, the old password confirmed rejected, production redeployed. Runbook: drift-check and backup procedures plus the incident record. Tests: 6483 pass (35 new across guard, backup encoding/retention/literals, restore sequencing, wiring). Commit `d73a815`.



**Release (2026-09-07)**: `main` pushed (`a3eaba9`), production deployed through the Vercel CLI as `arabclue-platform-7pujb9gf7-mirxa27s-projects.vercel.app` (aliases arabclue.com, www; known-good rollback: `arabclue-platform-6tromvsqs`). Migrations `20260906120000_rate_limit_postgres_backend` and `20260907000000_tender_clarifications` are recorded as applied; the production `_prisma_migrations` ledger was baselined (all 31 rows, `applied_steps_count = 0`) by a concurrent session minutes before this deploy, so `prisma migrate status` against the production direct URL answers "up to date". Live checks: `/api/health` ok, `/api/ready` → `ready: true` (it answered `false` before the ledger and the rate-limit tables existed), `/` and `/pricing` 200, `/api/projects/:id/clarifications` → 401 with the bilingual contract, `/app/projects/:id/clarifications` → 307 to login. **Operator note**: the committed local `.env` `DATABASE_URL` is the production Neon endpoint (`ep-quiet-breeze-avigwtu6`), the same one Vercel production uses — the QA workspace, user, project, uploads and clarifications created during this round's browser QA were deleted from the database and from Vercel Blob afterwards (two `TENDER_INTERROGATE` audit rows referencing the deleted project remain); point `.env` at an isolated Neon branch before any further local QA.

**Release**: `main` pushed (`d1a4cb4`), migrations applied to the production Neon branch (`prisma migrate status`: up to date, 29 migrations), production deployed through the Vercel CLI (59.x device login; the linked project is `mirxa27s-projects/arabclue-platform` → arabclue.com). Live checks after the deploy: `/api/health` ok, `/`, `/pricing`, `/register?plan=…` 200 with zero console errors, `/app` → 307 to login, `/api/projects` → 401. `/api/ready` reported `aiEngines: degraded:DEFAULT,DRAFTING` / `aiCredential: credential_unresolved` because the sealed `AZURE_OPENAI_API_KEY` row was encrypted with a different `ARABCLUE_ENC_KEY` than production's and the variable was not in the Vercel environment — set as a sensitive production variable and redeployed.

**Also**: readiness detail gated behind the cron secret/admin session, ExcelJS/JSZip lazy-loaded, list queries bounded, six composite indexes (migration `20260905120000_hot_path_indexes`, applied to the dev database), security hardening (precheck limiter, env delete gate, email-change re-verification, presence tenant scoping, proxy matcher), pricing → `/register?plan=` handoff with the plan preselected in Billing, deadline reminders and trial-ending emails, activation funnel analytics.

### Verification
```bash
bunx tsc --noEmit            # pass
bun run lint                 # 0 errors (2 warnings in generated .well-known/workflow files)
bun run test                 # 6697 pass (241 isolated + 6456), 0 fail, 15 intentional skips (sixth round)
bun run build                # pass; pdf.worker.mjs and tesseract core traced into ingesting routes
bun run deploy:safety:repo   # pass
```

### Operator items (cannot be done from the repo)
- Production: set `REDIS_URL` (readiness reports `rateLimit: memory_vercel` — per-instance counters are not a rate limit across Vercel instances); `TAVILY_API_KEY` if live web research should run in production; `OPENAI_API_KEY` and `ZAI_API_KEY` as Vercel variables (the sealed rows for those keys do not open with the production `ARABCLUE_ENC_KEY`, so the EMBEDDING / COMPLIANCE / LAW / REWRITE / FINANCIAL / TECHNICAL / INGESTION / VOICE engines fall back to the DEFAULT Azure connection).
- Local `.env`: the sealed AI keys were encrypted with a different `ARABCLUE_ENC_KEY`; set an env key that matches a provider row's `apiKeyEnvKey`.
- QA accounts created during browser testing in the dev database: `qa.0905@`, `qa.pro.0905@`, `qa.pro2.0905@`, `qa.pro3.0905@`, `qa.pro5.0905@`, `qa.pro6.0905@arabclue-qa.test` (safe to delete).

---

## Status (2026-08-26 guided onboarding + design upgrade)

### Delivered (this pass)
**Guided onboarding wizard (inspired by reference — "Connect apps" pattern)**
- New `src/lib/onboarding-wizard.ts` pure engine: 5-step state machine (`profile → brand → legal → connect → launch`), zod-validated payloads, `wizardStepCompletion` / `wizardProgress` / `deriveWizardPreview` with live "Personalizes as you answer" derivation. 22 unit tests.
- New `src/components/dashboard/onboarding-wizard.tsx`: premium guided setup card — header ("ARABCLUE SETUP Step N of 5" + progress bar + step dots), left form panel, right live preview rail (`{workspace}'s Arabclue`, Founder/exec · Coding context line, STRENGTHS chips, SUGGESTED APPS status, FIRST MESSAGES cards). Bilingual AR/EN, RTL-aware, Skip/Back/Continue flow.
- **Connect step wires to real platform capabilities (no mocks):** Etimad tender watch creates a real `POST /api/projects` by `etimadRef` (filing stays exclusively on the Etimad portal — no fake submission API), approval chain quick-setup seeds `POST /api/approval-policy`, restrictions acknowledged via `PATCH /api/onboarding`, brand/legal persist through `PATCH /api/brand` + `PATCH /api/workspaces`.
- **Fully AI-managed handoff:** launch step offers 3 mission cards — *Draft a bid proposal* (projects/agents), *Build qualification dossier* (account), *Review a contract* (contracts) — each navigates to the corresponding AI-managed pipeline; proposal mission can start from the Etimad tender just created.
- Route `setup` registered in `dashboard-routes.ts` (`/app/setup`), lazy view in `views.tsx`, banner CTA now opens guided setup, `nav_setup` i18n added.

**Design upgrade**
- Wizard uses the app's semantic Tailwind tokens (bg-card/border/muted/primary) with rounded-[20px], shadow-[0_8px_40px], gradient brand band — matches the reference's dark glass aesthetic while respecting light/dark themes.

### Verification
```bash
bunx tsc --noEmit            # pass
bun run lint                 # 0 errors
bun run test                 # 4249 pass, 0 fail, 13 intentional skips
bun run build                # pass
```

**Etimad note:** tender bidding remains reference-tracked; final filing is exclusively on the Etimad portal. No submission API is fabricated — the wizard creates a tracked project so agents can draft the bid package you review before manual portal submission.

---

## Status (2026-08-25 document AI + design pass)

### Delivered (this pass)
**AI generation reliability**
- New `src/lib/llm/resilience.ts`: typed transport errors, stable failure classification (`rate_limited | timeout | server_error | network | missing_key | invalid_response | …`), exponential backoff w/ full jitter (3 attempts, transient-only), and truncation repair that cuts to the last complete sentence (Arabic `؟` aware) when a provider hits the token ceiling.
- `generateCompletion` now retries transient failures, returns `failureKind` / `truncated` / `attempts`, and never ships a mid-sentence draft; embedding calls gained a timeout.
- Drafting agent caps the assembled prompt (RAG context was unbounded), and surfaces `failureKind`/`truncated` into the run's finalArtifact; agent workflow UI shows the fallback reason and truncation flag in both locales.

**Document design system**
- Bilingual layout engine: hierarchical section numbering ("1", "2", …) synced between headings and a new paired table of contents with dotted leaders and anchor links.
- Full branded cover page compiled into structured HTML/PDF exports (gradient brand band, accent strip, kicker/subtitle/bidder/tender-ref/date) derived automatically from the snapshot.
- Workspace brand palette now flows into document CSS variables (hex-validated; WCAG ≥4.5:1 guard before a brand secondary may become body ink).
- Lifecycle-aware chrome: only fully validated authoritative exports (approved status + bound chain + persisted snapshot) get "Authoritative export" footers and clean titles; everything else keeps honest DRAFT marking. Wired through download route, ZIP builder, PPTX/XLSX metadata.
- New native `kpi` block type renders bilingual stat cards in HTML/PDF instead of degrading KPIs to plain text paragraphs.
- PDF exports now emit bookmarks (`outline: true`) from semantic headings.

### Verification
```bash
bunx tsc --noEmit            # pass
bun run lint                 # 0 errors
bun run test                 # 4225 pass, 0 fail, 13 intentional skips
bun run build                # pass (incl. Chromium-gated PDF chrome tests)
```

---

## Status (2026-08-25 outstanding-work pass)

### Delivered (this pass)
- Closed all five actionable minors deferred from the bid-pack branch review (unmapped-body test, heading-line duplication, AR fallback pins, partial-brand overlay preservation, front-matter HTML smoke + XSS escaping).
- Added behavioral isolated tests proving the recurring-charge webhook retry contract (handler failure → event FAILED + 5xx; success → PROCESSED + 200).
- Verified every "not yet addressed" High finding from the 2026-08-22 audit §5b is fixed in code and refreshed that doc table accordingly.
- Deleted orphaned `scripts/embed-schema-sql.mjs` (audit defect #6 fix: dead code with no consumer or npm script).

### Verification
```bash
bunx tsc --noEmit            # pass
bun run lint                 # 0 errors
bun run test                 # 4182 pass, 0 fail, 13 intentional skips
bun run build                # pass
```

### Intentionally out of scope (require unavailable third parties / operator action)
- Real Etimad portal submission API (no public API; requires government integration agreement)
- Redis/Bull job queue provisioning (infra operator task)
- SSO (requires IdP contract)
- Live MyFatoorah sandbox charge without merchant credentials
- Production-scale load tests (need production-scale data)
- Git history rewrite + credential rotation (operator actions per PRE_PRODUCTION_SECURITY_TASKS.md)

---

## Status (2026-08-02 delivery-completion pass)

### Delivered (this pass)
- Fixed Bun test-runner module-mock leakage: the 7 files using `mock.module` now live in `src/lib/__tests-isolated/` with hook-scoped registration; `test` script runs them in a separate process pass. Suite: 3937 pass / 0 fail.
- Applied the final pending migration `20260729100000_marketplace_rating_check` (shared Neon, user-approved); schema 20/20 up to date. Removed obsolete `MIGRATION_REQUIRED.md`.
- Regenerated the migration ledger in `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` (Requirement 16.6 tests green).
- Fixed business-profile export route fixtures to model verified users (email-verification gating is enforced).
- Moved the previously-orphaned `arabclue-logo.test.tsx` suite (38 tests, was breaking `tsc`) into the runnable test tree.
- Lint 0 errors / 0 warnings (fixed react-hooks/refs violation in `use-copilot-processing.ts`, ignored esbuild bundles under `extensions/arabclue-agent/{content,background,sidepanel,shared}`, removed stale eslint-disable directives).
- `tsc --noEmit` clean (removed stale `.next/types` duplicates; tsconfig test-dir excludes consistent).
- `bun run build` green (Next.js 16.2.11 Turbopack, no warnings).
- Audit docs refreshed: `AUDIT_REPORT.md` / `AUDIT_IMPLEMENTATION_MAP.md` — all previously-flagged items marked resolved; remaining items are operational load tests needing production-scale data.

### Verification
```bash
bun run test                 # 3937 pass, 0 fail, 13 intentional skips
bun run lint                 # 0 errors, 0 warnings
bunx tsc --noEmit            # pass
bunx prisma migrate status   # up to date (20/20)
bun run build                # pass
```

### Intentionally out of scope
- Real Etimad portal submission API
- Redis/Bull job queue
- SSO
- Live MyFatoorah sandbox charge without merchant credentials
- Production-scale load tests (1M+ analytics events, 10K+ row XLSX)

### Delivered
- Versioned regulatory policy registry (no blanket 10%, no PDPL universal residency, no invented NORA IDs, tender SLA preserved)
- Deterministic validation gate blocking export on pricing / placeholders / invented identifiers
- MyFatoorah Webhook V2 canonical HMAC, URL allowlist, amount/currency verification, webhook event idempotency
- Admin Payments → MyFatoorah panel (write-only secrets, connection + signature tests)
- Recurring profile + webhook event models/migration
- Full docs suite under `docs/`

### Verification
```bash
bun test src/lib/__tests__   # 49 pass
bun run lint                 # 0 errors
bunx tsc --noEmit            # pass
bunx prisma migrate deploy   # pass
bun run build                # pass
```

### Intentionally out of scope
- Real Etimad portal submission API
- Redis/Bull job queue
- SSO
- Live MyFatoorah sandbox charge without merchant credentials
