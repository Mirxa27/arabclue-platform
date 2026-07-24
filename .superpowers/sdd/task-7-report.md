# Task 7 Report: Billing failure UX + notification dismiss + real KPI trends

Status: DONE

## Implemented

- Added `trendPct(current, previous): number | null` in `src/lib/stats-trends.ts`.
- Added TDD coverage in `src/lib/__tests__/stats-trends.test.ts`:
  - `0 -> 0` returns `null`.
  - `0 -> positive` returns `100`.
  - Positive and negative changes are rounded.
- Updated `/api/stats` to return:
  - `trends.projects`
  - `trends.documents`
  - `trends.proposals`
  - `trends.compliance`
- Computed trends from last 7 days versus the prior 7 days using tenant-scoped `createdAt` windows.
- Updated stat cards to consume API trends and omit the trend badge when the trend is `null`.
- Removed fake hardcoded trend percentages from stat cards.
- Added billing failure alert UX for:
  - `subscription.status === "PAST_DUE"`
  - latest billing record `status === "FAILED"`
- Wired billing Retry to the existing `/api/billing/checkout` endpoint.
- Added `src/hooks/use-dismissed-notifications.ts` for localStorage-backed notification dismissal.
- Updated the topbar to:
  - filter dismissed notification IDs,
  - show the unread dot only for visible notifications,
  - dismiss individual notifications,
  - dismiss all visible notifications with "Mark all read".
- Updated `StatsResponse` typing with nullable trend fields.

## Verification

- Confirmed TDD red state before helper implementation:
  - `bun test src/lib/__tests__/stats-trends.test.ts` failed because `../stats-trends` did not exist.
- Focused test after implementation:
  - `bun test src/lib/__tests__/stats-trends.test.ts` -> 3 pass, 0 fail.
- TypeScript:
  - `bunx tsc --noEmit` -> pass.
- Lint:
  - `bun run lint` -> pass.
- Full lib test suite:
  - `bun run test` -> 204 pass, 0 fail.
- Final checks:
  - `bunx tsc --noEmit` -> pass.
  - `git diff --check` -> pass.

## Notes / concerns

- Compliance trend compares the compliance score for checks created in the last 7 days against the prior 7 days, instead of comparing compliance-check volume. This matches the compliance KPI card more closely than raw count volume.
- Notification dismissals are intentionally local to the browser via localStorage. There is no server-side read state, per the task scope.
- Billing retry uses the active subscription plan when present. For failed records without an active subscription, it falls back to checkout metadata from the failed billing record when available.
- `account-onboarding.tsx` was not edited.
