-- PaymentCheckout + BillingRecord MyFatoorah fields + User.activeWorkspaceId

ALTER TABLE "User" ADD COLUMN "activeWorkspaceId" TEXT;

ALTER TABLE "BillingRecord" ADD COLUMN "externalInvoiceId" TEXT;
ALTER TABLE "BillingRecord" ADD COLUMN "externalPaymentId" TEXT;
CREATE INDEX "BillingRecord_externalInvoiceId_idx" ON "BillingRecord"("externalInvoiceId");

CREATE TABLE "PaymentCheckout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "customerReference" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "paymentUrl" TEXT,
    "billingRecordId" TEXT,
    "errorMessage" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentCheckout_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "BillingRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PaymentCheckout_customerReference_key" ON "PaymentCheckout"("customerReference");
CREATE UNIQUE INDEX "PaymentCheckout_billingRecordId_key" ON "PaymentCheckout"("billingRecordId");
CREATE INDEX "PaymentCheckout_userId_idx" ON "PaymentCheckout"("userId");
CREATE INDEX "PaymentCheckout_status_idx" ON "PaymentCheckout"("status");
CREATE INDEX "PaymentCheckout_invoiceId_idx" ON "PaymentCheckout"("invoiceId");
