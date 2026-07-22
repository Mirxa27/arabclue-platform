# Arabclue Design System

Style guide for dashboard panels, marketing pages, and shared UI patterns.
Follow this when adding or updating views so the product stays consistent and reusable.

## Architecture (Next.js App Router)

This is **not** a Laravel app. Map familiar MVC ideas as follows:

| Classic concept | Arabclue equivalent |
| --- | --- |
| PageController | `DashboardViews` + `VIEW_REGISTRY` in `src/components/dashboard/views.tsx` |
| Specialized controllers | Feature panels (`ProjectsList`, `ProposalsList`, admin modules) |
| Route handlers | `src/app/api/**/route.ts` using `withTenant` / `withAdmin` from `src/lib/api-controller.ts` |
| Blade views | Client components under `src/components/dashboard` and `src/components/admin` |
| Layout / partials | `AppShell`, `PublicShell`, `PageHeader`, `Panel` |

**Rule:** Keep `views.tsx` as a thin router only. Do not add data fetching or business logic there — put it in specialized panels or API routes.

## Tokens & brand

Defined in `src/app/globals.css` (CSS variables) and Tailwind theme.

- **Primary:** royal blue (`--primary`, chart-1)
- **Surfaces:** cool slate backgrounds (`--background`, `--card`)
- **Sidebar:** deep slate-blue
- **Success / compliance:** emerald accents
- **Admin:** amber badges and lock icon
- **Fonts:** Geist (UI Latin), IBM Plex Sans Arabic (Arabic display/body), Geist Mono (refs, scores)

Avoid purple-on-white marketing themes, cream+serif defaults, and broadsheet newspaper layouts.

## Shared patterns (`src/components/patterns`)

| Component | Use for |
| --- | --- |
| `PageHeader` | Every dashboard / admin view title row |
| `PageSection` | Outer `space-y-4` wrapper for a view |
| `Panel` | List cards and monitors (icon + title + actions + body) |
| `QueryState` | Loading / error / empty / content branch |
| `EmptyState` / `ErrorState` | Empty and error bodies inside panels |
| `ConfirmDialog` | Destructive or confirm actions (never `window.confirm`) |

Primitives (Button, Input, Dialog, Badge, …) live in `src/components/ui/*` (shadcn). Prefer composing patterns **on top of** primitives — do not reinvent buttons or modals per page.

### Panel structure

```tsx
<Panel
  icon={FolderKanban}
  tone="primary" // primary | success | warning | accent | muted
  title="…"
  subtitle="…"
  actions={<Button size="sm">…</Button>}
>
  <QueryState … empty={<EmptyState … />}>
    {/* list rows */}
  </QueryState>
</Panel>
```

### Page structure

```tsx
<PageSection>
  <PageHeader title="…" subtitle="…" locale={locale} badge="compliance" | "admin" | "none" />
  {/* grid of Panels / feature modules */}
</PageSection>
```

## API controllers

Use `src/lib/api-controller.ts`:

```ts
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    // …
    return jsonOk({ … });
  }, "resource GET");
}
```

- `"session"` — authenticated read
- `"writer"` — blocks `REVIEWER` (403)
- `withAdmin` — platform admin routes
- Throw `ApiError(message, status)` for expected 4xx
- `QuotaExceededError` maps to HTTP 402 automatically

Client fetches should use `apiJson` from `src/lib/api-client.ts` for consistent error messages.

## Metadata (SEO)

Use `createPageMetadata` from `src/lib/seo.ts` in **server** `layout.tsx` or `page.tsx` files:

```ts
export const metadata = createPageMetadata({
  title: "Pricing",
  description: "…",
  path: "/pricing",
  noIndex: false, // true for login & dashboard
});
```

Do not hard-code Open Graph titles in individual layouts unless overriding intentionally.

Public marketing routes (no auth): `/for-owners`, `/pricing`, `/compliance`.
Quality reference page: **`/for-owners`** — brand-first hero, one job per section, bilingual copy, intentional motion.

## Marketing pages

Shell: `PublicShell` (`src/components/marketing/public-shell.tsx`).

Guidelines:

1. Brand name (أراب كلاو / Arabclue) is the first hero signal.
2. One headline + one supporting sentence + one CTA group in the first viewport.
3. No card grids in the hero.
4. Prefer icon + text capability rows over decorative card stacks.
5. Match corporate blue/slate tokens; keep Arabic typography on IBM Plex.

## Dashboard density

- Card headers: `text-sm font-semibold`, subtitles `text-[11px] text-muted-foreground`
- Monospace for Etimad refs, percentages, plan codes
- Max list height often `max-h-96` with scroll
- Skeletons: `ListSkeleton` / `ChartSkeleton` from `loading-skeletons.tsx`

## Checklist for a new view

1. Register the view id in `DashboardView` (`src/lib/store.ts`) and sidebar nav.
2. Add a thin entry in `VIEW_REGISTRY` using `PageSection` + `PageHeader`.
3. Implement data UI as a specialized panel using `Panel` + `QueryState`.
4. Call tenant APIs via `withTenant`; validate bodies with Zod (`src/lib/validation.ts`).
5. Add `createPageMetadata` only if the view is a real App Router segment (marketing pages). SPA views inherit dashboard metadata.
