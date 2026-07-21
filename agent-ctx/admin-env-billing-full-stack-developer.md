# Task: admin-env-billing

- **Agent:** full-stack-developer
- **Task ID:** admin-env-billing
- **Scope:** Build two production-ready admin panel React components for the Arabclue SaaS platform (`AdminEnvSettings` + `AdminBilling`) on top of the existing Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui stack.

## Context Review
Read before starting:
- `/home/z/my-project/worklog.md` — project overview (Etimad AI-Bidder / Arabclue, blue & slate corporate palette, RTL Arabic default, modular admin panel already scaffolded).
- `/home/z/my-project/src/components/admin/ai-providers.tsx` — reference admin component for visual style (header `bg-muted/30`, `border-border/60`, scrollable body `max-h-[32rem] overflow-y-auto scrollbar-thin`, dense `text-[10px]/[11px]` layout, `font-mono` numbers, Dialog-based edit forms, react-query mutations, useToast feedback).
- `/home/z/my-project/src/lib/i18n.ts` — `tr(key, locale)` bilingual dictionary + `useLocale()` Zustand store; verified all required i18n keys exist (`admin_env`, `admin_encrypted`, `admin_rotate`, `admin_reveal`, `admin_masked`, `admin_billing`, `admin_plans`, `admin_usage`, `admin_revenue`, `admin_users`, `admin_quota`, `admin_unlimited`, `admin_per_month`, `admin_per_year`, `action_save`, `loading`, `no_data`).
- `/home/z/my-project/src/app/api/admin/env/route.ts` + `env/[key]/route.ts` — env GET (with `?reveal=1`), POST (upsert+encrypt), PATCH `[key]` `{ rotate: true }`. Found a bug: GET computed a sanitized `result` array (with `value`, `isMasked`) but returned the raw Prisma `settings` (leaking `valueEncrypted`, no `value`). Fixed below.
- `/home/z/my-project/src/app/api/admin/billing/route.ts` + `plans/route.ts` + `plans/[id]/route.ts` — billing GET returns `{ records, subscriptions, plans, stats }`; plans POST creates, plans/[id] PATCH updates (used for `isActive` toggle).
- `/home/z/my-project/prisma/schema.prisma` — `EnvSetting`, `SubscriptionPlan`, `Subscription`, `BillingRecord` models confirmed.
- `/home/z/my-project/src/lib/constants.ts` — `ENV_CATALOG` (15 known keys across 6 categories), `DEFAULT_PLANS` (STARTER / PRO / ENTERPRISE / PAY_AS_YOU_GO with `-1` = unlimited quotas).
- `/home/z/my-project/src/components/dashboard/app-shell.tsx` — confirms `<html dir>` is synced from `useLocale()`, so Tailwind `rtl:`/`ltr:` variants and logical properties (`ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`) work bidirectionally. Default is RTL Arabic.

## Files Created
1. `/home/z/my-project/src/components/admin/env-settings.tsx` — `AdminEnvSettings`
2. `/home/z/my-project/src/components/admin/billing.tsx` — `AdminBilling`

## Files Modified
1. `/home/z/my-project/src/app/api/admin/env/route.ts` — 1-line fix: GET now returns `{ settings: result, catalog }` instead of the raw DB rows, so the UI receives masked `value` + `isMasked` flags and the reveal flow works.

