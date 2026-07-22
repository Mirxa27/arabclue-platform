# Testing

## Commands

```bash
bun test src/lib/__tests__
bun run lint
bunx tsc --noEmit
bun run build
```

## Suites

| Suite | Coverage |
| --- | --- |
| `guardrails-pricing.test.ts` | No-pricing, BoQ null prices, validation gate |
| `billing.test.ts` | MF allowlist, Webhook V2 signature, amount match, fingerprint |
| `core.test.ts` | Ingestion SLA preservation, QLR, RAG, drafting |
| `production.test.ts` | RBAC, compliance categories, PPTX, secrets gate |
| `validation.test.ts` | Zod API contracts |

## AI evaluation (deterministic proxies)

- Pricing refusal
- Invented NORA ID block
- Blanket local-content preference block
- Cross-tenant helpers (`assertWorkspaceMatch`)

## Security tests (unit)

- Arbitrary MF URL rejection
- Invalid webhook signature rejection
- Amount/currency mismatch rejection logic
