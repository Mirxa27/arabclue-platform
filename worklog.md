# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates the generation of compliant, attractive technical and financial proposals for **all types of Saudi government tenders** (IT, construction, consulting, operations, medical, general supplies) on the Etimad portal. Built on top of the previous "Etimad AI-Bidder" foundation, rebranded and significantly extended with a comprehensive Admin Panel, multi-tender-type support, real LLM integration, and downloadable artifact generation.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite) + z-ai-web-dev-sdk (LLM) + ExcelJS + JSZip.
**Design:** Blue & slate corporate palette, full RTL/LTR (Arabic/English), modular grid layout, sticky footer.

## Architecture Decisions
- Single-page dashboard on `/` route with view-switching (8 user views + 6 admin views).
- **Multi-tender-type support:** 6 tender types (IT, Construction, Consulting, Operations, Medical, General) each with distinct SLA penalty rules, evaluation splits, compliance scopes, and BoQ templates.
- **5-agent pipeline:** Ingestion → Compliance & Regulatory → Technical & Solution Architect (RAG) → Financial & Qualification → Proposal Drafting. The drafting agent calls the real LLM (z-ai-web-dev-sdk) with RAG context from past projects, falling back to a deterministic template.
- **Admin Panel:** 4 major modules (AI Provider Config, Env (.env) Management, Billing & Plans, Security/RBAC + Audit Trail) + overview.
- **Real artifact generation:** ZIP download containing branded HTML proposal (printable to PDF), slides HTML, real XLSX compliance matrix, real XLSX BoQ with VAT + local content preference, markdown source, and README.
- **Encryption:** EnvSetting values encrypted with AES-256-GCM (crypto module), masked in UI, reveal + rotate operations.
- **Audit trail:** Every admin action, config change, and generation event logged to immutable AuditLog table with user, action, resource, severity, IP, and JSON details.

## Current Project Status (STABLE & VERIFIED)
- ✅ Prisma schema extended to 15 models (added AIProviderConfig, EnvSetting, SubscriptionPlan, Subscription, BillingRecord, AuditLog).
- ✅ Rebranded from "Etimad AI-Bidder" to "Arabclue" (أراب كلاو) across UI, metadata, layout title, i18n.
- ✅ 6 tender types with type-aware agent workflow (SLA, evaluation split, compliance scope, BoQ all adapt).
- ✅ Tender type selector on dashboard.
- ✅ LLM wired into Proposal Drafting agent (z-ai-web-dev-sdk), RAG-grounded, with deterministic fallback.
- ✅ Real artifact generation: ZIP (21KB, 6 files), HTML proposal (17KB), XLSX compliance matrix (8.8KB), XLSX BoQ (7.6KB) — all verified via curl + `file` + `unzip -l`.
- ✅ Admin Panel — 6 views:
  - **Overview:** 8 KPI cards, users-by-role chart, audit-by-action chart, security status banner.
  - **AI Providers:** 5 presets (ZAI GLM-4.6/4.5, GPT-4o, Claude 3.5 Sonnet, Mistral Large), activate/switch, edit temperature/tokens/confidence/guardrails (toxicity/PII/hallucination), cost tracking.
  - **Env Settings:** AES-256 encrypted, grouped by category, masked values, reveal/rotate/edit, 15-key catalog.
  - **Billing:** 4 default plans (STARTER/PRO/ENTERPRISE/PAY_AS_YOU_GO), MRR/revenue/usage KPIs, plan CRUD, billing records table, subscription usage progress bars.
  - **Security (RBAC):** Users table with 5 roles (SUPER_ADMIN/ADMIN/BIDDER/REVIEWER/FINANCE), role management, MFA status, deactivate, create user, assign plans.
  - **Audit Trail:** Immutable append-only log, filterable by action/severity, expandable JSON details, summary stats.
- ✅ ESLint clean (0 errors).
- ✅ Verified via agent-browser: tender type selector renders, Run Agents reaches 100% C1 compliance, admin nav (6 items) renders, AI providers view shows all 5 presets with ACTIVE badge, env settings shows encrypted keys grouped by category, billing shows plans, security shows users table, audit shows immutable trail.

## Goals Completed (this phase)
1. Rebrand to Arabclue (أراب كلاو) — title, metadata, i18n, footer.
2. Multi-tender-type support: 6 types with type-specific SLA/evaluation/compliance/BoQ.
3. Tender type selector component on dashboard.
4. LLM integration in Proposal Drafting agent (z-ai-web-dev-sdk, RAG-grounded).
5. Real artifact generation: ZIP + HTML proposal + XLSX matrix + XLSX BoQ.
6. Admin Panel — AI Provider Config (5 presets, guardrails, cost).
7. Admin Panel — Env (.env) Management (AES-256 encrypted, masked, rotate).
8. Admin Panel — Billing & Plans (4 tiers, quotas, usage, revenue).
9. Admin Panel — Security/RBAC (5 roles, MFA, user CRUD).
10. Admin Panel — Immutable Audit Trail (filterable, expandable details).
11. Admin Overview (8 KPIs, charts, security status).
12. Subscription usage tracking (proposalsUsed, tokensUsed increment on generation).

## Verification Results
- `bun run lint` → 0 errors.
- Dev server running on port 3000 (HTTP 200).
- `curl` artifact downloads: ZIP HTTP 200 (21,838 bytes, valid Zip archive with 6 files), PDF (HTML) HTTP 200 (16,984 bytes), XLSX matrix HTTP 200 (8,830 bytes, Microsoft Excel 2007+), XLSX BoQ HTTP 200 (7,600 bytes).
- `unzip -l` confirms ZIP contains: Technical_Proposal.html, Technical_Proposal_Slides.html, Compliance_Matrix.xlsx, Financial_BoQ.xlsx, Proposal_Content.md, README.txt.
- agent-browser: title "Arabclue | أراب كلاو", tender type selector (6 types), Run Agents → 100% C1, admin nav (6 items), AI providers (5 presets, ZAI GLM-4.6 ACTIVE), env settings (encrypted, grouped), billing (4 plans), security (users table), audit (immutable).

## Unresolved Issues / Risks
- **PDF is HTML-based:** To avoid pdfkit native-font/bundling issues in Turbopack, the "PDF" artifact is a print-optimized HTML document with a "Save as PDF" button. This renders perfectly in browsers and prints to PDF, but isn't a binary PDF. For true binary PDF, integrate a headless browser or Puppeteer in production.
- **archiver v8 incompatibility:** archiver v8 changed its API (no default export, `Archiver` class). Switched to JSZip which is pure-JS and ESM-friendly. The `archiver` package is still installed but unused — can be removed.
- **LLM fallback:** Non-ZAI providers (OpenAI/Anthropic/Mistral) return a deterministic fallback since only ZAI's z-ai-web-dev-sdk is wired. To enable others, add their API keys via the Env Settings admin module.
- **Auth/MFA UI:** Bootstrap auto-creates a demo SUPER_ADMIN user. Production needs the full login + MFA flow (schema fully supports it).

## Priority Recommendations for Next Phase
1. Add Puppeteer/Playwright-based binary PDF generation for true .pdf output.
2. Implement real auth + MFA login flow (NextAuth, schema ready).
3. Wire non-ZAI LLM providers (OpenAI/Anthropic) by reading their API keys from the encrypted EnvSetting table.
4. Add document version comparison (diff view).
5. Polish: framer-motion page transitions, skeleton loaders.
