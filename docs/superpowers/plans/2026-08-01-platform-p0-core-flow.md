# Platform completion — P0 core flow (2026-08-01)

> Branch: `cursor/e2e-completion-ab64`
> Stack: **Next.js 16 + Prisma/Neon** (not FastAPI/Mongo — product brief stack is aspirational only)

## Done this batch

1. Agent durability — `scheduleAgentPipeline` via `after()`; stale QUEUED/RUNNING auto-FAILED on new run
2. Onboarding incomplete — API returns `missing[]`; Agents UI deep-links to Account
3. Track record CTA — Account → Knowledge Approval for evidence approval
4. Export loop — structured `xlsx` + structured ZIP package; proposals list **Submit review**
5. Download engine — `STRUCTURED_SUPPLEMENTAL` for zip/matrix/boq when snapshot exists

## Still open (not this batch)

- Solo OWNER self-approve shortcut when policy is single-step (Reviews queue already works)
- Slack / WhatsApp notifications
- Playwright full login e2e suite
- Optional marketplace rating CHECK migration
