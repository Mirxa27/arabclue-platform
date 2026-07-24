# Task 5 Report: Open DocumentFileViewer after upload

**Status:** DONE
**Branch:** `cursor/docs-generation-complete-ab64`
**Commit message:** `feat(ingest): preview uploaded documents in file viewer`

## Summary

- Typed the upload mutation response as `{ document: ApiDocument }` so ingestion consumes `id`, `originalName`, `mimeType`, `storagePath`, `projectId`, and `parsedSummary` from `/api/documents`.
- Added `previewDoc` state to `FileIngestion` and render `DocumentFileViewer` with `open`, `onOpenChange`, `locale`, `title`, `storagePath`, `mimeType`, and `fileName`.
- Auto-opens the viewer after successful upload when the uploaded document has `storagePath`.
- Updated Recent documents rows to open `DocumentFileViewer` when `storagePath` is present, with the existing Documents view navigation retained as the no-file fallback.
- Normalized nullable `parsedSummary` to `undefined` for the local upload queue summary type.

## Files changed

- `src/components/dashboard/file-ingestion.tsx`
- `.superpowers/sdd/task-5-report.md`

## Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | Pass (exit 0) |
| `bun run lint` | Pass (exit 0) |

## Constraints

- No API, schema, or dependency changes.
- No new user-facing copy was added.

## Concerns

- GUI automation is not available in this subagent tool set, so verification is terminal-based.
