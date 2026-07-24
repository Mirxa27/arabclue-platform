# Implementation Status

**Branch:** `cursor/docs-generation-complete-ab64`
**Verified:** 2026-07-24

## Latest closures — complete document generation

Plan: `docs/superpowers/plans/2026-07-24-docs-generation-complete.md`

| Gap | Status | Evidence |
| --- | --- | --- |
| Branded Excel / PPTX / slides / ZIP chrome | Closed | `generators.ts` + `brandArgb` / locale-aware `exportCompanyName`; tests in `generators-brand.test.ts` |
| Contract MDX studio + client masthead | Closed | `contract-studio.tsx` uses `MarkdownStudioEditor` + `letterheadCompanyName` |
| Live BrandSetup letterhead draft | Closed | Parent-owned draft drives `LetterheadPreview` before Save |
| Proposal preview matches export letterhead | Closed | Preview/Print → `DocumentPreviewFrame`; split strip reuses `letterheadBarHtml`; paper chrome |
| Post-upload document preview | Closed | `file-ingestion.tsx` opens `DocumentFileViewer` on upload + recent rows |

## Previously closed

| Gap | Status | Evidence |
| --- | --- | --- |
| Uploaded doc view layout | Closed | `DocumentFileViewer` in document matrix |
| Seamless proposal editing | Closed | MDXEditor studio + skills |
| Client letterhead on HTML/PDF export | Closed | `letterhead.ts` on proposal + contract exports |
| Brand typeface + saved preview | Closed | `fontFamily` in BrandSetup |

Remaining product gaps SDD Tasks 1–7, Voice Mission UX, qualification accuracy — see git history.

## Explicitly out of scope

- Etimad portal submission API
- SSO / OIDC
- Live MyFatoorah without merchant credentials
- AI bid pricing
- New Prisma BrandProfile per government client (workspace BrandProfile remains the bidder letterhead)
