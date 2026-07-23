# Task 5 Report: Mission Control import source fidelity

## Summary

Implemented Mission Control import source fidelity for Email, Google Drive, and OneDrive.

## Changes

- Replaced prompt-based Mission attachment imports with an in-app dialog in `src/components/dashboard/mission-attachment-tray.tsx`.
  - Browser capture now uses the same in-app paste dialog instead of `window.prompt`.
  - Email, Google Drive, and OneDrive are separate tray actions.
  - The external-source dialog includes clear source labels, a pasted-text area, and an optional file input.
  - Text imports use source-specific filenames:
    - `email-import.txt`
    - `google-drive-import.txt`
    - `onedrive-import.txt`
- Added canonical attachment source handling in `src/lib/agents/platform/classify-attachment.ts`.
  - Canonical persisted sources are `email`, `google_drive`, and `onedrive`.
  - Legacy/API input source `drive` is accepted and normalized to `google_drive`.
  - Cloud/email text imports follow the pasted-text classification path for ambiguous long text.
- Updated `src/app/api/platform-agent/missions/[id]/attachments/route.ts`.
  - Multipart source values are normalized before staging.
  - JSON text attachment source accepts `email`, `google_drive`, `onedrive`, and legacy `drive`.
- Updated platform agent tool paths in `src/lib/agents/platform/tools.ts`.
  - `ingestDroppedFile` and `captureClientArtifact` accept `google_drive`, `onedrive`, and legacy `drive`.
  - `importExternalSource` now stages Google Drive as `google_drive` and OneDrive as `onedrive` instead of collapsing both to `drive`.
  - Re-classification normalizes stored legacy `drive` values before classification.

## Tests added

- `src/lib/__tests__/mission-control.test.ts`
  - Verifies connector catalog exposes `email`, `google_drive`, and `onedrive`.
  - Verifies the connector catalog does not expose canonical `drive`.
  - Verifies source normalization preserves `email`, `google_drive`, and `onedrive`.
  - Verifies legacy `drive` input normalizes to `google_drive`.
- `src/lib/__tests__/classify-attachment.test.ts`
  - Verifies Google Drive and OneDrive RFP text imports classify as `RFP`.
  - Verifies both cloud-source classification paths enable pipeline routing for high-confidence RFP content.

## Verification

- `~/.bun/bin/bun test src/lib/__tests__/mission-control.test.ts src/lib/__tests__/classify-attachment.test.ts`
  - Result: 9 pass, 0 fail.
- `~/.bun/bin/bun run test`
  - Result: 185 pass, 0 fail.
- `~/.bun/bin/bun run lint`
  - Result: 0 errors, 6 warnings.
  - Warnings are unrelated pre-existing unused eslint-disable directives in:
    - `src/components/admin/ai-providers.tsx`
    - `src/components/dashboard/agent-workflow.tsx`
    - `src/components/dashboard/business-profile-view.tsx`
    - `src/components/dashboard/settings-panel.tsx`
- `~/.bun/bin/bunx tsc --noEmit`
  - Result: passed.

## Notes

- No Tasks 6-7 work was started.
- No database migration was needed because attachment `source` is stored as text.
- GUI recording was not produced because this subagent run did not expose a computer-use executor; verification used automated tests, lint, TypeScript, and static prompt/source checks.
