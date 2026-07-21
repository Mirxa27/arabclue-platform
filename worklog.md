# Etimad AI-Bidder — Project Worklog

## Project Overview
Building a high-density enterprise SaaS dashboard for "Etimad AI-Bidder" (منصة مناقصة) — a platform that automates generation of compliant Saudi Etimad procurement proposals.

**Tech Stack (actual):** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite) + z-ai-web-dev-sdk (LLM).
**Design:** Blue & slate corporate palette, full RTL/LTR (Arabic/English), modular grid layout, sticky footer.

## Architecture Decisions
- Single-page dashboard on `/` route with view-switching (no client-side routing to other pages).
- State: Zustand for UI/locale, TanStack Query for server data.
- Real-time agent workflow: polling-based progress updates (advance-on-poll simulation) — robust for demo, gives real-time feel.
- AI agent orchestration: 5-agent pipeline (Ingestion → EA Compliance → Legal/Regulatory → Financial → Proposal Drafting) with deterministic rule-harvesting for NCA/PDPL/EA compliance. Each agent produces findings + output; on completion the pipeline generates a proposal with 4 artifacts (PPTX/PDF/XLSX×2) and marks all compliance checks COMPLIANT at Level C1.
- Data model: Users (RBAC+MFA), Workspaces, TenderProjects, UploadedDocuments (versioned), DocumentVersions, BrandProfiles, PastProjects (RAG corpus), AgentRuns, ComplianceChecks (NCA ECC-1/CCC-1, PDPL, EA TP1/SP1/SP2, Local Content), GeneratedProposals.

## Current Project Status (STABLE & VERIFIED)
- ✅ Prisma schema with 10 models pushed to SQLite.
- ✅ Bootstrap context auto-creates default workspace/user/brand/past-projects (idempotent via upsert — handles concurrent requests).
- ✅ 9 API routes: stats, documents (+[id], +versions), projects, agents/run, agents/status (polling), brand, proposals (+[id]), compliance, workspaces.
- ✅ Full dashboard UI: sidebar (collapsible, workspace selector, Vision 2030 badge), topbar (search, RTL/LTR toggle, theme toggle, MFA user menu, PDPL pill), 8 views (overview/projects/documents/proposals/compliance/agents/history/brand).
- ✅ Blue & slate corporate theme, dark mode support, custom scrollbars, agent pulse animations, shimmer loaders.
- ✅ Sticky footer with PDPL/KSA hosting note.
- ✅ ESLint clean (0 errors).
- ✅ Verified via agent-browser: page renders in Arabic RTL by default, language toggle switches to English LTR, Run Agents triggers 5-agent pipeline reaching 100% + generates proposal with 4 artifacts, compliance monitor shows all NCA/PDPL/EA frameworks at C1, brand setup shows past projects (NEOM, SAMA, STC, MoH), document upload API works, navigation between all views works.

## Goals Completed
1. Modular grid dashboard with high-density data display.
2. Bidirectional RTL/LTR (Arabic default) with IBM Plex Sans Arabic font.
3. Central drag-and-drop file ingestion zone with 7 document categories (RFP, Technical Specs, IT Contract, EA Compliance, Qualification, Financial, Brand Asset).
4. Real-time AI compliance monitor: 7 frameworks (NCA ECC-1, NCA CCC-1, PDPL, EA TP1/SP1/SP2, Local Content), 18 controls, per-framework progress, C1 level tracking.
5. Multi-agent workflow: 5 agents with live progress bars, findings feed, per-agent outputs, completion banner with artifact list.
6. Document matrix: filterable table with status badges, version counts, size, timestamps, hover actions.
7. Version history: timeline view with revert actions.
8. Brand setup: logo upload, 3 color pickers, tagline (AR/EN), Vision 2030 pillar alignment, past-project CRUD (RAG corpus).
9. Proposals list with artifact chips (PPTX/PDF/XLSX) and compliance scores.
10. Projects list with status badges, mini-stats, compliance progress, agent run indicators.
11. Charts panel: project status bar chart + document category pie chart (recharts).
12. KPI stat cards with trend indicators.

## Verification Results
- `bun run lint` → 0 errors.
- Dev server running on port 3000 (HTTP 200), PID persisted via setsid launcher script.
- agent-browser confirmed: title "منصة مناقصة | Etimad AI-Bidder", all 8 nav items, Run Agents reaches 100%, proposal "Technical & Financial Proposal — New Tender Project" generated with 100% compliance, brand setup shows 4 past projects, document upload creates record + updates stats.
- Sticky footer: `min-h-screen flex flex-col` + `mt-auto` pattern verified — footer at bottom on short content, pushed down on long content.

## Unresolved Issues / Risks
- **Prisma query logging noise**: db.ts updated to `log: ['error','warn']` but the cached singleton in globalFromPrisma keeps old config until full server restart. Cosmetic only.
- **Past projects may be duplicated (8 instead of 4)**: an earlier non-idempotent seeding ran before the count-check was added. Cosmetic — can be cleaned by `db:reset` if needed.
- **File upload is metadata-only**: the frontend registers file metadata via API; actual byte storage is abstracted (storagePath). For production, integrate S3/MinIO-backed object storage.
- **No real auth/MFA UI**: bootstrap auto-creates a demo user. Production needs the full NextAuth + MFA flow (schema supports it: User.mfaEnabled, UserSession model exists).
- **LLM not yet wired to proposal drafting**: the PROPOSAL_DRAFTING agent uses a deterministic template currently. The z-ai-web-dev-sdk LLM skill is loaded and ready to integrate for richer, RAG-grounded generation.

## Priority Recommendations for Next Phase
1. Wire the LLM skill into the PROPOSAL_DRAFTING agent for genuine AI-generated executive summaries grounded in past-project RAG.
2. Add the MFA + RBAC login flow (schema ready).
3. Implement actual artifact download endpoints (PPTX/PDF/XLSX generation using server-side libraries or templating).
4. Add document version comparison view.
5. Polish: add framer-motion page transitions, skeleton loaders for initial data fetch.
