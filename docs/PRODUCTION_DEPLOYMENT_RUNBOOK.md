# Production Deployment and Secret Incident Runbook

## Current release status

**Blocked as of 2026-07-24.** The sensitive `.env` file has been removed from
the current Git index but remains in three public historical commits. A fixed
development administrator identity and five generated role credential rows
also appeared in public history. Their current-tree removal does not revoke the
live credentials or erase Git history.

Do not create a Preview or Production deployment until the external remediation
owner has completed every item in the incident checklist and
`bun run deploy:safety` passes. This document intentionally never records a
secret value.

## Release invariants

- A build compiles application code and assets only. It never runs
  `prisma migrate`, `prisma db push`, or `prisma db reset`.
- Every Vercel Preview deployment uses a dedicated Neon branch. Preview and
  Production must not share a database URL or database role.
- Production schema changes are backward-compatible, tested on an isolated
  branch, backed up, and applied once in a separately approved release step.
- Secrets live in the provider secret store and are scoped to exactly one
  environment. Local environment files and generated credentials are never
  committed or uploaded.
- A known-good deployment and a tested rollback procedure exist before traffic
  moves.

## Secret incident response

These steps require repository-owner and provider-admin authority. They were
not performed by the code change that introduced this runbook.

1. Pause automatic deployments and restrict repository access while triage is
   active.
2. Inventory every credential named by the tracked environment file and Git
   history without copying values into tickets, chat, or logs.
3. Rotate or revoke each credential at its source provider. Include database
   roles, authentication and encryption secrets, administrator passwords, blob
   storage, email, billing, and model-provider keys where configured.
4. Revoke active application sessions after rotating authentication material.
   Disable every reserved development identity, reset all generated
   SUPER_ADMIN/ADMIN/BIDDER/REVIEWER/FINANCE credentials, revoke their active
   sessions, audit activity from first exposure, and require MFA before any
   account is re-enabled.
5. Review Neon, Vercel, GitHub, authentication, billing, storage, and email
   audit logs from the earliest exposed commit onward. Escalate to the security
   and legal owners if unauthorized access or personal-data exposure is
   suspected.
6. Record rotation completion by credential name, owner, timestamp, and
   provider—not by value.

## Git index and history remediation

History rewriting is destructive and requires an approved maintenance window.
Do not perform these actions from a dirty working checkout.

1. Back up the repository and freeze merges and deployments.
2. In a temporary mirror clone, remove `.env` from every ref with an approved
   history-rewrite tool.
3. In the normal checkout, remove `.env` from the index while keeping the local
   file. Verify `.env.example` remains tracked and contains placeholders only.
4. Have a repository owner force-update all affected protected refs.
5. Verify that no branch, tag, pull request ref, release artifact, cache, or
   deployment source bundle still contains the file.
6. Require every collaborator and automation runner to re-clone or reset to the
   rewritten history.
7. Re-enable protected branches only after secret scanning and
   `bun run deploy:safety` pass.

Rotating credentials is mandatory even after a perfect history rewrite because
old clones and caches may retain the original objects.

## Database release procedure

1. Create an isolated Neon branch from the intended base and point only the
   test environment at it.
2. Generate and commit migrations against the isolated development workflow;
   never use `prisma db push` against Preview or Production.
3. Apply the committed migration to a fresh isolated branch, then run the full
   application test suite and representative document-generation flows.
4. Confirm the migration is backward-compatible with the currently deployed
   application and document the forward-recovery plan.
5. Create or verify a Production restore point and obtain release approval.
6. Supply the Production migration connection from the secret manager and run
   `bun run db:migrate:deploy` exactly once from the controlled release job.
7. Verify migration status and application readiness before deploying code.

Vercel's `buildCommand` is `bun run build`, so neither Preview nor Production
builds can mutate the database.

<!-- BEGIN GENERATED MIGRATION LEDGER — generated from src/lib/migration-registry.ts; do not edit by hand -->

## Migration ledger

All 24 migrations under `prisma/migrations` are listed below with their
identifiers, the capabilities they affect, their positions in the apply sequence,
and their reverse actions. Prisma applies migrations in lexicographic directory
order, so the positions below are the apply order.

`GET /api/ready` compares this set against the `_prisma_migrations` ledger of the
connected database and reports a not-ready state carrying
`SCHEMA_MIGRATION_PENDING`, every unapplied identifier, and the affected
capability names while any migration is absent. That readiness comparison is
read-only and issues no data-definition statement.

This block is generated from `src/lib/migration-registry.ts`. Do not edit it by
hand: run `bun scripts/sync-migration-runbook.mjs --write` after changing the registry.
`bun run deploy:safety` and `src/lib/__tests__/migration-runbook.test.ts` both
fail while this block differs from the registry, and
`src/lib/__tests__/migration-registry.test.ts` fails while the registry differs
from the migration directory.

