# AI Guardrails

Living configuration for the AI engine. Re-validate when models or prompts change.

## G1 — No pricing (mandatory)

ArabClue **must never**:

- Suggest, calculate, or fill unit prices, totals, discounts, margins, or markups.
- Advise on commercial strategy or “win price”.

**Enforcement**

1. Deterministic financial agent: `unitPrice` / `total` always `null`.
2. System prompt `NO_PRICING_RULE` on all agents.
3. Input patterns in `detectPricingRequest` → refuse with `PRICING_REFUSAL_MESSAGE`.
4. Output patterns in `detectPricingSuggestion` → reject completion.

**QA tests:** `src/lib/__tests__/guardrails-pricing.test.ts`

## G2 — Confidential / restricted content

Active `Restriction` rows (competitor names, confidential clauses) are injected into drafting context. Model must not reference competitors or reuse restricted wording.

## G3 — No fabrication

Missing past projects, certificates, or balances → ask/leave blank; do not invent. Hallucination cues and grounding confidence apply when provider flags enabled.

## G4 — Qualification vs pricing

QLR and saudization from **user-uploaded** FINANCIAL documents are allowed (qualification). Local content preference may appear as a **regulatory evaluation fact** only — never as a bid price adjustment.
