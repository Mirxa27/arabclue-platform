# Regulatory Policy Registry

Source: `src/lib/procurement-rules.ts` (`REGULATORY_POLICY_REGISTRY`).

Each entry includes:

- jurisdiction, authority, instrument name (EN/AR)
- version, effective date, source reference
- applicability criteria, control identifiers
- superseded flag, review date
- human approval status
- normalized rules payload

## Critical rules

1. **Penalties** — extract tender clause as `EXPLICIT_TENDER`; list statutory candidates separately as `REGULATORY_CANDIDATE`. Never rewrite tender percentages.
2. **Local content** — no blanket preference. Only tender-stated or approved-rule percentages with eligibility notes.
3. **PDPL** — no universal 100% residency mandate. Platform default hosting may be KSA; transfers require policy evaluation.
4. **NCA** — ECC/CCC versions from registry; support successor versions.
5. **NORA** — no invented principle IDs. Tender-extracted IDs only until an approved official source is registered.
6. **Legal advice** — all matrices carry `NOT_LEGAL_ADVICE` / review-required statuses and the legal disclaimer.

Compliance content is assisted drafting, not legal advice.
