# AI System

## Pipeline

Durable in-process workflow with persisted `AgentRun` state, progress, cancel, and final artifacts.

1. **Ingestion** — parse tender text, extract requirements, preserve SLA clauses
2. **Compliance** — evidence-based matrix with `sourceCategory` + legal-review status
3. **Technical** — RAG over approved tenant corpus only
4. **Financial** — qualification ratios + structure-only BoQ (no prices)
5. **Drafting** — bilingual proposal; restrictions enforced
6. **Validation gate** — blocks export on policy violations

## Provider abstraction

`src/lib/llm/index.ts` + `AIProviderConfig` per engine (INGESTION, COMPLIANCE, TECHNICAL, FINANCIAL, DRAFTING, EMBEDDING, REWRITE, DEFAULT).

## Guardrails

See `docs/GUARDRAILS.md`.

## RAG

- Chunking: `document-chunks.ts`
- Tenant filter on `DocumentChunk.workspaceId`
- Local embeddings fallback when no embedding provider configured
