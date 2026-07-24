# Remaining Product Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining P1/P2 ArabClue workspace gaps so agent ops, reviews, contracts, Mission Control, onboarding, billing, notifications, and KPIs are fully usable without fake/empty failure states.

**Architecture:** Prefer UI + thin API endpoints over schema migrations. Reuse `QueryState` / `EmptyState` / toasts. Persist ephemeral UX (notification dismiss, etimad checklist) in `localStorage`. Derive contract obligations from existing articles/entities. No Etimad submission API, SSO, or live MyFatoorah charges.

**Tech Stack:** Next.js 16 App Router, React Query, Prisma `AgentRun` / proposals / billing records, Zustand/`localStorage`, Sonner/toast, existing `/api/stats` and compare routes.

## Global Constraints

- Branch prefix: `cursor/<name>-ab64` (this work: `cursor/remaining-gaps-sdd-ab64`)
- Do not implement Etimad portal submission, SSO/OIDC, or live MyFatoorah charges
- Prefer `QueryState` / `EmptyState` / `ErrorState` from `@/components/patterns`
- Arabic + English copy for user-facing strings (`locale === "ar"`)
- No AI bid pricing; financial workbook stays human-entered
- Commit after each task; run focused tests then `bunx tsc --noEmit` before commit when touching TS
- Do not invent fake KPI trends — compute or hide
- YAGNI: no new Prisma models unless a task explicitly requires one (none do)

---

### Task 1: QueryState consistency for docs/contracts/history

**Files:**
- Modify: `src/components/dashboard/document-matrix.tsx`
- Modify: `src/components/dashboard/version-history.tsx`
- Modify: `src/components/dashboard/contracts-panel.tsx`

**Interfaces:**
- Consumes: `QueryState`, `EmptyState`, `ErrorState` from `@/components/patterns`
- Produces: panels that expose `isLoading` / `isError` / `isEmpty` / `onRetry` consistently

- [ ] **Step 1:** In each of the three files, destructure `isError` and `refetch` from `useQuery` if missing.
- [ ] **Step 2:** Replace hand-rolled loading/error/empty branches with:

```tsx
<QueryState
  isLoading={isLoading}
  isError={isError}
  isEmpty={items.length === 0}
  onRetry={() => refetch()}
  locale={locale}
  loading={<ListSkeleton rows={3} />}
  empty={
    <EmptyState
      icon={/* existing icon */}
      title={locale === "ar" ? "..." : "..."}
      description={/* keep existing empty copy */}
      action={/* keep existing CTAs if any */}
    />
  }
>
  {/* existing list content */}
</QueryState>
```

- [ ] **Step 3:** Ensure contracts empty state still offers project/agents CTAs.
- [ ] **Step 4:** Run `bunx tsc --noEmit` — expect pass.
- [ ] **Step 5:** Commit: `fix(ui): adopt QueryState on docs contracts history panels`

---

### Task 2: Agent ops center — workspace run history

**Files:**
- Create: `src/app/api/agents/runs/route.ts`
- Create: `src/lib/__tests__/agent-runs-list.test.ts` (pure helper if extracted)
- Modify: `src/components/dashboard/agent-workflow.tsx`
- Optional create: `src/lib/agent-runs.ts` helper to map DB rows → API DTO

**Interfaces:**
- Consumes: Prisma `AgentRun` with `project: { workspaceId, title, etimadRef }`
- Produces: `GET /api/agents/runs?limit=50` → `{ runs: Array<{ id, projectId, projectTitle, status, progress, currentAgent, errorMessage, createdAt, completedAt }> }`

- [ ] **Step 1:** Add helper `serializeAgentRun(run)` in `src/lib/agent-runs.ts` returning the DTO above.
- [ ] **Step 2:** Test serialize with a fixture object — assert fields present.
- [ ] **Step 3:** Implement `GET` with `withTenant("session")`, filter `where: { project: { workspaceId } }`, `orderBy: { createdAt: "desc" }`, `take: limit`.
- [ ] **Step 4:** In `agent-workflow.tsx`, add a “Run history” list above the active gauges; clicking a run sets `runId` / project and hydrates existing status poll.
- [ ] **Step 5:** Show `errorMessage` on failed runs; Cancel still uses existing cancel API for RUNNING.
- [ ] **Step 6:** `bun test src/lib/__tests__/agent-runs-list.test.ts` + tsc; commit: `feat(agents): workspace-wide run history ops center`

---

### Task 3: Reviews — errors + redline timeline

**Files:**
- Modify: `src/components/dashboard/reviews-queue.tsx`
- Reuse: `GET /api/proposals/[id]/versions/compare?a=&b=`

**Interfaces:**
- Consumes: reviews list query; compare API returning `{ lines: string[] }` or existing shape
- Produces: queue with QueryState + expandable diff per row

- [ ] **Step 1:** Wire `isError` / `refetch` into `QueryState` (never show empty on error).
- [ ] **Step 2:** Add “Redline” button per proposal review that fetches compare for `version` vs `version - 1` (skip if version < 2 with muted hint).
- [ ] **Step 3:** Render diff in a `<pre className="font-mono text-[10px]">` capped at 200 lines.
- [ ] **Step 4:** tsc; commit: `fix(reviews): surface errors and version redline diffs`

