-- Hybrid retrieval store (RAG architecture pass, 2026-09-05).
--
-- Before: vectors lived in "embeddingJson" text and were scored in JavaScript
-- over the 400 most recent chunks of a workspace, so older chunks were
-- unsearchable and every query parsed hundreds of 1536-float JSON blobs.
-- Lexical search was a term-frequency cosine in the app with no Arabic
-- normalization, and the two signals were never fused for the same rows.
--
-- After: pgvector holds the vectors (untyped dimension: the embedding model is
-- an admin choice and two models already coexist in this table), tagged with
-- the model and dimension so a query only compares vectors of its own size;
-- a generated tsvector carries normalized Arabic/English tokens for lexical
-- search; the application fuses both rankings (reciprocal rank fusion).
--
-- Safety: additive. CREATE EXTENSION is idempotent and supported on Neon;
-- the backfill casts the existing JSON text into the vector column. Reverse:
-- drop the columns and indexes; the extension may stay.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embedding" vector;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embeddingDim" INTEGER;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "sectionHeading" TEXT;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "pageRef" TEXT;
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "language" TEXT;

-- Normalization the query side mirrors (src/lib/rag-search.ts normalizeForSearch):
-- strip Arabic diacritics and tatweel, fold alef variants, taa marbuta and
-- alef maqsura, then index the text twice — as written and with the definite
-- article "ال" removed from each word — so "الأمن" and "أمن" meet.
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      regexp_replace(
        translate(
          regexp_replace(coalesce("sectionHeading", '') || ' ' || "content", '[ً-ٰٟـ]', '', 'g'),
          'أإآةى', 'اااهي'
        ),
        '(^|[^؀-ۿ])ال', '\1', 'g'
      )
      || ' ' ||
      translate(
        regexp_replace(coalesce("sectionHeading", '') || ' ' || "content", '[ً-ٰٟـ]', '', 'g'),
        'أإآةى', 'اااهي'
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "DocumentChunk_tsv_idx" ON "DocumentChunk" USING GIN ("tsv");
CREATE INDEX IF NOT EXISTS "DocumentChunk_workspaceId_embeddingDim_idx" ON "DocumentChunk"("workspaceId", "embeddingDim");

-- Backfill from the legacy JSON mirror. pgvector parses the '[…]' text directly.
UPDATE "DocumentChunk"
SET "embedding" = "embeddingJson"::vector,
    "embeddingDim" = json_array_length("embeddingJson"::json)
WHERE "embeddingJson" IS NOT NULL AND "embedding" IS NULL;
