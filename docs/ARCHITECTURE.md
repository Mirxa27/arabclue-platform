# Architecture

## Layers

1. **Web app** — Next.js App Router SPA dashboard (`?view=`) + marketing pages (`/for-owners`, `/pricing`, `/compliance`) + login.
2. **API gateway** — Route handlers under `src/app/api/*` using `withTenant` / `withAdmin` (`src/lib/api-controller.ts`).
3. **Domain services** — onboarding readiness, requirements persistence, billing (MyFatoorah), RAG, quotas, audit.
4. **AI engine** — five-stage in-process pipeline (`src/lib/agents/orchestrator.ts`) with per-engine LLM providers and guardrails.
5. **Data store** — Prisma (SQLite local / Postgres production) + workspace-scoped file storage under `uploads/{workspaceId}/`.

## Agent pipeline

```
INGESTION → COMPLIANCE_REGULATORY → TECHNICAL_ARCHITECT → FINANCIAL_QUALIFICATION → PROPOSAL_DRAFTING
```

- Ingestion extracts entities and persists `TenderRequirement` rows.
- Compliance evaluates NCA/PDPL/NORA/local-content controls with evidence.
- Technical uses RAG over past projects, library, staff, methodologies (respecting restrictions).
- Financial extracts QLR from uploaded statements and builds **structure-only** BoQ (no prices).
- Drafting writes technical markdown; BoQ amount columns blank.

## No-pricing enforcement

| Layer | Mechanism |
| --- | --- |
| Deterministic agents | `runFinancialAgent` sets `unitPrice`/`total` to `null` |
| Prompts | `NO_PRICING_RULE` in all agent system prompts |
| LLM I/O | `applyPricingInputGuardrails` / output pricing detection in `guardrails.ts` |
| Export | BoQ XLSX uses human `financialFormsJson` or blank cells |

## Tenancy

`getTenantContext(userId)` resolves membership-scoped workspace. All tenant resources assert `workspaceId` match.
