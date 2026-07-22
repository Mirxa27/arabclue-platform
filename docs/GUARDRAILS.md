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
5. Validation gate blocks export when pricing language or AI-priced BoQ is present.

**QA tests:** `src/lib/__tests__/guardrails-pricing.test.ts`

## G2 — Confidential / restricted content

Active `Restriction` rows are injected into drafting context and checked by the validation gate.

## G3 — No fabrication

Missing past projects, certificates, or balances → ask/leave blank; do not invent. Invented NORA IDs blocked at export.

## G4 — Qualification vs pricing

QLR and saudization from **user-uploaded** FINANCIAL documents are allowed (qualification). Pass/fail only when tender states a threshold. Local content preference appears only as a **tender-stated** regulatory evaluation fact.

## G5 — Regulatory precision

See `docs/REGULATORY-POLICY.md`. Prompt-only enforcement is insufficient; compliance agent + validation gate enforce categories and legal-review status.
