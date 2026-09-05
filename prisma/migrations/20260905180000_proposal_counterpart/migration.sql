-- AI-generated counterpart-language draft on GeneratedProposal.
--
-- A proposal is drafted in one locale (GeneratedProposal.locale). The
-- synchronized bilingual HTML/PDF export needs the complete draft in the other
-- language, which the writer used to paste by hand. POST
-- /api/proposals/[id]/counterpart now generates it section by section and
-- persists it here so the editor can prefill the counterpart textarea and show
-- the fidelity findings and the run that produced them.
--
--   counterpartMd               the draft in the other language (Markdown)
--   counterpartLocale           "ar" | "en" — the language counterpartMd is written in
--   counterpartGeneratedAt      when the run finished
--   counterpartDiagnosticsJson  JSON CounterpartDiagnosticsRecord: fidelity
--                               findings plus provider, model and tokens
--
-- Safety: additive only. Nullable columns without defaults are a catalog-only
-- change in PostgreSQL (no table rewrite, no backfill). IF NOT EXISTS keeps the
-- migration idempotent. Reverse: DROP COLUMN for each name below.

ALTER TABLE "GeneratedProposal" ADD COLUMN IF NOT EXISTS "counterpartMd" TEXT;
ALTER TABLE "GeneratedProposal" ADD COLUMN IF NOT EXISTS "counterpartLocale" TEXT;
ALTER TABLE "GeneratedProposal" ADD COLUMN IF NOT EXISTS "counterpartGeneratedAt" TIMESTAMP(3);
ALTER TABLE "GeneratedProposal" ADD COLUMN IF NOT EXISTS "counterpartDiagnosticsJson" TEXT;
