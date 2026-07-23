# Task 3 Report: Contract legal review path

## Summary

Implemented the contract legal review path for `GeneratedProposal` rows with `type=CONTRACT`.

Contracts now reuse the existing proposal review submit/approve APIs, appear in the reviewer queue with their type, open the contract studio instead of the proposal editor, and use `validateContractDraft` for contract export readiness.

## Changes

### Backend/API

- Added `src/lib/contract-review.ts` for shared review lifecycle and contract export-readiness helpers:
  - `getSubmittedForReviewStatus()`
  - `getReviewDecisionProposalStatus()`
  - `getContractValidationReport()`
  - `getContractExportReadiness()`
- Updated `POST /api/proposals/[id]/submit`:
  - Reuses the shared submitted review status.
  - Blocks resubmission for `IN_REVIEW`, `REVIEW`, `REVIEWED`, `APPROVED`, and `EXPORTED`.
- Updated `PATCH /api/reviews/[id]`:
  - Uses shared sequential decision status logic.
  - Final approval sets `APPROVED` and `approvedAt`.
  - Non-final approval leaves the proposal in `REVIEWED`.
  - Rejection sets `REJECTED`.
- Updated `GET /api/reviews`:
  - Includes `proposal.type` and `proposal.titleAr` so the client can route contract reviews correctly.
- Updated `GET /api/proposals/[id]/validate`:
  - For `type=CONTRACT`, uses `validateContractDraft` through `getContractExportReadiness`.
  - Uses PDF export policy for contract readiness.
- Updated `GET /api/proposals/[id]/download`:
  - Reuses the shared `validateContractDraft` report helper for contracts.

### UI

- Updated `ContractsPanel`:
  - Adds a “Submit for legal review” action for contract drafts not already in review/approved/exported states.
  - Calls the existing `/api/proposals/[id]/submit` endpoint.
  - Invalidates proposal/review queries after submit.
- Updated `ReviewsQueue`:
  - Detects `proposal.type === "CONTRACT"`.
  - Displays a contract badge for contract review items.
  - Opens `BilingualContractStudio` for contract items.
  - Keeps proposal items on the existing proposal editor path.

### Tests

- Added `src/lib/__tests__/contract-review.test.ts`.
- Test covers:
  - Submit status enters the existing review chain.
  - Intermediate approval remains in `REVIEWED`.
  - Final approval becomes `APPROVED`.
  - A valid contract in review is not PDF export-ready when an approval policy exists.
  - The same valid contract after final approval is PDF export-ready.

## Verification

Commands run:

- `bun test src/lib/__tests__/contract-review.test.ts`
  - First run failed RED because `../contract-review` did not exist.
  - Final run passed.
- `bun run test`
  - Passed: 181 tests, 0 failures.
- `bun run lint`
  - Passed with 0 errors.
  - Existing warnings remain for unused eslint-disable directives in unrelated files.
- `bunx tsc --noEmit --pretty false`
  - Passed.
- `bun run build`
  - Failed on pre-existing/client-bundling import traces for Node-only modules:
    - `redis` requiring `net` and `dns/promises`.
    - `z-ai-web-dev-sdk` requiring `fs/promises`.
  - The failure was not introduced by this task; it occurs through existing `views.tsx` -> server library import traces.

## Concerns

- No browser/manual UI test was performed because no computer-use executor is available in this tool environment.
- `bun run build` remains blocked by existing Node-only dependency bundling issues unrelated to Task 3.
