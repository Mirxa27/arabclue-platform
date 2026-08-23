# Task 4 Report: Command-center overview and URL-truthful flow

**Status:** DONE  
**Branch:** `cursor/dashboard-command-center-ab64`  
**Commit:** `2f60895` — feat(dashboard): show work panels only after a tender exists

## Summary

Overview no longer dumps StatCards / FileIngestion / AgentWorkflow while projects are loading or empty. The tender flow board resolves the next step via Task 3 helpers and navigates with `useNavigateToView` (URL-truthful), with no `setView` calls.

## What changed

### `src/hooks/use-ensure-active-project.ts`
- Return value now includes `isSuccess` from the existing `["projects"]` query: `{ projects, active, activeProjectId, isSuccess }`.

### `src/components/dashboard/views.tsx` (`OverviewView`)
- Imports `useEnsureActiveProject` and `shouldShowOverviewWorkPanels`.
- `showWork = isSuccess && shouldShowOverviewWorkPanels(projects.length)`.
- While `!isSuccess` or zero projects, work panels stay hidden (no loading-as-empty flash).
- PageHeader subtitle uses `tr("overview_subtitle", locale)`.

### `src/lib/i18n.ts`
- Added registry key:
  - `overview_subtitle`: `{ ar: "المطلوب الآن على المناقصة النشطة", en: "What this tender needs next" }`

### `src/components/dashboard/tender-flow-board.tsx`
- Removed `setView` / `startTransition`; file has **no** `\bsetView\b`.
- Uses `useNavigateToView`, `resolveOverviewNextStep`, `overviewStepView`.
- `nextId` drives highlight and primary CTA (not an independent `steps.find(!done)`).
- Step actions: `create` opens wizard only; other steps set active project then `navigateToView(overviewStepView(step.id))`.
- Export always goes to `proposals` via `overviewStepView("export")` (no contracts fallback).
- Kept four step cards, Etimad cockpit, and wizard.

### `src/lib/__tests__/overview-navigation-guards.test.ts`
- Source-guard tests as specified in the brief (TDD: written first, failed, then implementation).

## Out of scope (not done)
- Task 5 (stat-card navigation, projects empty copy, ErrorState/ConfirmDialog).
- Documents/Agents FileIngestion mounts unchanged.
- No Prisma, no push, no full test suite.

## Verification

```bash
bun test ./src/lib/__tests__/overview-navigation-guards.test.ts \
  ./src/lib/__tests__/overview-next-step.test.ts \
  ./src/lib/__tests__/view-router-url-sync.test.ts \
  ./src/lib/__tests__/i18n-completeness.test.ts
bunx tsc --noEmit
```

**Result:** 1897 pass, 0 fail across 4 files; `tsc --noEmit` clean.

## Self-review checklist
- [x] Loading is not treated as zero projects (`isSuccess` gate).
- [x] Flow board uses shared next-step helpers (no drift).
- [x] Navigation is URL-truthful via `useNavigateToView`.
- [x] Bilingual subtitle in `localizationRegistry`.
- [x] Guard test path exact; no `setView` in tender-flow-board.
- [x] Commit message matches brief; i18n.ts included for registry key.

## Concerns
None.

## Whole-branch fix

**Finding:** `TenderFlowBoard` treated an in-flight `["projects"]` query as zero projects, so `resolveOverviewNextStep` returned `"create"` and briefly marked “Set up tender” as Next / primary CTA.

**Status:** DONE  
**Commit:** _(filled after commit)_

### What changed

- `src/lib/overview-next-step.ts` — added `resolveOverviewNextStepWhenReady` (returns `null` when `!isSuccess`; otherwise delegates to `resolveOverviewNextStep`). Existing table unchanged.
- `src/components/dashboard/tender-flow-board.tsx` — reads `isSuccess` from `useEnsureActiveProject()`; uses `resolveOverviewNextStepWhenReady`; hides header CTA while `nextId` is null; step cards render without a “Next” badge until success.
- `src/lib/__tests__/overview-next-step.test.ts` — behavior tests for the loading gate.
- `src/lib/__tests__/overview-navigation-guards.test.ts` — guard expects `resolveOverviewNextStepWhenReady`.

### Tests

```bash
bun test src/lib/__tests__/overview-next-step.test.ts src/lib/__tests__/overview-navigation-guards.test.ts
```

```
bun test v1.3.9 (cf6cdbbb)

src/lib/__tests__/overview-navigation-guards.test.ts:
(pass) overview navigation stays on the URL > the flow board does not call setView [5.11ms]
(pass) overview navigation stays on the URL > overview defers work panels until a project exists [0.84ms]

src/lib/__tests__/overview-next-step.test.ts:
(pass) resolveOverviewNextStep > create when there is no project [0.32ms]
(pass) resolveOverviewNextStep > upload when the active tender has no documents [0.03ms]
(pass) resolveOverviewNextStep > agents when documents exist but no runs
(pass) resolveOverviewNextStep > export once a run exists
(pass) resolveOverviewNextStepWhenReady > returns null while projects query is in flight [0.42ms]
(pass) resolveOverviewNextStepWhenReady > does not treat a pending empty list as create [0.05ms]
(pass) resolveOverviewNextStepWhenReady > delegates to resolveOverviewNextStep once ready [0.03ms]
(pass) overviewStepView > create has no view; the others map to the flow views [0.04ms]
(pass) shouldShowOverviewWorkPanels > hides upload and agents until a project exists [0.02ms]

 11 pass
 0 fail
 19 expect() calls
Ran 11 tests across 2 files. [168.00ms]
```

Also ran `bunx tsc --noEmit` (clean).

### Concerns
None.
