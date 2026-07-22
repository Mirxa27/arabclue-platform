# Architecture

## Layers

1. **Web app** — Next.js App Router dashboard (`?view=`) + marketing pages + login.
2. **API gateway** — Route handlers under `src/app/api/*` using `withTenant` / `withAdmin` (`src/lib/api-controller.ts`).
3. **Domain services** — onboarding, requirements, billing (MyFatoorah), RAG, quotas, audit, validation gate.
4. **AI engine** — five-stage in-process pipeline (`src/lib/agents/orchestrator.ts`) with per-engine LLM providers and guardrails.
5. **Data store** — Prisma Postgres + workspace-scoped file storage (`uploads/{workspaceId}/` or Vercel Blob).

## Agent pipeline

```
INGESTION → COMPLIANCE_REGULATORY → TECHNICAL_ARCHITECT → FINANCIAL_QUALIFICATION → PROPOSAL_DRAFTING
→ VALIDATION GATE (export)
```

## Regulatory policy registry

`src/lib/procurement-rules.ts` holds versioned instruments (GTPL, PDPL, NCA ECC/CCC, local-content mechanisms) with jurisdiction, authority, applicability, approval status, and review dates. Compliance rows carry `sourceCategory` and `legalReviewStatus`.

## No-pricing enforcement

| Layer | Mechanism |
| --- | --- |
| Deterministic agents | `unitPrice`/`total` always `null` |
| Prompts | `NO_PRICING_RULE` |
| LLM I/O | input/output pricing detection |
| Export | validation gate + human `financialFormsJson` |

## Billing

MyFatoorah adapter (`src/lib/myfatoorah.ts`) is the only payment port implementation. Admin UI: Payments → MyFatoorah (`admin_myfatoorah` view).
