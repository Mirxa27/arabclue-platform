# Proposal Document Studio Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Ship a live Proposal Document Studio (versions, skills, regenerate version/fork, validation export policy) plus agent resume/readiness ops.

**Architecture:** Service module `proposal-studio.ts` + skill prompts; APIs mirror document versioning; orchestrator accepts regenerate modes; editor and reviews/agent UIs consume them.

**Tech Stack:** Next.js App Router, Prisma, React Query, existing LLM/guardrails.

## Global Constraints

- No AI pricing; evidence-only claims; human final author.
- Approval required for final export when policy steps exist.
- Regenerate supports both version update and fork.

---

### Task 1: Studio core lib + tests

- Add `src/lib/proposal-studio.ts` (diff, revert content, export policy, skill catalog).
- Fix validation gate for human BoQ source.
- Tests in `src/lib/__tests__/proposal-studio.test.ts`.

### Task 2: Schema + version/regenerate APIs

- Migration: `parentProposalId`, `configJson`.
- Version compare/revert routes.
- Extend agent run body + orchestrator regenerate modes.
- Enhance rewrite route with skills + apply.

### Task 3: Export policy live

- Download route: approval gate, EXPORTED on ZIP, human BoQ fix.

### Task 4: UI live

- Proposal editor: versions, skills, validation, regenerate.
- Reviews open studio; agent workflow CTA.

### Task 5: Ops resume + readiness

- Persist configJson; resume from status; ready checks for LLM.

### Task 6: Docs, verify, commit, push, PR
