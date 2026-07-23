# Saudi Qualification Accuracy Implementation Plan

> **For agentic workers:** Use subagent-driven-development or execute directly for small mechanical tasks.

**Goal:** Align product defaults and UX with Saudi procurement research: no blanket saudization/local-content %, accurate PDPL/marketing claims, qualification dossier checklist, and compliance seed refresh.

**Architecture:** Client-safe cert catalog + qualification helpers; server uses them on submit/onboarding; seedComplianceChecks backfills missing controls and refreshes static requirement text.

**Tech Stack:** Existing Next.js/Prisma/Bun tests.

## Global Constraints

- No pricing strategy from AI
- No blanket mandatory local-content / Saudization percentages
- Do not harden legal readiness to require all certs (would break existing workspaces) — checklist is advisory + visible
- Branch: `cursor/saudi-qualification-accuracy-ab64`

---

### Task 1: Remove blanket saudization/local-content defaults

- [ ] Project POST defaults → null
- [ ] Wizard empty defaults; send null when blank
- [ ] Platform tools create paths → null / omit
- [ ] Tests for null defaults

### Task 2: PDPL + marketing accuracy

- [ ] Rewrite PDPL-14 requirement (no “100% residency” absolute)
- [ ] Marketing ZATCA item → accurate (VAT/CR capture, not “ZATCA Compliant”)
- [ ] Regression test for forbidden PDPL/marketing phrases

### Task 3: Qualification dossier checklist

- [ ] `src/lib/qualification.ts` with cert types + dossier items (CR, VAT/ZATCA, GOSI, NCA, LCGPA, ISO)
- [ ] Wire cert select in account onboarding
- [ ] Include advisory gaps on proposal submit checklist + optional business-profile surface
- [ ] Tests

### Task 4: Compliance seed refresh

- [ ] `seedComplianceChecks` inserts missing controls and updates title/requirement text for known controlIds
- [ ] Tests

### Task 5: Verify & ship

- [ ] bun test, tsc, lint, build
- [ ] Update IMPLEMENTATION_STATUS
- [ ] Push + deploy main
