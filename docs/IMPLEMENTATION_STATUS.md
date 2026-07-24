# Implementation Status

**Branch:** `cursor/ship-remaining-ux-ab64` → `main`
**Verified:** 2026-07-24

## Latest closures — active project UX

| Gap | Status | Evidence |
| --- | --- | --- |
| Upload “No active project” with projects listed | Closed | In-place project select + auto-select first; picker on FileIngestion |
| Unformatted agent progress % | Closed | `formatPercent` + rounded `overallProgress` writes |
| Active project lost on refresh | Closed | `useUI` persist (`arabclue-ui`) |
| Delete clears wrong active project | Closed | Only clears when deleted id was active; falls back to next |
| Search doesn’t activate project | Closed | Topbar project/doc hits set `activeProjectId` |
| Requirements empty dead-end | Closed | CTA to Projects |


| Gap | Status | Evidence |
| --- | --- | --- |
| PDF preview “refused to connect” | Closed | `X-Frame-Options: SAMEORIGIN` + blob embed in `DocumentFileViewer` |
| Proposal HTML preview framing | Closed | `DocumentPreviewFrame` HTML also uses blob fetch |
| Compliance remediation copy | Closed | Open actions show agent `remediation` when present |
| Charts silent failure | Closed | `ChartsPanel` ErrorState + Retry |
| Submit advisory checklist | Closed | Submit toast surfaces missing reqs, non-compliant controls, BoQ prices, qualification gaps |
| Docs list error recovery | Closed | File ingestion Retry on documents query failure |

## Document generation (complete)

Plan: `docs/superpowers/plans/2026-07-24-docs-generation-complete.md`

| Gap | Status |
| --- | --- |
| Branded Excel / PPTX / slides / ZIP chrome | Closed |
| Contract MDX studio + client masthead | Closed |
| Live BrandSetup letterhead draft | Closed |
| Proposal preview matches export letterhead | Closed |
| Post-upload document preview | Closed |

## Previously closed

Pass A P0 UX, Pass B remaining product gaps (QueryState, agent runs, reviews redline, obligations, Mission recovery, qualification CTAs, billing alerts, notification dismiss, KPI trends), Saudi contract remaining, Voice Mission core, qualification backend.

## Explicitly out of scope

- Etimad portal submission API
- SSO / OIDC
- Live MyFatoorah without merchant credentials
- AI bid pricing
- New Prisma BrandProfile per government client
