# Gap Analysis

Maps master-prompt requirements to repository status after the continued production pass.

| Requirement | Status | Files | Defects fixed | Tests | Verification |
| --- | --- | --- | --- | --- | --- |
| §1.1 Evidence-first | Improved | `agents/*`, `validation-gate.ts`, `knowledge-eligibility.ts` | Expired/unapproved knowledge excluded from RAG | `security-export` | Unit |
| §1.2 No-pricing | Complete | `guardrails.ts`, `financial.ts`, download route | Export blocked on pricing language | `guardrails-pricing` | 59 unit tests |
| §1.3 Regulatory precision | Complete | `procurement-rules.ts`, `compliance.ts`, `ingestion.ts` | No blanket legal universals | `core`, `production` | Unit |
| §3 Onboarding hub | Baseline | onboarding APIs/UI | Knowledge approval fields on certs/projects | — | Migration |
| §3.2 Tender workspace | Hardened | `safe-zip.ts`, documents API | ZIP-slip, allowlist, bomb limits | `security-export` | Unit |
| §4–5 AI workflow | Hardened | `orchestrator.ts` | Post-draft validation; approved corpus only | — | Code |
| §6 Data model | Extended | `schema.prisma` | Webhook events, recurring, knowledge eligibility columns | migrate deploy | Migration |
| §7 APIs | Extended | ready, reconcile, myfatoorah, webhook | Reconciliation + readiness | billing tests | Unit + build |
| §9.3 MyFatoorah | Hardened | `myfatoorah.ts`, billing | Allowlist, V2 sig, amount match, reconcile | `billing.test.ts` | Unit |
| §10 Export | Hardened | `export-manifest.ts`, generators | Manifest + validation + traceability reports | `security-export` | Unit |
| §11 Security | Hardened | safe-zip, MF allowlist | ZIP-slip, SSRF URL reject | security + billing tests | Unit |
| §12 Ops | Hardened | `/api/health`, `/api/ready` | Liveness vs readiness split | build routes | Build |
| §13 Tests | Expanded | `__tests__/*` | 59 tests | `bun test` | 59 pass |

## Intentionally out of scope (documented)

- Direct Etimad portal submission
- Redis/Bull distributed queue (in-process agents retained)
- SSO / OIDC enterprise IdP
- Live sandbox payment without merchant credentials
