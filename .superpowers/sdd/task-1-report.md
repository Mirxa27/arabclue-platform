# Task 1 report: Draft snapshot compiler

**Status:** DONE (implementation already present; this report is the SDD handoff, not a new implementer commit)

## What was implemented

`compileDraftProposalSnapshot` and `applyWorkspaceBrandToSnapshot` in `src/lib/proposal-draft-snapshot.ts`.

- Required government-formal modules plus `submission-letter`
- Sources are only `TENDER` | `WORKSPACE` | `USER_ENTRY`
- Heading split maps known titles; leftover body goes to `technical-solution`
- Missing language uses an honest “not provided” line
- Empty sections use bilingual “not drafted yet”
- Brand colors go through `normalizeDocumentBrandColor`

Landed in `fa04428 feat(docs): design preview bid packs with each organisation's brand` (same SHA as `main` / this feature branch).

## Tests

Controller re-ran after checkout:

```
bun test src/lib/__tests__/proposal-draft-snapshot.test.ts
```

5/5 passing (empty diagnostics, no APPROVED_KNOWLEDGE, technical heading map, HTML export, brand overlay). Output pristine.

## TDD Evidence

Not available for this commit. Tests and implementation shipped together in `fa04428`. RED phase was not recorded.

## Files changed (this task’s portion of fa04428)

- Create: `src/lib/proposal-draft-snapshot.ts`
- Create: `src/lib/__tests__/proposal-draft-snapshot.test.ts`

## Self-review

- Unmapped leftover body is implemented but not directly unit-tested (the existing test uses a heading that already matches `technical-solution`).
- Cover / document-control / submission-letter get synthesized draft text when markdown has no matching section.

## Concerns

Implementation landed on `main` in a docs-titled commit rather than a Task-1-only commit on this branch. Review the snapshot compiler only; Task 2 files in the same commit are out of scope for this task’s quality verdict except as neighboring context.
