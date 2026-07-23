-- AlterTable
ALTER TABLE "AIProviderConfig" ADD COLUMN IF NOT EXISTS "enginesJson" TEXT;

-- Backfill: copy legacy single engine into enginesJson array
UPDATE "AIProviderConfig"
SET "enginesJson" = CASE
  WHEN "enginesJson" IS NULL OR "enginesJson" = '' THEN '["' || "engine" || '"]'
  ELSE "enginesJson"
END;
