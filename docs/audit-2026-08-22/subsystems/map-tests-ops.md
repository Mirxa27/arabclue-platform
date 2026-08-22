# ArabClue Platform — Test / Ops / Schema / Deploy Audit

**Repository:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Branch:** `main` @ `5a3ef50`
**Audit date:** 2026-08-22
**Method:** static read only. No build, no test run, no Prisma command, no database connection. Only writes were to `/tmp/acp-audit/`.

> One temporary regeneration of `src/lib/schema-sql.ts` was performed to measure drift and was immediately reverted via `git checkout --`. `git status` for that path is clean.

---

## 0. Headline numbers

| Metric | Value |
|---|---|
| Test files (incl. helpers) | 218 |
| Test LOC | 47,718 |
| `test(`/`it(` declarations | 1,992 |
| Test helper/fixture files (0 tests) | 13 (3,382 LOC) |
| Prisma models | 61 |
| Prisma migrations | 20 (+4 archived SQLite) |
| API routes (`route.ts`) | 136 |
| API routes with no test reference | 82 (60%) |
| `src/lib` modules | 214 |
| `src/lib` modules never imported by a test | 50 |
| Playwright e2e specs | 7 (39 tests) |
| GitHub workflows | 1 (`document-quality.yml`, 4 jobs) |
| Code-coverage reporting | none for `src/lib`; document-only lcov |

---

## 1. Test inventory

### 1.1 Group summary

| Group | Files | LOC | Tests |
|---|---:|---:|---:|
| `src/lib/__tests__/*` (root) | 126 | 23,538 | 1,130 |
| `src/lib/__tests__/platform-completion/` | 53 | 16,469 | 672 |
| `src/lib/__tests__/ai/` | 4 | 864 | 33 |
| `src/lib/__tests__/brand/` | 1 | 374 | 34 |
| `src/lib/__tests-isolated/` | 7 | 1,895 | 84 |
| `e2e/completion/` | 14 | 1,196 | 39 |
| `support/` + `fixtures/` (helpers) | 13 | 3,382 | 0 |
| **Total** | **218** | **47,718** | **1,992** |

`src/components/brand/__tests__/` **exists but is empty** (directory present on disk, zero tracked files). See defect #12.

### 1.2 Full file table

Columns: LOC / tests (`test(`/`it(`) / describes / `expect(` calls / verdict.
Verdict legend: **Genuine** = exercises real production code against independent expectations; **Config-lint** = asserts on repo configuration or registry shape rather than behaviour (useful as drift protection, but not a behaviour test); **Weak** = passes under conditions that would not detect the failure it names; **Tautology** = cannot fail.

#### `src/lib/__tests-isolated/` — module-mock suites (run in a separate `bun test` process so `mock.module` cannot leak)

| Path | LOC | Tests | Desc | Expects | Covers | Verdict |
|---|---:|---:|---:|---:|---|---|
| `audit.test.ts` | 159 | 13 | 2 | 37 | audit-log writer, severity mapping, redaction | Genuine |
| `bootstrap.test.ts` | 276 | 11 | 3 | 12 | first-run admin/workspace bootstrap, idempotence, `@arabclue.local` preservation | Genuine |
| `ensure-db.test.ts` | 132 | 6 | 1 | 8 | schema-presence probe, missing-table degradation | Genuine |
| `env-settings.test.ts` | 165 | 9 | 3 | 9 | AES-256-GCM `EnvSetting` encrypt/decrypt, secret masking | Genuine |
| `notification-delivery.test.ts` | 614 | 12 | 1 | 61 | dispatcher claim/retry/backoff, idempotence | Genuine **but** its fake DB is under-constrained — see defect #1 |
| `quotas.test.ts` | 252 | 21 | 2 | 31 | plan quota enforcement, `-1` unlimited, overage | Genuine |
| `requirements.test.ts` | 290 | 12 | 2 | 24 | tender requirement extraction + matrix status | Genuine |

#### `src/lib/__tests__/platform-completion/` — the Kiro spec suite

| Path | LOC | Tests | Expects | Covers | Verdict |
|---|---:|---:|---:|---|---|
| `account-registration.test.ts` | 804 | 31 | 119 | registration validation, verification token lifecycle, reserved-identity rejection | Genuine |
| `account-route-gating.test.ts` | 376 | 15 | 59 | register/verify route gating, production identity blocks | Genuine |
| `analytics-aggregation.test.ts` | 340 | 32 | 59 | rollups, bucketing, percentile math | Genuine |
| `analytics-collector.test.ts` | 626 | 29 | 88 | closed event vocabulary, PII minimisation, duration bounds | Genuine |
| `analytics-dashboard.test.tsx` | 352 | 25 | 55 | dashboard rendering, empty vs populated | Genuine |
| `analytics-origin-route-integration.test.ts` | 362 | 11 | 33 | origin route → collector wiring | Genuine |
| `api-failure-mapper.test.ts` | 407 | 32 | 99 | error → bilingual envelope, secret scrubbing (incl. a DSN/`sk-` redaction case) | Genuine |
| `billing-reconcile-apply.test.ts` | 141 | 2 | 14 | reconciliation apply step | Genuine |
| `clause-catalog-seeding.test.ts` | 293 | 11 | 62 | clause catalog seed idempotence | Genuine |
| `clause-create-category.test.ts` | 70 | 2 | 6 | clause category creation | Genuine |
| `clause-service-route-ui.test.ts` | 572 | 13 | 36 | clause service + route + UI contract | Genuine |
| `comment-lifecycle.test.ts` | 650 | 23 | 119 | comment create/edit/resolve/withdraw, threading | Genuine |
| `contract-template-schema.test.ts` | 670 | 34 | 87 | template schema versioning, canonical hash | Genuine |
| `credential-recovery.test.ts` | 402 | 20 | 67 | recovery token single-use, expiry, anti-enumeration | Genuine |
| `dashboard-route-table.test.ts` | 328 | 26 | 87 | dashboard route registry ↔ view switcher | Genuine |
| `document-language-purity.test.ts` | 76 | 3 | 10 | no Arabic in EN output and vice versa | Genuine |
| `infrastructure.test.ts` | 229 | 12 | 31 | test-DB guard, deterministic clock/RNG, network guard, **dependency pinning + script-string linting** | Mixed: guard tests Genuine; `pins fast-check exactly` and `one-shot safe test scripts` are **Config-lint** |
| `integrity-policy.test.ts` | 357 | 37 | 53 | production-integrity scanner rules | Genuine |
| `localization.test.ts` | 220 | 20 | 46 | locale resolution, fallback | Genuine |
| `logical-css-integrity.test.ts` | 40 | 1 | 1 | greps `src/components/{dashboard,admin}` for physical-direction Tailwind classes | **Config-lint** (source grep, not behaviour) |
| `marketplace-integration.test.ts` | 405 | 14 | 43 | marketplace apply/rate/usage | Genuine |
| `notification-dispatch-helpers.test.ts` | 69 | 5 | 13 | backoff + claim helper math | Genuine |
| `property-1-2-dashboard-paths.test.ts` | 82 | 2 | 11 | fast-check: dashboard path resolution | Genuine (property) |
| `property-3-4-34-translations.test.ts` | 107 | 3 | 8 | fast-check: translation completeness | Genuine (property) |
| `property-5-6-clause-catalog.test.ts` | 59 | 2 | 9 | fast-check: clause catalog invariants | Genuine (property) |
| `property-7-8-template-invariants.test.ts` | 134 | 2 | 11 | fast-check: template invariants | Genuine (property) |
| `property-9-25-26-template-history.test.ts` | 270 | 3 | 21 | fast-check: version history monotonicity | Genuine (property) |
| `property-10-contract-self-comparison.test.ts` | 51 | 1 | 7 | fast-check: self-diff is empty | Genuine (property) |
| `property-11-xlsx-completeness.test.ts` | 286 | 1 | 10 | fast-check: XLSX row completeness | Genuine (property) |
| `property-12-27-xlsx-literals.test.ts` | 260 | 1 | 9 | fast-check: no computed monetary literals in XLSX | Genuine (property) |
| `property-13-recurring-webhook-idempotence.test.ts` | 137 | 1 | 9 | fast-check: webhook replay safety | Genuine (property) |
| `property-14-reconciliation-idempotence.test.ts` | 101 | 1 | 13 | fast-check: reconcile twice = once | Genuine (property) |
| `property-15-16-analytics.test.ts` | 126 | 2 | 7 | fast-check: analytics invariants | Genuine (property) |
| `property-17-invalid-registration.test.ts` | 721 | 10 | 36 | fast-check: invalid registration rejection matrix | Genuine (property) |
| `property-18-consumed-tokens-single-use.test.ts` | 241 | 1 | 10 | fast-check: token single-use | Genuine (property) |
| `property-19-keyset-traversal.test.ts` | 169 | 1 | 11 | fast-check: keyset pagination has no gaps/dupes | Genuine (property) |
| `property-20-30-version-history.test.ts` | 136 | 2 | 13 | fast-check: version history | Genuine (property) |
| `property-21-comment-withdrawal.test.ts` | 116 | 1 | 13 | fast-check: withdrawal hides content | Genuine (property) |
| `property-22-tenant-isolation.test.ts` | 122 | 1 | 7 | fast-check: cross-workspace reads denied | Genuine (property) |
| `property-23-notification-minimization.test.ts` | 88 | 1 | 10 | fast-check: notification payload minimisation | Genuine (property) |
| `property-24-validation-gate.test.ts` | 149 | 2 | 15 | fast-check: validation gate | Genuine (property) |
| `property-28-29-recurring-invariants.test.ts` | 133 | 2 | 14 | fast-check: recurring state invariants | Genuine (property) |
| `property-31-marketplace-usage.test.ts` | 85 | 1 | 5 | fast-check: usage counter monotonicity | Genuine (property) |
| `property-32-migration-sql.test.ts` | 883 | 36 | 60 | migration SQL policy (destructive-op detection, idempotence) | Genuine |
| `property-33-notification-delivery-idempotence.test.ts` | 105 | 1 | 7 | fast-check: delivery idempotence | Genuine (property) |
| `property-35-capability-reachability.test.ts` | 44 | 2 | 6 | manifest reachability + scanner self-check | Genuine |
| `reconciliation-integration.test.ts` | 945 | 45 | 124 | full billing reconciliation | Genuine |
| `recurring-billing-state.test.ts` | 1040 | 54 | 168 | recurring state machine | Genuine |
| `return-to-and-presence.test.ts` | 85 | 4 | 18 | return-to URL safety, presence | Genuine |
| `route-state.test.ts` | 333 | 26 | 66 | route state machine | Genuine |
| `template-contract-integration.test.ts` | 297 | 13 | 35 | template → contract binding | Genuine |
| `ui-preferences-persistence.test.ts` | 180 | 10 | 44 | UI prefs persistence | Genuine |
| `workspace-invitations.test.ts` | 1142 | 42 | 156 | invitation lifecycle, revocation, reserved domains | Genuine |

#### `src/lib/__tests__/` root — selected (all 126 files categorised; the table lists every file)

