# Bid Pack Organisation Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preview bid exports use the designed bilingual engine and each workspace BrandProfile, with cover + submission letter in the ZIP.

**Architecture:** Compile a draft `ProposalSnapshot` from proposal + project + BrandProfile. Overlay workspace brand. Export through `exportProposalLayout`. Add branded front-matter HTML to the structured ZIP.

**Tech Stack:** Existing bilingual layout, letterhead, bun tests. No Prisma migrate. No new package.

## Global Constraints

- Package manager is **bun**, never npm.
- Locale defaults to Arabic (RTL); new strings have non-empty `ar` and `en` in `localizationRegistry`.
- Do not invent bid prices or APPROVED_KNOWLEDGE.
- Do not run `prisma migrate` / `db push` / reset against Neon.
- Do not add Etimad submit, SSO, or live MyFatoorah.
- APPROVED/EXPORTED still require a persisted structured snapshot (409).
- Commits stay on `cursor/bid-pack-org-design-ab64`.
- Tests: `bun test <focused-file>` while iterating.

## File structure

- Create: `src/lib/proposal-draft-snapshot.ts`
- Create: `src/lib/__tests__/proposal-draft-snapshot.test.ts`
- Create: `src/lib/branded-front-matter.ts`
- Create: `src/lib/__tests__/branded-front-matter.test.ts`
- Modify: `src/lib/structured-bid-package.ts`
- Modify: `src/app/api/proposals/[id]/download/route.ts`
- Modify: `src/lib/i18n.ts` + brand-setup copy
- Modify: `src/lib/__tests__/no-fabricated-assurance.test.ts` if needed

---

### Task 1: Draft snapshot compiler

**Files:**
- Create: `src/lib/proposal-draft-snapshot.ts`
- Create: `src/lib/__tests__/proposal-draft-snapshot.test.ts`

**Interfaces:**

```ts
export function compileDraftProposalSnapshot(input: {
  proposalId: string;
  version: number;
  contentMd: string | null;
  locale: "ar" | "en";
  projectTitle: string;
  projectTitleAr?: string | null;
  etimadRef?: string | null;
  bidderNameEn: string;
  bidderNameAr: string;
  brand: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  };
}): ProposalSnapshot;

export function applyWorkspaceBrandToSnapshot(
  snapshot: ProposalSnapshot,
  brand: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  }
): ProposalSnapshot;
```

- [ ] Write failing tests: compiles with empty diagnostics; never APPROVED_KNOWLEDGE; brand overlay wins; heading maps to technical-solution
- [ ] Implement using `REQUIRED` government-formal modules + `submission-letter`
- [ ] `bun test src/lib/__tests__/proposal-draft-snapshot.test.ts`
- [ ] Commit

---

### Task 2: Branded cover + letter + ZIP + preview route

**Files:**
- Create: `src/lib/branded-front-matter.ts`
- Modify: `src/lib/structured-bid-package.ts`
- Modify: `src/app/api/proposals/[id]/download/route.ts`
- Modify: `src/lib/i18n.ts`, `src/components/dashboard/brand-setup.tsx`

Cover/letter HTML use `letterheadBarHtml`. ZIP files: `Cover_Letterhead.html`, `Submission_Letter.html`.

Download: if not contract, no persisted snapshot, format pdf|html|pptx|zip — compile draft, `applyWorkspaceBrandToSnapshot`, use `exportProposalLayout` / structured ZIP instead of `generateProposalPDF`.

Account copy: brand setup paints bid exports.

- [ ] Tests for front-matter (contains company name, no PDPL claim)
- [ ] ZIP includes the two filenames
- [ ] Route uses draft compiler (source guard: preview path calls `compileDraftProposalSnapshot`)
- [ ] Commit
