# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates compliant technical and financial proposals for Saudi government tenders on Etimad.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma (SQLite local) + NextAuth + Playwright PDF + ExcelJS + JSZip + multi-provider LLM.

## Honest status (2026-07-22 production readiness cut)

### Solid
- Multi-agent pipeline (5 skills) with LLM enrich + deterministic fallbacks
- Proposal editor, versions, AI rewrite, Playwright PDF / XLSX / ZIP
- NextAuth credentials + JWT; MFA setup/verify with session or email+password
- Admin CRUD (users, plans, AI providers, env, billing ledger, audit)
- scrypt passwords; bootstrap admin from `BOOTSTRAP_ADMIN_PASSWORD` only
- Membership-scoped tenant context (`getTenantContext`) on tenant APIs
- Document/proposal ownership checks; sanitized document PATCH
- Quotas enforced on upload + agent run; REVIEWER write block
- Agent cancel + single active run per project
- `/api/health`; root README; `.env.example`; SQLite local / Postgres migrate notes

### Intentionally not in this cut
- Stripe/mada checkout (manual ledger only)
- Real Etimad portal submission API
- Redis/Bull job queue (in-process agents with cancel)
- Full E2E / Playwright browser suite (unit tests cover core contracts)

### Known residual risk
- File bytes API auth-gates but does not re-check workspace path ownership beyond session
- Workspace switcher UI remains display-oriented (API is membership-scoped)
- First production deploy should use Postgres + `prisma migrate deploy`, not `db push --accept-data-loss`

## Production readiness checklist (completed)

1. Secrets hygiene — env-only bootstrap password, enc key, `.env.example`, force password change
2. `typescript.ignoreBuildErrors: false`
3. MFA login sends password on setup/verify; no email prefill
4. `activeProjectId` required for upload + agent run
5. Workspace scoping via membership
6. Document APIs locked (session + ownership + sanitize PATCH)
7. Open handlers gated + `/api/health`
8. Prisma migrate scripts + Postgres README path; no accept-data-loss default
9. Compliance `NON_COMPLIANT` (not GAP); evidence-based LOCAL_CONTENT
10. Plan quotas on upload + agent run
11. Auth rate limit, session revoke on logout, no prefill
12. Project PATCH/DELETE + list error/empty UI
13. Agent cancel + RUNNING/QUEUED guard
14. `requireWriter` / REVIEWER read-only
15. Unit tests: auth roles, IDOR helper, compliance, MFA contract
16. README, gitignore db/env, honest worklog

## UI consistency & design system (2026-07-22)

- Thin view router (`VIEW_REGISTRY`) — no business logic in `views.tsx`
- Shared API controllers: `withTenant` / `withAdmin` / `ApiError` (`src/lib/api-controller.ts`)
- Reusable patterns: `PageHeader`, `Panel`, `QueryState`, `ConfirmDialog` (`src/components/patterns`)
- SEO service: `createPageMetadata` (`src/lib/seo.ts`) on route layouts
- Public pages: `/for-owners` (quality reference), `/pricing`, `/compliance`
- Style guide: `docs/design-system.md`

## Production completion pass (2026-07-22)

- Real PPTX slides via `pptxgenjs` in ZIP + `?format=pptx` download
- `DocumentChunk` model + embed-on-upload for tender RAG (Technical Agent)
- Runtime LLM guardrails (toxicity, hallucination grounding, confidence threshold, PII)
- `assertProductionSecrets` at bootstrap + `instrumentation.ts` boot
- Evidence-based compliance (NCA control keywords, PDPL residency, SLA cap row)
- Removed unused `pdfkit`; unit tests green

## MyFatoorah billing + remaining features (2026-07-22)

- Self-serve checkout via MyFatoorah `SendPayment` + `GetPaymentStatus`
- Callback page `/billing/callback` and webhook `/api/billing/webhook` (HMAC)
- Idempotent `fulfillCheckout` activates subscription + syncs workspace plan
- User Billing view (`nav_billing`) with usage meters and payment history
- Workspace switcher (`User.activeWorkspaceId`) + invite existing users by email
- Env catalog: `MYFATOORAH_API_KEY`, `MYFATOORAH_API_URL`, `MYFATOORAH_WEBHOOK_SECRET`

## AI provider / model configuration (2026-07-22)

- Per-engine providers: DEFAULT, INGESTION, COMPLIANCE, TECHNICAL, FINANCIAL, DRAFTING, REWRITE, EMBEDDING
- OpenAI-compatible providers (`openai_compatible`, Ollama, OpenRouter, Groq, DeepSeek, Azure)
- Auto-fetch `/models` list; auto-fill context window, vision, JSON mode, tools, costs
- One active provider per engine (multiple configs allowed); fallback to DEFAULT
- Agents route via `generateCompletion(..., { engine })`; embeddings use EMBEDDING engine
- Admin UI: engine tabs, fetch models, capability toggles, custom API base + env key

## Verification commands
```bash
bun run lint
bunx tsc --noEmit
bun test
curl -s localhost:3000/api/health
```
