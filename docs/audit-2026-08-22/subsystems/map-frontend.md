# ArabClue — Frontend Code Audit

**Repo:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Scope:** `src/components/**`, `src/app/**` (excluding `src/app/api/**`), `src/hooks/**`, Zustand stores
**Basis:** current working tree (uncommitted modifications included), not git HEAD
**Stack:** Next.js 16 App Router + Turbopack, React 19, TypeScript, Tailwind v4, shadcn/ui + Radix, Zustand, TanStack Query, framer-motion, recharts, sonner

## Coverage and method

Total in-scope volume: ~27.1k LOC in `src/components/dashboard`, ~10.4k in the remaining component groups, ~4.3k in `src/app` (non-API), ~1.1k in `src/hooks`, ~5.4k in `src/components/ui`.

- **Read in full:** all of `src/app/**` (non-API), all of `src/hooks/**`, `src/lib/store.ts`, `src/lib/dashboard-routes.ts`, `src/lib/app-route-resolver.ts`, all of `src/components/patterns/**`, `src/components/providers/**`, and ~30 of the largest/highest-risk dashboard + admin components.
- **Read partially (targeted sections):** `proposal-editor.tsx`, `billing-reconciliation.tsx`, `mission-extension-bridge.tsx`, `arabclue-logo.tsx`, `copilot-processing-view.tsx`, `ui/chart.tsx`.
- **Covered by cross-cutting grep only:** the remaining dashboard/mission components and `src/components/ui/**` primitives. Findings in this report are only asserted where I read the code; grep-only observations are marked as such or placed in **Needs verification**.

Every finding in section 4 was verified by reading the cited lines.

---

## 1. File-by-file map

### 1.1 `src/app/**` (non-API)

| Path | LOC | Boundary | Purpose / exports | Rendered by | API calls | State | Edge cases |
|---|---|---|---|---|---|---|---|
| `layout.tsx` | 74 | server | Root layout. Sets `<html lang/dir>`, fonts, `ThemeProvider` + `AuthSessionProvider` + `QueryProvider`, `Toaster`. `export const dynamic = "force-dynamic"` | Next.js root | — | reads locale cookie | Forces **every** route dynamic (see D-06) |
| `page.tsx` | 21 | server | Homepage → `<LandingPage initialLocale>` | root layout | — | cookie locale | — |
| `error.tsx` | 46 | client | Root error boundary | Next.js | — | `reset()` | Hardcoded EN strings (D-19) |
| `global-error.tsx` | 83 | client | Root HTML-level error boundary | Next.js | — | — | Hardcoded EN strings (D-19) |
| `not-found.tsx` | 38 | server | 404 page | Next.js | — | — | Hardcoded EN + light-only colors (D-20) |
| `(app)/app/page.tsx` | 7 | server | `/app` entry → `AppRouteEntry(segments=[])`. `force-dynamic` | root layout | — | — | — |
| `(app)/app/[...segments]/page.tsx` | 18 | server | Catch-all `/app/*` → `AppRouteEntry(segments)`. `force-dynamic` | root layout | — | — | — |
| `(app)/app/app-route-entry.tsx` | 31 | server | Resolves segments → `{view, projectId, notice}` via `resolveAppRouteForRequest`; renders `AppShell` + `DashboardViews` | both `/app` pages | — | — | Handles forbidden view, missing project, unauth redirect |
| `(app)/app/layout.tsx` | 32 | server | Dashboard layout; reads locale cookie server-side | route group | — | — | — |
| `(app)/app/error.tsx` | 33 | client | Dashboard error boundary | route group | — | `reset()` | Hardcoded EN "Workspace error"/"Retry" (D-19) |
| `(app)/app/loading.tsx` | 32 | server | Dashboard skeleton | route group | — | — | — |
| `login/page.tsx` | 343 | client | Sign-in + forced-password-change flow | — | `signIn()`, `/api/auth/*` | local form | i18n OK; decorative `left-[-20%]` blobs |
| `register/page.tsx` | 185 | client | Registration | — | `/api/auth/register` | local form | Uncleaned redirect `setTimeout` |
| `verify-email/page.tsx` | 187 | client | Email verification + manual token entry | — | `/api/auth/verify-email` | local + `getElementById` | Uncontrolled input anti-pattern |
| `forgot-password/page.tsx` | 183 | client | Reset request | — | `/api/auth/forgot-password` | local form | — |
| `reset-password/page.tsx` | 228 | client | Reset completion | — | `/api/auth/reset-password` | local form | — |
| `invite/page.tsx` | 261 | client | Invitation acceptance | — | `/api/invitations/*` | local form | — |
| `billing/callback/page.tsx` + `page-client.tsx` | 17 + 92 | server + client | MyFatoorah return handler | — | `/api/billing/callback` | `useSearchParams`, `useSession` | Broken `?view=billing` deep link (D-04); all-English (D-19) |
| `pricing/page.tsx` | 85 | server | Pricing + `PackagesSection` | `PublicShell` | — | — | — |
| `compliance/page.tsx` | 151 | server | Compliance marketing page | `PublicShell` | — | — | — |
| `for-owners/page.tsx` | 172 | server | Owner-persona page + `TenderInsightsChart` | `PublicShell` | — | — | — |
| `contact/page.tsx` | 74 | server | Contact channels | `PublicShell` | — | — | — |
| `faq/page.tsx`, `legal/page.tsx` | 19, 23 | server | `DocPage` wrappers | `PublicShell` | — | — | — |
| `about/`, `terms/`, `privacy/`, `cookies/`, `dpa/`, `security/`, `acceptable-use/`, `billing-policy/` `page.tsx` | 8 each | server | Thin `DocPage` wrappers over content in `src/lib` | `PublicShell` | — | — | — |
| `*/layout.tsx` (per-page) | 7–19 each | server | Per-route `metadata` only | — | — | — | — |
| `robots.ts`, `sitemap.ts` | 24, 21 | server | SEO routes using `NEXT_PUBLIC_APP_URL` | — | — | — | — |
| `globals.css` | 880 | — | Tailwind v4 theme, tokens, shimmer/scrollbar utilities | — | — | — | — |
| `design-tokens.css` | 358 | — | Brand/design tokens | — | — | — | — |
| `bilingual-layout.css` | 278 | — | Bilingual document print/preview styles | — | — | — | — |

### 1.2 `src/hooks/**`

| Path | LOC | Purpose | Consumers | Notes |
|---|---|---|---|---|
| `use-view-router.ts` | 283 | Reconciles URL ↔ dashboard store; exports `useViewRouter` with `navigateToView` | `views.tsx` | `navigateToView` reaches ~0 in-content call sites (D-01) |
| `use-copilot-processing.ts` | 388 | Copilot phase/elapsed/token snapshot state machine | `mission-control-shell` | Well-structured; drives real `CopilotProcessingView` |
| `use-toast.ts` | 193 | shadcn toast reducer | app-wide | Stock |
| `use-dismissed-notifications.ts` | 127 | Local dismissal set for notification inbox | `topbar.tsx` | — |
| `use-artifact-download.ts` | 70 | Proposal/contract artifact download with busy-format tracking | editors, preview frame | — |
| `use-ensure-active-project.ts` | 46 | Picks/validates `activeProjectId` from `/api/projects` | `app-shell.tsx` | Clobbers saved project on every load (D-02) |
| `use-mobile.ts` | 19 | Viewport breakpoint hook | `ui/sidebar` | Stock |

