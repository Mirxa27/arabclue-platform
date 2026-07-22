# Security

## Authentication & sessions

- NextAuth credentials + JWT
- Server-side `UserSession` revocation
- Optional TOTP MFA for privileged users
- Login rate limiting
- Password minimum 10 characters

## Tenancy & authorization

- Membership-scoped `getTenantContext`
- `assertWorkspaceMatch` on resource access
- REVIEWER read-only on write endpoints (`requireWriter`)
- Platform admin routes via `requireAdmin` / `requireSuperAdmin`

## Secrets

- Bootstrap secrets in environment / KMS
- Application secrets in `EnvSetting` with AES-256-GCM (`ARABCLUE_ENC_KEY`)
- Write-only after creation; UI shows masks only
- MyFatoorah admin never returns plaintext tokens
- Audit of secret metadata writes

## Payments

- Official MyFatoorah URL allowlist only (SSRF guard)
- Webhook V2 `myfatoorah-signature` via HMAC-SHA256 canonical fields
- Invalid signature → 401, no state change
- Event fingerprint idempotency
- Amount/currency verification against server-side order before entitlements
- Browser callback is UX-only

## Uploads & documents

- Workspace-scoped storage paths
- MIME/category classification
- Treat tender text as untrusted for policy override

## Headers & transport

- Production HTTPS via platform (Vercel / Caddy)
- CSP and security headers via Next config / hosting

## Audit

Append-only `AuditLog` for login, config, billing, generation, role changes.
