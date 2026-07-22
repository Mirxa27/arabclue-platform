# Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | Modular monolith (Next.js App Router + Prisma) | Preserve working stack; workers can split later |
| D2 | In-process agent pipeline with DB checkpoints | PRD explicitly defers Redis/Bull |
| D3 | Versioned in-code regulatory registry + applicability metadata | Avoid false legal universals; DB can extend later |
| D4 | Tender SLA preserved exactly; statutory caps as REGULATORY_CANDIDATE rows | Constitution §1.3 |
| D5 | Local-content preference only from tender text | No blanket 10% |
| D6 | NORA identifiers only from tender or approved registry (empty until approved source) | No invented TP1/SP1/SP2 |
| D7 | MyFatoorah base URL allowlist server-side only | SSRF / credential exfiltration prevention |
| D8 | Webhook V2 canonical HMAC (not raw body) | Official MyFatoorah docs |
| D9 | Never activate entitlements from browser redirect alone | Confirm via webhook and/or GetPaymentStatus + amount match |
| D10 | Validation gate blocks export (HTTP 422) | Deterministic policy enforcement beyond prompts |
| D11 | Postgres provider (Neon) | Production baseline migration |
| D12 | MyFatoorah only payment adapter | Constitution §9.3 |
