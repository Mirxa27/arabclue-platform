# Task 2 Report: Agent ops center — workspace run history

**Status:** DONE  
**Branch:** `cursor/remaining-gaps-sdd-ab64`  
**Commit message:** `feat(agents): workspace-wide run history ops center`

## Summary

Added workspace-wide AgentRun history for the agents dashboard. The new API lists recent runs for the caller's workspace, the serializer provides the required DTO shape, and the dashboard can select an older run to rehydrate the existing status polling flow.

## Changes

### `src/lib/agent-runs.ts`

- Added `serializeAgentRun(run)` returning `{ id, projectId, projectTitle, status, progress, currentAgent, errorMessage, createdAt, completedAt }`.
- Extracts `currentAgent` from the running entry in `agentStates`.
- Serializes dates to ISO strings for the API DTO.

### `src/lib/__tests__/agent-runs-list.test.ts`

- Added TDD coverage for the serializer using a fixture with project context, failed status, active agent state, error text, and timestamps.
- Verified red first: test initially failed because `../agent-runs` did not exist.

### `src/app/api/agents/runs/route.ts`

- Added `GET /api/agents/runs?limit=50`.
- Uses `withTenant("session")`.
- Filters runs by `where: { project: { workspaceId: workspace.id } }`.
- Orders by newest first and caps `limit` to `1..100`.

### `src/components/dashboard/agent-workflow.tsx`

- Added a bilingual "Run history" list above the live progress gauges.
- Fetches `/api/agents/runs?limit=50` with React Query.
- Clicking a run sets `activeProjectId`, sets `runId`, and fetches `/api/agents/status?runId=...` to hydrate the existing pipeline UI.
- Shows failed run `errorMessage` inline in history and preserves the existing cancel flow for running runs.
- Invalidates run history when runs start, complete, fail, or cancel.

## Verification

| Check | Result |
|-------|--------|
| `bun test src/lib/__tests__/agent-runs-list.test.ts` before helper | Failed as expected: missing `../agent-runs` |
| `bun test src/lib/__tests__/agent-runs-list.test.ts` | Pass: 1 pass, 0 fail |
| `bunx tsc --noEmit` | Pass (exit 0) |
| `bun run lint` | Pass (exit 0) |

## Constraints

- No schema migrations.
- No dependency changes.
- Tenant scoping is through `withTenant("session")` and the related project's `workspaceId`.

## Concerns

None.

