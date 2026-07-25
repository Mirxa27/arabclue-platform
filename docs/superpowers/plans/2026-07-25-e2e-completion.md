# E2E Completion Plan — 2026-07-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Branch: `cursor/e2e-completion-ab64`.

**Goal:** Close remaining production e2e holes so Marketplace → Builder, Business Profile export, and AI Agents runs work without fake success, silent failures, or dead buttons. Prefer real implementations; soft-fail only when Phase 4 tables are absent on Neon (do not invent data).

## Global Constraints

- Branch: `cursor/e2e-completion-ab64` only
- Do **not** run `prisma migrate` / `db push` against shared Neon unless the human explicitly authorizes it in chat
- Creating migration SQL files under `prisma/migrations/` is allowed
- No Etimad submission API, SSO/OIDC, live MyFatoorah charges, AI bid pricing
- Arabic + English user-facing strings
- Prefer `QueryState` / `EmptyState` / toasts; no `alert()`
- Commit after each task; focused tests + `bunx tsc --noEmit` before commit
- YAGNI: no new Prisma models except Phase 4 tables already in `schema.prisma`

---

### Task 1: AI Agents preflight — block empty-document runs + honest failure UI

**Files:**
- Modify: `src/components/dashboard/agent-workflow.tsx`
- Modify: `src/app/api/agents/run/route.ts` (or existing run handler) — return 422 when project has zero documents
- Optional helper: `src/lib/agents/run-preflight.ts` + test `src/lib/__tests__/agent-run-preflight.test.ts`

**Acceptance:**
- Before starting a run, UI knows document count for `activeProjectId` (query existing documents API or project endpoint)
- Primary Run button disabled (or click shows destructive toast + navigates to Documents) when `documentCount === 0`
- Banner: AR/EN “Upload tender documents before running agents” with CTA → `setView("documents")`
- API rejects empty-doc runs with stable `{ error, code: "NO_DOCUMENTS" }` 422 — do not create AgentRun rows that immediately fail
- Failed ingestion agent showing `progress: 100` + FAILED must render as failed (red), not success-looking; ensure card uses `status === "FAILED"` for chrome (verify/fix agent card)
- `projectMeta` fetch failure shows error + Retry (not silent null)

- [ ] **Step 1:** Extract `assertProjectHasDocuments(count)` pure helper + unit test
- [ ] **Step 2:** Wire documents count query into AgentWorkflow
- [ ] **Step 3:** Gate Run button + banner CTA
- [ ] **Step 4:** API preflight 422
- [ ] **Step 5:** tests + tsc; commit: `fix(agents): preflight block runs with no documents`

---

### Task 2: Soft-fail Phase 4 APIs (analytics + collaboration) without migration

**Files:**
- Modify: `src/app/api/analytics/proposals/route.ts`
- Modify: `src/app/api/collaboration/comments/route.ts`
- Modify: `src/app/api/collaboration/presence/route.ts`
- Modify: `src/components/dashboard/analytics-dashboard.tsx` — Retry on error
- Optional: add resolve stub route that returns 501 honest message OR implement resolve if `CollaborationComment` exists

**Acceptance:**
- When Prisma table missing (P2021), return `{ ok: true, empty: true, items: [] }` / empty analytics with `degraded: true` — never 500 HTML
- Analytics UI shows Retry on fetch error and empty state when degraded
- Do not mock fake metrics

- [ ] Steps: detect Prisma missing-table; soft response; UI Retry; tests; commit `fix(phase4): soft-fail analytics and collaboration when tables absent`

---

### Task 3: Phase 4 migration SQL (file only) + marketplace Use resolves DB or catalog

**Files:**
- Create: `prisma/migrations/20260725_phase4_proposal_system/migration.sql` matching schema models `ProposalBuilderSection`, `TemplateMarketplaceEntry`, `CollaborationComment`, `AnalyticsEvent` (+ indexes/FKs from schema)
- Modify: `src/app/api/templates/marketplace/[id]/use/route.ts` — resolve system catalog OR DB by id/templateKey
- Do **not** apply migration to Neon

**Acceptance:**
- Migration SQL is valid for PostgreSQL / Neon
- Use route finds DB templates when table exists; falls back to system catalog; never 404 for system ids
- Unit/integration test for catalog resolution helper
- Commit: `feat(phase4): add proposal-system migration SQL and marketplace use resolution`

---

### Task 4: Business Profile zero-stat CTAs + Account → Profile when incomplete

**Files:**
- Modify: `src/components/dashboard/business-profile-view.tsx` — clickable zero stats → account
- Modify: `src/components/dashboard/account-onboarding.tsx` — always show “View capability statement / draft” link

**Acceptance:**
- Zero KPI cards are buttons/links to Account Setup
- Incomplete onboarding still offers View Business Profile
- Commit: `fix(profile): zero-stat CTAs and always-on profile link`

---

### Task 5: Mission Control chat gate + proposals empty CTA

**Files:**
- Modify: `src/components/dashboard/platform-agent-console.tsx` — disable Send/Speak until `missionId`
- Modify: `src/components/dashboard/proposals-list.tsx` — empty state CTAs to projects/agents

**Acceptance:**
- Composer disabled with hint until mission ready
- Proposals empty has real CTAs
- Commit: `fix(ux): gate mission chat and proposals empty CTAs`

---

### Task 6: Verify marketplace→builder→HTML export path + unit coverage

**Files:**
- Verify existing handoff in `proposal-builder-draft.ts`, marketplace card, builder export
- Add/extend tests if gaps remain
- Soften Create Template: open blank builder (already) — ensure no dead “Create Template” label

**Acceptance:**
- Automated tests cover draft handoff + HTML export compile
- No “coming soon” toasts on marketplace Preview
- Commit only if code changes: `test(marketplace): harden builder handoff coverage`

---

## Out of scope

- Applying Phase 4 migration to shared Neon without explicit human authorization
- Full Playwright login e2e suite (follow-up plan)
- Etimad / SSO / live payments
