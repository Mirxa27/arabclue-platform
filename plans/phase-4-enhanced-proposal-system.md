# Phase 4: Enhanced Proposal System — Implementation Plan

## [Overview]
Build a comprehensive proposal generation system with visual builder, template marketplace, analytics dashboard, and collaboration features for the Arabclue B2B SaaS platform.

## [Types]
New types in `src/lib/proposal-builder-types.ts`:
- `ProposalSection` — typed section with key, type, bilingual content, order
- `ProposalBuilderState` — builder state with sections, metadata, validation
- `SectionType` — union: cover, executive-summary, technical-approach, pricing, team, qualifications, timeline, compliance, appendix
- `TemplateMarketplaceItem` — template with metadata, ratings, usage stats
- `CollaborationPresence` — user presence with cursor position, active section
- `AnalyticsMetric` — typed metric with value, trend, period

## [Files]
New files:
- `src/lib/proposal-builder-types.ts` — all Phase 4 types
- `src/lib/proposal-builder-engine.ts` — section management, validation, compilation
- `src/lib/proposal-builder-sections.ts` — section type definitions and defaults
- `src/lib/template-marketplace.ts` — marketplace data, ratings, usage tracking
- `src/lib/collaboration-sse.ts` — SSE stream for real-time updates
- `src/lib/analytics-collector.ts` — metric collection and aggregation
- `src/components/dashboard/proposal-builder.tsx` — main builder component
- `src/components/dashboard/proposal-builder-sections.tsx` — section list with DnD
- `src/components/dashboard/proposal-builder-preview.tsx` — real-time bilingual preview
- `src/components/dashboard/proposal-builder-toolbar.tsx` — toolbar with actions
- `src/components/dashboard/template-marketplace.tsx` — marketplace browser
- `src/components/dashboard/template-marketplace-card.tsx` — template card component
- `src/components/dashboard/analytics-dashboard.tsx` — analytics view
- `src/components/dashboard/analytics-charts.tsx` — chart components
- `src/components/dashboard/collaboration-presence.tsx` — presence indicators
- `src/components/dashboard/collaboration-comments.tsx` — comment threads
- `src/app/api/proposals/builder/route.ts` — builder CRUD API
- `src/app/api/proposals/builder/sections/route.ts` — section management API
- `src/app/api/templates/marketplace/route.ts` — marketplace API
- `src/app/api/templates/marketplace/[id]/route.ts` — single template API
- `src/app/api/analytics/proposals/route.ts` — analytics data API
- `src/app/api/collaboration/presence/route.ts` — presence SSE endpoint
- `src/app/api/collaboration/comments/route.ts` — comments CRUD API
- `prisma/migrations/20260725_phase4_proposal_system/migration.sql` — schema additions

Modified files:
- `src/lib/store.ts` — add builder state, marketplace state, collaboration state
- `src/components/dashboard/views.tsx` — register new views: proposal-builder, marketplace, analytics
- `src/components/dashboard/sidebar.tsx` — add nav items for new views
- `src/lib/i18n.ts` — add translations for new UI strings
- `prisma/schema.prisma` — add ProposalSection, TemplateMarketplaceEntry, CollaborationComment, AnalyticsEvent models

## [Functions]
New functions:
- `createProposalSection(type: SectionType, locale: "ar"|"en"): ProposalSection`
- `reorderSections(sections: ProposalSection[], fromIndex: number, toIndex: number): ProposalSection[]`
- `validateProposalSections(sections: ProposalSection[]): ValidationResult`
- `compileProposalToIR(sections: ProposalSection[], metadata: ProposalMetadata): DocumentIR`
- `getMarketplaceTemplates(filters: MarketplaceFilters): TemplateMarketplaceItem[]`
- `trackTemplateUsage(templateId: string, workspaceId: string): void`
- `collectAnalyticsEvent(event: AnalyticsEvent): void`
- `getProposalAnalytics(workspaceId: string, period: DateRange): AnalyticsSummary`
- `createPresenceStream(workspaceId: string, proposalId: string): ReadableStream`
- `addCollaborationComment(proposalId: string, sectionKey: string, content: string): Comment`

## [Classes]
No new classes — all functional components and hooks following existing patterns.

## [Dependencies]
New packages:
- `@dnd-kit/core` — drag-and-drop for section reordering
- `@dnd-kit/sortable` — sortable list utilities
- `@dnd-kit/utilities` — CSS transform helpers
- `recharts` — charting library for analytics (lightweight, React-native)

## [Testing]
- Unit tests for section validation, reordering, compilation
- Integration tests for builder API, marketplace API, analytics API
- Component tests for builder, marketplace, analytics views
- E2E test: create proposal with builder → preview → export

## [Implementation Order]
1. Install dependencies (@dnd-kit, recharts)
2. Add Prisma schema for new models + migration
3. Create type definitions (proposal-builder-types.ts)
4. Build proposal builder engine (section management, validation)
5. Create proposal builder UI components (main builder, sections list, preview, toolbar)
6. Build template marketplace (data layer + UI)
7. Build analytics dashboard (collector + charts + UI)
8. Add collaboration features (SSE presence, comments)
9. Wire up store, views, sidebar, i18n
10. Add API routes for all new endpoints
11. Verify lint + build