## Work Log
1. Read worklog + reference component + i18n + store + API routes + schema + constants to confirm data shapes and visual conventions.
2. Built `AdminEnvSettings`:
   - `useQuery(["admin-env"])` fetches `{ settings, catalog }`; lazy `useQuery(["admin-env","revealed"])` (enabled only when a reveal is toggled, `staleTime: 30s`) fetches `?reveal=1` and is memoised into a `revealedMap` for per-row unmasking.
   - Settings grouped into the 6 fixed categories (AI_PROVIDER, DATABASE, INTEGRATION, SECURITY, BILLING, GENERAL) using shadcn `Collapsible`; each category header shows localized label, count badge, and mono category badge; chevron rotates `-rotate-90` (LTR) / `rotate-90` (RTL) when collapsed.
   - Each row: lock/key icon, monospace key, masked-value badge for secrets, description, masked `value` with per-row Eye/EyeOff reveal toggle, Rotate-Key button (PATCH `[key]` `{rotate:true}`), Edit button, `lastRotatedAt` timestamp.
   - Edit dialog: pre-fills context, password input for secrets, "leave empty to keep" hint, isSecret checkbox; POSTs `{ key, value, category, description, isSecret }`.
   - Add dialog: catalog picker (15 presets with category/description/required badge) OR custom-key mode; native category `<select>`; auto-detects secret by key name (KEY/SECRET/PASSWORD/TOKEN) mirroring server logic; AES-256 confirmation note.
   - Header: KeyRound icon + title + AES-256 Encrypted badge + Add Variable button. Body: `max-h-[32rem] overflow-y-auto scrollbar-thin`. Search bar with logical-property padding (`ps-8`, icon `start-2.5`).
   - Loading + empty + no-results states, toast feedback on save/rotate success/failure, query invalidation of both list and revealed cache.
3. Built `AdminBilling`:
   - Top: 4 KPI cards (MRR, Total Revenue, Active Subscriptions, Total Proposals Used) with icon chip + monospace value + sub-label.
   - Middle: `admin_plans` Card with grid of plan cards (1/2/3 col responsive). Each plan: localized name, Active/Disabled badge, `Switch` toggle (PATCH `/api/admin/plans/[id]` `{isActive}`), monthly+yearly price in SAR, quotas grid (proposals, documents, tokens/mo, storage) with `admin_unlimited` for `-1`, features chips (parsed from `featuresJson`), active subscriber count computed from the subscriptions array.
   - Add Plan dialog: 10 fields (name, nameAr, description, priceMonthly, priceYearly, maxProposals, maxDocuments, maxWorkspaces, maxTokensPerMonth, maxStorageGb) → POST `/api/admin/plans`.
   - Bottom-left: recent billing records `Table` (type badge, amount SAR mono, user email, status badge, payment method localized, date) capped at 25 rows, `max-h-96 overflow-y-auto scrollbar-thin`.
   - Bottom-right: active subscriptions list with two usage `Progress` bars each (proposals + tokens). Color logic via `[&>[data-slot=progress-indicator]]:bg-{color}!` important-suffix arbitrary variant: emerald ≤70%, amber 70–90%, red >90%; unlimited quotas render full muted bar with `∞` label.
   - Currency formatted via `toLocaleString()` with `ar-SA`/`en-US` locale + SAR/ر.س suffix; dates via `toLocaleDateString`.
   - Loading + empty states everywhere, toast feedback, react-query invalidation.
4. Fixed env GET route bug (return `result` not raw `settings`).
5. Ran `bun run lint` → 0 errors. Verified dev server still healthy.

## Stage Summary
- ✅ Both components delivered as fully-functional `"use client"` React components, RTL-aware (logical properties + `rtl:` variants), bilingual via `tr()`/`useLocale()`, using the mandated shadcn/ui primitives (Card, Button, Input, Label, Badge, Dialog, Separator, Collapsible, Progress, Switch, Table) and the specified lucide-react icons.
- ✅ All required i18n keys exercised; loading/empty states handled; react-query mutations + toast feedback throughout.
- ✅ Visual style matches `ai-providers.tsx` (header `bg-muted/30`, `border-border/60`, scrollable bodies, `text-[10px]/[11px]` density, `font-mono` numerics, emerald/amber/red status badges).
- ✅ Env component: grouped collapsible categories, per-row reveal (lazy revealed query), edit dialog, rotate-key, AES-256 badge, lastRotatedAt.
- ✅ Billing component: 4 KPI cards, plan grid with toggle + create dialog, billing records table, active-subscriptions usage bars with green/amber/red thresholds and Unlimited handling.
- ✅ Necessary 1-line API fix applied so the env component actually receives masked values (otherwise `value`/`isMasked` would be undefined and reveal wouldn't work).
- ✅ `bun run lint` clean.
