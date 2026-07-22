# ArabClue PRD — Product Requirements Document

## Problem statement

Companies bidding on Saudi/GCC tenders spend weeks assembling technical proposals, compliance matrices, and financial form structures. ArabClue is an AI bid-preparation assistant that drafts technical content from the account knowledge base and structures financial forms **without ever pricing the bid**.

## Target users

- Bid managers, technical writers, and final approvers at companies that submit government and private-sector tenders.
- Initial market: Saudi Arabia / GCC (Etimad-oriented); architecture remains region-extensible.

## Success metrics

- Time from tender upload to first technical draft &lt; 30 minutes for a prepared account.
- Zero pricing suggestions from the AI (QA guardrail tests pass).
- Compliance matrix and requirements matrix traceable to tender text and account assets.

## Functional requirements

### 4.1 Account onboarding (10 parts)

| Story | Acceptance |
| --- | --- |
| As a bidder, I complete brand, legal, track record, staff, methodologies, library, partnerships, sectors, approval chain, and restrictions | All 10 steps are editable in Account Setup; readiness gate blocks agent runs until required steps complete |
| Required steps: brand, legal (CR/VAT or certificate), track record or staff, approval chain, restrictions reviewed | `GET /api/onboarding` reports `readyForProposals` |

### 4.2 Tender intake & requirements

| Story | Acceptance |
| --- | --- |
| As a bidder, I upload RFP/specs and run agents | Requirements are persisted with status COVERED / IN_PROGRESS / MISSING and optional links to account assets |
| As a bidder, I update requirement status | `PATCH /api/projects/:id/requirements` updates status |

### 4.3 Technical drafting

| Story | Acceptance |
| --- | --- |
| As a writer, I generate and edit a technical proposal | Pipeline produces markdown; editor supports save, AI rewrite, versions, export |

### 4.4 Financial proposal — structure only

| Story | Acceptance |
| --- | --- |
| As a finance user, I see BoQ structure without prices | Agent BoQ lines have `unitPrice`/`total` null |
| As a finance user, I enter prices myself | `PATCH /api/proposals/:id/financial` stores human amounts; export uses them |
| As any user, AI refuses pricing requests | Guardrails return refusal message; unit tests cover detection |

### 4.5 Review, approval & export

| Story | Acceptance |
| --- | --- |
| As a writer, I submit for review | Creates `ProposalReview` steps from approval policy |
| As a reviewer, I approve/reject | Sequential steps; final approval sets `APPROVED` |
| As a bidder, I export branded package | PDF / PPTX / XLSX / ZIP with branding |

## Non-functional

- Tenant isolation via membership-scoped workspace context.
- Arabic/English UI (RTL).
- Auth: credentials + optional MFA; REVIEWER is read-only except review decisions.

## Explicit out of scope

- Pricing recommendations, discounts, margins, commercial strategy.
- Direct Etimad portal submission API.
- Redis/Bull job queue (in-process agents with cancel).
- SSO.

## Assumptions

- QLR/saudization extracted from **user-uploaded** financial statements are qualification facts, not bid pricing.
- Local content “price preference” appears only as a regulatory evaluation fact.
