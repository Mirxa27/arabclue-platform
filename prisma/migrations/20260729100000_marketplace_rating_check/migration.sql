-- Marketplace template rating CHECK constraint (audit: data integrity).
--
-- Ensures the "rating" column on "TemplateMarketplaceRating" only accepts
-- integer values in the 1–5 range at the database level. App-level Zod
-- validation (z.number().int().min(1).max(5)) already guards writes, but
-- a DB-level CHECK prevents invalid rows from direct SQL or future code
-- paths that bypass the API route.
--
-- The constraint is created NOT VALID so existing rows are not rejected at
-- apply time; validation of existing rows is a separate approved release
-- action (migration policy: forward-only, strictly additive).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_marketplace_rating_range_check'
  ) THEN
    ALTER TABLE "TemplateMarketplaceRating"
      ADD CONSTRAINT "template_marketplace_rating_range_check"
      CHECK ("rating" >= 1 AND "rating" <= 5) NOT VALID;
  END IF;
END $$;
