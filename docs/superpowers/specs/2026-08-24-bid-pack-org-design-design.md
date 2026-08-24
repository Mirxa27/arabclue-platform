# Bid pack + organisation design

Date: 2026-08-24  
Branch: `cursor/bid-pack-org-design-ab64`  
Approved: designed bid pack; every workspace owns its document design

## Problem

Approved proposals already require an immutable structured snapshot and export through the bilingual layout engine. Draft / preview downloads still use the weaker Markdown→HTML→PDF path. Cover and submission letter are layout modules, not files in the ZIP. Organisation brand (logo, colors, font, taglines) exists on `BrandProfile` but does not always land on every preview export.

## Goal

Every workspace paints its own house style on every bid export. Preview PDF/HTML/PPTX/ZIP use the same designed bilingual engine as structured snapshots. The ZIP includes a designed cover and submission letter. No Prisma migration. No official Etimad forms. No AI prices. Contracts stay DRAFT / counsel-required.

## Non-goals

- Custom CSS or uploaded Word templates (XSS)
- Persisted default layout column (needs Neon migrate — use `government-formal` + optional `?layout=` later)
- Marketing brochure / brand-kit PDF (follow-up)
- DOCX in this first slice if it requires a new dependency mid-gate; prefer designed HTML/PDF first
- Changing APPROVED/EXPORTED: still 409 without a persisted snapshot

## Design

```
Workspace BrandProfile (existing Account setup)
        ↓
compileDraftProposalSnapshot (preview only)
  or persisted CanonicalProposalSnapshot
        ↓
applyWorkspaceBrandToSnapshot
        ↓
exportProposalLayout (HTML / PDF / PPTX)
        + branded cover / submission letter in ZIP
```

`BrandProfile` remains the only design source. Strict allow-list (hex colors, known fonts, safe logo URL) is unchanged. Each organisation already has this on Account; this work makes every export honor it.

Draft snapshots:

- `intent: "FULL_SUBMISSION"`, `languageMode: "BILINGUAL"`
- Sources only `TENDER` | `WORKSPACE` | `USER_ENTRY` — never `APPROVED_KNOWLEDGE`
- Required `government-formal` modules plus `submission-letter`
- Split `contentMd` on headings; unmapped body goes to `technical-solution`
- Missing language is an honest “not provided” line, not a translation
- Empty section is “not drafted yet” in both locales

## Testing

- Unit: draft snapshot compiles (`compileProposalLayout` diagnostics empty)
- Unit: no APPROVED_KNOWLEDGE; brand colors come from the workspace profile
- Source/route: preview PDF does not call `generateProposalPDF` when a draft snapshot compiles
- ZIP lists `Cover_Letterhead.html` and `Submission_Letter.html`
- i18n completeness for any new Account copy