Apply the whole sequence with one `bun run db:migrate:deploy` from the
controlled release job. Never apply a subset by hand.

| # | Migration identifier | Reverse action | Affected capabilities |
| --- | --- | --- | --- |
| 1 | `20260722140000_postgres_baseline` | none | authentication, workspace tenancy, tender projects, document ingestion, proposal generation, agent runs, compliance checks, approval policy, billing, audit log, knowledge records |
| 2 | `20260722150000_payment_webhook_recurring` | documented below | payment webhook idempotence, recurring subscription billing |
| 3 | `20260722160000_knowledge_eligibility` | documented below | knowledge eligibility screening |
| 4 | `20260722170000_proposal_studio` | documented below | proposal studio editing, agent run telemetry |
| 5 | `20260722180000_provider_models_cache` | documented below | LLM provider model cache |
| 6 | `20260723000000_copilot_mission_control` | documented below | platform copilot, mission control, mission attachments |
| 7 | `20260723101000_provider_multi_engines` | documented below | multi-engine LLM routing |
| 8 | `20260724161123_contract_templates` | documented below | contract template provider selection |
| 9 | `20260724180000_production_persistence` | documented below | contract obligation tracking, expiry notifications, notification dismissal |
| 10 | `20260724200000_contract_templates` | documented below | contract template catalog, contract template versioning, standard clause library, generated contracts |
| 11 | `20260724214500_contract_template_safety` | documented below | contract legal-review safety flags, contract non-executable marking |
| 12 | `20260724223000_knowledge_review_safety` | documented below | knowledge approval queue, knowledge review provenance |
| 13 | `20260724231500_proposal_structured_snapshot` | documented below | structured proposal snapshot, authoritative bilingual export |
| 14 | `20260724234500_proposal_review_integrity` | documented below | proposal review snapshot integrity |
| 15 | `20260725001000_knowledge_evidence_integrity` | documented below | knowledge evidence binding, evidence checksum provenance |
| 16 | `20260725003000_contract_draft_persistence` | documented below | contract draft persistence |
| 17 | `20260725004000_contract_render_snapshot` | documented below | contract render snapshot |
| 18 | `20260725_phase4_proposal_system` | documented below | activity analytics, collaboration comments, proposal builder sections, template marketplace |
| 19 | `20260726000000_platform_completion` | documented below | email verification, credential recovery, workspace invitations, contract instance revision history, transactional notification delivery, in-application notifications, marketplace ratings, marketplace usage accounting, recurring checkout idempotence, proposal presence |
| 20 | `20260729100000_marketplace_rating_check` | documented below | marketplace rating integrity |
| 21 | `20260822170000_notification_delivery_channel_unique` | documented below | multi-channel notification delivery |
| 22 | `20260822180000_analytics_daily_summary` | documented below | analytics retention archival |
| 23 | `20260822190000_auth_hardening_mfa` | documented below | authentication, MFA enrolment staging, TOTP replay protection, MFA recovery codes |
| 24 | `20260822200000_money_decimal_columns` | documented below | billing, exact SAR storage |

### 1. `20260722140000_postgres_baseline`

- **Apply position:** 1 of 24
- **Capabilities:** authentication, workspace tenancy, tender projects, document ingestion, proposal generation, agent runs, compliance checks, approval policy, billing, audit log, knowledge records
- **Tables created:** `User`, `UserSession`, `Workspace`, `WorkspaceMember`, `TenderProject`, `UploadedDocument`, `DocumentChunk`, `DocumentVersion`, `BrandProfile`, `PastProject`, `AgentRun`, `ComplianceCheck`, `GeneratedProposal`, `ProposalVersion`, `AIProviderConfig`, `EnvSetting`, `SubscriptionPlan`, `Subscription`, `BillingRecord`, `PaymentCheckout`, `AuditLog`, `Certificate`, `StaffMember`, `MethodologyAsset`, `ContentLibraryItem`, `Partnership`, `TargetSector`, `BidHistoryNote`, `ApprovalPolicy`, `ApprovalStep`, `Restriction`, `OnboardingProgress`, `TenderRequirement`, `ProposalReview`
- **Reverse action:** **None.** This migration has no reverse action; recover forward or restore the pre-release restore point.

### 2. `20260722150000_payment_webhook_recurring`

- **Apply position:** 2 of 24
- **Capabilities:** payment webhook idempotence, recurring subscription billing
- **Tables created:** `PaymentWebhookEvent`, `MyFatoorahRecurringProfile`
- **Reverse action:** DROP TABLE "MyFatoorahRecurringProfile"; DROP TABLE "PaymentWebhookEvent";

### 3. `20260722160000_knowledge_eligibility`

- **Apply position:** 3 of 24
- **Capabilities:** knowledge eligibility screening
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "Certificate" and "PastProject": drop the added eligibility columns.

