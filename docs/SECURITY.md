# Security

## Account isolation

- Tenant APIs resolve workspace via `WorkspaceMember` (`getTenantContext`).
- Resource access asserts `resource.workspaceId === tenant.workspaceId`.
- File bytes (`/api/files`) require path prefix `uploads/{workspaceId}/` and reject `..`.

## Access control

| Role | Writes | Reviews |
| --- | --- | --- |
| BIDDER / FINANCE / ADMIN / SUPER_ADMIN | Yes (`requireWriter`) | Yes if assigned |
| REVIEWER | Blocked | Yes (`requireReviewerAction`) |

## Secrets

- Passwords: scrypt (`src/lib/password.ts`).
- Admin env values: AES-GCM with `ARABCLUE_ENC_KEY`.
- Bootstrap admin password from env only; `mustChangePassword` on first login.
- Production boot fails if `NEXTAUTH_SECRET` / `ARABCLUE_ENC_KEY` missing (`assertProductionSecrets`).

## AI safety

- PII redaction, toxicity, hallucination grounding, **pricing refusal** (product Section 2).
- Restrictions (competitors / confidential clauses) injected into drafting context.

## Audit

Immutable `AuditLog` for auth, uploads, proposal edits, billing, config changes.
