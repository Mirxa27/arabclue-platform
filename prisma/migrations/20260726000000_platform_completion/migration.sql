-- Platform-completion compatibility baseline.
-- Forward-only and strictly additive: apply only through an explicitly approved release.
--
-- Invariants enforced by this file (Requirement 16.1):
--   * No statement removes, renames, retypes, or empties an existing object.
--   * Every ALTER TABLE ... ADD COLUMN is nullable or carries a default, so the
--     statement applies to a table that already holds rows.
--   * Every CREATE TABLE / CREATE INDEX / ADD CONSTRAINT is guarded so re-running
--     the migration on a partially provisioned database is a no-op.
--   * Every added constraint is created NOT VALID so existing rows are never
--     rejected at apply time; validation is a separate approved release action.
--
-- Objects that PostgreSQL supports but the Prisma schema language cannot express
-- (expression indexes, partial indexes, CHECK constraints) live only here and are
-- annotated in prisma/schema.prisma with a "SQL-only" comment.

-- ─── Existing-table compatibility columns ──────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN IF NOT EXISTS "maxSeats" INTEGER;

ALTER TABLE "StandardClause"
  ADD COLUMN IF NOT EXISTS "clauseKey" TEXT,
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "isCustom" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CollaborationComment"
  ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isWithdrawn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TemplateMarketplaceEntry"
  ADD COLUMN IF NOT EXISTS "isRetired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AnalyticsEvent"
  ADD COLUMN IF NOT EXISTS "eventKey" TEXT,
  ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;

ALTER TABLE "ContractTemplate"
  ADD COLUMN IF NOT EXISTS "currentVersionNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "currentVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isExecutable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ContractTemplateVersion"
  ADD COLUMN IF NOT EXISTS "versionNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "isExecutable" BOOLEAN NOT NULL DEFAULT false;

-- Legacy Float "amount" is retained unchanged; "amountExact" carries the exact
-- stored literal copied from the plan cycle price (Requirement 9.1).
ALTER TABLE "MyFatoorahRecurringProfile"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "planId" TEXT,
  ADD COLUMN IF NOT EXISTS "amount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "amountExact" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS "nextChargeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastChargeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedCharges" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastFailureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lastFailureAt" TIMESTAMP(3);

-- ─── Versioned token digests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "hashSalt" TEXT,
  "hashVersion" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RecoveryToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "hashSalt" TEXT,
  "hashVersion" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "tokenHash" TEXT NOT NULL,
  "hashSalt" TEXT,
  "hashVersion" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "inviterId" TEXT,
  "emailDeliveryState" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- ─── Immutable generated-contract snapshots ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "GeneratedContractVersion" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "templateVersionId" TEXT,
  "bindingsJson" TEXT NOT NULL,
  "variableValuesJson" TEXT,
  "selectedClauseIdsJson" TEXT,
  "documentSpecJson" TEXT,
  "contentHtml" TEXT NOT NULL,
  "canonicalHash" TEXT,
  "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "isExecutable" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratedContractVersion_pkey" PRIMARY KEY ("id")
);

-- ─── Recurring checkout reservation ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecurringCheckoutIntent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "billingCycle" TEXT NOT NULL,
  "amountExact" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT,
  "expiresAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringCheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- ─── Marketplace rating and application idempotency ─────────────────────────
CREATE TABLE IF NOT EXISTS "TemplateMarketplaceRating" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateMarketplaceRating_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemplateMarketplaceApplication" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "appliedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateMarketplaceApplication_pkey" PRIMARY KEY ("id")
);

-- ─── Durable collaboration presence ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProposalPresence" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sectionKey" TEXT,
  CONSTRAINT "ProposalPresence_pkey" PRIMARY KEY ("id")
);

-- ─── Notification outbox and in-application inbox ───────────────────────────
CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "eventId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "recipientEmail" TEXT,
  "recipientLocale" TEXT,
  "templateKey" TEXT,
  "payloadJson" JSONB,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "firstAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "claimedBy" TEXT,
  "deliveryDeadlineAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InAppNotification" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL,
  "titleAr" TEXT NOT NULL,
  "bodyEn" TEXT NOT NULL,
  "bodyAr" TEXT NOT NULL,
  "href" TEXT,
  "eventId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- ─── Compatibility columns for tables that may already exist ────────────────
