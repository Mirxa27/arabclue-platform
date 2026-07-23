# Saudi Contract Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close remaining Saudi-market contract workflow gaps: editable contract studio with legal review, hardened bilingual validation, accurate local-content compliance copy, Mission Control import fidelity, and tender-fact autopilot enrichment.

**Architecture:** Contracts already persist as `GeneratedProposal` with `type=CONTRACT` and `ProposalVersion` rows. Extend the existing proposal review/export path for contracts (do not invent a parallel data model). Harden `validateContractDraft` and align static compliance seed text with `procurement-rules.ts`. Improve Mission Control import source typing and autopilot project field population from ingest entities.

**Tech Stack:** Next.js App Router, Prisma/Postgres, Bun tests, existing proposal/review/download APIs, Mission Control platform tools.

## Global Constraints

- No pricing strategy, discounts, margins, or commercial recommendations from AI
- No 100% legal certainty claims; human final author; counsel must verify
- Contract drafts remain bilingual EN|AR with mandatory legal disclaimer
- Local content / Saudization rules are tender-stated mechanisms only — never blanket “mandatory 10%” / “mandatory 35%” universals
- Branch: `cursor/saudi-contract-remaining-ab64`
- Prefer extending existing proposal APIs over new parallel contract tables
- Every task ends with focused tests green + commit on the feature branch

---

### Task 1: Harden `validateContractDraft`

**Files:**
- Modify: `src/lib/agents/law-contract.ts`
- Modify or create: `src/lib/__tests__/law-contract*.test.ts` (or existing contract validation test file)
- Reference: `src/lib/guardrails.ts`, `src/lib/validation-gate.ts`

- [x] Add failing tests for: AI pricing language in contracts; missing EN or AR article body asymmetry; missing research/source section when expected; false certainty; missing disclaimer
- [x] Extend `validateContractDraft` to block pricing language (reuse guardrail detectors where possible)
- [x] Warn or error on bilingual asymmetry (article markers present in one language body but empty in the other)
- [x] Require research/sources section markers before export-ready contracts (error if absent)
- [x] Keep disclaimer + false-certainty checks
- [x] Run focused tests until green
- [x] Commit

### Task 2: Contract studio edit / save / version

**Files:**
- Modify: `src/components/dashboard/contract-studio.tsx`
- Modify: `src/components/dashboard/contracts-panel.tsx`
- Reuse: proposal content save/version APIs (`/api/proposals/[id]` PATCH, versions routes)
- Test: add component-adjacent or API-level tests if existing patterns cover proposal save; otherwise unit-test any new helpers

- [x] Make contract studio editable (markdown textarea or existing editor pattern from proposal editor — keep UI focused, not a second proposal editor clone)
- [x] Save updates content + creates/uses `ProposalVersion` like proposals
- [x] Disable edits when status is IN_REVIEW / APPROVED / EXPORTED (mirror proposal lock rules)
- [x] Wire Save + Version history controls from contracts panel / studio
- [x] Commit

### Task 3: Contract legal review path

**Files:**
- Modify: `src/components/dashboard/reviews-queue.tsx`
- Modify: `src/components/dashboard/contracts-panel.tsx` and/or contract studio
- Reuse: existing review submit/approve APIs for proposals
- Test: `src/lib/__tests__/*review*` or proposal-studio tests — extend for `type=CONTRACT`

- [x] Add “Submit for legal review” for CONTRACT proposals (same approval chain)
- [x] Reviews queue opens contract studio (not proposal editor) when `type === "CONTRACT"`
- [x] After final approval, contract can export PDF; gate with hardened `validateContractDraft`
- [x] Tests covering contract submit → approve → export-ready
- [x] Commit

### Task 4: Local-content compliance metadata cleanup

**Files:**
- Modify: `src/lib/constants.ts` (LOCAL_CONTENT controls)
- Modify: any seed/export labels that hardcode 10% / 35%
- Reference: `src/lib/procurement-rules.ts`
- Test: add regression scan in `src/lib/__tests__/` for forbidden blanket phrases in static compliance text

- [x] Rewrite LC-1 / LC-2 titles+requirements to tender-stated mechanism language (EN + AR)
- [x] Remove default mandatory percentages from matrix seed/export labels
- [x] Add test that fails if exported/static compliance text contains blanket “mandatory 10%” or “Minimum 35% Saudization” style universals
- [x] Commit

### Task 5: Mission Control import source fidelity

**Files:**
- Modify: `src/components/dashboard/mission-attachment-tray.tsx`
- Modify: `src/app/api/platform-agent/missions/[id]/attachments/route.ts`
- Modify: connector/source types as needed
- Test: extend mission-control / classify tests

- [x] Replace `window.prompt` Email/Drive import with an in-app modal (text paste + optional file) — clear labels for Email / Google Drive / OneDrive
- [x] Persist distinct sources: `email`, `google_drive`, `onedrive` (or `drive` if already used — pick one and accept both in API)
- [x] Accept drive sources on JSON attachment API path
- [x] Tests for source preservation + classification path
- [x] Commit

### Task 6: Autopilot project enrichment from tender facts

**Files:**
- Modify: `src/lib/agents/platform/autopilot.ts`
- Modify: ingest/stage helpers if needed to surface entities
- Test: `src/lib/__tests__/autopilot.test.ts`

- [x] When creating a project from high-confidence RFP ingest, populate available fields: title, etimadRef, category, deadline/budget/SLA hints from parsed entities
- [x] Fall back to filename/date title only when entities missing
- [x] Add autopilot test: RFP text with Etimad-like fields → enriched `TenderProject` payload
- [x] Commit

### Task 7: Verify & ship

- [x] `bun test src/lib/__tests__`
- [x] `bunx tsc --noEmit`
- [x] `bun run lint`
- [x] Update `docs/IMPLEMENTATION_STATUS.md` with these remaining-gap closures
- [x] Push branch `cursor/saudi-contract-remaining-ab64`; PR/main deploy handled by controller
