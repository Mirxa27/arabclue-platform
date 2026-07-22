# API

## Auth

- `POST /api/auth/[...nextauth]` — credentials + JWT
- MFA: `/api/auth/mfa/setup|verify|disable`
- Password change: `/api/auth/password`

## Tenant

- Workspaces, projects, documents, proposals, compliance, onboarding corpus routes under `/api/*`
- Agents: `POST /api/agents/run`, `GET /api/agents/status`, `POST /api/agents/cancel`
- Billing: `POST /api/billing/checkout`, `GET /api/billing/callback`, `POST /api/billing/webhook`
- Export: `GET /api/proposals/:id/download?format=zip|pdf|pptx|xlsx-matrix|xlsx-boq` — **422** when validation gate fails

## Admin

- AI providers, env settings (write-only secrets), users, audit, plans
- **Payments → MyFatoorah:** `GET|POST /api/admin/myfatoorah`
  - GET: metadata only (masked secrets, webhook URL, recent events)
  - POST actions: `save`, `test_connection`, `test_webhook_signature`

## Health

- `GET /api/health` → `{ ok: true, service: "arabclue" }`

Errors never include stack traces, secrets, or filesystem paths.
