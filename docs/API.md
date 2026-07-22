# API contracts (tenant)

All routes require session JWT unless noted. Writers exclude `REVIEWER` role except review decisions.

## Onboarding & account

| Method | Path | Notes |
| --- | --- | --- |
| GET/PATCH | `/api/onboarding` | Readiness + mark restrictions reviewed |
| GET/POST/PATCH/DELETE | `/api/certificates` | CRUD |
| GET/POST/PATCH/DELETE | `/api/staff` | CRUD |
| GET/POST/PATCH/DELETE | `/api/methodologies` | CRUD |
| GET/POST/PATCH/DELETE | `/api/library` | CRUD |
| GET/POST/DELETE | `/api/partnerships` | CRUD |
| GET/POST/DELETE | `/api/sectors` | Upsert by sector |
| GET/POST/DELETE | `/api/bid-history` | CRUD |
| GET/PUT | `/api/approval-policy` | Replace steps |
| GET/POST/DELETE | `/api/restrictions` | CRUD |
| PATCH | `/api/workspaces` | Switch workspace **or** update CR/VAT |

## Tender & proposals

| Method | Path | Notes |
| --- | --- | --- |
| GET/PATCH | `/api/projects/:id/requirements` | Matrix |
| POST | `/api/agents/run` | Requires onboarding ready + quota |
| GET/PATCH | `/api/proposals/:id/financial` | Human BoQ prices |
| POST | `/api/proposals/:id/submit` | Start approval |
| GET | `/api/reviews` | Pending for current user |
| PATCH | `/api/reviews/:id` | Approve/reject (reviewers allowed) |
| GET | `/api/notifications` | Certs, reviews, onboarding |

## Existing core

Auth, documents, proposals edit/download, brand, billing, admin — unchanged contracts; see route handlers under `src/app/api/`.
