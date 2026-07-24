# Product gaps — make ArabClue fully useful (2026-07-24)

Research sources: Next.js App Router conventions, local PRD + implementation status, codebase audit, SDD plan `docs/superpowers/plans/2026-07-24-remaining-product-gaps.md`.

## Closed

### Pass A (P0 UX) — `19f6efd`

Route states, mobile shell, proposal export readiness, requirements evidence, compliance remediation, Etimad manual cockpit, Mission Control mobile height.

### Pass B (remaining P1/P2) — `cursor/remaining-gaps-sdd-ab64`

| Gap | Fix |
| --- | --- |
| QueryState consistency | docs / contracts / version history |
| Agent ops center | `GET /api/agents/runs` + history strip |
| Reviews errors + redline | QueryState + version compare panel |
| Contract obligation register | derived from articles/milestones + localStorage done |
| Mission Control recovery | toast (no alert), mission create Retry, Stop teardown |
| Qualification + onboarding CRUD | gap CTAs, EmptyState/toasts, approval reorder/delete |
| Billing failure UX | PAST_DUE / FAILED Alert + Retry checkout |
| Notification dismiss | localStorage; onboarding id fingerprints missing steps |
| Real KPI trends | 7d vs prior 7d; no fake arrows |

## Explicitly out of scope

- Etimad portal submission API
- SSO / OIDC
- Live MyFatoorah without merchant credentials
