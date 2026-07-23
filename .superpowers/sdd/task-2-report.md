# Task 2 Report: Contract studio edit / save / version

## Status

Implemented Task 2 on branch `cursor/saudi-contract-remaining-ab64`.

## Requirements covered

- Made `src/components/dashboard/contract-studio.tsx` editable with a focused markdown textarea.
- Added Save control that PATCHes `/api/proposals/[id]` with `contentMd` and `changeLog: "Contract studio save"`, reusing the existing proposal save/version route.
- Added contract version history mode with existing proposal version compare and revert routes.
- Wired `src/components/dashboard/contracts-panel.tsx` to fetch the opened contract detail via `GET /api/proposals/[id]` so version rows are available to the studio.
- Disabled contract editing and save/revert controls when status is `IN_REVIEW`, `REVIEW`, `APPROVED`, or `EXPORTED`.
- Added server-side edit locking to PATCH, rewrite, and revert edit paths using a shared helper.
- Added `ApiProposalVersion` typing for proposal version data.

## Files changed

- `src/components/dashboard/contract-studio.tsx`
- `src/components/dashboard/contracts-panel.tsx`
- `src/app/api/proposals/[id]/route.ts`
- `src/app/api/proposals/[id]/rewrite/route.ts`
- `src/app/api/proposals/[id]/versions/[version]/revert/route.ts`
- `src/lib/api-types.ts`
- `src/lib/proposal-status.ts`
- `src/lib/__tests__/proposal-status.test.ts`

## Verification

- `bun test src/lib/__tests__/proposal-status.test.ts`
  - Result: 2 pass, 0 fail.
- `bun run test`
  - Result: 180 pass, 0 fail.
- `bun run lint`
  - Result: 0 errors, 6 pre-existing warnings in unrelated files.
- `bunx tsc --noEmit`
  - Result: pass.
- `bun run build`
  - Result: failed before completing due existing Turbopack module resolution errors for Node-only dependencies (`dns/promises`, `net`, `fs/promises`) pulled into client/browser traces from Redis and `z-ai-web-dev-sdk`.
- `curl http://127.0.0.1:3000/api/health`
  - Result: dev server returned the same Turbopack module resolution error page, blocking local runtime API/browser verification.

## Self-review

- Scope stayed within Task 2; no Tasks 3-7 work was started.
- The contract studio did not clone the proposal editor. It adds only preview/edit/version modes, save, compare, and revert.
- Locked statuses are enforced both in UI and server routes so a disabled button is not the only protection.
- Existing `PATCH /api/proposals/[id]` versioning behavior remains the source of truth for version creation.
- No database migration or dependency changes were introduced.

## Concerns

- Runtime browser/API verification is blocked by the repo's current Next/Turbopack client bundling issue involving server-only modules imported into client traces. The code passes tests, lint, and `tsc`, but the local app cannot serve pages until that environment/build issue is fixed.