### 1.3 Zustand store — `src/lib/store.ts` (only `create()` from zustand in the app)

Two stores:

- **`useLocale`** — `{locale, dir, setLocale, toggleLocale}`. Persists to `localStorage["arabclue-locale"]` as a JSON persist blob **and** a cookie; writes `document.documentElement.lang/dir`. `scheduleLocalePersistence` defers writes for INP.
- **`useUI`** — `{view, activeProjectId, sidebarCollapsed, mobileNavOpen, adminMode, tenderType, routeNotice}` + setters. `UI_PERSIST_OPTIONS` deliberately **excludes** `view` and `activeProjectId` from persistence so the URL stays canonical. Re-exports routing constants from `src/lib/dashboard-routes.ts`.

### 1.4 `src/components/providers/**`

| Path | LOC | Boundary | Notes |
|---|---|---|---|
| `query-provider.tsx` | 20 | client | `QueryClient` in `useState` initializer (correct). `staleTime: 5000`, `refetchOnWindowFocus: false`, `retry: 1` |
| `theme-provider.tsx` | 23 | client | `next-themes`, class attribute, system default |
| `session-provider.tsx` | 7 | client | next-auth `SessionProvider` passthrough |

### 1.5 `src/components/patterns/**`

| Path | LOC | Exports | Notes |
|---|---|---|---|
| `query-state.tsx` | 101 | `EmptyState`, `ErrorState`, `QueryState` | Good loading/error/empty contract. `ErrorState` default `retryLabel="Retry"` is English-only unless callers pass a label |
| `panel.tsx` | 76 | `Panel`, `PanelTone` | Icon-header card wrapper |
| `page-header.tsx` | 93 | `PageHeader`, `PageSection` | — |
| `confirm-dialog.tsx` | 71 | `ConfirmDialog` | Default `confirmLabel`/`cancelLabel` are English-only |
| `export-readiness-checklist.tsx` | 96 | `ExportReadinessChecklist` | Used by proposal editor |
| `index.ts` | — | Barrel | — |

### 1.6 `src/components/dashboard/**` — shell and routing

| Path | LOC | Boundary | Purpose | API calls | Notes |
|---|---|---|---|---|---|
| `app-shell.tsx` | 66 | client | Sidebar + topbar + mobile Sheet + footer; calls `useEnsureActiveProject` | — | `(session.user as any).emailVerified` cast; duplicates `html.lang/dir` already set by the store |
| `views.tsx` | 787 | client | View switcher. 12 panels statically imported, 18 via `next/dynamic` | — | Direct `setView` calls bypass the URL (D-01) |
| `sidebar.tsx` | 340 | client | Primary nav; uses `resolveDashboardNavigation` and **does** push URL | — | Correct nav path |
| `topbar.tsx` | 369 | client | Search, notifications, language/theme, project switcher | `/api/notifications`, `/api/search` | Notifications query permanently errors (D-03) |
| `footer.tsx` | 37 | client | Static footer | — | — |
| `view-navigation.tsx` | 31 | client | `ViewNavigationProvider` / `useNavigateToView` | — | **Zero consumers** (D-01) |
| `loading-skeletons.tsx` | 53 | client | `ListSkeleton`, `ChartSkeleton` | — | — |

### 1.7 `src/components/dashboard/**` — data panels (read in full)

| Path | LOC | API calls | Poll | States | Notes |
|---|---|---|---|---|---|
| `account-onboarding.tsx` | 1283 | `/api/onboarding`, `/api/workspaces`, `/api/certificates`, `/api/staff`, `/api/methodologies`, `/api/library`, `/api/partnerships`, `/api/sectors`, `/api/bid-history`, `/api/approval-policy`, `/api/restrictions` | — | mixed | 4 panels have **no** loading/error/status handling (D-07, D-08); select/submit mismatch (D-09) |
| `agent-workflow.tsx` | 1211 | `/api/agents/status`, `/api/agents/run` | 900 ms | full | No AbortController; toast per failed poll; `key={i}` findings |
| `proposal-editor.tsx` | 1231 | `/api/proposals/[id]`, `/financial`, `/validate`, `/rewrite`, `/api/brand` | — | full | Optimistic-concurrency save (`expectedVersion`+`expectedUpdatedAt`) is well done; `<tr key={i}>` on editable BoQ rows |
| `settings-panel.tsx` | 538 | `/api/auth/profile`, `/avatar`, `/password`, `/mfa/{setup,verify,disable}` | — | full | 8 `<Label>` with no `htmlFor` (D-10); no `<form>` so Enter never submits |
| `document-matrix.tsx` | 358 | `/api/documents` | — | full | `localStorage` in `useState` initializer → hydration mismatch (D-11); delete with no confirm; English-only `timeAgo` |
| `requirements-matrix.tsx` | 456 | `/api/requirements`, `/api/certificates`, `/api/staff`, `/api/library` | — | full | Hardcoded English summary + raw enum values in UI (D-16) |
| `reviews-queue.tsx` | 422 | `/api/reviews` | 15 s | full | Unlabeled textareas; one pending decision disables every row's buttons |
| `compliance-monitor.tsx` | 395 | `/api/compliance` | 4 s | full | Hardcoded English tooltips; aggressive poll |
| `projects-list.tsx` | 327 | `/api/projects` | 6 s | full | Uses `ConfirmDialog` for delete (good) |
| `proposals-list.tsx` | 396 | `/api/proposals` | — | full | English-only `timeAgo` |
| `stat-cards.tsx` | 164 | `/api/stats` | 8 s | partial | No error branch — renders zeros on failure |
| `charts-panel.tsx` | 205 | `/api/stats` | 10 s | full | **Dead code — zero importers** (D-17) |
| `file-ingestion.tsx` | 482 | `/api/documents` (POST) | — | full | Drop zone is mouse-only (D-12); sequential upload waterfall; no client-side size/type check |
| `document-preview-frame.tsx` | 527 | `/api/proposals/[id]/download?format={html,pdf}` | — | full | Sandboxed HTML iframe, blob cache with revoke, retry — well built |
| `document-file-viewer.tsx` | 315 | `/api/files` | — | full | Correct per-kind branches and object-URL cleanup |
| `proposal-builder-preview.tsx` | 256 | — | — | n/a | **Unescaped `dangerouslySetInnerHTML`** (D-05) |
| `markdown-studio-editor{,-inner}.tsx` | 46 + 202 | — | — | n/a | `ssr:false` dynamic import; both HTML sinks use escaped generators (safe) |
| `collaboration-presence.tsx` | 230 | `/api/collaboration/presence` | 3 s + 30 s heartbeat | partial | Section change tears down and rejoins (D-13) |
| `mission-pipeline-bar.tsx` | 231 | — | — | n/a | **Simulated progress rendered as real** (D-14); uncleaned timeout (D-15) |
| `copilot-processing-view.tsx` | 321 | — | — | n/a | Real snapshot-driven; `sr-only` summary; fully i18n'd — good reference |
| `mission-control-shell.tsx` | 274 | — | — | n/a | Composes mission surfaces incl. `MissionPipelineBar` |
| `mission-extension-bridge.tsx` | 630 | agent zip download | 4 s ping | partial | Uncleaned `setTimeout` at :319 |

