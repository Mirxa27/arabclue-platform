# Task 1 Report: Harden `validateContractDraft`

## What changed

- Added focused contract validation tests in `src/lib/__tests__/law-contract.test.ts` for:
  - AI pricing recommendations in contract text.
  - AI commercial pricing strategy language in contract text.
  - Empty EN or AR article body asymmetry.
  - Missing research/source section markers.
  - Existing false-certainty and missing-disclaimer behavior.
- Extended `validateContractDraft` in `src/lib/agents/law-contract.ts` to:
  - Block pricing language with existing `detectPricingSuggestion` and `detectPricingRequest` guardrail detectors.
  - Error when research summary or source section markers are absent.
  - Error when a parsed bilingual article has content in only one language body.
  - Preserve the existing empty content, legal disclaimer, false certainty, and article count checks.

## Test commands + output

### Red: new pricing/asymmetry/source tests failed before implementation

Command:

```bash
bun test src/lib/__tests__/law-contract.test.ts
```

Output:

```text
bun test v1.3.14 (0d9b296a)

src/lib/__tests__/law-contract.test.ts:
(pass) Saudi law research + bilingual contract agent > registers LAW_CONTRACT agent and LAW engine [0.06ms]
(pass) Saudi law research + bilingual contract agent > research brief cites registry and never claims 100% certainty [1.80ms]
(pass) Saudi law research + bilingual contract agent > deterministic bilingual contract has front-to-front articles [0.53ms]
(pass) Saudi law research + bilingual contract agent > validation rejects false 100% certainty claims [0.14ms]
(pass) Saudi law research + bilingual contract agent > validation rejects missing mandatory legal disclaimer [0.07ms]
(fail) Saudi law research + bilingual contract agent > validation rejects AI pricing language in contracts
Expected: true
Received: false
(fail) Saudi law research + bilingual contract agent > validation rejects bilingual article body asymmetry
Expected: true
Received: false
(fail) Saudi law research + bilingual contract agent > validation rejects contracts without research and source section markers
Expected: true
Received: false

 6 pass
 3 fail
 23 expect() calls
Ran 9 tests across 1 file. [92.00ms]
```

### Red: pricing strategy language failed before broadening detector usage

Command:

```bash
bun test src/lib/__tests__/law-contract.test.ts
```

Output:

```text
(fail) Saudi law research + bilingual contract agent > validation rejects AI commercial pricing strategy language in contracts
Expected: true
Received: false

 9 pass
 1 fail
 29 expect() calls
Ran 10 tests across 1 file. [106.00ms]
```

### Green: focused contract validation tests

Command:

```bash
bun test src/lib/__tests__/law-contract.test.ts
```

Output:

```text
bun test v1.3.14 (0d9b296a)

src/lib/__tests__/law-contract.test.ts:
(pass) Saudi law research + bilingual contract agent > registers LAW_CONTRACT agent and LAW engine [0.06ms]
(pass) Saudi law research + bilingual contract agent > research brief cites registry and never claims 100% certainty [1.79ms]
(pass) Saudi law research + bilingual contract agent > deterministic bilingual contract has front-to-front articles [0.55ms]
(pass) Saudi law research + bilingual contract agent > validation rejects false 100% certainty claims [0.47ms]
(pass) Saudi law research + bilingual contract agent > validation rejects missing mandatory legal disclaimer [0.09ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI pricing language in contracts [0.04ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI commercial pricing strategy language in contracts [0.05ms]
(pass) Saudi law research + bilingual contract agent > validation rejects bilingual article body asymmetry [0.12ms]
(pass) Saudi law research + bilingual contract agent > validation rejects contracts without research and source section markers [0.09ms]
(pass) Saudi law research + bilingual contract agent > bilingual contract HTML export includes both languages [8.63ms]

 10 pass
 0 fail
 30 expect() calls
Ran 10 tests across 1 file. [105.00ms]
```

### Full test suite

Command:

```bash
bun run test
```

Output:

```text
$ bun test src/lib/__tests__
...
 176 pass
 0 fail
 719 expect() calls
Ran 176 tests across 30 files. [708.00ms]
```

### Lint

Command:

```bash
bun run lint
```

Output:

```text
$ eslint .

/workspace/src/components/admin/ai-providers.tsx
  738:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

/workspace/src/components/dashboard/agent-workflow.tsx
  150:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')
  355:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

/workspace/src/components/dashboard/business-profile-view.tsx
  237:17  warning  Unused eslint-disable directive (no problems were reported from '@next/next/no-img-element')

/workspace/src/components/dashboard/settings-panel.tsx
   47:5   warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')
  511:18  warning  Unused eslint-disable directive (no problems were reported from '@next/next/no-img-element')

✖ 6 problems (0 errors, 6 warnings)
  0 errors and 6 warnings potentially fixable with the `--fix` option.
```

