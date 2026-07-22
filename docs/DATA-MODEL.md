# Data Model

Prisma schema: `prisma/schema.prisma` (PostgreSQL).

## Core tenants

- `User`, `UserSession`, `Workspace`, `WorkspaceMember`
- `TenderProject`, `UploadedDocument`, `DocumentVersion`, `DocumentChunk`
- `BrandProfile`, `PastProject`, onboarding corpus (certificates, staff, methodologies, library, partnerships, sectors, bid history, approval policy, restrictions)
- `TenderRequirement`, `ComplianceCheck`, `AgentRun`
- `GeneratedProposal`, `ProposalVersion`, `ProposalReview`
- `AIProviderConfig`, `EnvSetting` (encrypted secrets)
- `SubscriptionPlan`, `Subscription`, `BillingRecord`, `PaymentCheckout`
- `PaymentWebhookEvent` (Webhook V2 durable receipt + idempotency)
- `MyFatoorahRecurringProfile`
- `AuditLog`

## Tenancy rules

- Every tenant-owned record includes `workspaceId` (or is scoped via parent).
- Tenant context is derived from authenticated membership (`getTenantContext`), never from client-supplied tenant alone.
- Vector/chunk queries filter by `workspaceId`.

## Migrations

- `20260722140000_postgres_baseline`
- `20260722150000_payment_webhook_recurring`