**Grep-only (not read line-by-line):** `contract-studio.tsx` (964), `platform-agent-console.tsx` (915), `business-profile-view.tsx` (744), `version-history.tsx` (714), `billing-panel.tsx` (668), `brand-setup.tsx` (649), `knowledge-approval-queue.tsx` (630), `collaboration-comments.tsx` (622), `live-voice-session.tsx` (618), `proposal-builder.tsx` (578), `contract-template-catalog.tsx` (559), `clause-browser.tsx` (524), `contracts-panel.tsx` (519), `template-marketplace-card.tsx` (470), `workspace-template-editor.tsx` (463), `mission-realtime-workflow.tsx` (407), `mission-tool-theater.tsx` (382), `tender-setup-wizard.tsx` (388), `ai-assist-actions.tsx` (341), `template-marketplace.tsx` (318), `mission-attachment-tray.tsx` (313), `analytics-dashboard.tsx` (304), `analytics-charts.tsx` (296), `marketplace-publish-dialog.tsx` (277), `etimad-workflow-cockpit.tsx` (257), `knowledge-review-controls.tsx` (249), `proposal-builder-sections.tsx` (248), `contract-revision-history.tsx` (223), `mission-pulse-widget.tsx` (201), `tender-flow-board.tsx` (195), `mission-action-ticker.tsx` (173), `proposal-builder-toolbar.tsx` (166), `mission-conversation.tsx` (143), `mission-stage.tsx` (95), `tender-type-selector.tsx` (90), `mission-execution-feed.tsx` (85), `radial-gauge.tsx` (77), `mission-performance-fx.tsx` (49).

### 1.8 `src/components/admin/**`

| Path | LOC | API calls | Poll | Notes |
|---|---|---|---|---|
| `overview.tsx` | 181 | `/api/admin/overview` | 15 s | **Static "PDPL Compliant" banner** (D-18); `"Workspaces"` and `"active"` hardcoded EN |
| `audit.tsx` | 638 | `/api/admin/audit?limit=200` | — | **No error state** — failed load looks like an empty audit trail (D-21); rows expand on click only, no keyboard (D-22) |
| `billing-reconciliation.tsx` | 671 | `/api/admin/billing/reconcile` | on demand | **Client asserts `providerState:"PAID"`** (D-23); Arabic Previous button mislabeled (D-24) |
| `myfatoorah.tsx` | 442 | `/api/admin/myfatoorah` | — | No error branch → failure indistinguishable from "Not configured" (D-25); write-only secret handling is correct |
| `ai-providers.tsx` | 1427 | `/api/admin/ai-providers` | — | grep-only |
| `security.tsx` | 984 | `/api/admin/users`, `/api/admin/security` | — | grep-only |
| `billing.tsx` | 963 | `/api/admin/billing`, `/api/admin/plans` | — | grep-only |
| `env-settings.tsx` | 813 | `/api/admin/env` | — | grep-only |

### 1.9 `src/components/marketing/**`, `documents/**`, `brand/**`

| Path | LOC | Boundary | Notes |
|---|---|---|---|
| `marketing/landing-page.tsx` | 1213 | client | Hero, feature grid, FAQ. Physical CSS props break RTL (D-26). Demo values are explicitly labelled "sample/عينة" — honest |
| `marketing/public-shell.tsx` | 470 | client | Public header/footer, locale + theme toggle |
| `marketing/packages-section.tsx` | 307 | client | Pricing tiers |
| `marketing/tender-insights-chart.tsx` | 273 | client | recharts; `text-right` breaks RTL (D-26) |
| `marketing/doc-page.tsx` | 236 | client | Generic doc/FAQ renderer; `text-left` breaks RTL (D-26) |
| `documents/document-components.tsx` | 673 | mixed | Print/export document primitives; `border-l-4` info box breaks RTL (D-26) |
| `documents/bilingual/` | — | — | Bilingual document layout components |
| `brand/arabclue-logo.tsx` | 587 | client | Logo system; `<style dangerouslySetInnerHTML>` fed by static animation config (safe) |
| `brand/logo-animations.ts`, `logo-variants.ts` | — | — | Static CSS/token generators |

### 1.10 `src/components/ui/**` (48 files, 5,365 LOC)

Stock shadcn/ui on Radix, essentially unmodified. Notable points:

- `label.tsx` is **stock Radix `LabelPrimitive.Root`** — it does not auto-associate with inputs, and `input.tsx` does not auto-generate an `id`. So `<Label>X</Label><Input/>` produces an unlabeled input. This is the mechanism behind D-10.
- `chart.tsx` injects a `<style>` via `dangerouslySetInnerHTML` from the developer-supplied `ChartConfig` (stock shadcn, no user input) — safe.
- `sidebar.tsx` (the shadcn primitive) is unused by the dashboard, which has its own `dashboard/sidebar.tsx`.
- Physical-direction classes inside `ui/` primitives (`dropdown-menu`, `context-menu`, `menubar`, `carousel`, `calendar`) are stock and mostly RTL-safe via Radix `dir`.

---

## 2. Routing and navigation map

### 2.1 Route table

