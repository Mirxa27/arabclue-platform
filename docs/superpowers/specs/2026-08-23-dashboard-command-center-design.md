# Dashboard command-center design

Date: 2026-08-23  
Branch: `cursor/dashboard-command-center-ab64`  
Approved approach: command-center overview + grouped nav + honest chrome

## Problem

`/app` (overview) stacks onboarding, a four-step tender flow, four KPI cards, and always-on upload + agent panels. A workspace with no project still sees the full widget dump. A team in a live bid does not get one obvious next action. The sidebar lists ~20 peer items and claims PDPL / Vision 2030 / NCA in pulsing chrome that nothing measures. Several overview CTAs call `setView` instead of the URL router, so refresh and Back drop the user on overview.

They hired ArabClue to get **this** tender across the line (set up → upload RFP → run agents → review → export), not to “use a dashboard.”

## Goal

Make the bidder dashboard answer “what is the next move on the live bid?” Home is a command center. Navigation is grouped. Chrome does not invent compliance. Existing visual tokens, RTL, and the `/app` Zustand + URL router stay.

## Non-goals

- Etimad submission API, SSO/OIDC, live MyFatoorah without merchant credentials
- Restyling every dashboard panel or inventing new KPI numbers
- Changing marketing, login, or register pages
- Prisma migrations or billing/money work

## Visual direction

Keep the current industrial bid-ops system (`--surface-*`, hairline borders, RTL). Quiet chrome. Pulse only when an agent or mission is actually running. No marketing theater on product chrome.

## Information architecture

Sidebar groups, in this order, with bilingual section labels:

**Workflow:** overview, copilot, projects, documents, proposals, contracts, compliance, agents, reviews

**Library:** clause-library, template-editor, marketplace, knowledge-approval

**Account:** account, business-profile, history, billing, settings, proposal-builder, analytics

Admin nav stays a separate existing block for ADMIN / SUPER_ADMIN only.

## Overview states

### Loading

Do not treat an in-flight `["projects"]` query as “zero projects.” Wait for success before hiding work panels.

### Zero projects

Show: page header, onboarding banner (if applicable), `TenderFlowBoard` (setup CTA only).

Do **not** mount `StatCards`, `FileIngestion`, or `AgentWorkflow`.

### One or more projects

Show: header, onboarding banner, `TenderFlowBoard` (active title + next step + existing Etimad deadline strip when a project is selected), `StatCards` (each card navigates to the matching view), then `FileIngestion` + `AgentWorkflow`.

## Next-step rule

A pure function decides the next undone step. No rounding, no invented scores.

| Condition | Step id | Navigation |
| --- | --- | --- |
| `projectCount === 0` | `create` | Open the existing tender setup wizard (no view change) |
| `documentCount === 0` | `upload` | `documents` |
| `agentRunCount === 0` | `agents` | `agents` |
| otherwise | `export` | `proposals` |

`TenderFlowBoard` already encodes this sequence; the function is the single source of truth so overview and tests cannot drift.

## Navigation

Every overview and flow-board view change goes through `useNavigateToView()` from `src/components/dashboard/view-navigation.tsx`, which is the URL-truthful path (`navigateToView` in `use-view-router.ts`). `setView` is not used for those CTAs. Creating a tender still opens `TenderSetupWizard`.

## Honest chrome

Remove from **dashboard shell only** (sidebar, topbar, footer):

- Pulsing PDPL / “PDPL Compliant” badges
- Vision 2030 / C1 / NCA essentials card
- Footer “PDPL compliant” note and hardcoded `v1.0.0`

Keep brand name, copyright, and “Saudi Platform” / “Hosted in Riyadh” as location/brand, not a legal conclusion. Compliance monitoring stays on the compliance view, where controls are evaluated.

## Copy

All new strings go in `localizationRegistry` with non-empty `ar` and `en`.

- Projects empty: dedicated first-tender title and description (not `no_data`)
- Sidebar group labels and expand/collapse titles
- `ErrorState` default retry label follows locale
- `ConfirmDialog` default Confirm/Cancel follow locale via `useLocale`

## Testing

- Source guards in `no-fabricated-assurance.test.ts` for sidebar, topbar, and footer
- Unit tests for the next-step function (zero / docs / agents / export)
- Source guard that `tender-flow-board.tsx` does not call `setView`
- i18n completeness covers new keys automatically

## Error handling

Workspace switcher fetch throws on `!res.ok` and shows a compact bilingual retry. Overview does not invent stats when `/api/stats` fails (`StatCards` already has retry).
