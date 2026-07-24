# Task 6 Report: Qualification dossier CTAs + onboarding CRUD polish

## Status

Implemented and verified on branch `cursor/remaining-gaps-sdd-ab64`.

## Summary

Account onboarding now turns Saudi qualification dossier gaps into direct CTAs, improves CRUD feedback for onboarding data entry, and allows approval-chain steps to be reordered or deleted through the existing approval policy API.

## Changes

- Added a `QualificationGap.key` to CTA map for:
  - CR
  - ZATCA VAT
  - GOSI
  - NCA
  - LCGPA
  - ISO
- Dossier gap CTAs now:
  - preselect the matching certificate type when relevant
  - scroll to the matching legal/certificate form section
  - focus the matching CR, VAT, or certificate-name input
- Added success/error toasts for:
  - legal workspace save failures
  - certificate add/delete
  - staff add/delete
  - methodology/library/partnership add/delete through `SimpleCrudPanel`
  - approval-chain updates
- Added `EmptyState` rendering for empty certificate, staff, generic CRUD, and approval-chain lists.
- Added approval-chain Up, Down, and Delete controls.
- Approval-chain add/reorder/delete actions all rewrite the steps array and persist via `PUT /api/approval-policy`.

## Files Changed

- `src/components/dashboard/account-onboarding.tsx`
- `.superpowers/sdd/task-6-report.md`

## Tests Added

No new tests were added. The change is a client UI behavior update with no new pure helper exported for unit testing.

## Verification

- `bunx tsc --noEmit`
  - pass
- `bunx eslint "src/components/dashboard/account-onboarding.tsx"`
  - pass
- `bun run test`
  - 201 pass, 0 fail

## Concerns / Notes

- No browser walkthrough was recorded because this subagent environment does not expose a computer-use/browser interaction tool. Verification was completed with TypeScript, focused ESLint, and the existing Bun test suite.
- `src/components/dashboard/platform-agent-console.tsx` was not modified.
