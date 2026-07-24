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

## Follow-up fix (KPI trend semantics)

Status: DONE

### Problem

Stat card primary values (e.g. `activeProjects`, `avgCompliance`, lifetime totals) did not match what `trends.*` measures (new counts / period scores for last 7d vs prior 7d), so trend arrows could mislead.

### Fix

- Chose **approach 1**: clarify trend copy instead of hiding trends on mismatched cards.
- Added bilingual i18n keys:
  - `stat_trend_vs_prior_7d` — visible subtitle when a trend badge is shown.
  - `stat_trend_tooltip` — full explanation on hover over the trend badge.
- Updated `StatCards` to show subtitle + tooltip whenever a non-null trend is present.
- Added `resolveTrend()` in `src/lib/stats-trends.ts` and wired stat cards through `data?.trends?.…` so missing/null/undefined trends never render fabricated arrows.
- Extended `stats-trends.test.ts` with `resolveTrend` coverage.

### Verification

- `bun test src/lib/__tests__/stats-trends.test.ts` → 5 pass, 0 fail.
- `bunx tsc --noEmit` → pass.
- Commit: `fix(stats): clarify KPI trend semantics vs prior 7d`

## Follow-up fix (whole-branch review findings)

Status: DONE

### Problems

- Onboarding notifications used the static `onboarding` ID, so localStorage dismissal hid future onboarding gap changes forever.
- `ReviewsQueue` opened `BilingualContractStudio` without passing parsed obligation milestones, while `ContractsPanel` did pass them.

### Fix

- Added `onboardingNotificationId()` to fingerprint onboarding notifications from `missing.join(",")`, leaving `CERT_EXPIRY` and `PENDING_REVIEW` IDs/dismissal unchanged.
- Moved contract artifact parsing into `src/lib/contract-artifacts.ts`.
- Updated both `ContractsPanel` and `ReviewsQueue` to use the same parser.
- Passed `milestones` from review-opened contracts into `BilingualContractStudio`.
- Added focused coverage for onboarding notification IDs and contract artifact milestone parsing.

### Verification

- `bun test src/lib/__tests__/notification-ids.test.ts src/lib/__tests__/contract-artifacts.test.ts` -> 3 pass, 0 fail.
- `bunx tsc --noEmit` -> pass.
- `bun test src/lib/__tests__/contract-obligations.test.ts` -> 2 pass, 0 fail.
- `bun run test` -> 209 pass, 0 fail.
- `bun run lint` -> pass.
- `git diff --check` -> pass.
