# Arabclue (أراب كلاو) — Project Worklog

## Project Overview
**Arabclue** is a B2B SaaS platform that automates compliant technical and financial proposal **structure** for Saudi government tenders on Etimad — **never pricing bids**.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind + shadcn/ui + Prisma (Postgres) + NextAuth + Playwright PDF + ExcelJS + JSZip + multi-provider LLM + MyFatoorah.

## Status (2026-07-22 production completion pass)

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
