# Task 1 Report: QueryState consistency for docs/contracts/history

**Status:** DONE  
**Branch:** `cursor/remaining-gaps-sdd-ab64`  
**Commit:** `1e703b7` — `fix(ui): adopt QueryState on docs contracts history panels`

## Summary

Replaced hand-rolled loading/error/empty branches in three dashboard panels with the shared `QueryState` + `EmptyState` pattern from `@/components/patterns`, aligning docs, contracts, and version history with existing panels (`projects-list`, `proposals-list`, `requirements-matrix`, `billing-panel`).

## Changes

### `src/components/dashboard/document-matrix.tsx`

- Imported `QueryState`, `EmptyState` from `@/components/patterns`.
- `useQuery` already exposed `isError`, `error`, and `refetch` — no hook change needed.
- Wrapped the document table in `QueryState` with:
  - `loading={<ListSkeleton rows={3} />}` (was 4; aligned to brief)
  - `empty` using `EmptyState` + `FileText` icon + `tr("no_data", locale)`
  - `onRetry={() => refetch()}`
  - `errorMessage` from caught fetch error when available

### `src/components/dashboard/version-history.tsx`

- Imported `QueryState`, `EmptyState`.
- Added `error` to `useQuery` destructuring.
- Replaced inline spinner/error/empty blocks with `QueryState`:
  - Loading now uses `ListSkeleton rows={3}` instead of inline `Loader2` (consistent with other panels).
  - Error state now includes retry via `onRetry={() => refetch()}` — **UX improvement** over prior version which showed error text only.
  - Empty state uses `EmptyState` + `History` icon + `tr("no_data", locale)`.
  - Preserved bilingual fallback error copy when `error` is not an `Error` instance.

### `src/components/dashboard/contracts-panel.tsx`

- Imported `QueryState`, `EmptyState`.
- Added `error` to `useQuery` destructuring.
- Replaced ternary loading/error/empty/list with `QueryState`:
  - Preserved bilingual empty copy split into `title` + `description`.
  - **Retained Projects and Agents CTAs** in `EmptyState.action` wrapped in `flex gap-2`.
  - Empty state wrapped in `Card className="border-dashed"` to preserve prior dashed-border styling.
  - Error retry uses `onRetry={() => void refetch()}` matching prior behavior.

## Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | Pass (exit 0) |
| Linter on modified files | No issues |

## Self-review

### Strengths

- All three panels now expose the same `isLoading` / `isError` / `isEmpty` / `onRetry` / `locale` contract via `QueryState`.
- Bilingual copy preserved everywhere copy was touched.
- Contracts empty state still routes to Projects and Agents views.
- Version history gains retry on fetch failure (previously missing).

### Minor notes (non-blocking)

- `document-matrix` empty state uses only `title` (`no_data`); prior UI had no description either — consistent.
- `contracts-panel` empty `EmptyState` uses `className="max-w-md mx-auto"` on the inner div; outer `Card` provides dashed border — slight layout shift vs monolithic empty card but functionally equivalent.
- Filtered-empty in `document-matrix` (category filter with no matches) still shows generic `no_data` — same as before.

## Files modified

- `src/components/dashboard/document-matrix.tsx`
- `src/components/dashboard/version-history.tsx`
- `src/components/dashboard/contracts-panel.tsx`

## Concerns

None.
