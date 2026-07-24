# Task 4 Report: Contract obligation register (derived)

Status: DONE

## Summary

- Added `src/lib/contract-obligations.ts` with `extractObligations(articles, milestones?)`.
- Added `ObligationRow` rows with stable `article-*` / `milestone-*` ids, source labels, extracted text, and default `open` status.
- Covered English and Arabic obligation heuristics: `obligation`, `shall`, `SLA`, `milestone`, `يجب`, `التزام`, and related Arabic forms.
- Added a contract studio "Obligations" mode that lists derived rows and persists done/reopen toggles to `localStorage["arabclue-obligations:${proposalId}"]`.
- Added a contracts panel "Obligations" action that opens the contract studio directly on the register.
- Added extracted entities to newly generated contract artifacts so future contracts can surface milestone obligations without schema changes.

## TDD evidence

- Wrote `src/lib/__tests__/contract-obligations.test.ts` before the extractor implementation.
- First red run failed on the missing module.
- Added a skeletal export and reran red; it failed on the expected empty extraction.
- Implemented the heuristic extractor and reran to green.

## Verification

- `bun test src/lib/__tests__/contract-obligations.test.ts` — pass.
- `bunx tsc --noEmit` — pass.
- `bun run test` — pass, 201 tests.
- `bun run lint` — pass.
- `bun run build` — pass.

## Concerns

- No new Prisma models were added.
- GUI/browser manual testing was not performed because this tool environment does not expose a computer-use browser executor; the UI path was verified through TypeScript, lint, and production build.