| Path | File | Auth | Rendering |
|---|---|---|---|
| `/` | `app/page.tsx` | public | server, forced dynamic |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/invite` | `app/<route>/page.tsx` | public | client, forced dynamic |
| `/pricing`, `/compliance`, `/for-owners`, `/contact`, `/faq`, `/legal`, `/about`, `/terms`, `/privacy`, `/cookies`, `/dpa`, `/security`, `/acceptable-use`, `/billing-policy` | `app/<route>/page.tsx` | public | server, forced dynamic |
| `/billing/callback` | `app/billing/callback/page.tsx` → `page-client.tsx` | authenticated (redirects to `/login?callbackUrl=`) | client, forced dynamic |
| `/app` | `app/(app)/app/page.tsx` | authenticated + email-verified | server shell, forced dynamic |
| `/app/<view>` and `/app/<view>/<projectId>` | `app/(app)/app/[...segments]/page.tsx` | authenticated + email-verified; admin views gated | server shell, forced dynamic |
| `/robots.txt`, `/sitemap.xml` | `app/robots.ts`, `app/sitemap.ts` | public | server |

### 2.2 How the `/app` dashboard actually works

The routing layer is better engineered than the "client-only Zustand switcher" description suggests. There are three cooperating pieces:

1. **`src/lib/dashboard-routes.ts`** — a pure, server-safe module that is the single source of truth. It defines `DashboardView`, the canonical path for each view, the admin-only set, the project-scoped set, and bidirectional `getPathForView` / `segmentsForView` / `resolveAppRoute` with project-ID encode/decode and `CanonicalFallback` correction types.
2. **`src/lib/app-route-resolver.ts`** (server) — `resolveAppRouteForRequest` runs before render: redirects unauthenticated users to `/login`, unverified users to `/verify-email`, verifies the project exists inside the caller's tenant, and downgrades forbidden admin views to a safe view with a `routeNotice`.
3. **`src/hooks/use-view-router.ts`** (client) — hydrates the store from the resolved route and reconciles the URL afterwards.

Critically, `UI_PERSIST_OPTIONS` in `store.ts` excludes `view` and `activeProjectId` from persistence, which is the right call: the URL, not localStorage, is meant to be canonical.

**Deep linking works** for any URL produced by the sidebar, because `resolveAppRoute` maps segments → view + project on the server before the client mounts.

**Where URL and store desync.** `useViewRouter` exposes `navigateToView`, and `view-navigation.tsx` wraps it in a `useNavigateToView` context hook. `useNavigateToView` has **zero consumers**. Instead, roughly 50 in-content buttons across `views.tsx`, `topbar.tsx`, `agent-workflow.tsx`, `file-ingestion.tsx`, `tender-flow-board.tsx`, `projects-list.tsx`, `proposals-list.tsx`, `compliance-monitor.tsx` and `account-onboarding.tsx` call `setView(...)` straight off `useUI()`. `setView` mutates store state and never touches the URL. Consequences:

- For non-project-scoped views (`account`, `settings`, `business-profile`, `knowledge-approval`), the URL stays at `/app` while a different panel renders. Reload returns the user to the overview; Back exits the dashboard entirely; a copied URL points at the wrong view.
- For project-scoped views the reconciliation effect does correct the URL, but with `router.replace`, so the prior history entry is destroyed and Back still misbehaves.
- `setView` also does not set `activeProjectId`, so a project-scoped view can be entered with no project selected.

The sidebar is the one navigation surface that behaves correctly — it goes through `resolveDashboardNavigation` and pushes a real URL.

### 2.3 Static vs dynamic rendering

`src/app/layout.tsx:42` declares `export const dynamic = "force-dynamic"`. Because this is the **root** layout, it forces dynamic rendering on every route in the application — including the homepage and all fourteen static marketing/legal pages, none of which read cookies, headers or session. `/app/page.tsx` and `/app/[...segments]/page.tsx` redundantly declare it again (correct there, since they do read session). No page in the tree opts into `revalidate` or static generation, so nothing is prerendered or ISR-cached.

---

## 3. Cross-cutting observations

### Data fetching

TanStack Query is the dominant pattern and is used well in most panels: `useQuery` + `useMutation` + `invalidateQueries`, with `QueryProvider` correctly instantiating the client inside `useState`. Raw `fetch` in `useEffect` is confined to genuinely imperative surfaces (`document-preview-frame`, `document-file-viewer`, `collaboration-presence`, `mission-extension-bridge`, `agent-workflow`'s poll loop) — all of which do at least use a `cancelled` flag.

Two systemic problems:

- **No `AbortController` anywhere in client code.** Grepping `AbortController|signal:` across `src/` returns hits only in `src/lib/**` server modules. Every component fetch — including the 900 ms agent-status poll and the 3 s presence poll — is unabortable, so cleanup only suppresses the `setState`, it does not cancel the request.
- **Polling pile-up.** With the overview open, the app runs concurrent intervals at 900 ms (agent status), 3 s (presence), 4 s (compliance), 6 s (projects), 8 s (stats), 10 s (charts, when mounted), 15 s (reviews, admin overview), 30–60 s (notifications). None of them pause on tab blur (`refetchOnWindowFocus:false` disables focus refetch but not the interval), and none stop when the underlying work is finished.

Waterfalls: `file-ingestion.tsx` uploads multi-file selections one at a time in an awaited loop instead of `Promise.all`.

### Error, loading and empty states

Most panels use the `QueryState`/`ErrorState`/`EmptyState` trio properly. The exceptions cluster in three places and all share the same failure mode — **an API error is rendered as "no data"**:

- `account-onboarding.tsx` `SectorsPanel`, `ApprovalPanel`, `RestrictionsPanel` (D-07, D-08)
- `admin/audit.tsx` (D-21)
- `admin/myfatoorah.tsx` (D-25)
- `stat-cards.tsx` renders zeros rather than an error.

**Fake data rendered as real.** Two confirmed instances:

- `mission-pipeline-bar.tsx` runs a timer-driven fake pipeline (spinners, green checkmarks, a live `n/5 · NN%` counter) whenever there are no real tool events (D-14).
- `admin/overview.tsx` renders an unconditional "Security Hardening Active" / "PDPL Compliant" banner with no backing data (D-18).

Marketing demo values in `landing-page.tsx` are explicitly labelled "sample"/"عينة" and are not a problem.

### Accessibility

- `<Label>` is stock Radix and does not associate itself with a sibling `<Input>`. Only 9 files use `htmlFor`; `settings-panel.tsx` (8 labels), `account-onboarding.tsx`, `admin/myfatoorah.tsx` (3) rely on bare `<Label>`, leaving password, email and MFA fields unlabeled for screen readers (D-10).
- Many inputs use `placeholder` as their only label (`account-onboarding.tsx` staff/sector/restriction forms, `reviews-queue.tsx` textareas).
- Custom widgets built from `div`/`TableRow` with `onClick` and no `role`/`tabIndex`/`onKeyDown`: the upload drop zone (D-12) and the audit log expander (D-22).
- The topbar search dropdown lacks combobox/listbox semantics and arrow-key navigation.
- Positives: Radix primitives handle focus trapping in dialogs; `copilot-processing-view.tsx` provides an `sr-only` status summary; `admin/billing-reconciliation.tsx` puts `aria-label` on every checkbox; `account-onboarding.tsx` labels its reorder icon buttons.

### i18n / RTL

The app uses a `tr(key, locale)` dictionary in `src/lib/i18n.ts` plus a very large amount of inline `locale === "ar" ? "…" : "…"`. The inline style works but leaves gaps wherever a developer forgot one — see D-16 and D-19.

- **RTL is actively guarded for the dashboard and admin.** `src/lib/__tests__/platform-completion/logical-css-integrity.test.ts` fails the build if any file under `src/components/dashboard` or `src/components/admin` contains a physical-direction Tailwind class. Both trees are clean.
- **The guard does not cover `src/components/marketing`, `src/components/documents`, or `src/app`,** and those are exactly where the RTL bugs are (D-26).
- `apiJson` in `src/lib/api-client.ts` resolves the client locale by comparing `localStorage["arabclue-locale"]` to the literal `"en"`, but that key holds a JSON persist blob, so the comparison is always false and every API error message comes back Arabic (D-27).
- Date formatting is inconsistent: `admin/audit.tsx` and `admin/billing-reconciliation.tsx` pass `ar-SA`/`en-US` correctly, while `account-onboarding.tsx:537` and `admin/myfatoorah.tsx:433` call bare `toLocaleDateString()`/`toLocaleString()`.
- English-only relative-time helpers (`timeAgo`) in `document-matrix.tsx` and `proposals-list.tsx`; `admin/audit.tsx` has a correctly localized `relativeTime` that should be shared.

### Performance

- `force-dynamic` on the root layout (D-06) is the single biggest win available: it removes static/ISR rendering from ~15 content pages.
- `views.tsx` statically imports 12 dashboard panels (~4.2k LOC of `StatCards`, `FileIngestion`, `ComplianceMonitor`, `AgentWorkflow`, `DocumentMatrix`, `VersionHistory`, `RequirementsMatrix`, `ReviewsQueue`, `ProposalsList`, `ContractsPanel`, `ProjectsList`, `TenderFlowBoard`) into the first dashboard chunk, even though the overview needs only a few. The other 18 panels are correctly `next/dynamic`.
- Heavy libraries are handled well overall: the MDX editor is `dynamic(..., {ssr:false})`, and recharts only enters the graph through `analytics-charts.tsx` (behind the dynamic `AnalyticsView`) and the dead `charts-panel.tsx`.
- `charts-panel.tsx` is 205 LOC of unreferenced code including a full recharts import (D-17).
- `framer-motion` is imported eagerly in 25+ modules including `views.tsx` and every marketing page.
- Minor O(n²) work inside render loops in `admin/overview.tsx:96` and `:136` (a `reduce`/`Math.max` recomputed per row).
- Long lists (audit at 200 rows, document matrix, clause browser) are unvirtualized but bounded by `max-h` + scroll.

### Forms

Despite `react-hook-form` + Zod being in the dependency list, the audited forms are hand-rolled `useState` + `onClick`. Consequences:

- Validation is ad-hoc and duplicated in the client (`newPassword.length < 10`, `!certName`) with no shared schema, so client and server rules can drift.
- Most submit buttons do gate on `isPending`/`busy`, which gives adequate double-submit protection — except the four unguarded handlers in `account-onboarding.tsx` (D-07).
- No form uses a `<form>` element in `settings-panel.tsx`, so Enter never submits and browsers cannot offer native validation.
- No unsaved-changes warnings anywhere. `proposal-editor.tsx` tracks `isDirty` and `document-preview-frame.tsx` surfaces a "Save now" banner, but nothing blocks navigation or unload.
- Positive: `proposal-editor.tsx` implements real optimistic-concurrency control, sending `expectedVersion` + `expectedUpdatedAt` and refusing to save without them.

### Client-side security

- Five `dangerouslySetInnerHTML` sites. Four are safe: `markdown-studio-editor-inner.tsx:179` (`letterheadBarHtml`, escapes via `escapeAttr`), `:194` (`markdownToHtml`, escapes via `escapeHtml`), `arabclue-logo.tsx:511,545` (static animation CSS), `ui/chart.tsx:83` (stock shadcn, developer-supplied config). One is not: `proposal-builder-preview.tsx:254` hand-rolls a duplicate markdown renderer that skips escaping entirely (D-05).
- `NEXT_PUBLIC_` usage is clean — only `NEXT_PUBLIC_APP_URL`, referenced in six server-side modules. No secrets or tokens in client code; `admin/myfatoorah.tsx` correctly treats API keys as write-only and displays only server-masked values.
- `admin/billing-reconciliation.tsx` fabricates a `providerState: "PAID"` claim client-side and the API accepts it without re-verification (D-23).
- `document-preview-frame.tsx` applies a sandbox to the generated-HTML iframe and documents why the PDF iframe cannot be sandboxed — good practice.

### React 19 / Next 16 correctness

- `document-matrix.tsx:343` reads `localStorage` inside a `useState` initializer, which produces different server and client first renders (D-11).
- Uncleaned timers: `mission-pipeline-bar.tsx:125`, `mission-extension-bridge.tsx:319`, `topbar.tsx:161`, `register/page.tsx` redirect.
- `agent-workflow.tsx` omits `applyStatusPayload` from its effect deps; `settings-panel.tsx:48` omits `locale`/`setLocale`. Neither is a live bug today but both are lint violations that mask future ones.
- `key={i}` on genuinely mutable lists: `proposal-editor.tsx:955` (editable BoQ rows), `agent-workflow.tsx:1103` (findings). The remaining `key={i}` hits are on static or skeleton lists and are fine.
- `use client` boundaries are clean — no server-only module is pulled into a client component. `dashboard-routes.ts` is deliberately kept pure so both sides can import it.
- `app-shell.tsx:27` uses `as any` to read `session.user.emailVerified`, defeating the session type.

---

## 4. Gaps and defects

### Critical

**D-01 — Critical | correctness/ux — `src/components/dashboard/view-navigation.tsx:1-31`, `src/components/dashboard/views.tsx` (~50 call sites)**

```tsx
// view-navigation.tsx — exported, never imported anywhere
export function useNavigateToView() { ... }
// meanwhile, everywhere else:
onClick={() => startTransition(() => setView("account"))}
```

`useNavigateToView` has zero consumers. ~50 in-content buttons call `setView` from `useUI()`, which updates store state without touching the URL. For non-project-scoped views the URL stays at `/app` while a different panel renders: reload loses the user's place, Back exits the dashboard, and shared links point at the wrong view. For project-scoped views the reconciliation effect corrects the URL with `router.replace`, destroying the previous history entry, so Back still misbehaves. `setView` also does not set `activeProjectId`.
**Fix:** delete `setView` from the public store surface (or rename it `setViewInternal` and use it only from `useViewRouter`), then replace every call site with `useNavigateToView()`, which should `router.push(getPathForView(view, projectId))` and let the reconciliation effect update the store.

**D-02 — Critical | correctness — `src/hooks/use-ensure-active-project.ts:1-46`**

```ts
const projects = data?.projects ?? [];
useEffect(() => { /* clears activeProjectId when projects.length === 0 */ },
  [projects, activeProjectId, setActiveProjectId]);
