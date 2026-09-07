# Tender Clarification Intelligence — design

**Date:** 2026-09-07 · **Status:** approved by default (autonomous session; the
user asked for "something completely new and unique to offer to customers",
better AI processing/generation, and best-in-class UI/UX, and was not available
to answer questions — every decision below is stated so it can be reversed).

## Why this feature

Every Etimad tender has an inquiries window (فترة الاستفسارات). The bidders who
ask sharp, cited questions get ambiguities resolved in their favour, surface
contradictions before they become disqualifications, and signal to the buyer
that they read the document. Today that work is manual, in Arabic, under a
deadline, and nobody automates it. Arabclue already parses the tender, chunks it
with page references, and drafts the proposal — so it is the natural place to
turn the tender's own defects into a formal clarification letter, and then to
carry the answers back into the proposal.

This is new (no existing module analyses the tender *for questions to ask*),
unique in the market, evidence-only (every finding cites verbatim tender text),
and it improves generation: section 16 of the proposal ("Assumptions,
Exclusions & Clarifications") stops being generic and lists the actual open
clarifications and the buyer's recorded answers.

## Scope

In:
1. Deterministic detectors over the project's tender chunks (no model needed).
2. A model pass (engine `INGESTION`) that finds deeper contradictions and
   ambiguities and drafts the formal question in Arabic and English, with
   verbatim quotes that are verified against the source before acceptance.
3. Persistence per project with triage (keep / drop / edit / submitted /
   answer recorded), idempotent re-runs that never clobber human edits.
4. A bilingual clarification letter (Markdown, screen HTML, print PDF) using
   the existing paired AR|EN layout engine.
5. A dashboard view `clarifications` (project-scoped) in the workflow group,
   plus the drafting hook.

Out (deferred, with the upgrade path named in code comments):
- Automatic ingestion of the buyer's published answers document as an
  addendum (today the team records the answer on the row).
- Cross-tender analytics of question themes.
- Competitor question inference.

## Data model

```prisma
model TenderClarification {
  id             String   @id @default(cuid())
  workspaceId    String
  projectId      String
  createdById    String
  kind           String   // CONTRADICTION | AMBIGUITY | MISSING_INFO | RISK_CLAUSE | PLACEHOLDER
  severity       String   // CRITICAL | MAJOR | MINOR
  status         String   @default("PROPOSED") // PROPOSED | KEPT | DROPPED | SUBMITTED | ANSWERED
  titleEn        String
  titleAr        String
  rationaleEn    String
  rationaleAr    String
  questionEn     String
  questionAr     String
  quotesJson     String   // JSON ClarificationQuote[] { text, documentId, documentName, pageRef, sectionHeading }
  answerMd       String?
  answeredAt     DateTime?
  submittedAt    DateTime?
  provenance     String   // DETERMINISTIC | AI_GENERATED | USER_AUTHORED
  provenanceJson String?  // { detectorId } | { provider, model, tokensUsed, windowIndex }
  fingerprint    String   // sha256(kind + normalized primary quote) — dedupe key across runs
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([projectId, fingerprint])
  @@index([projectId, status])
  @@index([workspaceId])
}
```

Migration `20260907000000_tender_clarifications` (additive; position 30 in the
ledger, `autonomy_slice_1` moves to 31). Registry and runbook updated.

Re-run semantics: findings are upserted by `(projectId, fingerprint)`. Existing
rows keep `status`, edited questions and answers; only rows still `PROPOSED`
and never edited receive refreshed AI text. Findings that no longer reproduce
are left in place (the team decides); nothing is deleted by a run.

## Analysis engine — `src/lib/tender-interrogation/`

Pure modules (no db, no fetch) so every rule is unit-testable:

- `types.ts` — `Finding`, `ClarificationQuote`, `SourcePassage`, kinds,
  severities, statuses.
- `fingerprint.ts` — `normalizeQuote`, `fingerprintFinding(kind, quote)`.
- `detectors.ts` — `detectDeterministicFindings(passages)`:
  - conflicting submission deadlines (≥2 distinct dates near deadline labels, AR/EN, DMY/ISO/Hijri-year aware)
  - conflicting evaluation weights (technical % stated with different values, or technical+financial ≠ 100)
  - conflicting penalty caps (distinct "maximum penalty" percentages)
  - dangling references (Annex/Appendix/Schedule/الملحق N referenced, no heading/label defines it)
  - placeholders (TBD, TBC, XX, ____, [ ], يحدد لاحقاً, لاحقًا, ×××)
  - missing mandatory information (no deadline, no evaluation criteria, no SLA/penalty, no scope, no submission method)
  - currency ambiguity (≥2 currencies attached to amounts)
  - day-count ambiguity ("within N days" with neither working/calendar nor أيام عمل/تقويمية in the sentence)
  - risk clauses (unlimited liability, termination without notice, pre-existing IP transfer, uncapped penalty)
  Each finding carries quotes with `documentName`, `pageRef`, `sectionHeading`.
- `grounding.ts` — `quoteIsGrounded(quote, passages)`: normalized (harakat,
  tatweel, alef/taa-marbuta folds, whitespace, punctuation) substring test; the
  anti-hallucination gate for model output.
- `windows.ts` — `selectInterrogationWindows(passages, { maxWindows, windowChars })`:
  scores passages by interrogation relevance (deadline / evaluation / penalty /
  scope / liability / annex vocabulary, AR+EN), packs them into windows, most
  relevant first.
- `prompt.ts` — `buildInterrogationSystemPrompt(locale)` (uses
  `NO_PRICING_RULE`, `REGULATORY_PRECISION_RULE`, `DOCUMENT_DATA_NOTICE`, the
  tender style guide) and `buildInterrogationUserPrompt(window, context)`;
  `interrogationAnswerSchema` (zod) + `parseInterrogationAnswer` via
  `parseJsonWithSchema`.
- `merge.ts` — `mergeFindings(deterministic, ai)`: dedupe by fingerprint and by
  quote overlap; deterministic wins on identical fingerprints.
- `letter.ts` — `composeClarificationLetter(input)`: returns `{ markdown,
  document: BilingualDocumentSpec }`; numbered questions, each with reference
  (document · page · section) and the verbatim quote; formal opening and
  closing in both languages; no pricing content; a footnote that answers
  received bind the tender only when the entity publishes them.
- `clarity.ts` — `clarityScore(findings)`: 100 − weighted open findings
  (CRITICAL 15, MAJOR 6, MINOR 2; DROPPED/ANSWERED excluded), floored at 0.
  Labelled in the UI as derived from the open findings, never as a prediction.

Orchestration — `src/lib/ai/tender-interrogation.ts`:
- `loadInterrogationPassages(projectId)` (db): chunks of the project's tender-side documents (`RFP`, `TECHNICAL_SPECS`, `IT_CONTRACT`, `EA_COMPLIANCE`, `OTHER`), joined with document name, ordered, capped at 600 chunks.
- `interrogateTender({ projectId, workspaceId, userId, locale })`:
  1. deterministic findings (always);
  2. windows → `generateCompletion` per window (`engine: "INGESTION"`, pool of 2, `promptOrigin: "system"`, JSON answer, schema-checked, quotes grounded or dropped);
  3. `guardOrThrow` semantics: a degraded model call in strict mode does **not** throw the whole run away — deterministic findings are honest and labelled — instead the result reports `ai: { status: "unavailable" | "partial" | "complete", failureKind, provider, model, windows, tokensUsed }`. Nothing templated is ever labelled `AI_GENERATED`.
  4. upsert rows; `bumpUsage(userId, "tokens", tokensUsed)`; audit `CLARIFICATION_INTERROGATE`.

## API

| Route | Role | Purpose |
| --- | --- | --- |
| `GET /api/projects/[id]/clarifications` | session | rows + summary (by status/severity/kind), clarity score, last run provenance |
| `POST /api/projects/[id]/clarifications/interrogate` | writer | runs the analysis (AI rate limit `ai.tender-interrogate` 6/min per workspace, token quota); `maxDuration = 120` |
| `POST /api/projects/[id]/clarifications` | writer | user-authored question (`USER_AUTHORED`) |
| `PATCH /api/projects/[id]/clarifications/[cid]` | writer | status transitions, question/title edits, answer recording |
| `GET /api/projects/[id]/clarifications/letter?format=md\|html\|pdf&locale=` | session | letter over `KEPT` + `SUBMITTED` rows (`format=pdf` gated by `assertExportFormatAllowed`) |

Failure codes registered in the i18n contract: `NO_TENDER_TEXT` (409, upload
and parse a tender first), `CLARIFICATION_NOT_FOUND` (404),
`CLARIFICATION_STATUS_INVALID` (409), `NO_KEPT_CLARIFICATIONS` (409, keep at
least one question before composing the letter).

## Drafting hook (AI generation improvement)

`orchestrator.prepare` loads KEPT/SUBMITTED/ANSWERED rows and formats a
"Clarifications register" block; `draftingUserPrompt` and the section-16 brief
receive it; `buildDeterministicProposal` lists it verbatim under section 16.
Open questions become explicit assumptions; answered ones are cited as
"clarified by the entity's response".

## UI — `src/components/dashboard/tender-interrogation.tsx`

Project-scoped view `clarifications` (path `/app/projects/<id>/clarifications`),
sidebar workflow group after Documents' natural successor, label
"استفسارات المنافسة / Tender Clarifications".

Layout (RTL-first, design tokens, no new dependencies):
- Header band: title, inquiry-window framing, last-run provenance chip
  (provider · model · when, or "deterministic only"), primary action
  **Interrogate tender**, secondary **Compose letter** (enabled when ≥1 KEPT).
- Main column: findings grouped by severity (CRITICAL → MINOR), each card with
  kind badge, severity stripe, title, verbatim quote block with document/page
  chip, rationale, the drafted question (inline editable), and actions Keep /
  Drop / Mark submitted / Record answer / Restore.
- Side rail: clarity gauge (reuses `RadialGauge`), counts by kind/status,
  filters, letter preview with Copy Markdown / Open HTML / Download PDF.
- Empty states: no tender parsed → link to Documents; provider unavailable →
  deterministic findings shown with an honest banner; nothing found → "No
  defects detected by the rules; run the model pass for a deeper read".
- Accessibility: buttons with labels, `aria-live` on run status, focus-visible,
  reduced-motion respected; keyboard-reachable inline edit.

## Testing

- Unit (bun): each detector with AR/EN positive and negative fixtures;
  fingerprint stability under harakat/whitespace; grounding accepts normalized
  matches and rejects fabricated quotes; window selection ordering and budget;
  prompt size bound; answer schema accept/reject; merge dedupe; letter numbering,
  both locales, no pricing words; clarity score arithmetic; deterministic
  proposal includes the clarifications register.
- Route-level (isolated, mock db): interrogate refuses with `NO_TENDER_TEXT`;
  PATCH status machine; letter refuses with `NO_KEPT_CLARIFICATIONS`.
- Registry parity: migration registry and runbook tests.
- Manual: browser QA against the local sandbox database with a sample tender.

## Build order

1. Schema + migration + registry + runbook.
2. Pure engine modules with tests (TDD).
3. Orchestration + routes + i18n codes.
4. Drafting hook + deterministic proposal.
5. Dashboard route table, i18n labels, sidebar, view, component.
6. Docs (AI-SYSTEM, worklog), tsc/lint/test/build, browser QA.
