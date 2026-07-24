-- Production completion: obligation state, notification dismissals, expiry email dedupe

CREATE TABLE IF NOT EXISTS "ContractObligationState" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractObligationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContractObligationState_proposalId_obligationId_key"
  ON "ContractObligationState"("proposalId", "obligationId");

CREATE INDEX IF NOT EXISTS "ContractObligationState_proposalId_idx"
  ON "ContractObligationState"("proposalId");

ALTER TABLE "ContractObligationState"
  DROP CONSTRAINT IF EXISTS "ContractObligationState_proposalId_fkey";
ALTER TABLE "ContractObligationState"
  ADD CONSTRAINT "ContractObligationState_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractObligationState"
  DROP CONSTRAINT IF EXISTS "ContractObligationState_updatedById_fkey";
ALTER TABLE "ContractObligationState"
  ADD CONSTRAINT "ContractObligationState_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "NotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDismissal_userId_notificationId_key"
  ON "NotificationDismissal"("userId", "notificationId");

CREATE INDEX IF NOT EXISTS "NotificationDismissal_userId_idx"
  ON "NotificationDismissal"("userId");

ALTER TABLE "NotificationDismissal"
  DROP CONSTRAINT IF EXISTS "NotificationDismissal_userId_fkey";
ALTER TABLE "NotificationDismissal"
  ADD CONSTRAINT "NotificationDismissal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ExpiryNotificationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaJson" TEXT,

    CONSTRAINT "ExpiryNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExpiryNotificationLog_workspaceId_kind_resourceId_channel_key"
  ON "ExpiryNotificationLog"("workspaceId", "kind", "resourceId", "channel");

CREATE INDEX IF NOT EXISTS "ExpiryNotificationLog_workspaceId_idx"
  ON "ExpiryNotificationLog"("workspaceId");

CREATE INDEX IF NOT EXISTS "ExpiryNotificationLog_sentAt_idx"
  ON "ExpiryNotificationLog"("sentAt");
