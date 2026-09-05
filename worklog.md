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

**Also**: readiness detail gated behind the cron secret/admin session, ExcelJS/JSZip lazy-loaded, list queries bounded, six composite indexes (migration `20260905120000_hot_path_indexes`, applied to the dev database), security hardening (precheck limiter, env delete gate, email-change re-verification, presence tenant scoping, proxy matcher), pricing → `/register?plan=` handoff with the plan preselected in Billing, deadline reminders and trial-ending emails, activation funnel analytics.

### Verification
```bash
bunx tsc --noEmit            # pass
bun run lint                 # 0 errors (2 warnings in generated .well-known/workflow files)
bun run test                 # 6361 pass, 0 fail, 14 intentional skips (fourth round)
bun run build                # pass; pdf.worker.mjs and tesseract core traced into ingesting routes
```

### Operator items (cannot be done from the repo)
- Production: set `REDIS_URL`, a mail transport (`RESEND_API_KEY` or SMTP), `CRON_SECRET`, and run `prisma migrate deploy` on the unpooled Neon URL.
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
