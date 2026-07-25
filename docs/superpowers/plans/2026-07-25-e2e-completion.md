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

### Task 1: AI Agents preflight — DONE (`7985e18`)

### Task 2: Soft-fail Phase 4 APIs — DONE (`0d283b1`)

### Task 3: Phase 4 migration SQL + marketplace Use — DONE (`6719fe7`)

### Task 4: Business Profile zero-stat CTAs — DONE (`113bf4e`)

### Task 5: Mission Control chat gate + proposals empty CTA — DONE (`113bf4e`)

### Task 6: Marketplace → builder → HTML export — DONE (`17e1c46`)

### Task 7: Collaboration resolve + builder mount + agent DASHBOARD_VIEWS — DONE (`d305ea8`)

Also landed (same branch cleanup):
- `3ea5c2b` auth Redis-optional login rate limits
- `ca94e29` agent decision registry / metrics / orchestrator logging
- `5ceefd9` Mission Control UX + stats Retry
- `e3f1da2` bilingual PDF / print-ready helpers
- `f9c40db` login/documents/contracts/file-delivery polish

---

## Out of scope / blocked on human

- Applying Phase 4 migration to shared Neon without explicit authorization in chat
- Full Playwright login e2e suite (follow-up plan)
