# Task 6 Report: Autopilot project enrichment from tender facts

## Status

Implemented and verified on branch `cursor/saudi-contract-remaining-ab64`.

## Summary

Autopilot project creation now reads parsed tender entities from the ingested `UploadedDocument.extractedEntities` JSON before creating a new `TenderProject`. When high-confidence RFP ingest creates a project, the payload is enriched with available structured tender facts instead of only using filename/date title and hard-coded `IT`.

## Changes

- Extended `IngestionEntities` with optional `project` metadata:
  - `title`
  - `titleAr`
  - `etimadRef`
  - `category`
  - `budget`
  - `currency`
  - `submissionDeadline`
  - `saudizationTarget`
  - `localContentTarget`
- Added deterministic tender-fact extraction in `parseTenderText()` for labeled RFP fields:
  - title/project/tender name labels
  - Etimad/reference labels
  - category/sector labels and strong category cues
  - budget/value labels with SAR/USD/EUR handling
  - submission deadline/closing date labels
  - Saudization target
  - tender-stated local-content preference via the existing local-content parser
- Updated `maybeAutopilotAfterIngest()` to load ingested entities for the document when creating a new project.
- Added `buildAutopilotProjectCreateData()` as the tested payload builder used by actual autopilot project creation.
- Preserved fallback behavior:
  - title falls back to classifier suggested title, then `Tender YYYY-MM-DD`
  - category falls back to `IT`
  - missing Etimad/deadline/budget/targets stay null/undefined instead of being invented

## Tests Added

- `src/lib/__tests__/autopilot.test.ts`
  - RFP text with Etimad-like fields parses into an enriched `TenderProject` create payload.
  - Missing parsed facts fall back to suggested title and `IT`.

## Verification

- `bun test src/lib/__tests__/autopilot.test.ts`
  - 4 pass, 0 fail
- `bun run test`
  - 187 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bun run lint`
  - pass with 0 errors and 6 existing warnings in unrelated UI files:
    - `src/components/admin/ai-providers.tsx`
    - `src/components/dashboard/agent-workflow.tsx`
    - `src/components/dashboard/business-profile-view.tsx`
    - `src/components/dashboard/settings-panel.tsx`

## Concerns / Notes

- `TenderProject` has no SLA-specific columns, so tender SLA remains preserved in parsed ingestion entities and downstream agent context rather than being copied onto the project row.
- Budget extraction is intentionally label-driven to avoid treating arbitrary monetary amounts in RFP prose as project budgets.
