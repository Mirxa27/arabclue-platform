# Implementation Status

**Branch:** `cursor/saudi-contract-followups-ab64`
**Verified:** 2026-07-23

## Quality gates (executed)

| Gate | Command | Result |
| --- | --- | --- |
| Unit tests | `bun test src/lib/__tests__` | **193 pass, 0 fail** |
| Typecheck | `bunx tsc --noEmit` | **pass** |
| Lint | `bun run lint` | **0 errors** (6 existing warnings) |
| Build (optional) | `bun run build` | **blocked by known Turbopack client trace issue**: Node-only `redis` and `z-ai-web-dev-sdk` modules are pulled into browser/SSR traces |

## Follow-up hardening (post review)

| Item | Status | Evidence |
| --- | --- | --- |
| Shared submit-block helper | Closed | `isProposalSubmitBlocked` used by submit route; unit coverage for edit-lock vs submit-block (incl. REVIEWED) |
| Export-label regression | Closed | `saudizationExportLabel` exported + scanned for blanket 35%/mandatory phrases |

## Saudi contract remaining-gap closures

| Gap | Status | Evidence |
| --- | --- | --- |
| Contract validation hardening | Closed | `validateContractDraft` blocks pricing language, false certainty, missing disclaimer, missing sources, and malformed/asymmetric bilingual article bodies |
| Contract studio edit/save/version | Closed | Contract studio uses existing proposal PATCH/version routes, creates `ProposalVersion` history, and locks edits in review/approved/exported states |
| Contract legal review path | Closed | CONTRACT proposals reuse submit/review/download validation flow; review queue opens contract studio and final approval gates PDF export |
| Local-content compliance metadata | Closed | LC-1/LC-2 static text and export labels no longer state blanket mandatory 10% preference or universal 35% Saudization minimum |
| Mission Control import source fidelity | Closed | Email, Google Drive, and OneDrive imports use an in-app dialog and persist canonical `email`, `google_drive`, and `onedrive` sources |
| Autopilot tender-fact enrichment | Closed | High-confidence RFP ingest populates project title, Etimad reference, category, deadline, budget, and tender-stated targets when parsed facts exist |

## Previously completed production surfaces

| Area | Status | Evidence |
| --- | --- | --- |
| Mission chat persistence | Live | `syncMissionTranscript` + chat `onEnd` + UI hydrate |
| Image OCR | Live | Tesseract.js eng+ara via `ocr-image.ts` + sharp preprocess |
| Document chunk RAG search | Live | `searchWorkspaceChunks` embedding hybrid |
| Email/Drive/OneDrive import | Live | Paste/file import (no stub/soon); OAuth apps not required |
| PDF generation/viewer | Live | Playwright `htmlToPdf` + `DocumentPreviewFrame` |
| Tender setup flow | Live | Wizard + `TenderFlowBoard` |
| Standalone self-host | Live | `STANDALONE=1` -> `output: "standalone"` |
| Redis rate limit | Live | `rateLimitAsync` when `REDIS_URL` set |
| Outbound webhooks | Live | `WEBHOOK_URL` on audit events |
| Onboarding banner | Fixed | Fail-closed on API error |
| Marketing SSO claim | Fixed | Replaced with RBAC & audit (SSO out of scope) |
| Camera Permissions-Policy | Fixed | `camera=(self)` |

## Deferred / external only

- Live MyFatoorah sandbox charge requires merchant credentials
- External malware scanner credentials
- Full browser E2E in CI image
- Google/Microsoft OAuth *app* linking (paste/upload path is production-complete without third-party app registration)
- Etimad portal submission API (explicitly out of scope)
- SSO/OIDC (explicitly out of scope per PRD)
- Parallel deep research on Saudi market/contracts: saved under `docs/research/saudi-procurement-contracts-2026.{md,json}`
