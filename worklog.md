# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates compliant technical and financial proposal **structure** for Saudi government tenders on Etimad — **never pricing bids**.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma (SQLite local) + NextAuth + Playwright PDF + ExcelJS + JSZip + multi-provider LLM.

## Status (2026-07-22 full product pass)

### Delivered vs product brief
- 10-part account onboarding hub + readiness gate on agent run
- Tender requirements matrix (persist + UI status linking)
- Structure-only financial BoQ; human price entry; pricing guardrails (tested)
- Approval chain submit/review/approve; reviews queue
- Certificate expiry + in-app notifications
- Engineering docs: `prd/PRD.md`, `docs/ARCHITECTURE.md`, `DATA-MODEL.md`, `API.md`, `SECURITY.md`, `STYLE.md`, `GUARDRAILS.md`

### Prior solid core
- Multi-agent pipeline, proposal editor/export, NextAuth + MFA
- Admin CRUD, MyFatoorah billing, quotas, tenant membership scoping

### Intentionally out of scope
- Real Etimad portal submission API
- Redis/Bull job queue
- SSO

## Verification
```bash
bun run lint
bunx tsc --noEmit
bun test
```
