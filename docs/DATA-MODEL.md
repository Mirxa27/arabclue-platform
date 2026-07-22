# Data model

Primary models (see `prisma/schema.prisma`):

## Identity & tenancy

- `User`, `UserSession`, `Workspace`, `WorkspaceMember`

## Tender workspace

- `TenderProject`, `UploadedDocument`, `DocumentVersion`, `DocumentChunk`
- `TenderRequirement` — tender requirements matrix (`COVERED` | `IN_PROGRESS` | `MISSING`)

## Account knowledge base

- `BrandProfile`, `PastProject`
- `Certificate` — expiry tracking
- `StaffMember` — CVs / role tags
- `MethodologyAsset`, `ContentLibraryItem`, `Partnership`
- `TargetSector`, `BidHistoryNote`
- `ApprovalPolicy` / `ApprovalStep`
- `Restriction`
- `OnboardingProgress` — step completion + `readyForProposals`

## Agents & outputs

- `AgentRun`, `ComplianceCheck`
- `GeneratedProposal` — includes `financialFormsJson` (human prices only)
- `ProposalVersion`, `ProposalReview`

## Platform

- `AIProviderConfig`, `EnvSetting`
- `SubscriptionPlan`, `Subscription`, `BillingRecord`, `PaymentCheckout`
- `AuditLog`
