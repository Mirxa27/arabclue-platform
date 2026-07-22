# Gap Analysis

Maps master-prompt requirements to repository status after the proposal document studio pass.

| Requirement | Status | Files | Defects fixed | Tests | Verification |
| --- | --- | --- | --- | --- | --- |
| §1.1 Evidence-first | Improved | `agents/*`, `validation-gate.ts`, `knowledge-eligibility.ts` | Expired/unapproved knowledge excluded from RAG | `security-export` | Unit |
| §1.2 No-pricing | Complete | `guardrails.ts`, `financial.ts`, download route | Export blocked on pricing language; human BoQ exempt | `guardrails-pricing`, `proposal-studio` | Unit |
| §1.3 Regulatory precision | Complete | `procurement-rules.ts`, `compliance.ts`, `ingestion.ts` | No blanket legal universals | `core`, `production` | Unit |
| §3 Onboarding hub | Baseline | onboarding APIs/UI | Knowledge approval fields on certs/projects | — | Migration |
| §3.2 Tender workspace | Hardened | `safe-zip.ts`, documents API | ZIP-slip, allowlist, bomb limits | `security-export` | Unit |
| §4–5 AI workflow | Hardened | `orchestrator.ts`, `proposal-studio.ts` | Coverage, version/fork regenerate, resume | `coverage`, `proposal-studio` | Unit |
| §4.3 Document studio | Complete | proposal editor, versions, skills, validate | Version UI, apply skills, export errors | `proposal-studio` | Unit + build |
| §4.5 Review & export | Complete | download, reviews queue, validate | Approval gate, EXPORTED status, open studio | `proposal-studio` | Unit |
| §6 Data model | Extended | `schema.prisma` | `parentProposalId`, `configJson` | migrate deploy | Migration |
| §7 APIs | Extended | validate, versions, rewrite skills, ready | Studio + resume surfaces | billing + studio tests | Unit + build |
| §9.3 MyFatoorah | Hardened | `myfatoorah.ts`, billing | Allowlist, V2 sig, amount match, reconcile | `billing.test.ts` | Unit |
| §10 Export | Hardened | `export-manifest.ts`, generators, policy | Manifest + approval + human BoQ fix | `security-export`, `proposal-studio` | Unit |
| §11 Security | Hardened | safe-zip, MF allowlist | ZIP-slip, SSRF URL reject | security + billing tests | Unit |
| §12 Ops | Hardened | `/api/health`, `/api/ready`, agent resume | Liveness, readiness, stale run resume | build routes | Build |
| §13 Tests | Expanded | `__tests__/*` | 74 tests | `bun test` | 74 pass |

## Intentionally out of scope (documented)

- Direct Etimad portal submission
- Redis/Bull distributed queue (in-process agents + resume retained)
- SSO / OIDC enterprise IdP
- Live sandbox payment without merchant credentials
