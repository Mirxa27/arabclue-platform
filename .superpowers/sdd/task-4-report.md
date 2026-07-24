# Task 4 Report: Proposal preview matches export letterhead

**Status:** DONE
**Branch:** `cursor/docs-generation-complete-ab64`
**Commit message:** `fix(studio): letterhead-aware proposal preview layout`

## Summary

- Mapped proposal Preview mode to `DocumentPreviewFrame`, matching Print mode and the HTML/PDF export preview path.
- Added optional React-rendered letterhead metadata to `MarkdownStudioEditor` split previews.
- Wired proposal split preview letterhead from `/api/brand` BrandProfile and workspace company data.
- Added subtle paper chrome around the `DocumentPreviewFrame` iframe area.

## Files changed

- `src/components/dashboard/proposal-editor.tsx`
- `src/components/dashboard/markdown-studio-editor.tsx`
- `src/components/dashboard/markdown-studio-editor-inner.tsx`
- `src/components/dashboard/document-preview-frame.tsx`
- `.superpowers/sdd/task-4-report.md`

## Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | Pass (exit 0) |
| `bun run lint` | Pass (exit 0) |

## Constraints

- Did not implement Task 5.
- No schema changes.
- No dependency changes.

## Concerns

- No browser/manual UI walkthrough was performed because this subagent environment does not expose a computer-use executor.

---

## Task 4 review fix: reuse `letterheadBarHtml` in split strip

**Status:** DONE  
**Commit:** `fix(studio): reuse letterheadBarHtml in split strip`

### Change

- Removed duplicated JSX letterhead strip in `MarkdownStudioEditorInner` split preview.
- Split preview now renders `letterheadBarHtml()` from `src/lib/letterhead.ts` via `dangerouslySetInnerHTML`, keeping styles/fields aligned with HTML/PDF export.
- `splitLetterhead` in `proposal-editor.tsx` now passes `{ brand, companyName }`; locale comes from the editor `locale` prop so AR/EN bilingual labels stay correct.

### Files changed

- `src/components/dashboard/markdown-studio-editor-inner.tsx`
- `src/components/dashboard/markdown-studio-editor.tsx`
- `src/components/dashboard/proposal-editor.tsx`

### Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | Pass (exit 0) |
| `bun run lint` | Pass (exit 0) |

### Regression guardrails

- Preview/Print still use `DocumentPreviewFrame` (unchanged).
- Edit/Split still use MDX editor with split preview toggle (unchanged).
- Paper chrome around preview iframe unchanged.
- Task 5 not started.
