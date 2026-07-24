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

Browser-dependent visual regression and PDF tests remain explicit:

```bash
bun run test:bilingual:visual
bun run benchmark:bilingual
```

The visual test renders a synchronized bilingual fixture containing Arabic,
English, mixed-direction values, a list, a table, and an embedded image. It
compares a normalized Chromium screenshot against the committed baseline at
`src/lib/__tests__/visual-baselines/bilingual-layout.chromium.png`.

The normalization is fixed at 50% scale with a 0.5-sigma blur to absorb
platform font anti-aliasing noise. A pixel is different when its RGB
root-mean-square delta is greater than 24 on the 0-255 channel scale; at most
0.5% of normalized pixels may differ. Failed comparisons write the normalized
actual image and a magenta diff to `coverage/bilingual-visual/`.

Update the baseline only after an intentional, reviewed rendering change:

```bash
bun run update:bilingual:visual-baseline
git diff -- src/lib/__tests__/visual-baselines/bilingual-layout.chromium.png
```

The update command is explicitly opt-in and refuses to run in CI. Review the
rendered PNG before committing it; never update a baseline merely to make a
failure disappear.

The latest Playwright Chromium, Firefox, and WebKit engines can be exercised
before a document release without adding their downloads to the normal CI path:

```bash
bun run setup:bilingual:browsers
bun run test:bilingual:browsers
```

The browser matrix renders the same font-embedded artifact at desktop and
mobile widths in every engine. It verifies paired geometry, RTL/LTR direction,
logical CSS support, embedded Arabic and English font availability, overflow,
heading semantics, and the mobile Arabic-first order. Each engine runs in a
separate bounded child process so a browser shutdown fault cannot starve the
next engine. Each browser lifecycle operation reports its engine, viewport,
and operation when it fails. Set `PLAYWRIGHT_BROWSER_DIAGNOSTICS=1` to print
per-operation timings.

The `Document quality` GitHub workflow exposes this matrix as an opt-in
`browser_matrix` manual input. Pull requests and pushes run the offline gate
without downloading Firefox or WebKit.

## Suites

| Suite                        | Coverage                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| `guardrails-pricing.test.ts` | No-pricing, BoQ null prices, validation gate                  |
| `billing.test.ts`            | MF allowlist, Webhook V2 signature, amount match, fingerprint |
| `core.test.ts`               | Ingestion SLA preservation, QLR, RAG, drafting                |
| `production.test.ts`         | RBAC, compliance categories, PPTX, secrets gate               |
| `validation.test.ts`         | Zod API contracts                                             |

## AI evaluation (deterministic proxies)

- Pricing refusal
- Invented NORA ID block
- Blanket local-content preference block
- Cross-tenant helpers (`assertWorkspaceMatch`)

## Security tests (unit)

- Arbitrary MF URL rejection
- Invalid webhook signature rejection
- Amount/currency mismatch rejection logic
