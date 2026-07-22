-- Payment webhook events + MyFatoorah recurring profiles
CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventFingerprint" TEXT NOT NULL,
    "eventName" TEXT,
    "eventCode" INTEGER,
    "eventReference" TEXT,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "recurringId" TEXT,
    "customerReference" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "disposition" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "payloadRedacted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhookEvent_eventFingerprint_key" ON "PaymentWebhookEvent"("eventFingerprint");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_processingStatus_idx" ON "PaymentWebhookEvent"("processingStatus");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_invoiceId_idx" ON "PaymentWebhookEvent"("invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_recurringId_idx" ON "PaymentWebhookEvent"("recurringId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_createdAt_idx" ON "PaymentWebhookEvent"("createdAt");

CREATE TABLE IF NOT EXISTS "MyFatoorahRecurringProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "recurringId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recurringType" TEXT,
    "intervalDays" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 3,
    "customerReference" TEXT,
    "initialInvoiceId" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MyFatoorahRecurringProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_recurringId_key" ON "MyFatoorahRecurringProfile"("recurringId");
CREATE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_userId_idx" ON "MyFatoorahRecurringProfile"("userId");
CREATE INDEX IF NOT EXISTS "MyFatoorahRecurringProfile_status_idx" ON "MyFatoorahRecurringProfile"("status");