---

### Task 4: Contract obligation register (derived)

**Files:**
- Create: `src/lib/contract-obligations.ts`
- Create: `src/lib/__tests__/contract-obligations.test.ts`
- Modify: `src/components/dashboard/contract-studio.tsx` and/or `contracts-panel.tsx`

**Interfaces:**
- Consumes: articles array `{ title?, titleAr?, body?, bodyAr? }[]` and optional milestones
- Produces: `extractObligations(articles, milestones?): ObligationRow[]` where `ObligationRow = { id, text, source, status: "open" | "done" }`

- [ ] **Step 1:** Write tests: article titled “Obligations” / body containing “shall” / milestone titles become rows; empty input → `[]`.
- [ ] **Step 2:** Implement keyword/heuristic extract (EN+AR: obligation|shall|يجب|التزام|SLA|milestone).
- [ ] **Step 3:** Add “Obligations” tab/section in contract studio listing rows; toggle done persists in `localStorage` key `arabclue-obligations:${proposalId}`.
- [ ] **Step 4:** Link from contracts panel into studio obligations tab when opening a contract.
- [ ] **Step 5:** tests + tsc; commit: `feat(contracts): derived obligation register from articles`

---

### Task 5: Mission Control speech/mission error recovery

**Files:**
- Modify: `src/components/dashboard/platform-agent-console.tsx`
- Light touch: `src/components/dashboard/live-voice-session.tsx` if stop copy inconsistent

**Interfaces:**
- Consumes: `useToast` / sonner; missions `POST /api/platform-agent/missions`
- Produces: no `alert()`; visible mission bootstrap error + Retry; stop clears speech/TTS/stream

- [ ] **Step 1:** Replace SpeechRecognition missing `alert(...)` with `toast({ title, variant: "destructive" })` or inline banner.
- [ ] **Step 2:** Surface mission create failure in UI state `missionError` with Retry button that re-POSTs.
- [ ] **Step 3:** Ensure Stop cancels recognition + speechSynthesis + chat `stop()` and shows brief “Stopped” toast.
- [ ] **Step 4:** Grep for `alert(` in dashboard — expect none in platform-agent-console.
- [ ] **Step 5:** tsc; commit: `fix(mission): toast speech gaps and mission create recovery`

---

### Task 6: Qualification dossier CTAs + onboarding CRUD polish

**Files:**
- Modify: `src/components/dashboard/account-onboarding.tsx`
- Optional: `src/lib/qualification.ts` for `gapAction` metadata

**Interfaces:**
- Consumes: `assessQualificationDossier` gaps; cert/staff/library CRUD APIs; approval-policy PUT
- Produces: gap → CTA map; toasts + EmptyState on CRUD; approval reorder/delete

- [ ] **Step 1:** Map each `QualificationGap.key` to `{ viewHint, certType?, scrollId }` and render a Button that focuses the matching form / preselects cert type.
- [ ] **Step 2:** In `SimpleCrudPanel` (or equivalent), toast on success/error; show `EmptyState` when empty.
- [ ] **Step 3:** Approval steps: Up / Down / Delete buttons rewriting steps array then `PUT /api/approval-policy`.
- [ ] **Step 4:** tsc; commit: `fix(account): qualification CTAs and onboarding CRUD UX`

---

### Task 7: Billing failure UX + notification dismiss + real KPI trends

**Files:**
- Modify: `src/components/dashboard/billing-panel.tsx`
- Modify: `src/components/dashboard/topbar.tsx`
- Create: `src/hooks/use-dismissed-notifications.ts` (localStorage)
- Modify: `src/app/api/stats/route.ts`
- Modify: `src/components/dashboard/stat-cards.tsx`
- Create: `src/lib/__tests__/stats-trends.test.ts` (pure pct helper)

**Interfaces:**
- Consumes: billing `subscription.status`, `records[].status`; notification `items[].id`; entity `createdAt`
- Produces: `trendPct(current, previous): number | null`; stats JSON `{ ..., trends: { projects, documents, proposals, compliance } }`

- [ ] **Step 1:** Helper `trendPct(curr, prev)` — if both 0 return `null`; if prev 0 and curr > 0 return `100`; else `Math.round(((curr - prev) / prev) * 100)`.
- [ ] **Step 2:** In `/api/stats`, count last 7d vs prior 7d for projects/documents/proposals; attach `trends`.
- [ ] **Step 3:** StatCards use API trends; omit arrow when `null`.
- [ ] **Step 4:** Billing: Alert when `PAST_DUE` or latest `FAILED`; Retry → existing checkout.
- [ ] **Step 5:** Topbar: filter dismissed ids from localStorage; Mark all read / per-item dismiss.
- [ ] **Step 6:** tests + tsc; commit: `feat(workspace): billing alerts notification dismiss real KPI trends`

---

## Out of scope (do not implement)

- Etimad submission API
- SSO / OIDC
- Live MyFatoorah sandbox charge without merchant credentials
- New Prisma tables for obligations or notifications