| Path | LOC | Tests | Expects | Covers | Verdict |
|---|---:|---:|---:|---|---|
| `agent-delegation.test.ts` | 89 | 6 | 21 | agent delegation routing | Genuine |
| `agent-run-preflight.test.ts` | 26 | 3 | 6 | preflight gating | Genuine |
| `agent-runs-list.test.ts` | 40 | 1 | 1 | `serializeAgentRun` DTO shape (single `toEqual`) | Genuine |
| `ai/compliance-analyzer.test.ts` | 158 | 7 | 30 | NCA/PDPL analyzer | Genuine |
| `ai/contract-drafting-assistant.test.ts` | 206 | 8 | 30 | contract drafting | Genuine |
| `ai/proposal-optimizer.test.ts` | 252 | 9 | 33 | proposal optimizer scoring | Genuine |
| `ai/vendor-matching-engine.test.ts` | 244 | 9 | 28 | vendor match scoring | Genuine |
| `analytics-retention.test.ts` | 149 | 6 | 23 | retention SQL window | Genuine |
| `autopilot.test.ts` | 91 | 4 | 10 | autopilot thresholds | Genuine |
| `bilingual-browser-compatibility.test.ts` | 340 | 1 | 16 | 3-engine geometry parity; Chromium/Firefox/WebKit | Genuine; runs only via `test:bilingual:browsers` |
| `bilingual-components.test.tsx` | 177 | 9 | 45 | bilingual component render | Genuine |
| `bilingual-font-tracing.test.ts` | 46 | 2 | 12 | `next.config.ts` trace list ↔ checker list | **Config-lint** |
| `bilingual-layout.test.ts` | 963 | 33 | 122 | layout engine geometry | Genuine |
| `bilingual-pdf.test.ts` | 305 | 13 | 44 | PDF render (1 test Chromium-gated) | Genuine |
| `bilingual-performance.test.ts` | 126 | 3 | 12 | render budget (Chromium-gated) | Genuine |
| `bilingual-typography.test.ts` | 434 | 39 | 119 | type scale, Arabic metrics | Genuine |
| `bilingual-visual.test.ts` | 572 | 2 | 14 | pixel diff vs `visual-baselines/*.png` (Chromium-gated) | Genuine |
| `billing.test.ts` | 149 | 8 | 19 | billing math, webhook signature | Genuine |
| `brand-logo.test.ts` | 181 | 8 | 22 | logo variants | Genuine |
| `brand-route-security.test.ts` | 150 | 7 | 17 | brand upload route authz | Genuine |
| `brand/arabclue-logo.test.tsx` | 373 | 34 | 70 | logo component matrix | Genuine |
| `business-profile-bilingual.test.ts` | 363 | 7 | 39 | profile export bilingual | Genuine |
| `business-profile-export-route.test.ts` | 393 | 10 | 56 | export route | Genuine |
| `capability-statement.test.ts` | 506 | 11 | 79 | capability statement generator | Genuine |
| `chrome-extension-connector.test.ts` | 10 | 1 | 2 | `MISSION_CONNECTORS` contains `chrome_extension` with `status: "ready"` | **Config-lint** — asserts a literal in a static registry |
| `classify-attachment.test.ts` | 73 | 5 | 17 | attachment classifier | Genuine |
| `compliance-local-content-metadata.test.ts` | 74 | 5 | 15 | local-content metadata | Genuine |
| `contract-artifacts.test.ts` | 39 | 2 | 3 | artifact list shape | Genuine |
| `contract-draft-admission.test.ts` | 102 | 4 | 7 | draft admission control | Genuine |
| `contract-draft-migration.test.ts` | 63 | 4 | 24 | draft migration | Genuine |
| `contract-draft-route.test.ts` | 480 | 15 | 64 | draft route + precondition headers | Genuine |
| `contract-export-bilingual.test.ts` | 122 | 6 | 20 | bilingual contract export | Genuine |
| `contract-obligations.test.ts` | 58 | 2 | 3 | obligation extraction | Genuine |
| `contract-package.test.ts` | 58 | 3 | 6 | contract ZIP package | Genuine |
| `contract-render-snapshot-migration.test.ts` | 36 | 1 | 5 | snapshot migration | Genuine |
| `contract-render-snapshot.test.ts` | 275 | 6 | 16 | render snapshot hash | Genuine |
| `contract-review.test.ts` | 106 | 1 | 9 | contract review flow | Genuine |
| `contract-template-catalog-route.test.ts` | 23 | 1 | 8 | catalog route | Genuine |
| `contract-template-catalog-ui.test.ts` | 50 | 3 | 22 | catalog UI mapping | Genuine |
| `contract-template-persistence-db.test.ts` | 595 | 7 | 37 | persistence against `createFakeDatabase()` | Genuine; **name is misleading** — no real DB (defect #16) |
| `contract-template-persistence.test.ts` | 297 | 7 | 33 | persistence pure logic | Genuine |
| `contract-template-preview-route.test.ts` | 174 | 6 | 24 | preview route | Genuine |
| `contract-template-renderer.test.ts` | 214 | 6 | 40 | renderer (1 Chromium-gated) | Genuine |
| `contract-templates.test.ts` | 655 | 25 | 119 | frozen template catalog | Genuine |
| `copilot-processing.test.ts` | 647 | 75 | 151 | copilot pipeline stages | Genuine |
| `core.test.ts` | 304 | 12 | 47 | core utils | Genuine |
| `coverage.test.ts` | 225 | 3 | 31 | requirement→evidence coverage planner, technical architect, 18-section proposal | Genuine |
| `cron-auth.test.ts` | 133 | 9 | 13 | `CRON_SECRET` bearer auth, timing-safe compare | Genuine |
| `deployment-safety.test.ts` | 221 | 17 | 33 | exercises `check-deployment-safety.mjs` exports | Genuine (tests the gate's logic, not the repo state) |
| `design-tokens.test.ts` | 219 | 20 | 61 | token scale integrity | Genuine |
| `document-chunks.test.ts` | 75 | 10 | 15 | RAG chunking | Genuine |
| `document-export-guard.test.ts` | 189 | 6 | 18 | export authz + rate limit | Genuine |
| `document-layout.test.ts` | 388 | 38 | 89 | document layout engine | Genuine |
| `document-quality-gate.test.ts` | 141 | 5 | 16 | quality gate thresholds | Genuine |
| `document-version-integrity.test.ts` | 32 | 2 | 4 | version checksum | Genuine |
| `document-visualizations.test.ts` | 1182 | 35 | 164 | charts/tables/diagrams | Genuine |
| `download-artifact.test.ts` | 77 | 7 | 8 | artifact download naming | Genuine |
| `email.test.ts` | 30 | 2 | 4 | email config detection | Genuine |
| `etimad-date-parser.test.ts` | 65 | 7 | 12 | Hijri/Gregorian parsing | Genuine |
| `etimad-matcher.test.ts` | 66 | 5 | 8 | Etimad ref matching | Genuine |
| `extension-api-base.test.ts` | 31 | 3 | 8 | extension API base URL | Genuine |
| `extension-config.test.ts` | 41 | 4 | 12 | extension config allowlist | Genuine |
| `extension-i18n.test.ts` | 39 | 5 | 8 | extension i18n keys | Genuine |
| `extension-pack.test.ts` | 32 | 3 | 6 | ZIP packing | Genuine |
| `extension-version.test.ts` | 24 | 3 | 11 | manifest version sync | **Config-lint** |
| `file-delivery-security.test.ts` | 112 | 7 | 28 | path traversal, content-type pinning | Genuine |
| `format-percent.test.ts` | 15 | 2 | 5 | percent formatter | Genuine |
| `generators-brand.test.ts` | 220 | 9 | 32 | brand-aware generators | Genuine |
| `guardrails-pricing.test.ts` | 238 | 10 | 34 | no AI-computed pricing | Genuine |
| `i18n-completeness.test.ts` | 209 | 10 | 17 | ar/en key parity | Genuine |
| `i18n-contracts.test.ts` | 239 | 11 | 38 | contract i18n | Genuine |
| `knowledge-approval.test.ts` | 274 | 8 | 19 | approval/revocation gating | Genuine |
| `law-contract.test.ts` | 270 | 12 | 37 | Saudi law agent | Genuine |
| `layout-sync.test.ts` | 899 | 36 | 101 | HTML↔PDF layout parity (2 Chromium-gated) | Genuine |
| `letterhead.test.ts` | 97 | 5 | 20 | letterhead composition | Genuine |
| `markdown.test.ts` | 159 | 24 | 49 | markdown sanitisation | Genuine |
| `marketing-pages.test.ts` | 57 | 4 | 15 | `PUBLIC_MARKETING_PAGES` registry completeness | **Config-lint** |
| `marketing-residency-claims.test.ts` | 40 | 2 | 16 | no unbacked data-residency claims | Genuine |
| `marketplace-template-resolve.test.ts` | 46 | 3 | 8 | marketplace resolve | Genuine |
| `migration-readiness.test.ts` | 216 | 17 | 45 | migration readiness classifier | Genuine |
| `migration-registry.test.ts` | 183 | 18 | 26 | registry ↔ disk migrations | **Config-lint** (valuable drift guard) |
| `migration-runbook.test.ts` | 202 | 14 | 43 | runbook ledger generation | Genuine |
| `mission-control.test.ts` | 45 | 4 | 17 | mission control state | Genuine |
| `mission-persistence-ocr.test.ts` | 80 | 5 | 11 | OCR persistence | Genuine |
| `mission-pulse.test.ts` | 111 | 5 | 23 | pulse polling | Genuine |
| `mission-tool-theater.test.ts` | 164 | 9 | 34 | tool-call rendering | Genuine |
| `nora-ids.test.ts` | 36 | 3 | 9 | ID generation | Genuine |
| `notification-ids.test.ts` | 13 | 1 | 3 | onboarding notification fingerprint | Genuine |
| `outbound-webhook.test.ts` | 22 | 2 | 3 | outbound webhook shape | Genuine |
| `password.test.ts` | 126 | 16 | 22 | hash/verify, policy, timing | Genuine |
| `pdf-generation.test.ts` | 331 | 20 | 45 | PDF pipeline (Chromium-gated block) | Genuine |
| `pdf-preview-view.test.ts` | 22 | 2 | 4 | preview view props | Genuine |
| `platform-agent.test.ts` | 102 | 6 | 19 | platform agent contract | Genuine |
| `platform-primitives.test.ts` | 393 | 18 | 50 | token hashing, keyset cursors | Genuine |
| `prisma-missing-table.test.ts` | 47 | 4 | 7 | P2021/P2010 detection | Genuine |
| `production-identities.test.ts` | 41 | 2 | 10 | reserved `@arabclue.local` blocking | Genuine |
| `production-readiness.test.ts` | 61 | 5 | 13 | Redis/Blob/cron readiness matrix | Genuine |
| `production.test.ts` | 278 | 18 | 54 | production env guards | Genuine |
| `proposal-builder-draft.test.ts` | 50 | 3 | 10 | builder draft | Genuine |
| `proposal-document-claims.test.ts` | 39 | 1 | 4 | no unbacked claims in output | Genuine |
| `proposal-download-format.test.ts` | 78 | 5 | 13 | download format negotiation | Genuine |
| `proposal-edit-precondition.test.ts` | 30 | 1 | 3 | If-Match precondition | Genuine |
| `proposal-final-export.test.ts` | 172 | 3 | 9 | final export bundle | Genuine |
| `proposal-layout-export.test.ts` | 528 | 12 | 65 | layout export (1 Chromium-gated) | Genuine |
| `proposal-layouts.test.ts` | 618 | 15 | 56 | layout presets | Genuine |
| `proposal-review-integrity.test.ts` | 78 | 3 | 4 | review hash binding | Genuine |
| `proposal-snapshot-evidence.test.ts` | 185 | 4 | 9 | snapshot evidence linkage | Genuine |
| `proposal-snapshot-hydration.test.ts` | 162 | 4 | 17 | snapshot hydration | Genuine |
| `proposal-snapshot-identity.test.ts` | 62 | 2 | 7 | snapshot identity hash | Genuine |
| `proposal-snapshot-persistence.test.ts` | 462 | 14 | 33 | snapshot persistence + revision | Genuine |
| `proposal-snapshot-route.test.ts` | 415 | 12 | 44 | snapshot route | Genuine |
| `proposal-status.test.ts` | 57 | 7 | 21 | status transitions | Genuine |
| `proposal-studio.test.ts` | 291 | 16 | 32 | studio editor state | Genuine |
| `proposal-submit-client.test.ts` | 135 | 3 | 7 | submit client | Genuine |
| `proposal-workflow-integrity.test.ts` | 130 | 8 | 58 | workflow integrity | Genuine |
| `provider-engines.test.ts` | 39 | 3 | 7 | engine selection | Genuine |
| `qualification.test.ts` | 45 | 3 | 9 | qualification scoring | Genuine |
| `rag.test.ts` | 187 | 20 | 30 | RAG retrieval/ranking | Genuine |
| `rate-limit-fail-closed.test.ts` | 113 | 1 | 4 | Redis outage → deny | Genuine |
| `rate-limit-policy.test.ts` | 89 | 5 | 13 | per-route policy | Genuine |
| `realtime-audio.test.ts` | 52 | 5 | 14 | realtime audio opts | Genuine |
| `saudi-law-research.test.ts` | 234 | 14 | 40 | law research agent | Genuine |
| `schema-guard.test.ts` | 172 | 19 | 37 | missing-table → bilingual 503 | Genuine |
| `security-export.test.ts` | 210 | 10 | 31 | export security | Genuine |
| `stats-trends.test.ts` | 30 | 5 | 9 | trend math | Genuine |
| `storage-security.test.ts` | 53 | 3 | 8 | storage path safety | Genuine |
| `tender-insights.test.ts` | 61 | 5 | 22 | insights aggregation | Genuine |
| `text-quality.test.ts` | 64 | 4 | 14 | text quality scoring | Genuine |
| `typography.test.ts` | 300 | 38 | 67 | typography scale | Genuine |
| `validation.test.ts` | 71 | 6 | 15 | zod schemas | Genuine |
| `voice-options.test.ts` | 87 | 10 | 22 | voice option registry | Genuine |

#### `e2e/completion/`

| Path | LOC | Tests | Covers | Verdict |
|---|---:|---:|---|---|
| `auth-public.spec.ts` | 80 | 9 | renders `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite` in ar+en; mocked register/forgot/invite submits | Genuine (fully mocked — no server logic exercised) |
| `copilot-processing.spec.ts` | 135 | 4 | `/app/copilot` processing lifecycle + RTL mirroring | Genuine |
| `dashboard-mocks.spec.ts` | 167 | 10 | analytics/clause/template/draft/XLSX/billing/knowledge/comment/presence/marketplace/notification payload rendering, all route-mocked | Genuine (contract-level only) |
| `health-ready.spec.ts` | 37 | 3 | `/api/health`, `/api/ready` | Genuine |
| `locale-viewports.spec.ts` | 72 | 4 | login at 4 viewports, locale persistence | Genuine |
| `route-guards.spec.ts` | 84 | 5 | unauthenticated redirects, `callbackUrl` retention, no protected fetches on public pages | Genuine — the strongest e2e file |
| `stateful-isolated.spec.ts` | 35 | 4 | isolated-DB registration | **1 Tautology + 1 Weak** — see defects #13/#14 |
| `global-setup.ts` | 60 | 0 | seeds SUPER_ADMIN before the suite | **Security defect #2** |
| `support/{config,forbidden-requests,locale,mocks,page-fetch,test-database}.ts` | 512 | 0 | helpers | n/a |

### 1.3 Flagged tests — explicit quotes

**Tautology (cannot fail):**

```12:14:e2e/completion/stateful-isolated.spec.ts
  test("isolated database guard is active for stateful setup", async () => {
    expect(isolated).toBe(true);
  });
```
The enclosing `describe` calls `test.skip(!isolated, ...)` on line 7. When `isolated` is false every test is skipped; when it is true the assertion is `expect(true).toBe(true)`. There is no input under which this reports a failure.

**Weak (accepts the failure it names):**

```29:33:e2e/completion/stateful-isolated.spec.ts
    expect([200, 201, 409, 429]).toContain(response.status());
    const body = await response.json();
    if (response.ok()) {
      expect(body).toBeTruthy();
    }
```
`429` is a rate-limit rejection and `409` is a duplicate — the only genuinely asserted outcome is "not a 4xx/5xx other than these", and the body assertion is behind `if (response.ok())`, so a permanently rate-limited or permanently conflicting registration endpoint passes.

**Config-lint asserting a literal the test itself declares:**

```45:51:src/lib/__tests__/platform-completion/infrastructure.test.ts
  test("pins fast-check exactly in package.json and bun.lock", () => {
    const version = packageJson.devDependencies?.["fast-check"];
    expect(version).toBe("4.9.0");
```
The `"4.9.0"` literal is hardcoded in both the test and `package.json:146`. Bumping the dependency requires editing the test, so it protects against accidental drift but proves nothing about behaviour.

```218:227:src/lib/__tests__/platform-completion/infrastructure.test.ts
      const command = packageJson.scripts?.[name] ?? "";
      expect(command).toContain("bun test");
      expect(command).toContain("completion-test-preload.ts");
```
Asserts the shape of its own `package.json` script strings.

```5:9:src/lib/__tests__/chrome-extension-connector.test.ts
  test("exposes chrome_extension as ready connector", () => {
    const ext = MISSION_CONNECTORS.find((c) => c.id === "chrome_extension");
    expect(ext).toBeTruthy();
    expect(ext!.status).toBe("ready");
```
The whole file (10 LOC, 1 test) asserts that a static array literal contains an entry the same commit added.

```33:38:src/lib/__tests__/platform-completion/logical-css-integrity.test.ts
        if (PHYSICAL_CLASS_RE.test(source)) {
          offenders.push(path.relative(process.cwd(), file));
        }
    expect(offenders).toEqual([]);
```
A source-tree grep, not a rendering assertion — it cannot detect a directionally-broken layout produced by inline styles, CSS modules, or `style={{ marginLeft }}`.

**Misleading name:**

```49:52:src/lib/__tests__/contract-template-persistence-db.test.ts
function createFakeDatabase(): {
  readonly database: PrismaClient;
  readonly state: FakeState;
```
595 LOC named `-db.test.ts` that never touches a database. The `-db` suffix implies the DB-backed suite (`test:completion:db`), which it is not.

**Overall verdict on test quality:** genuinely high. There are **zero** snapshot tests, **zero** `.only`, one `.skip` (conditional and justified), no `expect(true).toBe(true)` outside the one tautology above, and 40+ fast-check property tests with a pinned seed and ≥100 runs enforced by `completionPropertyOptions`. The dominant weakness is not tautology — it is **coverage distribution** (§2) and the fact that the fakes are more permissive than the real database (defect #1).

---

## 2. Coverage analysis

### 2.1 `src/lib` modules with no test coverage

50 of 214 `src/lib` modules are never imported by any test. Those ≥150 LOC:

| LOC | Module | Why it matters |
|---:|---|---|
| 1651 | `src/lib/agents/platform/tools.ts` | every Copilot tool implementation — the agent's entire write surface |
| 1473 | `src/lib/agents/orchestrator.ts` | multi-agent run driver, resume/cancel, progress persistence |
| 708 | `src/lib/recurring-billing-prisma.ts` | **billing** — the Prisma adapter that actually writes recurring rows |
| 661 | `src/lib/invitation-service-prisma.ts` | the Prisma adapter behind the 1,142-LOC invitation test suite |
| 645 | `src/lib/pdf/print-ready.ts` | print-ready PDF pipeline |
| 637 | `src/lib/agents/agent-registry.ts` | agent registration/thresholds |
| 610 | `src/lib/knowledge-queue.ts` | knowledge review queue |
| 518 | `src/lib/llm/index.ts` | LLM provider dispatch + fallback |
| 481 | `src/lib/marketing/legal-content.ts` | legal page copy (PDPL/terms) |
| 368 | `src/lib/knowledge-decision.ts` | approve/reject decision engine |
| 339 | `src/lib/api-types.ts` | shared API types |
| 325 | `src/lib/account-service-prisma.ts` | account Prisma adapter |
| 307 | `src/lib/api-controller.ts` | shared route controller wrapper |
| 291 | `src/lib/comment-lifecycle-prisma.ts` | comment Prisma adapter |
| 290 | `src/lib/recovery-service-prisma.ts` | **auth** — password-recovery Prisma adapter |
| 289 | `src/lib/proposal-review-service.ts` | review workflow service |
| 255 | `src/lib/marketing/company-content.ts` | company copy |
| 235 | `src/lib/knowledge-decision-prisma.ts` | decision Prisma adapter |
| 223 | `src/lib/knowledge-queue-prisma.ts` | queue Prisma adapter |
| 211 | `src/lib/agents/platform/realtime.ts` | realtime audio session |
| 195 | `src/lib/clause-library-prisma.ts` | clause Prisma adapter |
| 183 | `src/lib/agents/prompts.ts` | agent prompt templates |
| 176 | `src/lib/brand-policy.ts` | brand asset policy |
| 170 | `src/lib/agents/agent-config.ts` | agent thresholds/config |
| 167 | `src/lib/agents/platform/ingest-document.ts` | document ingestion tool |
| 166 | `src/lib/app-route-resolver.ts` | client route resolution |
| 166 | `src/lib/agents/decision-logger.ts` | agent decision audit trail |

The pattern is systematic and important: the codebase splits every service into a **pure logic module** (`invitation-service.ts`, `recovery-service.ts`, `comment-lifecycle.ts`, `account-service.ts`, `clause-library.ts`, `knowledge-queue.ts`, `recurring-billing.ts`) and a **`*-prisma.ts` adapter** that does the actual database I/O. The 16,469-LOC `platform-completion` suite tests the pure halves exhaustively against in-memory fakes; **every `*-prisma.ts` adapter is untested**. Defect #1 is exactly the class of bug this leaves open.

The second uncovered cluster is the entire agent runtime: `orchestrator.ts` (1,473) + `platform/tools.ts` (1,651) + `agent-registry.ts` (637) + `agent-config.ts` + `prompts.ts` + `decision-logger.ts` ≈ 4,300 LOC with no direct test.

### 2.2 API route coverage

82 of 136 routes (60%) are not referenced by any test or e2e spec. The security-relevant gaps:

- **All 12 admin routes**: `/api/admin/{ai-providers,ai-providers/[id],ai-providers/models,audit,env,env/[key],myfatoorah,overview,plans,plans/[id],users,users/[id]}`. `/api/admin/env` reads/writes the AES-encrypted `EnvSetting` table — no test.
- **All 4 cron routes**: `/api/cron/{analytics-retention,billing-reconcile,expiry-notifications,notification-dispatch}` — no route-level test. (`cron-auth.test.ts` covers the `authorizeCron` helper in isolation; all four routes do call it — verified.)
- **Auth surface**: `/api/auth/{[...nextauth],password,precheck,return-to}` and all three MFA routes (`mfa/setup`, `mfa/verify`, `mfa/disable`).
- **Billing money paths**: `/api/billing/webhook`, `/api/billing/callback`, `/api/billing/recurring/[id]/{cancel,resume}`.
- **Agent execution**: `/api/agents/{run,cancel,runs,status}`.
- **Document versioning/revert**: `/api/documents/[id]/versions/[version]/revert` and `/compare`.
- **Extension surface**: all 5 `/api/platform-agent/extension/*` routes.

### 2.3 e2e journey coverage

| Journey | e2e coverage | Notes |
|---|---|---|
| Login | **Partial** | `/login` renders at 4 viewports in ar+en; locale persists. No successful authenticated login is ever performed. |
| Register | **Mocked only** | `auth-public.spec.ts:32` fills the form but `/api/auth/register` is stubbed by `mocks.ts:31`. `stateful-isolated.spec.ts` hits the real route but only when an isolated DB is configured, and its assertion is weak (§1.3). |
| Verify email | **Render only** | page renders; endpoint mocked. |
| Forgot / reset password | **Mocked only** | anti-enumeration copy asserted against a stub. |
| Invite accept | **Mocked only** | `/api/invitations/accept` stubbed at `mocks.ts:77`. |
| Create proposal | **None** | |
| Generate document | **None** | |
| Download PDF | **Mocked headers only** | `dashboard-mocks.spec.ts:81` asserts XLSX blocking + PDF metadata headers against `mocks.ts:163` — no real PDF is produced in e2e. |
| Checkout / billing | **Mocked only** | reconcile + recurring stubbed; `/billing/callback` only checked for "makes no tenant API calls". |
| Agent run | **Partial, mocked** | `copilot-processing.spec.ts` drives `/app/copilot` UI against stubs. |
| Admin actions | **None** | no admin surface is visited. |
| Route guards | **Real** | `route-guards.spec.ts` is the only spec asserting genuine server behaviour end to end. |

Because `playwright.completion.config.ts:8` documents "The dev server must already be running" and defines no `webServer`, and because no CI job invokes `test:e2e:completion`, **the e2e suite never runs automatically**.

### 2.4 Does `bun test` require a database?

**No — it is actively prevented from reaching one.** `package.json:35`:

```json
"test": "bun test --preload ./src/lib/__tests__/support/completion-test-preload.ts src/lib/__tests-isolated && bun test --preload ./src/lib/__tests__/support/completion-test-preload.ts src/lib/__tests__"
```

The preload (`src/lib/__tests__/support/completion-test-preload.ts`, 27 lines) does five things before any test module loads:

1. `process.env.TZ = "UTC"` — deterministic date formatting.
2. `clearProviderCredentials(process.env)` — deletes 19 provider keys (`RESEND_API_KEY`, `MYFATOORAH_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `AUTH_TOKEN`, …) so a developer `.env` cannot make a test hit a real provider.
3. Force-disables `SKIP_EMAIL_VERIFICATION` (deletes then sets `"false"`, with a comment noting Bun can re-expose deleted `.env` keys).
4. **Database routing** (lines 18–25):
   ```ts
   if (process.env.COMPLETION_USE_TEST_DATABASE === "1") {
     const approved = requireIsolatedTestDatabase(process.env);
     process.env.DATABASE_URL = approved.url;
   } else {
     process.env.DATABASE_URL = BLOCKED_TEST_DATABASE_URL;
     delete process.env.DIRECT_URL;
   }
   ```
   `BLOCKED_TEST_DATABASE_URL` is `postgresql://blocked:blocked@127.0.0.1:1/arabclue_blocked_test?…&connect_timeout=1` — port 1, unreachable, 1-second timeout. Any accidental Prisma call fails fast and loudly rather than silently reaching Neon.
5. `installNoExternalNetworkGuard()` — replaces `globalThis.fetch` with a wrapper that throws `EXTERNAL_NETWORK_BLOCKED` for any non-loopback host, and sets `ARABCLUE_LLM_DETERMINISTIC=1`.

**Mocking strategy.** Two tiers:
- *Hand-written in-memory fakes* (`support/{account,clause,comment,invitation,recovery,recurring-billing}-fakes.ts`, ~2,724 LOC) implementing the Prisma surface each service needs. These are injected as parameters — the services are written to accept a database object — so no module patching is required. This is why the main suite runs in one process.
- *`mock.module`* is used **only** in `src/lib/__tests-isolated/` (7 files, 21 call sites). That directory exists because Bun's `mock.module` is process-global and leaks across files; running it as a separate `bun test` invocation contains the damage. This is a good design decision, clearly deliberate.

**What `COMPLETION_USE_TEST_DATABASE=1` changes.** It routes `test:completion:db` through `requireIsolatedTestDatabase()` (`support/test-database.ts:93`), a fail-closed guard requiring **all** of:
- not `NODE_ENV=production` / `VERCEL_ENV=production`;
- `TEST_DATABASE_URL` set, valid `postgres(ql)://`, naming a host and a database;
- database name not in `{postgres, template0, template1}`;
- `TEST_DATABASE_ISOLATED=true` explicitly;
- `TEST_DATABASE_IDENTITY` set **and** exactly equal to `databaseIdentity(TEST_DATABASE_URL)` — a credential-free `host:port/db?schema=` string;
- that identity differing from every one of `DATABASE_URL`, `DIRECT_URL`, `PRODUCTION_DATABASE_URL`, `SHARED_DATABASE_URL`, `NEON_DATABASE_URL`.

`normalizeHostname()` (line 38) strips the `-pooler` suffix from `*.neon.tech` hosts, so the pooled and direct Neon endpoints for the same branch collapse to one identity and cannot be used to sneak past the shared-database check. Credentials are excluded from the identity, so a different Postgres *user* on the same database is also rejected. This is a well-built guard, and `infrastructure.test.ts:78-152` tests all seven rejection codes.

**Caveat:** none of this protects the Playwright suite. `e2e/completion/global-setup.ts` imports `src/lib/db` directly and has no equivalent guard (defect #2).

### 2.5 Coverage reporting

**There is no code-coverage measurement for `src/lib`.** `bun test` is never invoked with `--coverage`, and there is no `bunfig.toml`.

The root `coverage/` directory is not a coverage report and is **not tracked** (`.gitignore:14 /coverage`, `.vercelignore:15 coverage`). It contains two unrelated artifact folders:
- `coverage/bilingual-visual/` (last written 2026-07-25) — visual-diff diagnostics from `bilingual-visual.test.ts`, uploaded by the CI `live-document-rendering` job on failure.
- `coverage/documents/` (last written 2026-08-11) — output of `bun run quality:documents` (`scripts/check-document-quality.ts`, 433 LOC). The CI `phase-two` job uploads `coverage/documents/lcov.info` as an artifact.

So the only lcov in the repository measures *document-generation* coverage (a bespoke domain metric — "Document generation coverage (85%+)" per the job name), not source-line coverage. Both directories are stale local artifacts.

---

## 3. Database schema review (`prisma/schema.prisma`, 1,722 lines, 61 models)

### 3.1 Model inventory

**Identity & access**
| Model | Purpose | Key relations |
|---|---|---|
| `User` | RBAC + MFA principal; `role` is a free `String` with a comment enumerating 5 values | hub for ~45 relations |
| `UserSession` | opaque session tokens | `→User` Cascade |
| `VerificationToken` | email verification, hashed, single-use via `consumedAt` | `→User` Cascade |
| `RecoveryToken` | password recovery, same shape | `→User` Cascade |

**Tenancy**
| Model | Purpose | Key relations |
|---|---|---|
| `Workspace` | tenant root | 30+ children, nearly all Cascade |
| `WorkspaceMember` | membership + workspace role | `→Workspace` Cascade, `→User` Cascade, `@@unique([workspaceId,userId])` |
| `WorkspaceInvitation` | hashed invite tokens, `emailDeliveryState` | `→Workspace` Cascade, `→User?` (inviter) SetNull |

**Tender & documents**
`TenderProject` (tender root), `UploadedDocument` (file metadata + parse status), `DocumentVersion` (immutable versions; triple-unique `(documentId,version,checksum)` used as an evidence anchor), `DocumentChunk` (RAG chunks), `TenderRequirement` (requirement matrix), `ComplianceCheck` (NCA/PDPL/EA controls).

**Copilot / Mission Control**
`CopilotMission`, `CopilotMessage`, `CopilotAttachment`, `CopilotAction` — durable voice/agent sessions, all Cascade from mission and workspace.

**Knowledge corpus (RAG)** — six models sharing an identical review/decision/evidence block (`decisionStatus`, `submittedById`, `reviewedById`, `revokedById`, `evidenceDocumentId/Version/Checksum` → `DocumentVersion` Restrict): `PastProject`, `Certificate`, `StaffMember`, `MethodologyAsset`, `ContentLibraryItem`, plus `BrandProfile`, `Partnership`, `TargetSector`, `BidHistoryNote`, `Restriction`, `OnboardingProgress`, `ApprovalPolicy`, `ApprovalStep`.

**Proposals**
`GeneratedProposal` (self-referential `ProposalLineage`; two `Json` snapshot columns with hash+revision), `ProposalVersion`, `ProposalReview` (binds a decision to `submissionHash`/`submittedSnapshotHash`), `ProposalBuilderSection`, `ProposalPresence`, `CollaborationComment` (threaded, withdrawable), `ContractObligationState`.

**Contracts**
`ContractTemplate` (+ `currentVersionId` one-to-one back-pointer), `ContractTemplateVersion` (three unique keys incl. `(id,templateId)` to support the composite FK from `GeneratedContract`), `StandardClause` (catalog + per-workspace custom), `GeneratedContract`, `GeneratedContractVersion`.

**Marketplace**
`TemplateMarketplaceEntry`, `TemplateMarketplaceRating` (1–5, CHECK in migration `20260729100000`), `TemplateMarketplaceApplication`.

**Billing**
`SubscriptionPlan`, `Subscription` (`userId @unique`), `BillingRecord`, `PaymentCheckout`, `PaymentWebhookEvent` (fingerprint-idempotent receipt log), `MyFatoorahRecurringProfile`, `RecurringCheckoutIntent`.

**Platform**
`AIProviderConfig`, `EnvSetting` (AES-256-GCM), `AuditLog`, `AnalyticsEvent`, `NotificationDelivery`, `InAppNotification`, `NotificationDismissal`, `ExpiryNotificationLog`.

### 3.2 Missing indexes

Cross-checked against actual query sites.

| Model | Missing index | Query evidence |
|---|---|---|
| `BrandProfile` | **no `@@index` at all**, including `workspaceId` | `src/lib/onboarding.ts:40` `brandProfile.findFirst({ where: { workspaceId } })`; `src/lib/agents/orchestrator.ts:470`; `src/lib/proposal-snapshot-identity.ts:198`. Three `findFirst`-by-`workspaceId` on an unindexed FK column. This is the one clear-cut missing index. |
| `AuditLog` | no index on `(resource, resourceId)` | both columns exist and are populated; only `userId`, `action`, `createdAt` are indexed |
| `ExpiryNotificationLog` | has indexes, but no FK — see §3.4 | |

`ApprovalPolicy` and `OnboardingProgress` also show "no `@@index`", but both carry `workspaceId @unique`, which Postgres backs with a unique index — so their lookups (`findUnique` at `bootstrap.ts:221`, `onboarding.ts:56`, `notification-service.ts:352`, and four route sites) are covered. `User` and `Workspace` are similarly covered by `@unique` on `email`/`slug`. `SubscriptionPlan` has no index and no unique beyond the PK, but it is a tiny lookup table.

Otherwise indexing is unusually thorough: 33 of 34 workspace-scoped models lead an index with `workspaceId`, and keyset-pagination cursor indexes (`(…, createdAt DESC, id)`) exist on `PastProject`, `Certificate`, `StaffMember`, `MethodologyAsset`, `ContentLibraryItem`, `ContractTemplate`, `GeneratedContract`, `WorkspaceInvitation`, `DocumentVersion`, `ProposalVersion`, `GeneratedContractVersion`, `InAppNotification`, `CollaborationComment`, `TemplateMarketplaceEntry`, `RecurringCheckoutIntent`, `MyFatoorahRecurringProfile`, `AnalyticsEvent`.

### 3.3 Unique constraints

**One is wrong and actively breaks production** — `NotificationDelivery` carries both:

```1632:1633:prisma/schema.prisma
  @@unique([eventId, recipientId])
  @@unique([eventId, recipientId, channel])
```

The 2-column key is strictly stronger, making the 3-column one dead. It also makes it impossible to record more than one channel per event+recipient — which is exactly what the code does. Full analysis in defect #1.

**Correct and load-bearing:** `WorkspaceMember(workspaceId,userId)`, `DocumentVersion(documentId,version)` and `(documentId,version,checksum)`, `ProposalVersion(proposalId,version)`, `ProposalReview(proposalId,stepIndex)`, `ApprovalStep(policyId,stepIndex)`, `ContractObligationState(proposalId,obligationId)`, `NotificationDismissal(userId,notificationId)`, `ExpiryNotificationLog(workspaceId,kind,resourceId,channel)`, `RecurringCheckoutIntent(subscriptionId,idempotencyKey)`, `GeneratedContract(workspaceId,clientRequestId)`, `TemplateMarketplaceRating(entryId,userId)`, `PaymentWebhookEvent.eventFingerprint`, all three token `tokenHash` columns.

**Deliberately in SQL only** (documented in the schema header comment at lines 16–33 because Prisma cannot express them): `User_email_normalized_key` on `lower(btrim(email))`, the partial unique on pending invitations per `(workspaceId, lower(btrim(email)))`, `StandardClause_catalog_clauseKey_key`, `MyFatoorahRecurringProfile_subscriptionId_current_key`, and `NotificationDelivery_dispatch_ready_idx`. This is well-handled — the comment names the owning migration.

**Gap:** `AIProviderConfig` has `isDefault Boolean` and `engine` with no partial unique enforcing "one default per engine". Nothing prevents two rows with `isDefault: true` for the same engine; selection then depends on `priority` ordering and row order.

### 3.4 Cascade / `onDelete` behaviour

**Orphan risk — columns that look like FKs but are not:**

- `DocumentChunk.workspaceId` and `DocumentChunk.projectId` (schema lines 347–348) are plain `String` with `@@index`, no `@relation`. They survive workspace/project deletion. In practice `documentId` cascades from `UploadedDocument`, which does cascade from `Workspace`, so the rows do get removed — but a `TenderProject` deletion leaves `DocumentChunk.projectId` pointing at a dead project (`UploadedDocument.projectId` is `SetNull`, the chunk's copy is not).
- `ExpiryNotificationLog.workspaceId` (line 1223) has **no relation at all**. Deleting a workspace leaves its dedupe rows forever. Because the unique key is `(workspaceId, kind, resourceId, channel)` and `resourceId` is a cuid, a recreated workspace gets a new id, so this is a slow leak rather than a correctness bug — but the table has no retention path (`src/app/api/cron/expiry-notifications/route.ts` only reads and inserts).
- `AuditLog` has **no `workspaceId`** at all (§3.6) and `userId` is `SetNull`, so deleting a user anonymises their audit trail in place. For a table the header comment calls an "Immutable Audit Trail", there is no DB-level protection against `UPDATE`/`DELETE` either.

**Mass-deletion risk:** `Workspace` is the cascade root for 30 relations. A single `db.workspace.delete()` removes projects, documents, versions, chunks, proposals, all proposal versions/reviews/comments/presence, contracts and contract versions, templates, custom clauses, the entire knowledge corpus, all analytics events, invitations, in-app notifications, marketplace entries and applications, and recurring checkout intents. There is no soft-delete column and no `Restrict` anywhere on the workspace path. `NotificationDelivery.workspaceId` is the sole `SetNull` exception (line 1629).

**Erasure blocked:** 13 required relations to `User` have no explicit `onDelete` and therefore default to `Restrict`:

`TenderProject.createdBy`, `UploadedDocument.uploadedBy`, `AgentRun.triggeredBy`, `GeneratedProposal.createdBy`, `ApprovalStep.reviewer`, `ProposalReview.reviewer`, `ContractTemplate.creator`, `ContractTemplateVersion.creator`, `GeneratedContract.creator`, `ProposalBuilderSection.creator`, `TemplateMarketplaceEntry.creator`, `CollaborationComment.creator`, `AnalyticsEvent.user`.

Plus explicit `Restrict` on `GeneratedContractVersion.creator`, `RecurringCheckoutIntent.createdBy`, `GeneratedProposal.structuredSnapshotUpdatedBy`, `TemplateMarketplaceApplication.appliedBy`, and the reviewer/revoker relations on all five knowledge models.

Net effect: **any user who has ever created a project, uploaded a document, generated a proposal, or triggered a single analytics event cannot be deleted.** For a Saudi platform subject to PDPL right-to-erasure, there needs to be a documented anonymisation path; none exists in the schema or in `src/lib`.

### 3.5 Nullable vs required mismatches

- `MyFatoorahRecurringProfile.amount Float?` **and** `amountExact String?` (lines 795–796) are both nullable, with the comment *"Legacy compatibility only; exact literal is authoritative when present"*. Nothing at the DB level guarantees at least one is set, so a profile can exist with no amount at all.
- `GeneratedProposal.structuredSnapshotHash String?` is nullable while `structuredSnapshotRevision Int @default(0)` is required — a revision can advance with a null hash. Same pairing for `contractRenderSnapshot*`.
- `ContractTemplate.canonicalHash String?` and `StandardClause.canonicalHash String?` are nullable, yet the legal-safety CHECK constraints and `isExecutable` gating are built around canonical hashing. An unhashed template row is representable.
- `AnalyticsEvent.eventKey String? @unique` — a nullable unique column. In Postgres multiple `NULL`s are allowed, so this only deduplicates events that supply a key; nothing enforces that they do.
- `User.role`, `Workspace.plan`, and roughly 40 other status/enum-like columns are `String` with a comment listing valid values. Only `KnowledgeReviewStatus` is a real Prisma enum. Typos are accepted by the database.

### 3.6 Multi-tenancy

34 of 61 models carry `workspaceId`, and 33 of those lead an index with it (`BrandProfile` is the exception, §3.2).

**Models with no tenant scope, and whether that is defensible:**

| Model | Scope | Assessment |
|---|---|---|
| `User`, `UserSession`, `VerificationToken`, `RecoveryToken` | global | correct — a user can belong to several workspaces via `WorkspaceMember` |
| `AIProviderConfig`, `EnvSetting`, `SubscriptionPlan` | global | acceptable for a single-operator deployment; blocks per-tenant provider keys |
| `PaymentWebhookEvent` | global | correct — a provider-side receipt log |
| **`AuditLog`** | **global** | **problem.** `resource`/`resourceId` are free strings, so there is no way to scope an audit query to a workspace without joining through every resource type. A workspace admin cannot be shown their own audit trail, and a tenant-scoped export/erasure cannot find the relevant rows. |
| **`Subscription`, `BillingRecord`, `PaymentCheckout`** | **per `userId`** | **problem.** Billing is attached to a user, not a workspace, while quota enforcement is workspace-shaped (`SubscriptionPlan.maxWorkspaces`, `maxSeats`). `MyFatoorahRecurringProfile` and `RecurringCheckoutIntent` *do* carry `workspaceId`, so the newer recurring path and the older checkout path disagree about who owns a subscription. |
| `NotificationDismissal` | per `userId` | correct |
| `ProposalVersion`, `ProposalReview`, `ContractObligationState`, `DocumentVersion`, `TenderRequirement`, `ComplianceCheck`, `ApprovalStep`, `CopilotMessage`, `GeneratedContractVersion`, `ContractTemplateVersion`, `TemplateMarketplaceRating` | inherit via parent | acceptable, but every tenant check must traverse the parent — a missed join is a cross-tenant read. `property-22-tenant-isolation.test.ts` tests this at the service layer only. |

### 3.7 JSON columns

Six models, twelve columns:

| Model | Columns |
|---|---|
| `GeneratedProposal` | `structuredSnapshot Json?`, `contractRenderSnapshot Json?` |
| `ProposalBuilderSection` | `titleJson Json`, `contentJson Json`, `metadataJson Json?`, `validationJson Json?` |
| `TemplateMarketplaceEntry` | `nameJson Json`, `descriptionJson Json`, `sectionTypes Json`, `previewJson Json?`, `tags Json?` |
| `CollaborationComment` | `mentions Json?` |
| `AnalyticsEvent` | `metadataJson Json?` |
| `NotificationDelivery` | `payloadJson Json?` |

Plus ~25 `String`-typed `*Json` columns holding stringified JSON (`agentStates`, `configJson`, `finalArtifact`, `artifactsJson`, `financialFormsJson`, `sectionsJson`, `variablesJson`, `clausesJson`, `provenanceJson`, `embeddingJson`, `classificationJson`, `partsJson`, `modelsCacheJson`, `featuresJson`, …).

**Validated on read:** the proposal snapshots are the good case — `proposal-snapshot-persistence.ts` and `proposal-snapshot-hydration.ts` parse through zod and carry a `structuredSnapshotHash` + `structuredSnapshotRevision`, so shape drift is detectable.

**Unvalidated — bare `as` casts on database output:**

```35:35:src/lib/marketplace-template-resolve.ts
  const name = row.nameJson as LocalizedString | null;
```
```127:127:src/app/api/analytics/proposals/route.ts
              (e.metadataJson as { exportFormat?: string } | null)?.exportFormat ??
```
```156:156:src/app/api/analytics/proposals/route.ts
              (e.metadataJson as { sectionType?: string } | null)?.sectionType ??
```
```56:63:src/app/api/templates/marketplace/[id]/route.ts
        name: row.nameJson as { ar: string; en: string },
            ? (row.previewJson as Record<string, unknown>)
```
```119:126:src/app/api/templates/marketplace/route.ts
        name: t.nameJson as { ar: string; en: string },
            ? (t.previewJson as Record<string, unknown>)
```

If a marketplace row is written with `nameJson` missing `ar`, the marketplace list and detail routes render `undefined` into the UI with no error. `metadataJson` is written by `analytics-collector.ts` under a closed vocabulary, but the read side trusts it without checking.

### 3.8 Migration story

**Real migrations, and they look production-grade.** 20 directories under `prisma/migrations/`, `migration_lock.toml` pinned to `postgresql`, plus 4 archived SQLite migrations in `prisma/migrations_sqlite_archive/` (correctly excluded from the active folder). `src/lib/migration-registry.ts` lists exactly the same 20 names — verified in sync, zero drift in either direction. `src/lib/migration-runbook.ts` generates the ledger block in `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`, and `scripts/check-deployment-safety.mjs:315` fails the gate if the committed runbook does not match the registry.

**Safety on a live shared database:**

- No `DROP TABLE`, no `DROP COLUMN`, no `TRUNCATE`, no `DELETE FROM` anywhere.
- The only `DROP CONSTRAINT` statements are 12 `DROP CONSTRAINT IF EXISTS` immediately followed by `ADD CONSTRAINT` (FK re-declaration in `20260725_phase4_proposal_system` and `20260724180000_production_persistence`). Safe, though it briefly drops referential integrity inside the transaction.
- No `SET NOT NULL` on an existing column.
- Heavy use of `IF NOT EXISTS` on later migrations — they are re-runnable.

**Two genuine hazards:**

1. **21 `CREATE UNIQUE INDEX` statements without `IF NOT EXISTS`.** Most are in the baseline (`20260722140000_postgres_baseline`, 17 of them) where the table is brand new, so they are fine. But four are added to **pre-existing populated tables**: `DocumentVersion_documentId_version_checksum_key` (`20260725001000:5`), `ContractTemplate_workspaceId_catalogKey_key` (`20260725003000:11`), `GeneratedContract_workspaceId_clientRequestId_key` (`20260725003000:41`), and `ContractTemplateVersion_templateId_version_key` / `_id_templateId_key` (`20260724214500:34,36`). Each will abort the whole migration if the live table already contains a duplicate.
2. **Zero `CREATE INDEX CONCURRENTLY`.** All 51 baseline indexes plus ~37 later ones take an `ACCESS EXCLUSIVE`-blocking `SHARE` lock for the duration of the build. Against an empty database that is instant; against a populated shared Neon database, every index build blocks writes on that table. `20260726000000_platform_completion` alone (1,199 lines) creates dozens of indexes on tables that already hold data.

**Positive:** `scripts/check-deployment-safety.mjs:47-48` defines a `databaseMutationPattern` covering `prisma migrate deploy|dev|reset|resolve`, `prisma db push|reset|execute`, and the `db:*` script aliases, then walks `build`, `build:vercel`, `build:standalone`, `dev`, `dev:log`, `dev:setup`, `dev:clean`, `start`, `start:standalone` **transitively through `bun/npm/pnpm/yarn run` indirection** (`resolveScriptCommands`, line 89) to prove none of them issues DDL. It also asserts `vercel.json.buildCommand` is clean. That is a genuinely strong guarantee that deploying cannot silently mutate the shared schema.

---

## 4. Build / ops / deploy review

### 4.1 `package.json` scripts

| Script | What it does | Assessment |
|---|---|---|
| `dev` | `db:ensure && next dev -p 3000` | safe (`db:ensure` only `mkdir`/`touch`) |
| `dev:log` / `dev:clean` / `dev:setup` | dev variants | safe |
| `build` | `node scripts/ensure-extension-packed.mjs && prisma generate && next build && node scripts/check-bilingual-font-traces.mjs` | safe; `prisma generate` does not touch the DB |
| `build:schema-sql` | `node scripts/embed-schema-sql.mjs` | **never run by anything** — see defect #6 |
| `build:vercel` | `bun run build` | fine |
| `build:standalone` | `STANDALONE=1` build + copies static/public | fine |
| `deploy:safety` | `bun scripts/check-deployment-safety.mjs` | strong gate, **not in CI** (defect #7) |
| `deploy:check` | `deploy:safety && lint && test && build` | the full gate; manual only |
| `test` | two sequential `bun test` runs with the preload | correct |
| `test:completion` / `test:completion:db` | subset + guarded DB variant | correct |
| `test:e2e:completion` | `playwright test --config playwright.completion.config.ts` | requires a hand-started dev server; **not in CI**; triggers defect #2 |
| `test:pdf`, `test:bilingual*`, `benchmark:bilingual` | Chromium-gated suites | fine |
| `update:bilingual:visual-baseline` | regenerates visual baselines | fine (guarded against CI by `bilingual-visual.test.ts:23`) |
| `quality:documents` | `bun scripts/check-document-quality.ts` | runs in CI |
| `seed:clauses` | `bun run src/lib/seeds/seed-clauses.ts` | **writes to whatever `DATABASE_URL` points at** — no isolation guard (defect #10) |
| `db:push`, `db:push:dev` | `prisma db push` | **destructive on a shared DB**; present but only reachable manually |
| `db:migrate` | `prisma migrate dev` | **can reset the DB** if drift is detected |
| `db:reset` | `prisma migrate reset` | **drops and recreates everything** |
| `db:migrate:deploy` | `prisma migrate deploy` | the correct production path |
| `db:ensure`, `db:generate`, `db:studio` | safe |
| `postinstall` | `prisma generate` | fine |
| `pack:extension`, `samples:docs`, `samples:bilingual`, `setup:pdf`, `setup:bilingual:browsers` | tooling | fine |

Two commands appear in documentation but not in `package.json`: `bun run test:e` and `bun run update:bilingual:visual` (both look like truncated references to the real `test:e2e:completion` and `update:bilingual:visual-baseline`).

Three scripts in `scripts/` are orphans — no package script, no CI step, no Kiro hook references them: `scripts/ensure-devtest.ts`, `scripts/scan-integrity.ts`, `scripts/sync-migration-runbook.mjs`.

### 4.2 `next.config.ts`

**Good:**
- `typescript: { ignoreBuildErrors: false }` (line 33) — type errors fail the build. There is **no** `eslint.ignoreDuringBuilds`, so Next's build-time lint also runs.
- `reactStrictMode: true`.
- No `images.remotePatterns` at all — nothing configured means nothing over-permissive.
- `serverExternalPackages` correctly keeps Playwright/Chromium out of the bundle.
- `outputFileTracingIncludes` pins 20 font files into the three PDF-producing routes, and `scripts/check-bilingual-font-traces.mjs` verifies the resulting `.nft.json` manifests post-build. This is a real, enforced guarantee.

**Security headers (lines 59–85):** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (with a comment justifying SAMEORIGIN over DENY for same-origin PDF preview iframes), `X-XSS-Protection: 0` (correct — the legacy filter is a liability), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, and HSTS `max-age=63072000; includeSubDomains; preload` gated on `process.env.VERCEL`.

**Missing: no Content-Security-Policy.** Neither `next.config.ts` nor `vercel.json` sets one, and there is no `middleware.ts` adding it. For an app that renders user-authored markdown (`react-markdown`), user-supplied contract HTML (`GeneratedContract.contentHtml`), and an MDX editor (`@mdxeditor/editor`), the absence of even a report-only CSP is the most significant header gap. `X-Frame-Options: SAMEORIGIN` also has no `frame-ancestors` counterpart, so modern browsers that prefer CSP have no directive to honour.

### 4.3 `eslint.config.mjs`

Extends `eslint-config-next/core-web-vitals` and `/typescript`, then **disables 25 rules**. The ones that matter:

| Rule | Line | Why it matters here |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 12 | with `noImplicitAny: false` in tsconfig, `any` is unflagged in both tools |
| `@typescript-eslint/no-unused-vars` + `no-unused-vars` | 13, 34 | dead code and forgotten imports accumulate silently |
| `react-hooks/exhaustive-deps` | 20 | stale-closure bugs in a React 19 app with heavy Zustand + TanStack Query use |
| `react-hooks/set-state-in-effect` | 22 | render loops |
| `react-hooks/purity`, `react-compiler/react-compiler` | 21, 26 | React Compiler correctness checks disabled |
| `no-fallthrough` | 40 | switch fallthrough in an app with ~40 string-enum status machines |
| `no-undef` | 43 | undefined identifiers |
| `no-unreachable` | 44 | dead branches |
| `no-redeclare` | 42 | |
| `prefer-const` | 33 | |
| `@typescript-eslint/ban-ts-comment` | 15 | `@ts-ignore` is unrestricted |
| `@typescript-eslint/no-non-null-assertion` | 14 | `!` everywhere, including on `.find()` results |

With `no-undef`, `no-unreachable`, `no-fallthrough`, and `exhaustive-deps` all off, `bun run lint` is close to a formatting check. The real type safety comes from `tsc` via `next build` — but that excludes the tests (§4.6).

### 4.4 `vercel.json`

```json
"framework": "nextjs", "buildCommand": "bun run build", "installCommand": "bun install"
```

**Headers:** duplicates four of the six `next.config.ts` headers. It does **not** duplicate HSTS (which `next.config.ts` adds under `process.env.VERCEL`) or `X-XSS-Protection`. Maintaining the same header set in two places is a drift hazard.

**Functions:** no `functions` block — no per-route `memory` or `maxDuration`. The cron routes set `export const maxDuration = 60` in code (all four verified), which Next translates into the function config, so this is covered for crons but nothing else. The PDF routes, which spawn Chromium, have no explicit memory allocation.

**Regions:** none specified. For a Saudi/Gulf product with a Neon database and marketing copy about data residency (`marketing-residency-claims.test.ts` exists precisely to police those claims), leaving the function region to Vercel's default is worth an explicit decision.

**Rewrites/redirects:** none.

**Crons — cross-check:**

| `vercel.json` path | Schedule | Route exists? |
|---|---|---|
| `/api/cron/billing-reconcile` | `15 5 * * *` | yes |
| `/api/cron/expiry-notifications` | `0 6 * * *` | yes |
| `/api/cron/notification-dispatch` | `30 5 * * *` | yes |
| — | — | **`/api/cron/analytics-retention` exists on disk with no cron entry** |

All four routes call `authorizeCron(req)` on their first line and set `dynamic = "force-dynamic"` + `maxDuration = 60`. The orphan is defect #5.

`notification-dispatch` running once daily is worth flagging: `notification-service.ts:279` sets `deliveryDeadlineAt` to `now + 30 minutes` and the comment describes "retries up to 3 times within 30 minutes", but the dispatcher that performs those retries only wakes once every 24 hours. Commit `c1be09a` ("fix(deploy): use daily Vercel schedule for notification-dispatch") suggests this was a deliberate downgrade, presumably to fit a Hobby-plan cron limit — but the code's own deadline logic now cannot be satisfied.

### 4.5 CI (`.github/`)

**There is exactly one workflow, `document-quality.yml`, and it is genuinely meaningful** — a pleasant surprise given the filename. Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`. Four jobs:

1. **`phase-two`** (15 min) — `bun run quality:documents`, uploads `coverage/documents/lcov.info`.
2. **`application`** (25 min) — `bun audit --prod`, `bunx prisma validate` against a throwaway `DATABASE_URL`, `bun run lint`, `bun run test` (with `CI=1 PLAYWRIGHT_CHROMIUM=0 TZ=UTC`), `bun run build`.
3. **`live-document-rendering`** (25 min) — installs Chromium, runs the 7 Chromium-gated suites with `PLAYWRIGHT_CHROMIUM=1`, uploads visual diagnostics on failure.
4. **`browser-matrix`** (20 min) — Chromium + Firefox + WebKit via `bun run test:bilingual:browsers`.

So lint, the full offline test suite, and a production build **are** enforced on every PR, plus a dependency audit and Prisma schema validation. That is a solid gate.

**What is missing:**
- **No `bun run deploy:safety`.** The strongest gate in the repository — tracked/historical `.env` detection, embedded-credential scanning, DDL-in-scripts detection, runbook↔registry sync — runs only when someone types `bun run deploy:check` locally. It is also environment-dependent (it requires `REDIS_URL`, `BLOB_READ_WRITE_TOKEN`, and a ≥16-char `CRON_SECRET` to be present), which is presumably why it was left out.
- **No standalone typecheck.** `next build` typechecks application code, but `tsconfig.json` excludes the tests (§4.6), so 47,718 LOC of test code is never type-checked by any job.
- **No e2e job.** `test:e2e:completion` is never invoked in CI.
- **No `bunx prisma migrate diff`** comparing `schema.prisma` against the migration folder. `prisma validate` only checks that the schema parses.
- **Node is never pinned.** Only `oven-sh/setup-bun@v2` is used; `package.json` declares `engines.node: 22.x` but no job honours it. `bun run build` shells out to `node scripts/*.mjs`, and `scripts/check-bilingual-font-traces.mjs:93` gates its entire body on `import.meta.main`, which does not exist in Node ≤ 22.17. On the runner's current Node this works; on an older Node the font-trace gate silently no-ops and the build still exits 0.
- **No concurrency group on three of four jobs.** Only `phase-two` is covered by the `concurrency` block at the workflow level — actually the block is workflow-scoped, so this is fine.

### 4.6 `tsconfig.json`

```39:47:tsconfig.json
  "exclude": [
    "node_modules",
    "examples",
    "extensions",
    "src/lib/__tests__",
    "src/lib/__tests-isolated",
    "e2e",
    "playwright.completion.config.ts"
  ]
```

All 47,718 LOC of test code, all 14 e2e files, and the Playwright config are excluded from type checking. Combined with `@typescript-eslint/no-unused-vars: off` and `no-undef: off` in ESLint, **nothing type-checks the test suite.** A test can reference a renamed export or pass a wrong-shaped fixture and only fail at runtime — or, if the assertion path never reaches it, not at all.

Also `"noImplicitAny": false` (line 13) partially defeats `"strict": true` (line 11).

### 4.7 `scripts/**`

| Script | LOC | Purpose | Works? | Destructive? |
|---|---:|---|---|---|
| `check-deployment-safety.mjs` | 349 | tracked/historical `.env` detection, embedded-credential scan, DDL-in-scripts detection (transitive), `vercel.json` buildCommand check, Redis/Blob/cron env presence, runbook↔registry sync | **Yes** — logic is sound and `deployment-safety.test.ts` exercises its exports. Two blind spots: it scans only a hardcoded 3-path `credentialRiskPaths` allowlist (defect #3) and only `.env*` filenames, so `db/custom.db` is invisible (defect #4). | no |
| `ensure-extension-packed.mjs` | 36 | reuse or build `public/downloads/arabclue-agent.zip` before `next build` | **Yes.** Pure Node (`existsSync` + `spawnSync`), no Bun-only API. Falls back to `bun scripts/pack-extension.mjs` and propagates a non-zero exit. | no |
| `check-bilingual-font-traces.mjs` | 102 | assert 20 font `.woff2` files appear in three route `.nft.json` manifests after build | **Yes on Node ≥ 22.18** (verified: local Node v22.22.3 reports `import.meta.main === true`). The `if (import.meta.main)` guard at line 93 means it silently exits 0 on any older Node. CI does not pin Node. | no |
| `embed-schema-sql.mjs` | 19 | concatenate all `prisma/migrations/*/migration.sql` into `src/lib/schema-sql.ts` | **Yes, but the committed output is 3.3× stale and its product is dead code** (defect #6) | no |
| `check-document-quality.ts` | 433 | document-generation coverage gate; emits `coverage/documents/lcov.info` | runs in CI `phase-two` | no |
| `generate-sample-documents.mjs` | 647 | sample artifact generation | manual | writes to disk only |
| `generate-bilingual-qa-artifact.ts` | 190 | bilingual QA artifact | manual | writes to disk only |
| `run-bilingual-browser-matrix.ts` | 107 | drives the 3-engine matrix | runs in CI `browser-matrix` | no |
| `pack-extension.mjs` | 9 | thin wrapper over `packExtensionZipToPublic()` | yes | no |
| `predeploy-build-gate.mjs` | 185 | Kiro `PreToolUse` hook — detects a deploy command and runs `bun run build` first, exit 2 to block | yes; well-written (`PREDEPLOY_GATE_DRYRUN=1` for testing, no hardcoded paths) | no |
| `sync-migration-runbook.mjs` | 56 | regenerate/validate the runbook ledger | yes; `--write` edits `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` only | docs only |
| `scan-integrity.ts` | 98 | production-integrity scanner runner | **No — `#!/usr/bin/env tsx` but `tsx` is not a dependency, and no script/CI/hook invokes it** (defect #8) | no |
| `ensure-devtest.ts` | 94 | create a local `@arabclue.local` test writer account | **Yes and it is the security model done right** — refuses `NODE_ENV=production`, refuses `VERCEL`, requires `ALLOW_LOCAL_DEV_ACCOUNT=yes`, requires a `localhost/127.0.0.1/::1` database host, takes the password from `DEVTEST_PASSWORD` (≥16 chars) rather than hardcoding it, and creates a `BIDDER` with `mustChangePassword: true` — never an admin. Orphaned (no package script). | writes one user to a **local-only** DB |

`scripts/ensure-devtest.ts` is worth highlighting as the correct pattern, because `e2e/completion/global-setup.ts` does the same job with none of these protections (defect #2).

### 4.8 Secrets hygiene

**Gitignore coverage is correct.** `.gitignore:33-35` `.env*` with `!.env.example`, plus `.env.admin`, `admin-credentials.json`, `*.pem`, `/db/*.db`, `prisma/template.db`. `.vercelignore` mirrors it. No `.env*` file other than `.env.example` is tracked, and `check-deployment-safety.mjs:179-190` additionally scans `git rev-list --objects --all` for `.env*` in history.

**Two real findings** (values never printed):

1. **`db/custom.db` — a 360 KB SQLite database is tracked in Git.** `git ls-files --error-unmatch db/custom.db` succeeds; three commits touch it (`b0aea0b`, `952b141`, `08d413f`). The `.gitignore` rule `/db/*.db` was added after the file was already tracked, so it has no effect. Contents (structure and row counts only): `User` = 2 rows with columns `passwordHash`, `mfaSecret`; `EnvSetting` = 15 rows with columns `key`, `valueEncrypted`, `isSecret`; `AIProviderConfig` = 5 rows with `apiBase`, `provider`, `modelId`; plus `Workspace`, `WorkspaceMember`, `Subscription`, and 13 `AuditLog` rows. `EnvSetting.valueEncrypted` is AES-256-GCM ciphertext, so exposure depends on `ARABCLUE_ENC_KEY` — but two real password hashes and two MFA secret slots are in the clear structurally.

2. **`e2e/completion/global-setup.ts:9-10` — a plaintext SUPER_ADMIN credential.**
   ```9:10:e2e/completion/global-setup.ts
   const EMAIL = "<REDACTED>@<reserved-dev-domain>";
   const PASSWORD = "<REDACTED-PASSWORD>";
   ```
   The same address is repeated at `e2e/completion/support/locale.ts:84`.

Everything else the sweep surfaced is legitimate test fixture data: `cron-auth.test.ts:5` `"super-secret-cron-value-0123"`, `production-readiness.test.ts:20-22` `"blob-token"` / `"0123456789abcdef"`, the `credential-recovery.test.ts` password strings, and `api-failure-mapper.test.ts:309`, which deliberately embeds a fake `sk-…` token and a fake Postgres DSN as *input* to prove the redaction logic strips them. None of these are real credentials.

`docs/PRE_PRODUCTION_SECURITY_TASKS.md:40` already records "Test accounts with `@arabclue.local` domain exposed" as a known risk, and line 91 asserts "Embedded credentials are test-only `@arabclue.local` identities" — accurate as far as it goes, but it does not mention that `global-setup.ts` writes that identity into the live database.

---

## 5. Gaps and defects

### Critical

**1. `NotificationDelivery` unique constraint makes multi-channel delivery impossible — every transactional notification with email enabled throws P2002 on the second insert.**
*Category: schema.* `prisma/schema.prisma:1632`

```1632:1633:prisma/schema.prisma
  @@unique([eventId, recipientId])
  @@unique([eventId, recipientId, channel])
```

The 2-column key subsumes the 3-column key and permits at most one delivery row per `(eventId, recipientId)`. But `sendTransactionalNotification` writes two rows for the same pair:

```189:196:src/lib/notification-service.ts
        await db.notificationDelivery.create({
          data: {
            eventId: input.eventId,
            recipientId: recipient.userId,
            channel: "in_app",
            status: "SENT",
          },
        });
```
then, for the same `eventId` and `recipient.userId`:
```280:286:src/lib/notification-service.ts
      await db.notificationDelivery.create({
        data: {
          eventId: input.eventId,
          recipientId: recipient.userId,
          channel: "email",
          status: "PENDING",
```

Every read path uses the 3-column compound key (`eventId_recipientId_channel` at lines 147, 208, 239), confirming the 3-column constraint is the intended design. **This is live in the deployed database** — `prisma/migrations/20260726000000_platform_completion/migration.sql:484-485` creates `NotificationDelivery_eventId_recipientId_key` on `("eventId","recipientId")`.

The collision is **unconditional**. Both email branches insert a row for the same `(eventId, recipientId)` already claimed by the `in_app` insert: the unconfigured path writes `status: "SKIPPED"` at line 256, and the configured path writes `status: "PENDING"` at line 280. There is no branch in which the email row is skipped entirely. Result: on any real database, the in-app row lands first and **the email insert always throws P2002** — so no email notification is ever queued, and the unhandled rejection propagates out of `sendTransactionalNotification` to whatever called it (invitations, approvals, expiry alerts).

*Why the tests miss it:* the fake in `src/lib/__tests-isolated/notification-delivery.test.ts` keys its store only on `where.eventId_recipientId_channel` (lines 96, 150) and models no 2-column uniqueness, so all 12 tests pass against a database shape that does not exist.

*Fix:* drop `@@unique([eventId, recipientId])` from `schema.prisma:1632` and add a migration `DROP INDEX IF EXISTS "NotificationDelivery_eventId_recipientId_key";`. Then extend the fake to enforce every unique key declared on the model, or add a `test:completion:db` case that inserts both channels.

**2. Playwright global setup writes a hardcoded plaintext SUPER_ADMIN password into whatever database `DATABASE_URL` names — including shared Neon.**
*Category: security.* `e2e/completion/global-setup.ts:9`

```9:10:e2e/completion/global-setup.ts
const EMAIL = "<REDACTED>@<reserved-dev-domain>";
const PASSWORD = "<REDACTED-PASSWORD>";
```

It then runs `db.user.upsert` (line 14) with `role: "SUPER_ADMIN"`, `active: true`, `mustChangePassword: false`, `mfaEnabled: false`, and makes that user `OWNER` of `default-workspace` (line 39). There is **no** database-host guard, no `NODE_ENV` check, and no `VERCEL` check — unlike `scripts/ensure-devtest.ts:15-37`, which enforces all three. `playwright.completion.config.ts:13` wires it as `globalSetup`, so `bun run test:e2e:completion` with a normal `.env` provisions a known-password super-admin on the shared database. The file's own doc comment acknowledges this: *"Shared Neon + production deploys can deactivate @arabclue.local identities; this restores the AGENTS.md account before the suite runs."*

This violates `AGENTS.md` on two counts: "Never store login credentials in this file, source code, documentation, or Git history" and "Development test accounts must be supplied through an approved local secret source and must never be created in a shared or production database."

*Fix:* replace the constants with `process.env.E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, and gate the whole setup behind `requireIsolatedTestDatabase(process.env)` — the guard already exists and is already re-exported at `e2e/completion/support/test-database.ts:11`. Then rotate that password anywhere it has been used.

**3. The deployment-safety credential scanner uses a 3-path allowlist and therefore does not scan the file that actually contains a credential.**
*Category: security / ci-cd.* `scripts/check-deployment-safety.mjs:73`

```73:77:scripts/check-deployment-safety.mjs
const credentialRiskPaths = [
  "AGENTS.md",
  "scripts/ensure-devtest.ts",
  "DEPLOY_ARABCLUE_COM.md",
];
```

`embeddedDevelopmentIdentityPattern` (line 71) is `/[A-Z0-9._%+-]+@arabclue\.local/iu` and would match `e2e/completion/global-setup.ts:9` immediately — but that path is not in the list, so the gate passes while defect #2 sits in the tree. An allowlist is the wrong shape for a credential scanner.

*Fix:* scan all of `git ls-files` (excluding `src/lib/__tests__/**`, which legitimately contains `@arabclue.local` fixtures) rather than three named paths, and add a rule for password-shaped literal assignments outside test directories.

### High

**4. A 360 KB SQLite database containing real password hashes and 15 encrypted secret rows is tracked in Git, and the safety gate cannot see it.**
*Category: security.* `db/custom.db` (binary; tracked, confirmed via `git ls-files --error-unmatch`)

`.gitignore:60` `/db/*.db` has no effect because the file was committed before the rule existed. Structure: `User` (2 rows; `passwordHash`, `mfaSecret` columns), `EnvSetting` (15 rows; `valueEncrypted`, `isSecret`), `AIProviderConfig` (5 rows), `AuditLog` (13 rows), plus `Workspace`/`WorkspaceMember`/`Subscription`. `check-deployment-safety.mjs:34-37` only recognises files whose basename starts with `.env`, so no gate flags this.

*Fix:* `git rm --cached db/custom.db`, purge it from history (`git filter-repo`), rotate `ARABCLUE_ENC_KEY` and every credential in `EnvSetting`, force-reset both user passwords, and extend `isSensitiveEnvironmentFile` to also reject `*.db`, `*.sqlite`, `*.sqlite3`, and `admin-credentials.json`.

**5. `/api/cron/analytics-retention` exists and is authenticated but is never scheduled — analytics data is retained indefinitely.**
*Category: ops.* `vercel.json:16` (crons array) vs `src/app/api/cron/analytics-retention/route.ts`

```16:29:vercel.json
  "crons": [
    { "path": "/api/cron/billing-reconcile",     "schedule": "15 5 * * *" },
    { "path": "/api/cron/expiry-notifications",  "schedule": "0 6 * * *"  },
    { "path": "/api/cron/notification-dispatch", "schedule": "30 5 * * *" }
  ]
```

The route is fully implemented (`authorizeCron` on line 14, `maxDuration = 60`, and `src/lib/__tests__/analytics-retention.test.ts` covers the retention SQL window with 6 tests), it is simply not wired. `AnalyticsEvent` grows without bound, which is both a cost issue and a PDPL data-minimisation issue, and it silently invalidates the retention behaviour those 6 tests assert.

*Fix:* add `{ "path": "/api/cron/analytics-retention", "schedule": "45 4 * * *" }`. Add a test asserting the `vercel.json` cron set equals the set of directories under `src/app/api/cron/` — the repo already has the config-lint idiom for this.

**6. `src/lib/schema-sql.ts` is 3.3× stale (missing 13 of 20 migrations, including the 1,199-line platform-completion migration) and nothing regenerates or consumes it.**
*Category: maintainability.* `src/lib/schema-sql.ts:1`

```1:1:src/lib/schema-sql.ts
/** Auto-generated from prisma/migrations — run: bun run build:schema-sql */
```

Regenerating produces 147,694 bytes against the committed 44,415. The first divergence is at byte 44,410, immediately after the `provider_multi_engines` backfill — so everything from `20260724161123_contract_templates` onward is absent, including the entire platform-completion migration that creates 30+ tables. `build:schema-sql` is not called by `build`, CI, or any hook, and grepping `src/` and `scripts/` finds **no importer of `SCHEMA_SQL`** — it is dead code that reads as authoritative.

*Fix:* delete `src/lib/schema-sql.ts` and the `build:schema-sql` script. If a bundled schema is genuinely needed, generate it during `build` and add a CI check that the committed copy matches.

**7. The strongest safety gate in the repository never runs automatically.**
*Category: ci-cd.* `package.json:20`

```20:20:package.json
    "deploy:check": "bun run deploy:safety && bun run lint && bun run test && bun run build",
```

`.github/workflows/document-quality.yml` runs lint, test, and build, but not `deploy:safety`. That gate is the only thing checking for tracked/historical `.env` files, embedded credentials, DDL inside build/dev/start scripts, and runbook↔registry drift. It is skipped presumably because it hard-fails when `REDIS_URL`, `BLOB_READ_WRITE_TOKEN`, and `CRON_SECRET` are absent (lines 269-283) — but that is a solvable problem.

*Fix:* split `runDeploymentSafetyCheck()` into a repository-hygiene half (no env needed) and a runtime-env half; run the first on every PR and the second only in the deploy workflow.

**8. `scripts/scan-integrity.ts` cannot execute — it declares a `tsx` shebang, `tsx` is not a dependency, and nothing invokes it.**
*Category: ops.* `scripts/scan-integrity.ts:1`

```1:1:scripts/scan-integrity.ts
#!/usr/bin/env tsx
```

`tsx` does not appear anywhere in `package.json`. No package script, CI step, or Kiro hook references the file. Its doc comment presents it as the enforcement mechanism for "task 12.3 / Requirement 19.1–19.11" — stub detection, runtime-fixture detection, monetary-compute detection across the whole tree. The underlying library (`src/lib/production-integrity-scanner.ts`) *is* tested (`integrity-policy.test.ts`, 37 tests; `property-35`, 2 tests), but only against inline strings and the capability manifest. The full-tree scan the script exists to perform has never run.

*Fix:* change the shebang to `#!/usr/bin/env bun`, add `"scan:integrity": "bun scripts/scan-integrity.ts"`, and add it to the CI `application` job.

**9. No Content-Security-Policy anywhere, in an app that renders user-authored markdown and stored HTML.**
*Category: security.* `next.config.ts:59` / `vercel.json:5`

Both header blocks set `nosniff`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`; neither sets `Content-Security-Policy` or `frame-ancestors`. There is no `middleware.ts` supplying one. The app renders markdown via `react-markdown`, edits it via `@mdxeditor/editor`, and stores raw HTML in `GeneratedContract.contentHtml` (`prisma/schema.prisma:1364`) which is served back to users.

*Fix:* add a report-only CSP first (`default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'`), review the violation reports, then enforce. Define it in exactly one place — the duplicated header lists in `next.config.ts` and `vercel.json` will otherwise drift.

**10. `seed:clauses` writes to whatever `DATABASE_URL` points at, with no isolation guard.**
*Category: ops.* `package.json:39`

```39:39:package.json
    "seed:clauses": "bun run src/lib/seeds/seed-clauses.ts",
```

Every other database-touching entry point in the repo is guarded — `check-deployment-safety.mjs` proves build/dev/start issue no DDL, `completion-test-preload.ts` redirects `DATABASE_URL` to an unreachable host, and `ensure-devtest.ts` refuses non-localhost. `seed:clauses` has none of that, and `AGENTS.md` explicitly warns the local env points at shared Neon.

*Fix:* add the same `requireLocalDatabase`-style host check used in `ensure-devtest.ts:15`, or route it through `requireIsolatedTestDatabase`.

### Medium

**11. `tsconfig.json` excludes all 47,718 LOC of test code from type checking, and ESLint has `no-unused-vars`/`no-undef` disabled.**
*Category: build.* `tsconfig.json:43`

```43:46:tsconfig.json
    "src/lib/__tests__",
    "src/lib/__tests-isolated",
    "e2e",
    "playwright.completion.config.ts"
```

`next.config.ts:33` sets `ignoreBuildErrors: false`, so application code is type-checked at build — but the exclusion means the tests are not, by any tool. A fixture that drifts from the type it claims to satisfy will not be caught. Also `"noImplicitAny": false` (line 13) undercuts `"strict": true`.

*Fix:* remove the four test exclusions (or add a `tsconfig.test.json` that includes them) and add `"typecheck": "tsc --noEmit"` to CI.

**12. `src/components/brand/__tests__/` is an empty directory, and even if populated `bun run test` would not run it.**
*Category: coverage.* `package.json:35`

The `test` script names only `src/lib/__tests-isolated` and `src/lib/__tests__`. `src/components/brand/__tests__/` exists on disk with zero files, and `git ls-files` returns nothing for it. The brand component tests actually live at `src/lib/__tests__/brand/arabclue-logo.test.tsx` (373 LOC, 34 tests), so nothing is lost today — but any test added to the component-adjacent directory will silently never run.

*Fix:* delete the empty directory, or change the test script to `bun test src` so location no longer determines execution.

**13. E2E tautology: an assertion that cannot fail.**
*Category: test-quality.* `e2e/completion/stateful-isolated.spec.ts:12`

```12:14:e2e/completion/stateful-isolated.spec.ts
  test("isolated database guard is active for stateful setup", async () => {
    expect(isolated).toBe(true);
  });
```

Skipped when `isolated` is false (line 7), and asserts `true === true` when it is not.

*Fix:* delete it. The `describe`-level `test.skip` already communicates the precondition.

**14. E2E weak assertion accepts the failure mode it is testing for.**
*Category: test-quality.* `e2e/completion/stateful-isolated.spec.ts:29`

```29:33:e2e/completion/stateful-isolated.spec.ts
    expect([200, 201, 409, 429]).toContain(response.status());
    const body = await response.json();
    if (response.ok()) {
      expect(body).toBeTruthy();
    }
```

A permanently rate-limited (`429`) or permanently conflicting (`409`) registration endpoint passes, and the body check is conditional. This is the *only* e2e test that exercises real server-side registration.

*Fix:* generate a guaranteed-unique email, assert `201`, and assert the response shape unconditionally.

**15. `MyFatoorahRecurringProfile` can exist with no amount at all.**
*Category: schema.* `prisma/schema.prisma:795`

```795:796:prisma/schema.prisma
  amount            Float? // Legacy compatibility only; exact literal is authoritative when present
  amountExact       String?
```

Both nullable, no CHECK requiring one. The schema header (lines 16–33) lists several CHECK constraints added in SQL, and `20260726000000_platform_completion` includes a "recurring value-literal" check — but nothing enforces `amount IS NOT NULL OR amountExact IS NOT NULL`. A float `amount` on a billing row is itself a rounding hazard, which is presumably why `amountExact String` was introduced.

*Fix:* add `CHECK ("amountExact" IS NOT NULL OR "amount" IS NOT NULL)`, then plan a backfill and make `amountExact` required.

**16. `contract-template-persistence-db.test.ts` uses no database.**
*Category: test-quality.* `src/lib/__tests__/contract-template-persistence-db.test.ts:49`

```49:52:src/lib/__tests__/contract-template-persistence-db.test.ts
function createFakeDatabase(): {
  readonly database: PrismaClient;
  readonly state: FakeState;
```

595 LOC whose `-db` suffix implies the guarded `test:completion:db` suite. It is a good test of the persistence logic — but the name suggests coverage that does not exist, and defect #1 is precisely the bug class that "fake typed as `PrismaClient`" hides.

*Fix:* rename to `contract-template-persistence-adapter.test.ts`.

**17. `notification-dispatch` runs once daily but the code sets a 30-minute delivery deadline and promises retries inside it.**
*Category: ops.* `src/lib/notification-service.ts:279` vs `vercel.json:26`

```277:280:src/lib/notification-service.ts
      // The /api/cron/notification-dispatch cron claims these rows, sends with a
      // 10-second provider timeout, and retries up to 3 times within 30 minutes.
      const deadlineAt = utcDeadline(30 * 60 * 1000);
```
against `{ "path": "/api/cron/notification-dispatch", "schedule": "30 5 * * *" }`. With one run per day, `deliveryDeadlineAt` is always long past by the time the dispatcher wakes, and no row can be retried three times within 30 minutes. Commit `c1be09a` made this schedule change deliberately, but the code's timing contract was not updated with it.

*Fix:* either move to a sub-hourly schedule (needs a paid Vercel plan) or an external scheduler, or widen `deliveryDeadlineAt` to match the actual cadence and correct the comment.

**18. `BrandProfile.workspaceId` is an unindexed foreign key queried by `findFirst` in three places.**
*Category: schema.* `prisma/schema.prisma:389`

`BrandProfile` (lines 389–405) declares no `@@index`. Query sites: `src/lib/onboarding.ts:40`, `src/lib/agents/orchestrator.ts:470`, `src/lib/proposal-snapshot-identity.ts:198` — all `findFirst({ where: { workspaceId } })`. It is the only workspace-scoped model with no index on the tenant column. Small today; a sequential scan per proposal render as workspaces grow.

*Fix:* add `@@index([workspaceId])`, or `workspaceId String @unique` if a workspace can only have one brand profile — which the `findFirst` usage implies.

**19. Every `*-prisma.ts` adapter is untested, including the recovery, invitation, and recurring-billing ones.**
*Category: coverage.* `src/lib/recurring-billing-prisma.ts` (708 LOC), `invitation-service-prisma.ts` (661), `account-service-prisma.ts` (325), `comment-lifecycle-prisma.ts` (291), `recovery-service-prisma.ts` (290), `knowledge-decision-prisma.ts` (235), `knowledge-queue-prisma.ts` (223), `clause-library-prisma.ts` (195)

The architecture deliberately separates pure logic from Prisma I/O, and the pure halves are covered exhaustively (`workspace-invitations.test.ts` is 1,142 LOC / 42 tests; `recurring-billing-state.test.ts` is 1,040 / 54). None of that touches the adapters, which are where the schema meets the code — and where defect #1 lives.

*Fix:* the `test:completion:db` harness and its isolated-database guard already exist. Add one adapter round-trip test per service under that flag and run it in CI against an ephemeral Postgres service container.

**20. The agent runtime — ~4,300 LOC including the orchestrator and every Copilot tool — has no direct test.**
*Category: coverage.* `src/lib/agents/platform/tools.ts` (1,651), `src/lib/agents/orchestrator.ts` (1,473), `src/lib/agents/agent-registry.ts` (637), `agent-config.ts` (170), `prompts.ts` (183), `decision-logger.ts` (166)

`platform/tools.ts` is the agent's entire write surface; `orchestrator.ts` drives run lifecycle, resume, cancel, and progress persistence. Individual agents (`compliance`, `drafting`, `ingestion`, `technical`, `law-contract`, `coverage`) are tested, but nothing tests the code that sequences them or the tools they call. `docs/AGENT_DECISION_LOGIC.md` documents thresholds that no test pins.

*Fix:* start with `agent-registry.ts` and `agent-config.ts` (pure, easy wins that pin documented thresholds), then add an orchestrator test with stubbed agents covering resume-after-failure and cancel.

**21. ESLint disables the rules that catch real bugs.**
*Category: maintainability.* `eslint.config.mjs:20`, `:34`, `:40`, `:43`, `:44`

```20:22:eslint.config.mjs
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "off",
```
plus `no-unused-vars` (34), `no-fallthrough` (40), `no-undef` (43), `no-unreachable` (44), `@typescript-eslint/no-explicit-any` (12). With `no-undef` and `no-unreachable` off, `bun run lint` in CI is close to a formatting check. `no-fallthrough` matters specifically here because the codebase models ~40 state machines as `String` columns with `switch` dispatch.

*Fix:* re-enable `no-undef`, `no-unreachable`, `no-fallthrough`, and `react-hooks/exhaustive-deps` (as `warn` to start), then burn down.

**22. `AuditLog` has no `workspaceId` and no immutability protection, despite being described as an immutable audit trail.**
*Category: schema.* `prisma/schema.prisma:851`

```849:851:prisma/schema.prisma
// ─── Immutable Audit Trail ───────────────────────────────────────────────────

model AuditLog {
```

No tenant column; `resource`/`resourceId` are free strings, so scoping an audit query to a workspace requires resolving every resource type. `userId` is `onDelete: SetNull`. Nothing at the DB level prevents `UPDATE` or `DELETE` — no revoked `UPDATE`/`DELETE` grant, no append-only trigger. Neither `resource` nor `resourceId` is indexed, so "show me everything that happened to proposal X" is a sequential scan.

*Fix:* add `workspaceId String?` with `@@index([workspaceId, createdAt])`, add `@@index([resource, resourceId])`, and revoke `UPDATE`/`DELETE` on the table from the application role.

**23. Billing is user-scoped while quotas and the newer recurring path are workspace-scoped.**
*Category: schema.* `prisma/schema.prisma:679`

```679:680:prisma/schema.prisma
  userId             String    @unique
  planId             String
```

`Subscription`, `BillingRecord`, and `PaymentCheckout` all key on `userId` with no `workspaceId`. But `SubscriptionPlan` defines `maxWorkspaces` (line 660) and `maxSeats` (line 663), and both `MyFatoorahRecurringProfile` (line 787) and `RecurringCheckoutIntent` (line 822) carry `workspaceId`. Two subsystems disagree about who owns a subscription. With `Subscription.userId @unique`, a user who belongs to two workspaces has one subscription covering both, and a workspace whose subscribing owner is removed has no subscription at all.

*Fix:* decide the billing unit explicitly. If it is the workspace, add `workspaceId` to `Subscription`/`BillingRecord`/`PaymentCheckout` and replace `userId @unique` with `@@unique([workspaceId])`.

### Low

**24. Four `CREATE UNIQUE INDEX` statements target already-populated tables without `IF NOT EXISTS` and will abort the migration on duplicate data.**
*Category: schema.* `prisma/migrations/20260725001000_knowledge_evidence_integrity/migration.sql:5`, `20260725003000_contract_draft_persistence/migration.sql:11` and `:41`, `20260724214500_contract_template_safety/migration.sql:34` and `:36`

```5:5:prisma/migrations/20260725001000_knowledge_evidence_integrity/migration.sql
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_checksum_key"
```

Unlike the 17 in the baseline (new tables) and the later ones that use `IF NOT EXISTS`, these add uniqueness to tables that already hold rows. They are already applied, so this is a note for future migrations rather than an open failure.

*Fix:* prefix future unique-index additions to live tables with a duplicate-detection query, and use `IF NOT EXISTS`.

**25. No `CREATE INDEX CONCURRENTLY` anywhere — every index build locks writes.**
*Category: schema.* `prisma/migrations/20260726000000_platform_completion/migration.sql` (dozens of index statements)

Zero occurrences of `CONCURRENTLY` across all 20 migrations. `20260726000000_platform_completion` (1,199 lines) builds dozens of indexes on tables that already have data, each taking a write-blocking lock. Fine at current scale; a real outage window later.

*Fix:* for future migrations on populated tables, split index creation into a separate migration using `CREATE INDEX CONCURRENTLY` (which requires running outside a transaction — Prisma needs `-- prisma+createIndexConcurrently` handling or a manual release step).

**26. `DocumentChunk.workspaceId`/`projectId` and `ExpiryNotificationLog.workspaceId` are indexed but have no foreign key.**
*Category: schema.* `prisma/schema.prisma:347`, `:1223`

```346:348:prisma/schema.prisma
  documentId    String
  workspaceId   String
  projectId     String?
```
`DocumentChunk` declares only `document UploadedDocument @relation(...)`. `ExpiryNotificationLog` (line 1221) declares no relation at all. Deleting a `TenderProject` leaves `DocumentChunk.projectId` dangling (the parent document's own `projectId` is `SetNull`, the chunk's copy is not), and expiry-log rows outlive their workspace with no cleanup path — `src/app/api/cron/expiry-notifications/route.ts` only reads (lines 43, 133) and inserts (lines 90, 175).

*Fix:* add proper relations with `Cascade` for `ExpiryNotificationLog.workspaceId` and `SetNull` for `DocumentChunk.projectId`.

**27. 13 required `User` relations default to `onDelete: Restrict`, making user deletion impossible and blocking PDPL erasure.**
*Category: schema.* `prisma/schema.prisma:208`, `:243`, `:480`, `:544`, `:1107`, `:1179`, `:1271`, `:1306`, `:1386`, `:1418`, `:1449`, `:1476`, `:1500`

```208:208:prisma/schema.prisma
  createdBy          User                @relation(fields: [createdById], references: [id])
```

No `onDelete` on a required relation means `Restrict`. Any user who has created a project, uploaded a document, generated a proposal, or emitted a single `AnalyticsEvent` can never be deleted. There is no anonymisation helper anywhere in `src/lib`.

*Fix:* document and implement an anonymisation path (rewrite `createdById` to a tombstone user, scrub PII on `User`, keep the row) and note it in `docs/SECURITY.md`.

**28. Three scripts are orphaned — no package script, no CI step, no hook.**
*Category: maintainability.* `scripts/ensure-devtest.ts`, `scripts/scan-integrity.ts`, `scripts/sync-migration-runbook.mjs`

`ensure-devtest.ts` (94 LOC) is the *correct* way to provision a dev account and is exactly what `global-setup.ts` should be using (defect #2). `sync-migration-runbook.mjs` (56 LOC) is what regenerates the ledger that `deploy:safety` validates — without a script entry, the `--write` path is undiscoverable. `scan-integrity.ts` additionally cannot run (defect #8).

*Fix:* add `"devtest:local"`, `"runbook:sync"`, and `"scan:integrity"` entries to `package.json`.

**29. Security headers are duplicated across `next.config.ts` and `vercel.json` with an existing divergence.**
*Category: ops.* `vercel.json:5` vs `next.config.ts:59`

`vercel.json` sets four headers; `next.config.ts` sets six (adding `X-XSS-Protection: 0` and conditional HSTS). Two sources of truth for the same policy, already out of sync.

*Fix:* keep one. `next.config.ts` is the better home since it can branch on `process.env.VERCEL`.

**30. `AIProviderConfig` has no constraint preventing two default providers for the same engine.**
*Category: schema.* `prisma/schema.prisma:593`

```592:594:prisma/schema.prisma
  isActive            Boolean   @default(false)
  isDefault           Boolean   @default(false)
  priority            Int       @default(0)
```

Nothing enforces at most one `isDefault: true` per `engine`. Selection then depends on `priority` ordering and, at ties, row order — non-deterministic provider choice.

*Fix:* add a partial unique index: `CREATE UNIQUE INDEX ON "AIProviderConfig"("engine") WHERE "isDefault";`

**31. Two documented commands do not exist in `package.json`.**
*Category: maintainability.* documentation under `docs/`

`bun run test:e` and `bun run update:bilingual:visual` appear in docs; the real scripts are `test:e2e:completion` (`package.json:38`) and `update:bilingual:visual-baseline` (`package.json:25`). Both look like truncated copies.

*Fix:* correct the doc references.

**32. Marketplace JSON columns are read with bare `as` casts and no runtime validation.**
*Category: maintainability.* `src/lib/marketplace-template-resolve.ts:35`, `src/app/api/templates/marketplace/route.ts:119`, `src/app/api/templates/marketplace/[id]/route.ts:56`, `src/app/api/analytics/proposals/route.ts:127` and `:156`

```35:35:src/lib/marketplace-template-resolve.ts
  const name = row.nameJson as LocalizedString | null;
```

`nameJson`, `descriptionJson`, `previewJson`, `sectionTypes`, and `tags` are `Json` with no shape enforcement. If a row is written with `nameJson` missing `ar`, both marketplace routes render `undefined` with no error. The proposal snapshots demonstrate the right pattern (zod-parsed with a hash and revision); the marketplace path does not follow it.

*Fix:* define zod schemas for these columns and parse on read, mirroring `proposal-snapshot-hydration.ts`.

---

## Needs verification (suspicions, not confirmed)

1. **`import.meta.main` in the CI build.** `scripts/check-bilingual-font-traces.mjs:93` gates its entire body on `import.meta.main`, which does not exist in Node < 22.18 / < 24.2. Local Node v22.22.3 returns `true`, so it works here. But `document-quality.yml` uses only `oven-sh/setup-bun@v2` — no `actions/setup-node`, no version pin — and `bun run build` shells out with `node`. If the runner ever provides an older Node, the font-trace gate silently no-ops and the build still exits 0. *Verify:* add `node -v` to the CI build step, or pin Node with `actions/setup-node`.

2. **Does `db/custom.db` contain live production credentials?** `EnvSetting.valueEncrypted` is AES-256-GCM ciphertext, so its exposure depends on whether `ARABCLUE_ENC_KEY` has ever been committed or shared. I did not decrypt anything. *Verify:* check whether `ARABCLUE_ENC_KEY` was ever in Git history or a shared channel; assume compromise and rotate regardless.

3. **`X-Frame-Options: SAMEORIGIN` and PDF preview.** The comment at `next.config.ts:65-66` says in-app previews iframe same-origin `/api/files` and download routes. I did not confirm the previews actually require framing rather than an object/embed or a blob URL. If they do not, `DENY` would be strictly safer.

4. **Does the `platform-completion` suite actually run all 672 tests?** The property tests use `completionPropertyOptions` with a ≥100-run floor, and `infrastructure.test.ts:53-58` asserts that floor. I did not run the suite, so I cannot confirm none of them silently degenerate to a trivial arbitrary. *Verify:* run `bun run test:completion` and compare the reported test count against 672.

5. **Cross-tenant reads in the 82 untested API routes.** `property-22-tenant-isolation.test.ts` proves isolation at the service layer, and the `*-prisma.ts` adapters are where the workspace filter is actually applied — and they are untested (defect #19). I did not read all 82 routes to confirm each applies a workspace filter. *Verify:* grep every `route.ts` for a `workspaceId` predicate on tenant-scoped models, or add a lint rule.

6. ~~Whether the `NotificationDelivery` bug is masked when email is unconfigured.~~ **Resolved — it is not.** `notification-service.ts:247-305` has three branches: `existingEmail` (no write), `!emailConfigured` (writes `status: "SKIPPED"` at line 256), and the queue path (writes `status: "PENDING"` at line 280). Both writing branches target the same `(eventId, recipientId)` the `in_app` insert already took, so the P2002 fires regardless of `RESEND_API_KEY`. Defect #1 is unconditional.

---

## What is genuinely strong here

Stating this plainly, because the defect list above is long and the balance matters:

- The **test-isolation architecture is excellent.** The preload strips 19 provider credentials, points `DATABASE_URL` at an unreachable port-1 loopback, and monkey-patches `fetch` to throw on any non-loopback host. `requireIsolatedTestDatabase` fails closed across seven distinct rejection codes and normalises Neon pooled/direct hostnames so the shared endpoint cannot be reached by aliasing. Splitting `mock.module` suites into `__tests-isolated/` because Bun's module mocks are process-global is a correct and well-reasoned decision.
- **1,992 tests, zero snapshots, zero `.only`, one justified conditional skip.** Roughly 40 fast-check property tests with a pinned seed and an enforced ≥100-run floor. Genuine tautologies: one.
- `check-deployment-safety.mjs` resolving package scripts **transitively** through `bun/npm/pnpm/yarn run` to prove no build/dev/start path issues DDL is a better guarantee than most production repositories have.
- The migration registry, the generated runbook ledger, and the gate that keeps them in sync are in perfect agreement — 20/20, no drift in either direction.
- `outputFileTracingIncludes` + a post-build `.nft.json` verification for 20 font files is a real, enforced deployment guarantee, not a comment.
- The `schema-guard` / `prisma-missing-table` pair turning a P2021 into a bilingual 503 that names the missing table *and its owning migration* is unusually thoughtful operational design.
- `scripts/ensure-devtest.ts` is a textbook example of how to gate a database-writing dev script. The problem is that `e2e/completion/global-setup.ts` does not follow it.
