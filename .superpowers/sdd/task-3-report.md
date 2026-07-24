# Task 3 Report: Reviews errors and redline timeline

## Status

DONE_WITH_CONCERNS

## Summary

Implemented Task 3 in `src/components/dashboard/reviews-queue.tsx`.

- Replaced the manual reviews loading/empty branch with shared `QueryState`.
- Wired `isError`, `error`, and `refetch` so failed review queries render the shared retry state instead of the empty state.
- Added a per-review bilingual Redline action.
- Inspected the existing proposal compare endpoint and consumers before wiring; the live shape is `{ contentDiff: string[] }`, with a fallback for the brief's `{ lines: string[] }`.
- On Redline click, the component loads proposal details to get the current `version`, skips comparison with a muted hint when `version < 2`, and fetches `version - 1` to `version` otherwise.
- Renders expandable inline diff output in a `<pre className="font-mono text-[10px]">`, capped to the first 200 lines with a bilingual truncation hint.

## Files changed

- `src/components/dashboard/reviews-queue.tsx`
- `.superpowers/sdd/task-3-report.md`

## Verification

- `bun test src/lib/__tests__/proposal-studio.test.ts`
  - Passed: 12 tests, 0 failures.
- `bunx tsc --noEmit`
  - Passed.
- `bun run lint -- src/components/dashboard/reviews-queue.tsx`
  - Passed.

## Concerns

- No browser/manual UI walkthrough was performed because this subagent environment does not expose a computer-use executor.
- The reviews list API does not currently include proposal `version`, so the Redline action fetches `/api/proposals/[id]` before calling the compare endpoint. This keeps the implementation scoped to the requested component.