### 4. `20260722170000_proposal_studio`

- **Apply position:** 4 of 24
- **Capabilities:** proposal studio editing, agent run telemetry
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "AgentRun" and "GeneratedProposal": drop the added studio columns.

### 5. `20260722180000_provider_models_cache`

- **Apply position:** 5 of 24
- **Capabilities:** LLM provider model cache
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "AIProviderConfig": drop the added model-cache columns.

### 6. `20260723000000_copilot_mission_control`

- **Apply position:** 6 of 24
- **Capabilities:** platform copilot, mission control, mission attachments
- **Tables created:** `CopilotMission`, `CopilotMessage`, `CopilotAttachment`, `CopilotAction`
- **Reverse action:** DROP TABLE "CopilotAction"; DROP TABLE "CopilotAttachment"; DROP TABLE "CopilotMessage"; DROP TABLE "CopilotMission";

### 7. `20260723101000_provider_multi_engines`

- **Apply position:** 7 of 24
- **Capabilities:** multi-engine LLM routing
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "AIProviderConfig": drop the added engine columns.

### 8. `20260724161123_contract_templates`

- **Apply position:** 8 of 24
- **Capabilities:** contract template provider selection
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "AIProviderConfig": drop the added contract-template column.

### 9. `20260724180000_production_persistence`

- **Apply position:** 9 of 24
- **Capabilities:** contract obligation tracking, expiry notifications, notification dismissal
- **Tables created:** `ContractObligationState`, `ExpiryNotificationLog`, `NotificationDismissal`
- **Reverse action:** DROP TABLE "NotificationDismissal"; DROP TABLE "ExpiryNotificationLog"; DROP TABLE "ContractObligationState";

### 10. `20260724200000_contract_templates`

- **Apply position:** 10 of 24
- **Capabilities:** contract template catalog, contract template versioning, standard clause library, generated contracts
- **Tables created:** `ContractTemplate`, `ContractTemplateVersion`, `StandardClause`, `GeneratedContract`
- **Reverse action:** DROP TABLE "GeneratedContract"; DROP TABLE "StandardClause"; DROP TABLE "ContractTemplateVersion"; DROP TABLE "ContractTemplate";

### 11. `20260724214500_contract_template_safety`

- **Apply position:** 11 of 24
- **Capabilities:** contract legal-review safety flags, contract non-executable marking
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "ContractTemplate", "ContractTemplateVersion", "StandardClause", "GeneratedContract": drop the added legal-safety columns.

### 12. `20260724223000_knowledge_review_safety`

- **Apply position:** 12 of 24
- **Capabilities:** knowledge approval queue, knowledge review provenance
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "Certificate", "PastProject", "MethodologyAsset", "ContentLibraryItem": drop the added review columns.

### 13. `20260724231500_proposal_structured_snapshot`

- **Apply position:** 13 of 24
- **Capabilities:** structured proposal snapshot, authoritative bilingual export
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "GeneratedProposal": drop the added snapshot columns.

### 14. `20260724234500_proposal_review_integrity`

- **Apply position:** 14 of 24
- **Capabilities:** proposal review snapshot integrity
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "ProposalReview": drop the added integrity columns.

### 15. `20260725001000_knowledge_evidence_integrity`

- **Apply position:** 15 of 24
- **Capabilities:** knowledge evidence binding, evidence checksum provenance
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "Certificate", "PastProject", "MethodologyAsset", "ContentLibraryItem": drop the added evidence-binding columns.

### 16. `20260725003000_contract_draft_persistence`

- **Apply position:** 16 of 24
- **Capabilities:** contract draft persistence
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "ContractTemplate" and "GeneratedContract": drop the added draft columns.

### 17. `20260725004000_contract_render_snapshot`

- **Apply position:** 17 of 24
- **Capabilities:** contract render snapshot
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "GeneratedProposal": drop the added render-snapshot columns.

### 18. `20260725_phase4_proposal_system`

- **Apply position:** 18 of 24
- **Capabilities:** activity analytics, collaboration comments, proposal builder sections, template marketplace
- **Tables created:** `AnalyticsEvent`, `CollaborationComment`, `ProposalBuilderSection`, `TemplateMarketplaceEntry`
- **Reverse action:** DROP TABLE "TemplateMarketplaceEntry"; DROP TABLE "ProposalBuilderSection"; DROP TABLE "CollaborationComment"; DROP TABLE "AnalyticsEvent";

### 19. `20260726000000_platform_completion`