-- These tables can be present from an earlier provisioning of the same wave.
-- Every statement below is additive so both provisioning paths converge.
ALTER TABLE "VerificationToken"
  ADD COLUMN IF NOT EXISTS "hashSalt" TEXT,
  ADD COLUMN IF NOT EXISTS "hashVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP(3);

ALTER TABLE "RecoveryToken"
  ADD COLUMN IF NOT EXISTS "hashSalt" TEXT,
  ADD COLUMN IF NOT EXISTS "hashVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceInvitation"
  ADD COLUMN IF NOT EXISTS "hashSalt" TEXT,
  ADD COLUMN IF NOT EXISTS "hashVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inviterId" TEXT,
  ADD COLUMN IF NOT EXISTS "emailDeliveryState" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "GeneratedContractVersion"
  ADD COLUMN IF NOT EXISTS "templateVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "variableValuesJson" TEXT,
  ADD COLUMN IF NOT EXISTS "selectedClauseIdsJson" TEXT,
  ADD COLUMN IF NOT EXISTS "documentSpecJson" TEXT,
  ADD COLUMN IF NOT EXISTS "canonicalHash" TEXT,
  ADD COLUMN IF NOT EXISTS "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN IF NOT EXISTS "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isExecutable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RecurringCheckoutIntent"
  ADD COLUMN IF NOT EXISTS "providerReference" TEXT,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3);

ALTER TABLE "ProposalPresence"
  ADD COLUMN IF NOT EXISTS "sectionKey" TEXT;

ALTER TABLE "NotificationDelivery"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientLocale" TEXT,
  ADD COLUMN IF NOT EXISTS "templateKey" TEXT,
  ADD COLUMN IF NOT EXISTS "payloadJson" JSONB,
  ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "claimedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryDeadlineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "InAppNotification"
  ADD COLUMN IF NOT EXISTS "href" TEXT,
  ADD COLUMN IF NOT EXISTS "eventId" TEXT,
  ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;

-- ─── Normalized knowledge-decision metadata ─────────────────────────────────
ALTER TABLE "PastProject"
  ADD COLUMN IF NOT EXISTS "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionReasonAr" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReasonEn" TEXT;

ALTER TABLE "Certificate"
  ADD COLUMN IF NOT EXISTS "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionReasonAr" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReasonEn" TEXT;

ALTER TABLE "MethodologyAsset"
  ADD COLUMN IF NOT EXISTS "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionReasonAr" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReasonEn" TEXT;

ALTER TABLE "ContentLibraryItem"
  ADD COLUMN IF NOT EXISTS "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionReasonAr" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReasonEn" TEXT;

ALTER TABLE "StaffMember"
  ADD COLUMN IF NOT EXISTS "decisionStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "submittedById" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "decisionReasonAr" TEXT,
  ADD COLUMN IF NOT EXISTS "decisionReasonEn" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceDocumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidenceVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "evidenceChecksum" TEXT;

-- ─── Normalized-identity uniqueness (SQL-only expression indexes) ───────────
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_key"
  ON "User" (lower(btrim("email")));

