# Gap Analysis

Maps master-prompt requirements to repository status after the production completion pass.

| Requirement | Status | Files | Defects fixed | Tests | Verification |
| --- | --- | --- | --- | --- | --- |
| §1.1 Evidence-first | Partial→Improved | `agents/*`, `validation-gate.ts` | Drafting no longer invents NORA/10%/PDPL mandate | `guardrails-pricing`, `validation-gate` | Unit tests |
| §1.2 No-pricing | Complete | `guardrails.ts`, `financial.ts`, download route | Export blocked on pricing language | `guardrails-pricing.test.ts` | 49 unit tests |
| §1.3 Regulatory precision | Complete | `procurement-rules.ts`, `compliance.ts`, `ingestion.ts` | Removed blanket penalty cap rewrite, 10% preference, PDPL 100% residency, invented NORA IDs | `core`, `production` | Unit tests |
| §3 Onboarding hub | Baseline | onboarding APIs/UI | — | onboarding readiness in agents | Manual/API |
| §3.2 Tender workspace | Baseline | documents, projects APIs | — | validation contracts | API |
| §4 AI workflow | Baseline | `orchestrator.ts` | — | cancel path exists | Code |
| §5 Agents 1–5 | Baseline+hardened | `agents/*` | Regulatory + financial precision | agent unit tests | Unit |
| §6 Data model | Extended | `schema.prisma` | Added webhook events + recurring profiles | migrate deploy | Migration |
| §7 APIs | Extended | `/api/admin/myfatoorah`, webhook | Webhook V2 + admin config | billing tests | Unit |
| §8 UI | Extended | admin MyFatoorah view | Payments panel | — | Code |
| §9.3 MyFatoorah | Hardened | `myfatoorah.ts`, billing, webhook | Allowlist, V2 sig, amount match, idempotency | `billing.test.ts` | Unit |
| §10 Export | Hardened | download route, generators | Validation gate; legal-safe copy | validation-gate tests | Unit |
| §11 Security | Hardened | MF allowlist, secrets write-only | SSRF URL reject; no secret reveal in MF admin GET | billing tests | Unit |
| §13 Tests | Expanded | `__tests__/*` | Updated for regulatory precision | 49 pass | `bun test` |

## Intentionally out of scope (documented)

- Direct Etimad portal submission
- Redis/Bull distributed queue (in-process agents retained)
- SSO / OIDC enterprise IdP
- Live sandbox payment without merchant credentials
