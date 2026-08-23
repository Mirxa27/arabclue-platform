# Dashboard Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/app` a bid command center: honest chrome, grouped nav, progressive disclosure, and URL-truthful next-step navigation.

**Architecture:** Extract a pure next-step resolver. Overview mounts work panels only after a project exists. Sidebar groups Workflow / Library / Account. Dashboard shell drops unearned PDPL/Vision pulses. All overview view changes go through `useNavigateToView`.

**Tech Stack:** Next.js 16 App Router, Zustand `useUI`, `useNavigateToView`, TanStack Query, `localizationRegistry`, bun tests.

## Global Constraints

- Package manager is **bun**, never npm.
- Locale defaults to Arabic (RTL); every new string has non-empty `ar` and `en` in `localizationRegistry`.
- `/app` is a Zustand view switcher; view changes that the user can refresh or share must go through `useNavigateToView` / `navigateToView`, not `setView`.
- Do not invent KPI numbers, compliance scores, or legal conclusions (no “PDPL Compliant” on dashboard chrome).
- Do not run `prisma migrate`, `db push`, or reset against Neon.
- Do not restyle marketing, login, or register pages.
- Do not add Etimad submission, SSO, or live MyFatoorah.
- Preserve existing visual tokens (`--surface-*`, hairline, RTL).
- Commits stay on `cursor/dashboard-command-center-ab64`.
- Tests: `bun test <focused-file>` while iterating; `bun test` once before commit.

## File structure

- Create: `src/lib/overview-next-step.ts` — pure next-step resolver
- Create: `src/lib/__tests__/overview-next-step.test.ts`
- Modify: `src/components/dashboard/sidebar.tsx` — groups, remove Vision card and PDPL pulse
- Modify: `src/components/dashboard/topbar.tsx` — remove PDPL Compliant pill
- Modify: `src/components/dashboard/footer.tsx` — remove PDPL note and `v1.0.0`
- Modify: `src/components/dashboard/views.tsx` — progressive disclosure
- Modify: `src/components/dashboard/tender-flow-board.tsx` — resolver + `useNavigateToView`
- Modify: `src/components/dashboard/stat-cards.tsx` — card navigation
- Modify: `src/components/dashboard/projects-list.tsx` — first-tender empty copy
- Modify: `src/hooks/use-ensure-active-project.ts` — export `isSuccess`
- Modify: `src/lib/i18n.ts` — new keys
- Modify: `src/components/patterns/query-state.tsx` — locale-aware `ErrorState` default
- Modify: `src/components/patterns/confirm-dialog.tsx` — locale-aware Confirm/Cancel
- Modify: `src/lib/__tests__/no-fabricated-assurance.test.ts` — shell guards
- Test: `src/lib/__tests__/overview-navigation-guards.test.ts`

---

### Task 1: Honest dashboard chrome

**Files:**
- Modify: `src/lib/__tests__/no-fabricated-assurance.test.ts`
- Modify: `src/components/dashboard/sidebar.tsx`
- Modify: `src/components/dashboard/topbar.tsx`
- Modify: `src/components/dashboard/footer.tsx`