-- ─── Token digest uniqueness and lookup indexes ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_tokenHash_key"
  ON "VerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "VerificationToken_userId_idx"
  ON "VerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "VerificationToken_userId_consumedAt_expiresAt_idx"
  ON "VerificationToken"("userId", "consumedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "VerificationToken_tokenHash_idx"
  ON "VerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "VerificationToken_expiresAt_idx"
  ON "VerificationToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryToken_tokenHash_key"
  ON "RecoveryToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RecoveryToken_userId_createdAt_idx"
  ON "RecoveryToken"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RecoveryToken_userId_consumedAt_expiresAt_idx"
  ON "RecoveryToken"("userId", "consumedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "RecoveryToken_tokenHash_idx"
  ON "RecoveryToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RecoveryToken_expiresAt_idx"
  ON "RecoveryToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_tokenHash_key"
  ON "WorkspaceInvitation"("tokenHash");
-- SQL-only partial expression index: at most one pending invitation per
-- workspace and normalized email (Requirement 3.1).
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_normalizedEmail_active_key"
  ON "WorkspaceInvitation"("workspaceId", lower(btrim("email")))
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_email_idx"
  ON "WorkspaceInvitation"("workspaceId", "email");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_expiresAt_idx"
  ON "WorkspaceInvitation"("workspaceId", "expiresAt");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_state_createdAt_id_idx"
  ON "WorkspaceInvitation"("workspaceId", "consumedAt", "revokedAt", "createdAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_consumedAt_idx"
  ON "WorkspaceInvitation"("email", "consumedAt");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_tokenHash_idx"
  ON "WorkspaceInvitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_inviterId_idx"
  ON "WorkspaceInvitation"("inviterId");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_idx"
  ON "WorkspaceInvitation"("email");

-- ─── Analytics idempotence and range scans ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsEvent_eventKey_key"
  ON "AnalyticsEvent"("eventKey");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_workspaceId_eventType_createdAt_id_idx"
  ON "AnalyticsEvent"("workspaceId", "eventType", "createdAt", "id");

-- ─── Clause library keys and scoped lookups ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "StandardClause_workspaceId_clauseKey_key"
  ON "StandardClause"("workspaceId", "clauseKey");
-- SQL-only partial unique index: workspace-independent catalog rows carry a NULL
-- workspaceId, so the compound unique index above cannot make the catalog key
-- unique on its own. Idempotent catalog seeding depends on this (Requirement 5.2).
CREATE UNIQUE INDEX IF NOT EXISTS "StandardClause_catalog_clauseKey_key"
  ON "StandardClause"("clauseKey")
  WHERE "workspaceId" IS NULL AND "clauseKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "StandardClause_workspaceId_isCustom_idx"
  ON "StandardClause"("workspaceId", "isCustom");
CREATE INDEX IF NOT EXISTS "StandardClause_clauseKey_isActive_idx"
  ON "StandardClause"("clauseKey", "isActive");
CREATE INDEX IF NOT EXISTS "StandardClause_category_isActive_workspaceId_idx"
  ON "StandardClause"("category", "isActive", "workspaceId");
CREATE INDEX IF NOT EXISTS "StandardClause_clauseKey_idx"
  ON "StandardClause"("clauseKey");

-- ─── Template version pointers and immutable history cursors ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplate_currentVersionId_key"
  ON "ContractTemplate"("currentVersionId");
CREATE INDEX IF NOT EXISTS "ContractTemplate_workspaceId_lifecycle_createdAt_id_idx"
  ON "ContractTemplate"("workspaceId", "lifecycle", "createdAt", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplateVersion_templateId_versionNumber_key"
  ON "ContractTemplateVersion"("templateId", "versionNumber");
CREATE INDEX IF NOT EXISTS "ContractTemplateVersion_templateId_versionNumber_id_idx"
  ON "ContractTemplateVersion"("templateId", "versionNumber" DESC, "id");

CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedContractVersion_contractId_revision_key"
  ON "GeneratedContractVersion"("contractId", "revision");
CREATE INDEX IF NOT EXISTS "GeneratedContractVersion_contractId_revision_idx"
  ON "GeneratedContractVersion"("contractId", "revision");
CREATE INDEX IF NOT EXISTS "GeneratedContractVersion_contractId_revision_id_cursor_idx"
  ON "GeneratedContractVersion"("contractId", "revision" DESC, "id");
CREATE INDEX IF NOT EXISTS "GeneratedContractVersion_templateVersionId_idx"
  ON "GeneratedContractVersion"("templateVersionId");
CREATE INDEX IF NOT EXISTS "GeneratedContractVersion_createdBy_idx"
  ON "GeneratedContractVersion"("createdBy");

-- ─── Keyset cursors for complete version history ────────────────────────────
CREATE INDEX IF NOT EXISTS "ProposalVersion_proposalId_version_id_cursor_idx"
  ON "ProposalVersion"("proposalId", "version" DESC, "id");
CREATE INDEX IF NOT EXISTS "DocumentVersion_documentId_version_id_cursor_idx"
  ON "DocumentVersion"("documentId", "version" DESC, "id");
CREATE INDEX IF NOT EXISTS "PaymentCheckout_status_createdAt_id_idx"
  ON "PaymentCheckout"("status", "createdAt", "id");

-- ─── Recurring profile scope and at-most-one current profile ────────────────
CREATE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_workspaceId_status_createdAt_id_idx"
  ON "MyFatoorahRecurringProfile"("workspaceId", "status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_subscriptionId_idx"
  ON "MyFatoorahRecurringProfile"("subscriptionId");
CREATE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_subscriptionId_status_idx"
  ON "MyFatoorahRecurringProfile"("subscriptionId", "status");
-- SQL-only partial unique index: at most one DRAFT or ACTIVE profile per
-- subscription (Requirement 9.11).
CREATE UNIQUE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_subscriptionId_current_key"
  ON "MyFatoorahRecurringProfile"("subscriptionId")
  WHERE "subscriptionId" IS NOT NULL AND "status" IN ('DRAFT', 'ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS "RecurringCheckoutIntent_subscriptionId_idempotencyKey_key"
  ON "RecurringCheckoutIntent"("subscriptionId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "RecurringCheckoutIntent_workspaceId_status_createdAt_id_idx"
  ON "RecurringCheckoutIntent"("workspaceId", "status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "RecurringCheckoutIntent_status_createdAt_id_idx"
  ON "RecurringCheckoutIntent"("status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "RecurringCheckoutIntent_providerReference_idx"
  ON "RecurringCheckoutIntent"("providerReference");

-- ─── Marketplace rating replacement and application idempotence ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateMarketplaceRating_entryId_userId_key"
  ON "TemplateMarketplaceRating"("entryId", "userId");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceRating_entryId_rating_idx"
  ON "TemplateMarketplaceRating"("entryId", "rating");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceRating_userId_idx"
  ON "TemplateMarketplaceRating"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "TemplateMarketplaceApplication_entryId_proposalId_key"
  ON "TemplateMarketplaceApplication"("entryId", "proposalId");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceApplication_workspaceId_createdAt_id_idx"
  ON "TemplateMarketplaceApplication"("workspaceId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceApplication_proposalId_idx"
  ON "TemplateMarketplaceApplication"("proposalId");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceApplication_appliedById_idx"
  ON "TemplateMarketplaceApplication"("appliedById");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_isRetired_idx"
  ON "TemplateMarketplaceEntry"("isRetired");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_isRetired_isPublic_createdAt_id_idx"
  ON "TemplateMarketplaceEntry"("isRetired", "isPublic", "createdAt", "id");

-- ─── Notification delivery uniqueness and dispatch scans ────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_eventId_recipientId_key"
  ON "NotificationDelivery"("eventId", "recipientId");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_eventId_recipientId_channel_key"
  ON "NotificationDelivery"("eventId", "recipientId", "channel");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_workspaceId_createdAt_idx"
  ON "NotificationDelivery"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_recipientId_createdAt_idx"
  ON "NotificationDelivery"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_eventId_idx"
  ON "NotificationDelivery"("eventId");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_nextAttemptAt_claimExpiresAt_id_idx"
  ON "NotificationDelivery"("status", "nextAttemptAt", "claimExpiresAt", "id");
CREATE INDEX IF NOT EXISTS "NotificationDelivery_claimedAt_claimExpiresAt_idx"
  ON "NotificationDelivery"("claimedAt", "claimExpiresAt");
-- SQL-only partial index for the retry dispatcher claim scan.
CREATE INDEX IF NOT EXISTS "NotificationDelivery_dispatch_ready_idx"
  ON "NotificationDelivery"("nextAttemptAt", "createdAt", "id")
  WHERE "status" IN ('PENDING', 'FAILED');

CREATE UNIQUE INDEX IF NOT EXISTS "InAppNotification_eventId_userId_key"
  ON "InAppNotification"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "InAppNotification_workspaceId_userId_isRead_idx"
  ON "InAppNotification"("workspaceId", "userId", "isRead");
CREATE INDEX IF NOT EXISTS "InAppNotification_userId_createdAt_idx"
  ON "InAppNotification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "InAppNotification_userId_createdAt_id_cursor_idx"
  ON "InAppNotification"("userId", "createdAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "InAppNotification_eventId_idx"
  ON "InAppNotification"("eventId");

-- ─── Durable presence uniqueness and stale-row scans ────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "ProposalPresence_proposalId_userId_key"
  ON "ProposalPresence"("proposalId", "userId");
CREATE INDEX IF NOT EXISTS "ProposalPresence_proposalId_lastSeenAt_idx"
  ON "ProposalPresence"("proposalId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ProposalPresence_proposalId_lastSeenAt_id_idx"
  ON "ProposalPresence"("proposalId", "lastSeenAt", "id");
CREATE INDEX IF NOT EXISTS "ProposalPresence_workspaceId_idx"
  ON "ProposalPresence"("workspaceId");
CREATE INDEX IF NOT EXISTS "ProposalPresence_workspaceId_lastSeenAt_idx"
  ON "ProposalPresence"("workspaceId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ProposalPresence_lastSeenAt_idx"
  ON "ProposalPresence"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "ProposalPresence_userId_idx"
  ON "ProposalPresence"("userId");

-- ─── Comment thread traversal and amendment lookups ─────────────────────────
CREATE INDEX IF NOT EXISTS "CollaborationComment_parentId_idx"
  ON "CollaborationComment"("parentId");
CREATE INDEX IF NOT EXISTS "CollaborationComment_proposalId_createdAt_id_idx"
  ON "CollaborationComment"("proposalId", "createdAt" DESC, "id");

-- ─── Knowledge queue merge ordering ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "PastProject_workspaceId_decisionStatus_submittedAt_id_idx"
  ON "PastProject"("workspaceId", "decisionStatus", "submittedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "Certificate_workspaceId_decisionStatus_submittedAt_id_idx"
  ON "Certificate"("workspaceId", "decisionStatus", "submittedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "MethodologyAsset_workspaceId_decisionStatus_submittedAt_id_idx"
  ON "MethodologyAsset"("workspaceId", "decisionStatus", "submittedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "ContentLibraryItem_workspaceId_decisionStatus_submittedAt_id_idx"
  ON "ContentLibraryItem"("workspaceId", "decisionStatus", "submittedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "StaffMember_workspaceId_decisionStatus_submittedAt_id_idx"
  ON "StaffMember"("workspaceId", "decisionStatus", "submittedAt" DESC, "id");
CREATE INDEX IF NOT EXISTS "StaffMember_evidenceDocumentId_evidenceVersion_idx"
  ON "StaffMember"("evidenceDocumentId", "evidenceVersion");

-- ─── Additive foreign keys (created NOT VALID) ──────────────────────────────
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StandardClause_workspaceId_fkey'
      AND conrelid = '"StandardClause"'::regclass
  ) THEN
    ALTER TABLE "StandardClause" ADD CONSTRAINT "StandardClause_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'VerificationToken_userId_fkey'
      AND conrelid = '"VerificationToken"'::regclass
  ) THEN
    ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecoveryToken_userId_fkey'
      AND conrelid = '"RecoveryToken"'::regclass
  ) THEN
    ALTER TABLE "RecoveryToken" ADD CONSTRAINT "RecoveryToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WorkspaceInvitation_workspaceId_fkey'
      AND conrelid = '"WorkspaceInvitation"'::regclass
  ) THEN
    ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WorkspaceInvitation_inviterId_fkey'
      AND conrelid = '"WorkspaceInvitation"'::regclass
  ) THEN
    ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_inviterId_fkey"
      FOREIGN KEY ("inviterId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContractTemplate_currentVersionId_fkey'
      AND conrelid = '"ContractTemplate"'::regclass
  ) THEN
    ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_currentVersionId_fkey"
      FOREIGN KEY ("currentVersionId") REFERENCES "ContractTemplateVersion"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GeneratedContractVersion_contractId_fkey'
      AND conrelid = '"GeneratedContractVersion"'::regclass
  ) THEN
    ALTER TABLE "GeneratedContractVersion" ADD CONSTRAINT "GeneratedContractVersion_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GeneratedContractVersion_templateVersionId_fkey'
      AND conrelid = '"GeneratedContractVersion"'::regclass
  ) THEN
    ALTER TABLE "GeneratedContractVersion" ADD CONSTRAINT "GeneratedContractVersion_templateVersionId_fkey"
      FOREIGN KEY ("templateVersionId") REFERENCES "ContractTemplateVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GeneratedContractVersion_createdBy_fkey'
      AND conrelid = '"GeneratedContractVersion"'::regclass
  ) THEN
    ALTER TABLE "GeneratedContractVersion" ADD CONSTRAINT "GeneratedContractVersion_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MyFatoorahRecurringProfile_userId_fkey'
      AND conrelid = '"MyFatoorahRecurringProfile"'::regclass
  ) THEN
    ALTER TABLE "MyFatoorahRecurringProfile" ADD CONSTRAINT "MyFatoorahRecurringProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MyFatoorahRecurringProfile_workspaceId_fkey'
      AND conrelid = '"MyFatoorahRecurringProfile"'::regclass
  ) THEN
    ALTER TABLE "MyFatoorahRecurringProfile" ADD CONSTRAINT "MyFatoorahRecurringProfile_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MyFatoorahRecurringProfile_subscriptionId_fkey'
      AND conrelid = '"MyFatoorahRecurringProfile"'::regclass
  ) THEN
    ALTER TABLE "MyFatoorahRecurringProfile" ADD CONSTRAINT "MyFatoorahRecurringProfile_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MyFatoorahRecurringProfile_planId_fkey'
      AND conrelid = '"MyFatoorahRecurringProfile"'::regclass
  ) THEN
    ALTER TABLE "MyFatoorahRecurringProfile" ADD CONSTRAINT "MyFatoorahRecurringProfile_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecurringCheckoutIntent_workspaceId_fkey'
      AND conrelid = '"RecurringCheckoutIntent"'::regclass
  ) THEN
    ALTER TABLE "RecurringCheckoutIntent" ADD CONSTRAINT "RecurringCheckoutIntent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecurringCheckoutIntent_subscriptionId_fkey'
      AND conrelid = '"RecurringCheckoutIntent"'::regclass
  ) THEN
    ALTER TABLE "RecurringCheckoutIntent" ADD CONSTRAINT "RecurringCheckoutIntent_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecurringCheckoutIntent_planId_fkey'
      AND conrelid = '"RecurringCheckoutIntent"'::regclass
  ) THEN
    ALTER TABLE "RecurringCheckoutIntent" ADD CONSTRAINT "RecurringCheckoutIntent_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecurringCheckoutIntent_createdById_fkey'
      AND conrelid = '"RecurringCheckoutIntent"'::regclass
  ) THEN
    ALTER TABLE "RecurringCheckoutIntent" ADD CONSTRAINT "RecurringCheckoutIntent_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceRating_entryId_fkey'
      AND conrelid = '"TemplateMarketplaceRating"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceRating" ADD CONSTRAINT "TemplateMarketplaceRating_entryId_fkey"
      FOREIGN KEY ("entryId") REFERENCES "TemplateMarketplaceEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceRating_userId_fkey'
      AND conrelid = '"TemplateMarketplaceRating"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceRating" ADD CONSTRAINT "TemplateMarketplaceRating_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceApplication_entryId_fkey'
      AND conrelid = '"TemplateMarketplaceApplication"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceApplication" ADD CONSTRAINT "TemplateMarketplaceApplication_entryId_fkey"
      FOREIGN KEY ("entryId") REFERENCES "TemplateMarketplaceEntry"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceApplication_proposalId_fkey'
      AND conrelid = '"TemplateMarketplaceApplication"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceApplication" ADD CONSTRAINT "TemplateMarketplaceApplication_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceApplication_workspaceId_fkey'
      AND conrelid = '"TemplateMarketplaceApplication"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceApplication" ADD CONSTRAINT "TemplateMarketplaceApplication_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceApplication_appliedById_fkey'
      AND conrelid = '"TemplateMarketplaceApplication"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceApplication" ADD CONSTRAINT "TemplateMarketplaceApplication_appliedById_fkey"
      FOREIGN KEY ("appliedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotificationDelivery_workspaceId_fkey'
      AND conrelid = '"NotificationDelivery"'::regclass
  ) THEN
    ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotificationDelivery_recipientId_fkey'
      AND conrelid = '"NotificationDelivery"'::regclass
  ) THEN
    ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientId_fkey"
      FOREIGN KEY ("recipientId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProposalPresence_proposalId_fkey'
      AND conrelid = '"ProposalPresence"'::regclass
  ) THEN
    ALTER TABLE "ProposalPresence" ADD CONSTRAINT "ProposalPresence_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProposalPresence_userId_fkey'
      AND conrelid = '"ProposalPresence"'::regclass
  ) THEN
    ALTER TABLE "ProposalPresence" ADD CONSTRAINT "ProposalPresence_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProposalPresence_workspaceId_fkey'
      AND conrelid = '"ProposalPresence"'::regclass
  ) THEN
    ALTER TABLE "ProposalPresence" ADD CONSTRAINT "ProposalPresence_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InAppNotification_workspaceId_fkey'
      AND conrelid = '"InAppNotification"'::regclass
  ) THEN
    ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InAppNotification_userId_fkey'
      AND conrelid = '"InAppNotification"'::regclass
  ) THEN
    ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END
