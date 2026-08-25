# Task 2 report: Branded cover + letter + ZIP + preview route

**Status:** DONE (implementation already present; this report is the SDD handoff, not a new implementer commit)

## What was implemented

- `renderCoverLetterheadHtml` / `renderSubmissionLetterHtml` using `letterheadBarHtml`
- ZIP files `Cover_Letterhead.html` and `Submission_Letter.html` via `generateStructuredBidPackageZIP`
- Preview download (non-contract, no persisted snapshot, pdf|html|pptx|zip) compiles a draft snapshot, applies workspace brand, and uses `exportProposalLayout` / structured ZIP
- Account copy `brand_exports_note` in `localizationRegistry` and `brand-setup.tsx`

Landed in `fa04428` (same SHA as `main` / this feature branch).

## Tests

Controller re-ran after checkout:

```
bun test src/lib/__tests__/branded-front-matter.test.ts src/lib/__tests__/bid-pack-design-guards.test.ts
```

5/5 passing. Output pristine.

## TDD Evidence

Not available for this commit. Tests and implementation shipped together in `fa04428`. RED phase was not recorded.

## Files changed (this task’s portion of fa04428)

- Create: `src/lib/branded-front-matter.ts`
- Create: `src/lib/__tests__/branded-front-matter.test.ts`
- Create: `src/lib/__tests__/bid-pack-design-guards.test.ts`
- Modify: `src/lib/structured-bid-package.ts`
- Modify: `src/app/api/proposals/[id]/download/route.ts`
- Modify: `src/lib/i18n.ts`
- Modify: `src/components/dashboard/brand-setup.tsx`

## Self-review

- `generateProposalPDF` / legacy ZIP remain as else-branches; for non-contract drafts `designedDraft` is always compiled, so those branches should be unreachable for the preview path.
- Audit / `X-Arabclue-Proposal-Engine` still label designed-draft downloads as `legacy-markdown`.

## Concerns

Same single commit as Task 1. Review the front-matter, ZIP, route, and brand copy only.

---

# Fix pass — Arabic titleAr + designed-draft-v1 label

**Status:** DONE  
**Commit:** `df4c9fa` — fix(export): use Arabic titleAr on covers and label designed-draft-v1

## What was implemented

1. **Arabic cover/letter title** — Optional `projectTitleAr` on `BrandedFrontMatterInput`; `resolveFrontMatterProjectTitle` picks trimmed `titleAr` when `locale === "ar"`, else `title`. ZIP call site passes `opts.project.titleAr`. Blank/null `titleAr` keeps English `title` (no invented translation). English locale always uses `title`.
2. **designed-draft engine label** — When `designedDraft !== null` and there is no persisted structured or contract-render snapshot, both `audit(...).details.exportEngine` and `X-Arabclue-Proposal-Engine` emit `"designed-draft-v1"`. Other labels unchanged (`structured-v1`, `contract-render-v1`, true legacy → `legacy-markdown`).

## What was tested and results

```
bun test src/lib/__tests__/branded-front-matter.test.ts src/lib/__tests__/bid-pack-design-guards.test.ts
```

**GREEN:** 9 pass, 0 fail (718ms).

## TDD Evidence

### RED (before implementation)

Command:

```
bun test src/lib/__tests__/branded-front-matter.test.ts src/lib/__tests__/bid-pack-design-guards.test.ts
```

Relevant failures (7 pass, 2 fail — expected):

- `designed-draft downloads label export engine designed-draft-v1` — `expect(source).toContain("designed-draft-v1")` failed because the download route still hard-coded the third branch to `"legacy-markdown"`.
- `Arabic locale uses titleAr and nameAr when present` — cover HTML still contained `Cloud operations tender` instead of `مناقصة تشغيل السحابة` because front-matter ignored `projectTitleAr`.

### GREEN (after implementation)

Command (same):

```
bun test src/lib/__tests__/branded-front-matter.test.ts src/lib/__tests__/bid-pack-design-guards.test.ts
```

Output:

```
bun test v1.3.9 (cf6cdbbb)

src/lib/__tests__/bid-pack-design-guards.test.ts:
(pass) bid pack organisation design > preview download compiles a branded draft snapshot
(pass) bid pack organisation design > structured ZIP ships branded cover and letter
(pass) bid pack organisation design > account brand copy says exports use this identity
(pass) bid pack organisation design > designed-draft downloads label export engine designed-draft-v1

src/lib/__tests__/branded-front-matter.test.ts:
(pass) branded front matter > cover includes company, title, and letterhead
(pass) branded front matter > submission letter is a preview, not a filing claim
(pass) branded front matter > Arabic locale uses titleAr and nameAr when present
(pass) branded front matter > English locale keeps English title even when titleAr is set
(pass) branded front matter > Arabic locale falls back to title when titleAr is blank

 9 pass
 0 fail
 32 expect() calls
Ran 9 tests across 2 files. [718.00ms]
```

## Files changed

- `src/lib/branded-front-matter.ts` — `projectTitleAr` + `resolveFrontMatterProjectTitle`
- `src/lib/structured-bid-package.ts` — pass `projectTitleAr: opts.project.titleAr`
- `src/app/api/proposals/[id]/download/route.ts` — designed-draft audit/header → `designed-draft-v1`
- `src/lib/__tests__/branded-front-matter.test.ts` — Arabic/English/fallback title cases
- `src/lib/__tests__/bid-pack-design-guards.test.ts` — designed-draft-v1 source guard + ZIP `titleAr` wiring

## Self-review findings

- **Completeness:** Both Important findings only; Task 2 Minors (ZIP constant unused, filename helper) left untouched.
- **Quality:** Title selection is trim-aware and locale-gated; no snapshot 409 behavior changed; snapshot route untouched.
- **Discipline (YAGNI):** No new packages; download route edited only on the two label branches plus existing designedDraft variable already in scope.
- **Testing:** Real HTML assertions for title/nameAr/no PDPL; source-guard for engine label and ZIP wiring. TDD RED→GREEN recorded above.

## Issues or concerns

None for this fix scope. Manifest `project.title` in the ZIP still uses the English Prisma `title` field (unchanged; out of finding scope).
