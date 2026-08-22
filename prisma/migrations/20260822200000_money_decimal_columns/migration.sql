-- Expand: exact SAR columns beside the legacy double-precision money fields.
-- The additive migration policy forbids ALTER COLUMN ... TYPE and DROP COLUMN,
-- so the floats stay in place as a frozen snapshot. Prisma maps the model
-- fields onto these new columns after the backfill. All live rows at authoring
-- time already stored clean two-decimal SAR; ROUND is a no-op for those values.

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN IF NOT EXISTS "priceMonthlyDecimal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "priceYearlyDecimal" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "BillingRecord"
  ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "PaymentCheckout"
  ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "SubscriptionPlan"
SET
  "priceMonthlyDecimal" = ROUND("priceMonthly"::numeric, 2),
  "priceYearlyDecimal" = ROUND("priceYearly"::numeric, 2);

UPDATE "BillingRecord"
SET "amountDecimal" = ROUND("amount"::numeric, 2);

UPDATE "PaymentCheckout"
SET "amountDecimal" = ROUND("amount"::numeric, 2);
