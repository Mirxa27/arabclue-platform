# Product gaps — make ArabClue fully useful (2026-07-24)

Research sources: Next.js App Router conventions (`loading` / `error` / `not-found`), local PRD + `IMPLEMENTATION_STATUS`, codebase audit.

## Closed in this pass

| Gap | Fix |
| --- | --- |
| Missing App Router route states | `not-found.tsx`, `error.tsx`, `global-error.tsx`, `(app)/app/loading.tsx`, `(app)/app/error.tsx` |
| Desktop-only shell | Mobile Sheet nav + topbar menu; hide fixed sidebar below `md` |
| Proposal export UX | Gate ZIP/PDF on `exportReady`; always-visible blockers; load/error; empty BoQ |
| Requirements evidence | Link CERTIFICATE / LIBRARY / STAFF from account assets |
| Compliance remediation | Next-action CTAs on non-compliant / partial controls |
| Etimad manual cockpit | Deadline / bond / envelope checklist on tender flow |
| Mission Control mobile | Drop hard `min-h-[560px]` on small screens |

## Still open (prioritized)

### P0 / P1

1. **Agent ops center** — run history across projects (not only active project).
2. **Reviews** — surface API errors (not empty); redline / diff timeline.
3. **Contract obligation register** — beyond draft studio.
4. **Qualification dossier UX** — guided steps around advisory checklist.
5. **Mission Control** — replace `alert()` for speech; resumable stream / clearer stop; mission-create error recovery.
6. **Onboarding CRUD** — toasts, empty lists, reorder approval steps.
7. **Consistent QueryState** — document-matrix, version-history, contracts (partially done).

### P2

8. Billing invoices / failed-payment UX (needs MyFatoorah merchant credentials for live charge).
9. Notifications mark-read (today’s feed is computed, not persisted).
10. Real KPI trends (stat cards still mostly static).

## Explicitly out of scope

- Etimad portal submission API
- SSO / OIDC
- Live MyFatoorah without merchant credentials