$mig$;

DO $mig$
DECLARE
  knowledge_table TEXT;
  constraint_name TEXT;
BEGIN
  FOREACH knowledge_table IN ARRAY ARRAY[
    'PastProject',
    'Certificate',
    'MethodologyAsset',
    'ContentLibraryItem'
  ]
  LOOP
    constraint_name := knowledge_table || '_submittedById_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = format('%I', knowledge_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID',
        knowledge_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StaffMember_submittedById_fkey'
      AND conrelid = '"StaffMember"'::regclass
  ) THEN
    ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StaffMember_reviewedById_fkey'
      AND conrelid = '"StaffMember"'::regclass
  ) THEN
    ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StaffMember_evidenceVersionRecord_fkey'
      AND conrelid = '"StaffMember"'::regclass
  ) THEN
    ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_evidenceVersionRecord_fkey"
      FOREIGN KEY ("evidenceDocumentId", "evidenceVersion", "evidenceChecksum")
      REFERENCES "DocumentVersion"("documentId", "version", "checksum")
      ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
  END IF;
END
$mig$;

-- ─── Additive check constraints (created NOT VALID) ─────────────────────────
-- Salted digest rollout: version 0 rows keep the legacy unsalted digest.
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'VerificationToken_digest_version_check'
      AND conrelid = '"VerificationToken"'::regclass
  ) THEN
    ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_digest_version_check"
      CHECK (
        ("hashVersion" = 0 AND "hashSalt" IS NULL)
        OR ("hashVersion" > 0 AND "hashSalt" IS NOT NULL AND length("hashSalt") > 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecoveryToken_digest_version_check'
      AND conrelid = '"RecoveryToken"'::regclass
  ) THEN
    ALTER TABLE "RecoveryToken" ADD CONSTRAINT "RecoveryToken_digest_version_check"
      CHECK (
        ("hashVersion" = 0 AND "hashSalt" IS NULL)
        OR ("hashVersion" > 0 AND "hashSalt" IS NOT NULL AND length("hashSalt") > 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'WorkspaceInvitation_digest_version_check'
      AND conrelid = '"WorkspaceInvitation"'::regclass
  ) THEN
    ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_digest_version_check"
      CHECK (
        ("hashVersion" = 0 AND "hashSalt" IS NULL)
        OR ("hashVersion" > 0 AND "hashSalt" IS NOT NULL AND length("hashSalt") > 0)
      ) NOT VALID;
  END IF;
END
$mig$;

-- Closed analytics vocabulary and nonnegative typed duration.
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsEvent_duration_nonnegative_check'
      AND conrelid = '"AnalyticsEvent"'::regclass
  ) THEN
    ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_duration_nonnegative_check"
      CHECK ("durationMs" IS NULL OR "durationMs" >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsEvent_event_type_check'
      AND conrelid = '"AnalyticsEvent"'::regclass
  ) THEN
    -- Mirrors ANALYTICS_EVENT_TYPES in src/lib/analytics-collector.ts. NOT VALID
    -- so already-stored rows are untouched while new appends stay in vocabulary.
    ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_event_type_check"
      CHECK ("eventType" IN (
        'proposal_created',
        'proposal_edited',
        'proposal_submitted',
        'proposal_approved',
        'proposal_rejected',
        'proposal_exported',
        'agent_run_started',
        'agent_run_completed',
        'agent_run_failed',
        'agent_run_cancelled',
        'document_uploaded',
        'document_version_created',
        'template_used',
        'section_added'
      )) NOT VALID;
  END IF;
END
$mig$;

-- Template and contract legal-safety invariants.
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContractTemplate_numeric_version_check'
      AND conrelid = '"ContractTemplate"'::regclass
  ) THEN
    ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_numeric_version_check"
      CHECK (
        ("currentVersionNumber" IS NULL AND "currentVersionId" IS NULL)
        OR ("currentVersionNumber" > 0 AND "currentVersionId" IS NOT NULL)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContractTemplate_non_executable_check'
      AND conrelid = '"ContractTemplate"'::regclass
  ) THEN
    ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_non_executable_check"
      CHECK ("isExecutable" = false) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContractTemplateVersion_numeric_version_check'
      AND conrelid = '"ContractTemplateVersion"'::regclass
  ) THEN
    ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_numeric_version_check"
      CHECK ("versionNumber" IS NULL OR "versionNumber" > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContractTemplateVersion_non_executable_check'
      AND conrelid = '"ContractTemplateVersion"'::regclass
  ) THEN
    ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_non_executable_check"
      CHECK ("isExecutable" = false) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GeneratedContractVersion_safety_check'
      AND conrelid = '"GeneratedContractVersion"'::regclass
  ) THEN
    ALTER TABLE "GeneratedContractVersion" ADD CONSTRAINT "GeneratedContractVersion_safety_check"
      CHECK (
        "legalReviewStatus" = 'UNREVIEWED'
        AND "counselReviewRequired" = true
        AND "isExecutable" = false
      ) NOT VALID;
  END IF;