**Interfaces:**
- Consumes: existing `no-fabricated-assurance.test.ts` source-read pattern
- Produces: dashboard shell with no unearned PDPL/Vision pulse; brand/location copy may remain

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/no-fabricated-assurance.test.ts`:

```ts
describe("dashboard chrome does not invent compliance", () => {
  test("sidebar does not pulse a PDPL or Vision 2030 claim", () => {
    const source = read("src/components/dashboard/sidebar.tsx");
    expect(source).not.toContain("PDPL");
    expect(source).not.toContain("Vision 2030");
    expect(source).not.toContain("animate-pulse");
  });

  test("topbar does not show PDPL Compliant", () => {
    const source = read("src/components/dashboard/topbar.tsx");
    expect(source).not.toContain("PDPL Compliant");
    expect(source).not.toContain("PDPL متوافق");
  });

  test("footer does not claim PDPL compliance or a fake version", () => {
    const source = read("src/components/dashboard/footer.tsx");
    expect(source).not.toContain("footer_pdpl_note");
    expect(source).not.toContain("v1.0.0");
    expect(source).not.toContain("PDPL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/no-fabricated-assurance.test.ts`

Expected: FAIL on the new dashboard chrome tests (sidebar/topbar/footer still contain those strings).

- [ ] **Step 3: Write minimal implementation**

In `sidebar.tsx` brand subtitle, keep “Saudi Platform” / “منصة سعودية” and remove the PDPL span and its emerald pulse on the logo (`animate-pulse` next to the logo). Delete the entire Vision 2030 footer card (`{/* Vision badge — subtle */}` through its closing `</div>`). Keep the collapse toggle. Set collapse `title` to `locale === "ar" ? (collapsed ? "توسيع" : "طي") : (collapsed ? "Expand" : "Collapse")`.

In `topbar.tsx`, delete the entire hidden-lg PDPL pill (`hidden lg:flex ... PDPL Compliant ... KSA`).

In `footer.tsx`, remove the ShieldCheck / `footer_pdpl_note` span and the Globe / `v1.0.0` span. Keep copyright and the Hosted in Riyadh line.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/no-fabricated-assurance.test.ts`

Expected: PASS. If sidebar still has `animate-pulse` elsewhere, remove only decorative pulses, not real agent-running indicators (there should be none left in this file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/no-fabricated-assurance.test.ts src/components/dashboard/sidebar.tsx src/components/dashboard/topbar.tsx src/components/dashboard/footer.tsx
git commit -m "$(cat <<'EOF'
fix(dashboard): stop inventing PDPL and Vision claims in chrome

The shell pulsed compliance badges nothing measured. Keep brand and
Riyadh hosting; leave legal conclusions to the compliance view.
EOF
)"
```

---

### Task 2: Group the sidebar

**Files:**
- Modify: `src/lib/i18n.ts` (add keys before the `} as const satisfies Dict` closing of `localizationRegistry`)
- Modify: `src/components/dashboard/sidebar.tsx`
- Create: `src/lib/__tests__/dashboard-sidebar-ia.test.ts`

**Interfaces:**
- Consumes: Task 1 sidebar without Vision card
- Produces: `NAV_WORKFLOW`, `NAV_LIBRARY`, `NAV_ACCOUNT` arrays and bilingual group headings

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/dashboard-sidebar-ia.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "..", "..", "..", "src/components/dashboard/sidebar.tsx"),
  "utf8"
);

describe("sidebar information architecture", () => {
  test("declares the three product groups", () => {
    expect(source).toContain("NAV_WORKFLOW");
    expect(source).toContain("NAV_LIBRARY");
    expect(source).toContain("NAV_ACCOUNT");
    expect(source).toContain("nav_group_workflow");
    expect(source).toContain("nav_group_library");
    expect(source).toContain("nav_group_account");
  });

  test("marketplace is not in the workflow list", () => {
    const workflow = source.slice(
      source.indexOf("NAV_WORKFLOW"),
      source.indexOf("NAV_LIBRARY")
    );
    expect(workflow).not.toContain('"marketplace"');
    expect(workflow).not.toContain('"clause-library"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/dashboard-sidebar-ia.test.ts`

Expected: FAIL — `NAV_WORKFLOW` is not in the file.

- [ ] **Step 3: Write minimal implementation**

Add to `localizationRegistry` (near other `nav_` keys):

```ts
  nav_group_workflow: { ar: "سير العمل", en: "Workflow" },
  nav_group_library: { ar: "المكتبة", en: "Library" },
  nav_group_account: { ar: "الحساب", en: "Account" },
  nav_expand: { ar: "توسيع", en: "Expand" },
  nav_collapse: { ar: "طي", en: "Collapse" },
```

Replace the single `NAV` array in `sidebar.tsx` with:

```ts
const NAV_WORKFLOW: { view: DashboardView; key: string; icon: typeof LayoutDashboard; badge?: "pending-approval" }[] = [
  { view: "overview", key: "nav_dashboard", icon: LayoutDashboard },
  { view: "copilot", key: "nav_copilot", icon: AudioLines },
  { view: "projects", key: "nav_projects", icon: FolderKanban },
  { view: "documents", key: "nav_documents", icon: FileText },
  { view: "proposals", key: "nav_proposals", icon: FileCheck2 },
  { view: "contracts", key: "nav_contracts", icon: Scale },
  { view: "compliance", key: "nav_compliance", icon: ShieldCheck },
  { view: "agents", key: "nav_agents", icon: Bot },
  { view: "reviews", key: "nav_reviews", icon: ScrollText },
];

const NAV_LIBRARY: typeof NAV_WORKFLOW = [
  { view: "clause-library", key: "nav_clause_library", icon: Scale },
  { view: "template-editor", key: "nav_template_editor", icon: FileStack },
  { view: "marketplace", key: "nav_marketplace", icon: Store },
  { view: "knowledge-approval", key: "nav_knowledge_approval", icon: ClipboardCheck, badge: "pending-approval" },
];

const NAV_ACCOUNT: typeof NAV_WORKFLOW = [
  { view: "account", key: "nav_account", icon: Building2 },
  { view: "business-profile", key: "nav_business_profile", icon: Sparkles },
  { view: "history", key: "nav_history", icon: History },
  { view: "billing", key: "nav_billing", icon: CreditCard },
  { view: "settings", key: "nav_settings", icon: Lock },
  { view: "proposal-builder", key: "nav_proposal_builder", icon: LayoutList },
  { view: "analytics", key: "nav_analytics", icon: BarChart3 },
];
```

Render three groups. Extract the existing item button into a local `NavButton` function in the same file to avoid duplicating the active/badge markup three times. When not collapsed, each group gets a heading using `tr("nav_group_*", locale)` in the same uppercase tracking style as the admin heading. When collapsed, separate groups with a hairline only.

Use `tr("nav_expand" | "nav_collapse", locale)` for the collapse control title.

Keep `ADMIN_NAV` and `goToView` unchanged (already URL-truthful).

If workspace fetch fails, throw on `!res.ok` in the queryFn:

```ts
const res = await fetch("/api/workspaces");
if (!res.ok) throw new Error(`workspaces ${res.status}`);
return res.json();
```

When `isError`, show a one-line bilingual retry under the brand block (`تعذر تحميل مساحة العمل` / `Could not load workspace`) with a button that calls `refetch`. Do not invent a workspace name.

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/__tests__/dashboard-sidebar-ia.test.ts src/lib/__tests__/i18n-completeness.test.ts src/lib/__tests__/no-fabricated-assurance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.ts src/components/dashboard/sidebar.tsx src/lib/__tests__/dashboard-sidebar-ia.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): group sidebar into workflow, library, and account

Twenty peer items buried the live-bid path. Marketplace and clause
tools move to Library so the primary list is the tender sequence.
EOF
)"
```

---

### Task 3: Pure overview next-step resolver

**Files:**
- Create: `src/lib/overview-next-step.ts`
- Create: `src/lib/__tests__/overview-next-step.test.ts`

**Interfaces:**
- Consumes: `DashboardView` from `@/lib/dashboard-routes`
- Produces:

```ts
export type OverviewStepId = "create" | "upload" | "agents" | "export";

export function resolveOverviewNextStep(input: {
  projectCount: number;
  documentCount: number;
  agentRunCount: number;
  proposalCount: number;
}): OverviewStepId;

export function overviewStepView(id: OverviewStepId): DashboardView | null;

export function shouldShowOverviewWorkPanels(projectCount: number): boolean;
```

`overviewStepView("create")` returns `null` (wizard, not a view).  
`overviewStepView("upload")` → `"documents"`.  
`overviewStepView("agents")` → `"agents"`.  
`overviewStepView("export")` → `"proposals"`.  
`shouldShowOverviewWorkPanels` is `projectCount > 0`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  overviewStepView,
  resolveOverviewNextStep,
  shouldShowOverviewWorkPanels,
} from "@/lib/overview-next-step";

describe("resolveOverviewNextStep", () => {
  test("create when there is no project", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 0,
        documentCount: 0,
        agentRunCount: 0,
        proposalCount: 0,
      })
    ).toBe("create");
  });

  test("upload when the active tender has no documents", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 0,
        agentRunCount: 4,
        proposalCount: 1,
      })
    ).toBe("upload");
  });

  test("agents when documents exist but no runs", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 2,
        agentRunCount: 0,
        proposalCount: 0,
      })
    ).toBe("agents");
  });

  test("export once a run exists", () => {
    expect(
      resolveOverviewNextStep({
        projectCount: 1,
        documentCount: 2,
        agentRunCount: 1,
        proposalCount: 0,
      })
    ).toBe("export");
  });
});

describe("overviewStepView", () => {
  test("create has no view; the others map to the flow views", () => {
    expect(overviewStepView("create")).toBeNull();
    expect(overviewStepView("upload")).toBe("documents");
    expect(overviewStepView("agents")).toBe("agents");
    expect(overviewStepView("export")).toBe("proposals");
  });
});

describe("shouldShowOverviewWorkPanels", () => {
  test("hides upload and agents until a project exists", () => {
    expect(shouldShowOverviewWorkPanels(0)).toBe(false);
    expect(shouldShowOverviewWorkPanels(1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/overview-next-step.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/overview-next-step.ts` with exactly the functions above. `resolveOverviewNextStep` uses the table in the spec (first matching condition wins). No I/O, no React.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/overview-next-step.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/overview-next-step.ts src/lib/__tests__/overview-next-step.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): decide the overview next step from stored counts

A single function names the undone bid step so the home CTA and the
flow board cannot disagree.
EOF
)"
```

---

### Task 4: Command-center overview and URL-truthful flow

**Files:**
- Modify: `src/hooks/use-ensure-active-project.ts`
- Modify: `src/components/dashboard/views.tsx`
- Modify: `src/components/dashboard/tender-flow-board.tsx`
- Create: `src/lib/__tests__/overview-navigation-guards.test.ts`

**Interfaces:**
- Consumes: `resolveOverviewNextStep`, `overviewStepView`, `shouldShowOverviewWorkPanels`; `useNavigateToView`
- Produces: `useEnsureActiveProject()` also returns `isSuccess: boolean`. Overview hides work panels when `isSuccess && projects.length === 0`. Flow board navigates via `useNavigateToView`.

- [ ] **Step 1: Write the failing guard test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("overview navigation stays on the URL", () => {
  test("the flow board does not call setView", () => {
    const source = read("src/components/dashboard/tender-flow-board.tsx");
    expect(source).toContain("useNavigateToView");
    expect(source).toContain("resolveOverviewNextStep");
    expect(source).not.toMatch(/\bsetView\b/);
  });

  test("overview defers work panels until a project exists", () => {
    const source = read("src/components/dashboard/views.tsx");
    expect(source).toContain("shouldShowOverviewWorkPanels");
    expect(source).toContain("isSuccess");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/overview-navigation-guards.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`use-ensure-active-project.ts`: return `{ projects, active, activeProjectId, isSuccess }` from the existing query (`isSuccess` is already computed).

`OverviewView` in `views.tsx`:

```tsx
function OverviewView() {
  const { locale } = useLocale();
  const { projects, isSuccess } = useEnsureActiveProject();
  const showWork = isSuccess && shouldShowOverviewWorkPanels(projects.length);
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_dashboard", locale)}
        subtitle={
          locale === "ar"
            ? "المطلوب الآن على المناقصة النشطة"
            : "What this tender needs next"
        }
        locale={locale}
      />
      <OnboardingBanner />
      <div className="space-y-4">
        <TenderFlowBoard />
      </div>
      {showWork ? (
        <>
          <StatCards />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FileIngestion />
            <AgentWorkflow />
          </div>
        </>
      ) : null}
    </PageSection>
  );
}
```

Import `useEnsureActiveProject` and `shouldShowOverviewWorkPanels`.

`tender-flow-board.tsx`:

- Import `useNavigateToView` from `@/components/dashboard/view-navigation`.
- Import `overviewStepView`, `resolveOverviewNextStep` from `@/lib/overview-next-step`.
- Remove `setView` from `useUI()`. Keep `setActiveProjectId`.
- Compute `nextId = resolveOverviewNextStep({ projectCount: projects.length, documentCount: docs, agentRunCount: runs, proposalCount: proposals })`.
- For step actions other than `create`: `if (active) setActiveProjectId(active.id); const view = overviewStepView(step.id); if (view) navigateToView(view);`
- `create` still opens `TenderSetupWizard`.
- The header primary button calls `next.action` as today.
- Keep the Etimad cockpit and wizard.

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/__tests__/overview-navigation-guards.test.ts src/lib/__tests__/overview-next-step.test.ts src/lib/__tests__/view-router-url-sync.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-ensure-active-project.ts src/components/dashboard/views.tsx src/components/dashboard/tender-flow-board.tsx src/lib/__tests__/overview-navigation-guards.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): show work panels only after a tender exists

Home was a widget dump on an empty workspace. The flow board now
names the next step and pushes the matching URL.
EOF
)"
```

---

### Task 5: Actionable stats, empty copy, locale defaults

**Files:**
- Modify: `src/lib/i18n.ts`
- Modify: `src/components/dashboard/stat-cards.tsx`
- Modify: `src/components/dashboard/projects-list.tsx`
- Modify: `src/components/patterns/query-state.tsx`
- Modify: `src/components/patterns/confirm-dialog.tsx`
- Create: `src/lib/__tests__/dashboard-locale-defaults.test.ts`

**Interfaces:**
- Consumes: `useNavigateToView`; Task 4 overview
- Produces: StatCards navigate; projects empty uses `projects_empty_title` / `projects_empty_description`; `ErrorState` and `ConfirmDialog` default labels follow locale

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localizationRegistry } from "@/lib/i18n";

const root = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("dashboard locale defaults", () => {
  test("projects empty has a first-tender pair", () => {
    expect(localizationRegistry.projects_empty_title.ar.length).toBeGreaterThan(0);
    expect(localizationRegistry.projects_empty_title.en.length).toBeGreaterThan(0);
    expect(localizationRegistry.projects_empty_description.en).not.toMatch(/no data/i);
    const list = read("src/components/dashboard/projects-list.tsx");
    expect(list).toContain("projects_empty_title");
  });

  test("ErrorState default retry follows locale", () => {
    const source = read("src/components/patterns/query-state.tsx");
    expect(source).toContain('retryLabel = locale === "ar"');
  });

  test("ConfirmDialog default actions follow locale", () => {
    const source = read("src/components/patterns/confirm-dialog.tsx");
    expect(source).toContain("useLocale");
    expect(source).toContain("nav_confirm");
    expect(source).toContain("nav_cancel");
  });

  test("stat cards navigate to the matching view", () => {
    const source = read("src/components/dashboard/stat-cards.tsx");
    expect(source).toContain("useNavigateToView");
    expect(source).toContain('navigateToView("projects")');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/dashboard-locale-defaults.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add keys:

```ts
  projects_empty_title: { ar: "لا توجد مناقصات بعد", en: "No tenders yet" },
  projects_empty_description: {
    ar: "أنشئ مناقصة لرفع الكراسة وتشغيل الوكلاء وتصدير العرض.",
    en: "Set up a tender so you can upload the RFP, run agents, and export the bid.",
  },
  nav_confirm: { ar: "تأكيد", en: "Confirm" },
  nav_cancel: { ar: "إلغاء", en: "Cancel" },
```

`projects-list.tsx` empty `EmptyState`: `title={tr("projects_empty_title", locale)}` and `description={tr("projects_empty_description", locale)}`. Keep the existing “Set up first tender” button.

`ErrorState` in `query-state.tsx`: add `const { locale } = useLocale();` and

```ts
retryLabel = locale === "ar" ? "إعادة المحاولة" : "Retry",
```

Callers that pass `retryLabel` still win.

`confirm-dialog.tsx`: `import { useLocale } from "@/lib/store"` and `import { tr } from "@/lib/i18n"`. Default `confirmLabel` / `cancelLabel` to `tr("nav_confirm", locale)` / `tr("nav_cancel", locale)` when the props are omitted. Easiest form: drop the parameter defaults and inside the component use `confirmLabel ?? tr("nav_confirm", locale)`.

`stat-cards.tsx`: import `useNavigateToView`. Add a `view: DashboardView` on each card (`projects`, `proposals`, `compliance`, `documents`). Make the `Card` a `<button type="button">` (or wrap it) that calls `navigateToView(c.view)`. Keep the retry error card. Do not invent trend numbers.

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/__tests__/dashboard-locale-defaults.test.ts src/lib/__tests__/i18n-completeness.test.ts src/lib/__tests__/overview-next-step.test.ts`

Expected: PASS.

Then: `bun test`

Expected: existing suite passes (do not change tests that asserted defective chrome except the ones this plan adds).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.ts src/components/dashboard/stat-cards.tsx src/components/dashboard/projects-list.tsx src/components/patterns/query-state.tsx src/components/patterns/confirm-dialog.tsx src/lib/__tests__/dashboard-locale-defaults.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): make stats, empties, and dialogs actionable in both locales

Zero-state projects now name the first tender. KPI cards open the
matching view. Shared dialogs stop defaulting to English.
EOF
)"
```
