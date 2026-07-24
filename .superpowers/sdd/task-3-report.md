# Task 3 Report: BrandSetup live letterhead from unsaved form

**Status:** DONE
**Branch:** `cursor/docs-generation-complete-ab64`
**Commit message:** `fix(brand): live letterhead preview from unsaved draft`

## Summary

Implemented Task 3 in `src/components/dashboard/brand-setup.tsx`.

## Changes

- Added a parent-owned `BrandDraft` initialized from the saved `BrandProfile`.
- Converted `BrandForm` from local-only form state to controlled draft updates from `BrandSetup`.
- Passed the same draft into `LetterheadPreview`, so unsaved changes to colors, logo, font, English tagline, and Arabic tagline render immediately before Save.
- Kept Save scoped to the full draft payload expected by `PATCH /api/brand`, including `fontFamily`.
- Preserved unsaved draft values across same-profile query invalidations, including logo upload refetches.

## Files changed

- `src/components/dashboard/brand-setup.tsx`
- `.superpowers/sdd/task-3-report.md`

## Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | Pass (exit 0) |
| `bun run lint` | Pass (exit 0) |
| `git diff --check` | Pass (exit 0) |

## Constraints

- Did not implement Tasks 4-5.
- No schema changes.
- No dependency changes.

## Concerns

- No browser/manual UI walkthrough was performed because this subagent environment does not expose a computer-use executor.