END
$mig$;

-- Recurring value literals. The predicates below validate the stored decimal
-- string shape only; they perform no monetary arithmetic and use no regular
-- expression anchors so the statement text stays free of dollar characters.
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'MyFatoorahRecurringProfile_exact_amount_check'
      AND conrelid = '"MyFatoorahRecurringProfile"'::regclass
  ) THEN
    ALTER TABLE "MyFatoorahRecurringProfile" ADD CONSTRAINT "MyFatoorahRecurringProfile_exact_amount_check"
      CHECK (
        "amountExact" IS NULL
        OR (
          "amountExact" = btrim("amountExact")
          AND length("amountExact") > 0
          AND translate("amountExact", '0123456789', '') IN ('', '.')
          AND left("amountExact", 1) <> '.'
          AND right("amountExact", 1) <> '.'
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'RecurringCheckoutIntent_state_check'
      AND conrelid = '"RecurringCheckoutIntent"'::regclass
  ) THEN
    ALTER TABLE "RecurringCheckoutIntent" ADD CONSTRAINT "RecurringCheckoutIntent_state_check"
      CHECK (
        "status" IN ('PENDING', 'FINALIZED', 'FAILED', 'EXPIRED')
        AND "billingCycle" IN ('MONTHLY', 'YEARLY')
        AND length(btrim("idempotencyKey")) > 0
        AND length(btrim("currency")) > 0
        AND "amountExact" = btrim("amountExact")
        AND length("amountExact") > 0
        AND translate("amountExact", '0123456789', '') IN ('', '.')
        AND left("amountExact", 1) <> '.'
        AND right("amountExact", 1) <> '.'
      ) NOT VALID;
  END IF;
END
$mig$;

-- Marketplace rating bounds and notification delivery bounds.
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TemplateMarketplaceRating_rating_check'
      AND conrelid = '"TemplateMarketplaceRating"'::regclass
  ) THEN
    ALTER TABLE "TemplateMarketplaceRating" ADD CONSTRAINT "TemplateMarketplaceRating_rating_check"
      CHECK ("rating" BETWEEN 1 AND 5) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotificationDelivery_attempt_count_check'
      AND conrelid = '"NotificationDelivery"'::regclass
  ) THEN
    ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_attempt_count_check"
      CHECK ("attemptCount" BETWEEN 0 AND 3) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotificationDelivery_status_check'
      AND conrelid = '"NotificationDelivery"'::regclass
  ) THEN
    ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_status_check"
      CHECK ("status" IN (
        'PENDING', 'CLAIMED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED', 'UNCONFIGURED'
      )) NOT VALID;
  END IF;