```

While the `/api/projects` query is loading, `data` is `undefined`, so `projects` is `[]` and the effect clears `activeProjectId` to `null`. When the data lands it sets the project to `projects[0]`. The user's selected project is therefore overwritten with the first project on **every** page load, and a deep link to `/app/compliance/<projectId>` can end up scoped to a different project.
**Fix:** gate the effect on `isSuccess` (or return early while `isLoading`), and only fall back to `projects[0]` when the persisted id is genuinely absent from a loaded list.

**D-05 — Critical | security — `src/components/dashboard/proposal-builder-preview.tsx:254`**

```tsx
dangerouslySetInnerHTML={{ __html: `<p class="mb-3">${html}</p>` }}
```

`MarkdownPreview` hand-rolls a markdown→HTML conversion that never escapes HTML entities, then injects the result. Proposal content originates from AI generation, imported RFPs, collaborators and cross-tenant marketplace templates, so this is a stored-XSS sink. `<script>` will not execute via `innerHTML`, but `<img src=x onerror=...>`, `<svg onload=...>` and `javascript:` hrefs all will. The canonical `markdownToHtml` in `src/lib/markdown.ts` already escapes correctly — this is an unescaped duplicate of it.
**Fix:** delete the local renderer and call `markdownToHtml` from `@/lib/markdown`.

**D-23 — Critical | security/correctness — `src/components/admin/billing-reconciliation.tsx:206-232`**

```ts
const items = checkoutIds.map((id) => ({
  checkoutId: id,
  providerResult: { providerState: "PAID" as const, ... },
}));
```

Bulk apply hardcodes `providerState: "PAID"` for every selected checkout, and `src/app/api/admin/billing/reconcile/route.ts:303-307` passes `body.items` straight into `applyReconciliationBulk` with no provider re-verification and no schema validation. "Select all → Apply selected" therefore marks checkouts as PAID even when the adjacent column shows `FAILED`, `EXPIRED`, `CANCELLED` or `UNKNOWN`. The single-apply path at route line 326 has the same trust gap.
**Fix:** stop sending `providerResult` from the client; send only `checkoutId[]` and have the server query MyFatoorah for each. If an explicit override must stay, validate it server-side with Zod, restrict it to a distinct `action=force` code path, and audit it at `WARN` severity.

### High

**D-03 — High | correctness — `src/components/dashboard/topbar.tsx:88-96`**

```ts
if (!res.ok) { await res.json().catch(() => ({})); throw ... }
return res.json();   // body already consumed
```

The response body is read once in the error branch and again on the success path. A `Response` body is a single-use stream, so the second `res.json()` always rejects and the notifications query is permanently in an error state — the inbox never shows anything. Verified unique to this file; every other `res.json().catch()` in the codebase reads the body only inside the error branch.
**Fix:** `const data = await res.json().catch(() => null); if (!res.ok) throw new Error(...); return data;`

**D-14 — High | ux/correctness — `src/components/dashboard/mission-pipeline-bar.tsx:100-141`**

```ts
const activeStep = tools && tools.length ? realActive : simStep;
const completedSteps = tools && tools.length ? realDone : simDone;
```

When no real tool events exist but `performing` is true, a `setInterval` advances a fake step every 1600 ms and then loops back to zero after 900 ms. The UI renders named stages (Analyzing / Planning / Research / Drafting / Review) with spinners, green checkmarks, a progress bar and a literal `"{n}/5 · NN%"` readout (line 223) — with no visual distinction from real progress. Users see fabricated agent progress that never resolves.
**Fix:** delete `simStep`/`simDone`. When `tools` is empty, render an honest indeterminate "Working…" state.

**D-18 — High | ux/correctness — `src/components/admin/overview.tsx:157-178`**

```tsx
{locale === "ar" ? "الأمان مفعّل" : "Security Hardening Active"}
… "RBAC + MFA + Immutable Audit Trail + AES-256 env encryption"
<Badge …>{locale === "ar" ? "متوافق PDPL" : "PDPL Compliant"}</Badge>
```

This banner is unconditional static markup — no field of `AdminOverviewResponse` is consulted. It asserts MFA enforcement, immutable audit and AES-256 encryption regardless of actual configuration, and stamps a regulatory compliance claim on a screen administrators use to assess posture. `admin/audit.tsx:216-219,345-348` makes the same class of unconditional "Tamper-evident … PDPL / NCA compliant" claim.
**Fix:** derive each item from real state (MFA enrolment rate, whether env encryption keys are configured, audit-table constraints) and render per-item pass/fail. Remove the blanket "PDPL Compliant" badge or replace it with a link to a real attestation.

**D-07 — High | correctness/ux — `src/components/dashboard/account-onboarding.tsx:993-1002, 1027-1037, 1243-1251, 1267-1275`**

```tsx
onClick={async () => {
  await fetch("/api/sectors", { method: "POST", ... });
  qc.invalidateQueries({ queryKey: ["sectors"] });
}}
```

Four mutation handlers use a bare `async` `onClick` with no try/catch, no error toast, no `isPending` guard and no `disabled` state. A failed POST (validation, quota, network) produces no feedback at all — in the bid-history case the input is even cleared, so the write looks like it succeeded. The missing pending guard also allows double-submit.
**Fix:** convert all four to `useMutation` with `onError` toasts, matching the `LegalPanel`/`StaffPanel` pattern already present in the same file, and disable the buttons while pending.

**D-08 — High | correctness/ux — `src/components/dashboard/account-onboarding.tsx:969-976, 1058-1061, 1223-1226`**

```ts
queryFn: async () => (await fetch("/api/sectors")).json(),
```

Four queries (`sectors`, `bid-history`, `approval-policy`, `restrictions`) never check `res.ok`. A 500 returning `{"error":...}` resolves as success, `data?.items ?? []` yields an empty array, and the panel renders an empty list. These three panels also have no `isLoading`/`isError` branches at all, so a server failure is indistinguishable from "you have not added anything yet".
**Fix:** reuse the `fetchJson`/`assertOk` helpers already defined at lines 133-143 of the same file, and add `QueryState` loading/error branches.

### Medium

**D-04 — Medium | correctness — `src/app/billing/callback/page-client.tsx:75, 85`**

```tsx
<Link href="/app?view=billing">
```

`resolveAppRoute` matches on path segments only and ignores query strings, so this lands on the overview rather than billing. After a payment, users are dropped somewhere other than their subscription page.
**Fix:** use `/app/billing`. Audit the notification service, which emits the same `?view=` shape.

**D-06 — Medium | performance — `src/app/layout.tsx:42`**

```ts
export const dynamic = "force-dynamic";
```

Declared on the **root** layout, so it forces dynamic rendering for the homepage and all fourteen marketing/legal routes, none of which read cookies, headers or session. Nothing in the app is prerendered or ISR-cached.
**Fix:** remove it from the root layout. Keep the existing declarations in `(app)/app/page.tsx` and `(app)/app/[...segments]/page.tsx`, and add `export const dynamic = "force-dynamic"` to `(app)/app/layout.tsx` and the auth pages that need it. Give marketing pages a `revalidate`.

**D-09 — Medium | correctness — `src/components/dashboard/account-onboarding.tsx:799` vs `:873`**

```tsx
value={form[f.key] ?? f.options[0]}          // displays "IMPLEMENTATION"
…
for (const f of fields) body[f.key] = form[f.key] ?? "";  // submits ""
```

`SimpleCrudPanel` selects show `options[0]` as the visible value but submit an empty string unless the user actively changes the dropdown. Creating a methodology, library item or partnership without touching the category select sends `category: ""`. Affects `/api/methodologies`, `/api/library`, `/api/partnerships`.
**Fix:** seed `form` from the field defaults on mount, or resolve with `form[f.key] ?? f.options?.[0] ?? ""` at submit time.

**D-10 — Medium | a11y — `src/components/dashboard/settings-panel.tsx:329, 339, 350, 365, 404, 415, 427, 468`**

```tsx
<Label>{locale === "ar" ? "كلمة المرور الجديدة" : "New password"}</Label>
<Input type="password" value={newPassword} … />
```

`ui/label.tsx` is stock Radix `LabelPrimitive.Root`, which does not associate with a sibling input, and `ui/input.tsx` generates no `id`. All eight labels here — including email, current password, new password, confirm password and the MFA code — leave their inputs with no accessible name. Same pattern in `admin/myfatoorah.tsx:295, 316, 338` and `account-onboarding.tsx:466, 470`.
**Fix:** add `htmlFor`/`id` pairs (the codebase already does this correctly in `tender-setup-wizard.tsx`, `workspace-template-editor.tsx`, `marketplace-publish-dialog.tsx`), or wrap the input inside the `Label`.

**D-11 — Medium | correctness — `src/components/dashboard/document-matrix.tsx:343`**

```ts
const [filter, setFilter] = useState(() => {
  try { const s = localStorage.getItem(key); … } catch {}
  return initial;
});
```

Client components are still server-rendered in the App Router. On the server `localStorage` throws, the `catch` returns `"ALL"`, and the client initializer then reads the persisted value — so the filter chips and badge render differently on the two passes, producing a React 19 hydration mismatch and a visible re-render whenever a non-default filter is saved.
**Fix:** initialize to the default and load the persisted value in a `useEffect`.

**D-12 — Medium | a11y — `src/components/dashboard/file-ingestion.tsx` (drop zone)**

```tsx
<div onClick={...} onDrop={...} className="...cursor-pointer">
```

The upload target is a `div` with `onClick` and no `role`, `tabIndex` or `onKeyDown`. The nested "Browse" button has no handler of its own and relies on bubbling. Keyboard and screen-reader users cannot start an upload — the primary way RFP data enters the product.
**Fix:** make the visible trigger a real `<button>` that calls `inputRef.current.click()`, keep the `div` as a mouse-only drop target with `aria-hidden` decoration, and give the file input an associated label.

**D-13 — Medium | correctness/performance — `src/components/dashboard/collaboration-presence.tsx:133-160`**

```ts
}, [proposalId, workspaceId, sendPresence, pollSnapshot, currentSectionKey]);
```

`currentSectionKey` is in the deps of the join/heartbeat effect, so every section change tears the effect down (firing a `leave` POST, clearing both intervals) and re-runs it (firing `join` + a snapshot poll + new intervals). A separate effect at lines 126-131 already handles section changes, so the work is duplicated. Worse, cleanup sets `mountedRef.current = false` and *then* fires an async `leave`; by the time it resolves the ref is `true` again, so the leave response can overwrite the fresh join snapshot.
**Fix:** drop `currentSectionKey` from the dep array (the ref already tracks it) and do not call `applyViewers` on the `leave` response.

**D-16 — Medium | i18n — `src/components/dashboard/requirements-matrix.tsx:164, 258-260`**

```tsx
subtitle={`${summary.COVERED} covered · ${summary.IN_PROGRESS} in progress · ${summary.MISSING} missing`}
…
<SelectItem value="COVERED">COVERED</SelectItem>
```

The summary line is hardcoded English in an Arabic-default product, and the status dropdown exposes raw enum identifiers to end users in both locales.
**Fix:** route both through `tr()` with `status_*` keys.

**D-19 — Medium | i18n — `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/(app)/app/error.tsx`, `src/app/billing/callback/page-client.tsx`**

Every error boundary and the entire billing callback page are hardcoded English ("Workspace error", "Retry", "Something went wrong"). Arabic is the default locale, so an Arabic user hitting any error — or completing a payment — sees an English-only screen.
**Fix:** read the locale cookie (error boundaries are client components but the cookie is readable) and route strings through `tr()`.

**D-21 — Medium | correctness/ux — `src/components/admin/audit.tsx:156-170, 415-419`**

```ts
const { data, isLoading } = useQuery<AuditResponse>({ … });
const logs = data?.logs ?? [];
…
) : filtered.length === 0 ? ( … {tr("no_data", locale)} … )
```

`isError` is never destructured or rendered. A failed audit fetch falls through to the empty state, so an administrator reviewing a compliance trail sees "no data" — indistinguishable from a genuinely empty log — while the header still advertises "Tamper-evident … PDPL / NCA compliant".
**Fix:** destructure `isError`/`refetch` and render `ErrorState` with a retry.

**D-24 — Medium | i18n/correctness — `src/components/admin/billing-reconciliation.tsx:630-634`**

```tsx
{tr("reconcile_next_page", locale) === "Next Page"
  ? (locale === "ar" ? "السابق" : "Previous")
  : tr("reconcile_next_page", locale)}