- **Apply position:** 19 of 24
- **Capabilities:** email verification, credential recovery, workspace invitations, contract instance revision history, transactional notification delivery, in-application notifications, marketplace ratings, marketplace usage accounting, recurring checkout idempotence, proposal presence
- **Tables created:** `VerificationToken`, `RecoveryToken`, `WorkspaceInvitation`, `GeneratedContractVersion`, `RecurringCheckoutIntent`, `TemplateMarketplaceApplication`, `NotificationDelivery`, `InAppNotification`, `TemplateMarketplaceRating`, `ProposalPresence`
- **Reverse action:** DROP TABLE "ProposalPresence"; DROP TABLE "TemplateMarketplaceRating"; DROP TABLE "InAppNotification"; DROP TABLE "NotificationDelivery"; DROP TABLE "TemplateMarketplaceApplication"; DROP TABLE "RecurringCheckoutIntent"; DROP TABLE "GeneratedContractVersion"; DROP TABLE "WorkspaceInvitation"; DROP TABLE "RecoveryToken"; DROP TABLE "VerificationToken"; then drop the columns added by this migration.

### 20. `20260729100000_marketplace_rating_check`

- **Apply position:** 20 of 24
- **Capabilities:** marketplace rating integrity
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "TemplateMarketplaceRating": DROP CONSTRAINT IF EXISTS "template_marketplace_rating_range_check";

### 21. `20260822170000_notification_delivery_channel_unique`

- **Apply position:** 21 of 24
- **Capabilities:** multi-channel notification delivery
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** CREATE UNIQUE INDEX "NotificationDelivery_eventId_recipientId_key" ON "NotificationDelivery"("eventId", "recipientId"); — only safe after collapsing multi-channel rows to one row per (eventId, recipientId).

### 22. `20260822180000_analytics_daily_summary`

- **Apply position:** 22 of 24
- **Capabilities:** analytics retention archival
- **Tables created:** `AnalyticsDailySummary`
- **Reverse action:** DROP TABLE "AnalyticsDailySummary";

### 23. `20260822190000_auth_hardening_mfa`

- **Apply position:** 23 of 24
- **Capabilities:** authentication, MFA enrolment staging, TOTP replay protection, MFA recovery codes
- **Tables created:** `MfaRecoveryCode`
- **Reverse action:** DROP TABLE "MfaRecoveryCode"; ALTER TABLE "User" DROP COLUMN "pendingMfaSecret"; ALTER TABLE "User" DROP COLUMN "mfaLastUsedStep";

### 24. `20260822200000_money_decimal_columns`

- **Apply position:** 24 of 24
- **Capabilities:** billing, exact SAR storage
- **Tables created:** none — adds columns, indexes, or constraints only
- **Reverse action:** ALTER TABLE "SubscriptionPlan" DROP COLUMN "priceMonthlyDecimal"; ALTER TABLE "SubscriptionPlan" DROP COLUMN "priceYearlyDecimal"; ALTER TABLE "BillingRecord" DROP COLUMN "amountDecimal"; ALTER TABLE "PaymentCheckout" DROP COLUMN "amountDecimal";

<!-- END GENERATED MIGRATION LEDGER -->

## Pre-deployment gates

Run from a clean checkout of the exact commit to be released:

```bash
bun install --frozen-lockfile
bun run deploy:safety
bun run lint
bun run test
bun run build
```

For bilingual document releases, also run:

```bash
PLAYWRIGHT_CHROMIUM=1 bun run test:bilingual:visual
PLAYWRIGHT_CHROMIUM=1 bun run benchmark:bilingual
```

Before promoting a Preview deployment:

- Confirm its database hostname or branch identifier is different from
  Production without logging either connection string.
- Call `/api/health` and `/api/ready`.
- Complete login, authorization, upload, bilingual HTML preview, and PDF export
  smoke tests.
- Check that logs contain no secrets, database errors, or new 5xx responses.

## Production release and verification

After all approvals and gates pass, deploy the verified commit through the
normal Vercel production workflow. Record the commit SHA, deployment URL,
migration identifier, approver, and known-good rollback deployment.

Verify:

- `/api/health` and `/api/ready` return successful responses.
- The public domain and `www` redirect use HTTPS and expected security headers.
- Login and role restrictions behave correctly.
- A bilingual HTML document and its PDF export both render Arabic and English
  content correctly.
- Error rate, database activity, memory, and PDF latency remain normal through
  the observation window.

## Application rollback

If the release is unhealthy, restore the last known-good Vercel deployment:

```bash
vercel rollback <known-good-deployment-url>
vercel rollback status
```

Then re-run health, readiness, login, and document-export checks. A Vercel
rollback does not revert a database migration. Never use `prisma migrate reset`
in Production; use the documented forward fix or restore procedure approved
for that migration.

## Authoritative platform references

- [Vercel project build configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel environment scoping](https://vercel.com/docs/environment-variables)
- [Vercel production rollback](https://vercel.com/docs/deployments/rollback-production-deployment)
- [Neon database branching workflow](https://neon.com/docs/get-started-with-neon/workflow-primer)
