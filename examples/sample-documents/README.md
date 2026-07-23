# Sample Saudi documents (EN | AR)

Bilingual demo fixtures for ArabClue — Etimad-oriented RFPs, contracts, compliance, and qualification packs.

> **SAMPLE / عيّنة فقط** — Fictional content for demos and tests. Not official government documents. Do not submit to Etimad, ZATCA, or courts.

## Contents

| # | File | Category | Description |
|---|------|----------|-------------|
| 1 | `01-etimad-rfp-cloud-services` | `RFP` | Etimad-style RFP — Government Cloud Hosting Services<br/>كراسة شروط منافسة — خدمات الحوسبة السحابية الحكومية |
| 2 | `02-it-services-agreement` | `IT_CONTRACT` | IT Managed Services Agreement<br/>عقد خدمات تقنية معلومات |
| 3 | `03-technical-specifications` | `TECHNICAL_SPECS` | Technical Specifications — Secured Cloud Platform<br/>المواصفات الفنية — منصة سحابية مؤمّنة |
| 4 | `04-financial-statements-excerpt` | `FINANCIAL` | Financial Statements Excerpt — Qualification Only<br/>مقتطف القوائم المالية — لأغراض التأهيل |
| 5 | `05-local-content-saudization` | `QUALIFICATION` | Local Content & Saudization Declaration<br/>إقرار المحتوى المحلي والسعودة |
| 6 | `06-nca-pdpl-compliance-checklist` | `EA_COMPLIANCE` | Compliance Checklist — NCA Controls & PDPL<br/>قائمة امتثال — ضوابط NCA و نظام PDPL |
| 7 | `07-nda-confidentiality-agreement` | `IT_CONTRACT` | Mutual Non-Disclosure Agreement<br/>اتفاقية عدم إفشاء وسرية |
| 8 | `08-qualification-commercial-registration` | `QUALIFICATION` | Commercial Registration Summary<br/>ملخص السجل التجاري |
| 9 | `09-zatca-vat-certificate` | `FINANCIAL` | ZATCA VAT Registration Certificate (Sample)<br/>شهادة تسجيل ضريبة القيمة المضافة (عيّنة) |
| 10 | `10-sow-digital-transformation` | `RFP` | Scope of Work — Municipal Services Digital Transformation<br/>نطاق عمل — برنامج التحول الرقمي للخدمات البلدية |

## Formats

- `html/` — printable bilingual HTML (open in a browser)
- `pdf/` — A4 PDFs generated via Playwright
- `manifest.json` — machine-readable index (ids, categories, paths)

When this branch is deployed, the same PDFs are also served from `/samples/*.pdf` (see `public/samples/`).

## How to use in ArabClue

1. Sign in to the workspace.
2. Create or open a tender project.
3. Upload one or more PDFs from `pdf/` (start with `01-etimad-rfp-cloud-services.pdf`).
4. Mission Control / classifiers should route by filename + content cues (`مناقصة`, `عقد`, `PDPL`, etc.).

Suggested upload sets:

- **Full bid intake:** `01`, `03`, `04`, `05`, `06`, `08`, `09`
- **Contract review:** `02`, `07`
- **Municipal SOW path:** `10` + `06`

## Regenerate

```bash
bun scripts/generate-sample-documents.mjs
```

Requires Playwright Chromium (`bunx playwright install chromium`).