```

The Previous button decides its label by string-comparing a translation against the literal English `"Next Page"`. `src/lib/i18n.ts:953-955` defines the Arabic value as `"الصفحة التالية"`, so in Arabic the comparison fails and the **Previous** button renders `"الصفحة التالية"` — "Next Page". Both pagination buttons read "Next Page" in Arabic.
**Fix:** add a `reconcile_prev_page` key and use it directly.

**D-25 — Medium | correctness/ux — `src/components/admin/myfatoorah.tsx:70-82, 203-211`**

The config query throws on failure but `isError` is never handled. On error `isLoading` goes false, `data` stays `undefined`, every field renders `—`, and the header badge shows "Not configured". An administrator can conclude the payment provider is unconfigured when in fact the admin API errored.
**Fix:** destructure `isError` and render a distinct error state with retry.

**D-26 — Medium | i18n-rtl — `src/components/marketing/landing-page.tsx:403, 651, 672, 867, 1085`; `src/components/marketing/doc-page.tsx:177`; `src/components/marketing/tender-insights-chart.tsx:168`; `src/components/documents/document-components.tsx:451`; `src/components/marketing/public-shell.tsx:145`**

```tsx
<button … className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">   // landing-page:1085, doc-page:177
<div className="text-right">                                                                 // tender-insights-chart:168
"info-box p-4 rounded-lg border-l-4"                                                         // document-components:451
<span className="ml-2 …">                                                                    // landing-page:403
```

`src/lib/__tests__/platform-completion/logical-css-integrity.test.ts` enforces logical properties across `src/components/dashboard` and `src/components/admin` — and both are clean. The guard does not cover `marketing/`, `documents/` or `src/app`, and that is exactly where physical properties survive. Arabic is the default locale, so FAQ accordions on the landing page and every legal/FAQ doc page left-align Arabic text, the insights chart right-aligns when it should end-align, and the document info-box accent bar sits on the wrong side of exported documents.
**Fix:** replace with `text-start`/`text-end`, `ms-`/`me-`, `ps-`/`pe-`, `border-s-4`, and extend the existing integrity test's `roots` array to cover `src/components/marketing`, `src/components/documents` and `src/app`.

**D-27 — Medium | i18n — `src/lib/api-client.ts` (`resolveClientLocale`)**

```ts
const stored = localStorage.getItem("arabclue-locale");
return stored === "en" ? "en" : "ar";
```

That key holds the Zustand persist blob (`{"state":{"locale":"en",…},"version":0}`), never the bare string `"en"`, so the comparison is always false and `apiJson` labels every API error in Arabic regardless of the user's language. `readPersistedLocale` in `src/lib/store.ts` parses the same key correctly.
**Fix:** reuse `readPersistedLocale` instead of the string comparison.

### Low

**D-15 — Low | correctness — `src/components/dashboard/mission-pipeline-bar.tsx:125`**

```ts
setTimeout(() => { setSimDone(new Set()); setSimStep(0); step = 0; }, 900);
```

The handle is never captured and the cleanup at line 135 only clears the interval, so this fires after unmount. Same pattern at `mission-extension-bridge.tsx:319` (`window.setTimeout(() => setChecking(false), 800)`) and `topbar.tsx:161` (`onBlur={() => setTimeout(() => setSearchOpen(false), 150)}`).
**Fix:** capture each handle and clear it in cleanup.

**D-17 — Low | maintainability — `src/components/dashboard/charts-panel.tsx:30`**

`ChartsPanel` has no importers anywhere in the repo (verified by grep for both `ChartsPanel` and the file path). 205 lines of dead code carrying an eager `recharts` import and a 10-second `/api/stats` poll that would fire if it were ever mounted.
**Fix:** delete it, or wire it into the analytics view if it was meant to ship.

**D-20 — Low | ux — `src/app/not-found.tsx`**

Hardcoded light-mode background and text colours, so the 404 page renders as a bright panel for dark-theme users. Also English-only (covered by D-19).
**Fix:** use the `bg-background`/`text-foreground` tokens.

**D-22 — Low | a11y — `src/components/admin/audit.tsx:492-498`**

```tsx
<TableRow className="… cursor-pointer" onClick={onToggle}>
```

Audit rows expand on click with no `role="button"`, `tabIndex` or key handler, so log details are unreachable by keyboard.
**Fix:** move the disclosure onto the existing chevron cell as a real `<button>` with `aria-expanded` and `aria-controls`.

**D-28 — Low | correctness — `src/components/dashboard/proposal-editor.tsx:955`, `src/components/dashboard/agent-workflow.tsx:1103`**

```tsx
<tr key={i} className="border-b border-border/40">
```

Array index keys on mutable lists — editable BoQ rows and the agent findings list. Deleting or reordering a row makes React reuse the wrong DOM node, which can strand edited input values on the wrong row.
**Fix:** key on a stable id, generating one client-side for new rows.

**D-29 — Low | correctness — `src/components/dashboard/document-matrix.tsx:311`**

```tsx
onClick={() => deleteMutation.mutate(d.id)}
```

Document deletion fires immediately with no confirmation, while project deletion in `projects-list.tsx` correctly uses `ConfirmDialog`.
**Fix:** route it through the existing `ConfirmDialog`.

**D-30 — Low | i18n — `src/components/dashboard/document-matrix.tsx` and `proposals-list.tsx` (`timeAgo`)**

`timeAgo` returns hardcoded English (`"just now"`, `"5m ago"`, `"3d ago"`) in both locales. `admin/audit.tsx:101-113` already implements a properly localized `relativeTime`.
**Fix:** extract `relativeTime` to `src/lib` and use it everywhere.

**D-31 — Low | performance — `src/components/dashboard/file-ingestion.tsx` (upload loop)**

Multi-file uploads are awaited one at a time, so five files take five round trips serially. No client-side size or type validation runs before upload either, so oversized files are only rejected after a full transfer.
**Fix:** bound-parallel the uploads and validate size/MIME before sending.

**D-32 — Low | performance — `src/components/dashboard/views.tsx:18-29`**

Twelve panels (~4.2k LOC) are statically imported into the dashboard's first chunk while the other eighteen use `next/dynamic`. Only a few are needed for the initial overview.
**Fix:** move the non-overview panels (`VersionHistory`, `RequirementsMatrix`, `ReviewsQueue`, `ContractsPanel`, `DocumentMatrix`) to `next/dynamic` like their peers.

**D-33 — Low | maintainability — `src/components/dashboard/app-shell.tsx:27`**

```ts
if (session?.user && !(session.user as any).emailVerified)
```

An `as any` cast defeats the session type; the same check already runs server-side in `app-route-resolver.ts`.
**Fix:** extend the next-auth `Session` type declaration and drop the cast (or drop the client-side check entirely).

---

## 5. Needs verification

1. **`navigator.sendBeacon` content type** — `collaboration-presence.tsx:169` posts a JSON string via `sendBeacon`, which sends `text/plain;charset=UTF-8`. If `/api/collaboration/presence` requires `application/json`, the unload "leave" silently fails and stale viewers linger until the 60 s prune. Needs a check of the route's body parsing.
2. **`admin/security.tsx`, `admin/billing.tsx`, `admin/env-settings.tsx`, `admin/ai-providers.tsx`** (4.2k LOC combined) were only grep-scanned. They use `<Label>` and physical-class patterns similar to audited files, so D-10-class issues are likely but unconfirmed.
3. **Mission surfaces** (`mission-realtime-workflow`, `mission-tool-theater`, `mission-attachment-tray`, `platform-agent-console`, `live-voice-session`) were not read line-by-line. Given the confirmed simulation in `mission-pipeline-bar.tsx`, the rest of the mission family should be checked for the same pattern.
4. **`agent-workflow.tsx` poll race** — cleanup clears the timeout but cannot cancel an in-flight `fetch`, so a stale `/api/agents/status` response can still call `applyStatusPayload` after `runId` changes. Reproducing requires a slow network; the code path is real but the practical impact is unmeasured.
5. **`toLocaleDateString()` without a locale argument** at `account-onboarding.tsx:537` and `myfatoorah.tsx:433` — falls back to browser locale rather than app locale. Visible only when the two differ.
6. **Zod parity** — `react-hook-form` and Zod are dependencies but no audited form uses them. Whether server routes validate the fields the client under-validates (e.g. the empty `category` from D-09) was not traced end to end.