### Diff check

Command:

```bash
git diff --check
```

Output:

```text
```

## Self-review notes

- Requirement coverage:
  - Pricing language is blocked using existing guardrail detectors.
  - Bilingual article body asymmetry is blocked for parsed EN/AR article bodies.
  - Research summary and source section markers are required before validation passes.
  - Existing disclaimer and false-certainty checks remain covered.
- Scope stayed within Task 1 files plus the required report file.
- No UI behavior changed, so no browser walkthrough artifact was applicable.
- `bun run lint` reports pre-existing warnings in unrelated component files; no lint errors.

## Follow-ups

- None for Task 1.

## Important review finding fix: bilingual structure cannot silently pass

### Fix notes

- Added regression coverage for article headers that keep `### Article ...` but omit either the `:::en` or `:::ar` language block.
- Added regression coverage for malformed bilingual fences where both language markers appear but `parseContractArticles` skips the article.
- Strengthened `validateContractDraft` with raw article-header inspection:
  - Drafts that claim bilingual operative articles but have no Article EN/AR blocks now raise `bilingual_structure`.
  - Each article header must use paired English/Arabic titles.
  - Each article section must include exactly one `:::en` block and one `:::ar` block.
  - Sections with malformed fences now raise `bilingual_structure` before export validation can pass them.
- Existing pricing, disclaimer, sources, false-certainty, and parsed-body asymmetry checks remain covered by the focused test file.

### Red: missing/malformed bilingual structure tests failed before implementation

Command:

```bash
bun test src/lib/__tests__/law-contract.test.ts
```

Output:

```text
bun test v1.3.14 (0d9b296a)

src/lib/__tests__/law-contract.test.ts:
(pass) Saudi law research + bilingual contract agent > registers LAW_CONTRACT agent and LAW engine [0.13ms]
(pass) Saudi law research + bilingual contract agent > research brief cites registry and never claims 100% certainty [0.53ms]
(pass) Saudi law research + bilingual contract agent > deterministic bilingual contract has front-to-front articles [1.51ms]
(pass) Saudi law research + bilingual contract agent > validation rejects false 100% certainty claims [0.62ms]
(pass) Saudi law research + bilingual contract agent > validation rejects missing mandatory legal disclaimer [0.11ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI pricing language in contracts [0.06ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI commercial pricing strategy language in contracts [0.07ms]
(pass) Saudi law research + bilingual contract agent > validation rejects bilingual article body asymmetry [0.25ms]
(fail) Saudi law research + bilingual contract agent > validation rejects article headers missing paired bilingual language blocks [0.46ms]
Expected: true
Received: false
(fail) Saudi law research + bilingual contract agent > validation rejects malformed bilingual markup skipped by article parsing [0.14ms]
Expected: true
Received: false
(pass) Saudi law research + bilingual contract agent > validation rejects contracts without research and source section markers [0.11ms]
(pass) Saudi law research + bilingual contract agent > bilingual contract HTML export includes both languages [11.16ms]

 10 pass
 2 fail
 33 expect() calls
Ran 12 tests across 1 file. [122.00ms]
```

### Green: focused contract validation tests after fix

Command:

```bash
bun test src/lib/__tests__/law-contract.test.ts
```

Output:

```text
bun test v1.3.14 (0d9b296a)

src/lib/__tests__/law-contract.test.ts:
(pass) Saudi law research + bilingual contract agent > registers LAW_CONTRACT agent and LAW engine [0.08ms]
(pass) Saudi law research + bilingual contract agent > research brief cites registry and never claims 100% certainty [1.32ms]
(pass) Saudi law research + bilingual contract agent > deterministic bilingual contract has front-to-front articles [0.55ms]
(pass) Saudi law research + bilingual contract agent > validation rejects false 100% certainty claims [0.70ms]
(pass) Saudi law research + bilingual contract agent > validation rejects missing mandatory legal disclaimer [0.14ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI pricing language in contracts [0.07ms]
(pass) Saudi law research + bilingual contract agent > validation rejects AI commercial pricing strategy language in contracts [0.08ms]
(pass) Saudi law research + bilingual contract agent > validation rejects bilingual article body asymmetry [0.19ms]
(pass) Saudi law research + bilingual contract agent > validation rejects article headers missing paired bilingual language blocks [0.18ms]
(pass) Saudi law research + bilingual contract agent > validation rejects malformed bilingual markup skipped by article parsing [0.08ms]
(pass) Saudi law research + bilingual contract agent > validation rejects contracts without research and source section markers [0.14ms]
(pass) Saudi law research + bilingual contract agent > bilingual contract HTML export includes both languages [7.96ms]

 12 pass
 0 fail
 37 expect() calls
Ran 12 tests across 1 file. [107.00ms]
```
