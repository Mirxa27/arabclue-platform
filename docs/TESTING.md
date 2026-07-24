# Testing

## Commands

```bash
bun test src/lib/__tests__
bun run lint
bunx tsc --noEmit
bun run build
```

For the deterministic bilingual-document gate used by CI:

```bash
bun run quality:documents
```

This command performs a repository TypeScript check, scopes ESLint to the
Phase 2 implementation and tests, runs the offline Phase 2 unit/integration
suite, and enforces at least 85% aggregate line and function coverage across
the explicitly allow-listed public Phase 2 modules. It does not launch a
browser, contact a database, or make network requests. The LCOV artifact is
written to `coverage/documents/lcov.info`.

Browser-dependent visual and PDF smoke tests remain explicit:

```bash
bun run test:bilingual:visual
bun run benchmark:bilingual
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