END
$mig$;

-- One normalized knowledge decision contract across the five record types.
DO $mig$
DECLARE
  knowledge_table TEXT;
  constraint_name TEXT;
BEGIN
  FOREACH knowledge_table IN ARRAY ARRAY[
    'PastProject',
    'Certificate',
    'MethodologyAsset',
    'ContentLibraryItem',
    'StaffMember'
  ]
  LOOP
    constraint_name := knowledge_table || '_decision_state_check';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = format('%I', knowledge_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
          "decisionStatus" IN (''PENDING'', ''APPROVED'', ''REJECTED'')
          AND (
            "decisionStatus" = ''PENDING''
            OR (
              "decisionStatus" = ''APPROVED''
              AND "reviewedById" IS NOT NULL
              AND "decisionAt" IS NOT NULL
              AND "evidenceDocumentId" IS NOT NULL
              AND "evidenceVersion" > 0
              AND "evidenceChecksum" IS NOT NULL
            )
            OR (
              "decisionStatus" = ''REJECTED''
              AND "reviewedById" IS NOT NULL
              AND "decisionAt" IS NOT NULL
              AND "decisionReasonAr" IS NOT NULL
              AND "decisionReasonEn" IS NOT NULL
              AND length(btrim("decisionReasonAr")) BETWEEN 1 AND 1000
              AND length(btrim("decisionReasonEn")) BETWEEN 1 AND 1000
            )
          )
        ) NOT VALID',
        knowledge_table,
        constraint_name
      );
    END IF;
  END LOOP;
END
$mig$;
