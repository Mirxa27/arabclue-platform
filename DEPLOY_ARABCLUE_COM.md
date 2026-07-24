# Deploy to arabclue.com — Checklist

Domain: **arabclue.com** (primary), www.arabclue.com → redirect to apex.

> **Security note:** `.env` must not be tracked in Git (now gitignored). Rotate any
> credentials that were previously committed and keep secrets only in Vercel
> Project → Settings → Environment Variables. See
> [`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md)
> for history remediation if secrets were exposed in older commits.

## 1. Vercel project setup

```bash
vercel link
vercel env add NEXTAUTH_SECRET
vercel env add ARABCLUE_ENC_KEY
vercel env add DATABASE_URL
vercel env add NEXTAUTH_URL
vercel env add NEXT_PUBLIC_APP_URL
vercel env add BOOTSTRAP_ADMIN_EMAIL
vercel env add BOOTSTRAP_ADMIN_PASSWORD
```

### Required env vars (Production)

```
DATABASE_URL=file:/tmp/arabclue.db
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://arabclue.com
NEXT_PUBLIC_APP_URL=https://arabclue.com
ARABCLUE_ENC_KEY=<openssl rand -base64 32>
BOOTSTRAP_ADMIN_EMAIL=admin@arabclue.com
BOOTSTRAP_ADMIN_PASSWORD=<strong 16+ chars, rotate after first login>
# Optional LLM
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
# Optional billing
MYFATOORAH_API_KEY=
MYFATOORAH_API_URL=https://api-sa.myfatoorah.com   # NOT apitest in prod!
MYFATOORAH_WEBHOOK_SECRET=
```

> **Important**: On Vercel, SQLite is ephemeral under /tmp. Data resets on cold start. For production persistence, migrate to Postgres (change prisma provider to postgresql, set DATABASE_URL to Postgres URL, run `prisma migrate deploy`).

## 2. Custom domain

In Vercel dashboard → Domains → Add `arabclue.com` + `www.arabclue.com`

- Set `www` → redirect to apex `arabclue.com` 308
- Enable auto HTTPS, HSTS

DNS (at registrar):

```
A     @     76.76.21.21   (Vercel apex)
CNAME www   cname.vercel-dns.com
TXT   _vercel  <provided by Vercel>
```

Or use Vercel nameservers.

## 3. Build

- Build command: `bun run build` (already in `vercel.json`; it never migrates a database)
- Install command: `bun install`

Build output:

```
✓ Compiled successfully
Route (app)
○ / (landing SaaS)
○ /pricing
○ /compliance
○ /for-owners
○ /login
○ /app
...
ƒ Proxy (Middleware)
```

## 4. First boot — admin credentials

On first deploy, instrumentation calls `ensureDatabaseReady()` + `getBootstrapContext()` which seeds:

- Default workspace `default-workspace`
- Brand profile
- AI provider presets
- EnvSetting catalog
- Plans (STARTER/PRO/ENTERPRISE/PAY_AS_YOU_GO)
- SUPER_ADMIN from `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`

Then rotate via local script and create role accounts:

```bash
# Locally against prod? Better run via Vercel env locally with DATABASE_URL pointing to prod Postgres
# For SQLite ephemeral prod, credentials are lost on redeploy — use Postgres for prod persistence.

# Local dev generation (already done):
bun run scripts/generate-admins.ts --force
# Outputs admin-credentials.json (gitignored)

# Credential values are never stored in this repository.
# Generate one-time credentials through the approved administrator bootstrap process,
# deliver them through the team secret manager, and rotate them on first login.

# All have mustChangePassword=true — will be forced to change on first login.
```

**RBAC matrix** (enforced in proxy + API + UI):

| Role | Dashboard | Create project/doc | Run agents | Edit proposals | Financial forms | Approve reviews | Manage users | Manage plans/env/audit |
|------|-----------|-------------------|------------|----------------|-----------------|-----------------|--------------|------------------------|
| SUPER_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (override) | ✅ all roles | ✅ + critical env keys |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ only BIDDER/REVIEWER/FINANCE (cannot create SUPER_ADMIN/ADMIN) | ✅ plans (no critical keys) |
| BIDDER | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (can submit) | ❌ | ❌ |
| REVIEWER | ✅ read-only | ❌ | ❌ | ❌ read | ❌ read | ✅ approve/reject own queue | ❌ | ❌ |
| FINANCE | ✅ | ❌ (writer exception for financial) | ❌ | ✅ financial only | ✅ | ❌ | ❌ | ❌ read billing |

Auth checks:
- `proxy.ts` gates `/api/admin/*` to ADMIN/SUPER_ADMIN, all other `/api/*` to authenticated
- `requireSession()` → any authenticated
- `requireWriter()` → blocks REVIEWER
- `requireAdmin()` → ADMIN or SUPER_ADMIN
- `requireSuperAdmin()` → only SUPER_ADMIN
- `canGrantRole(actor, target)` → SUPER_ADMIN can grant all, ADMIN cannot grant ADMIN/SUPER_ADMIN
- Billing callback now checks `checkout.userId === session.user.id` + rate-limit
- MFA setup/verify now session-only + rate-limit 5/15m
- Document versions validates `uploads/{workspaceId}/` prefix + fileExists

## 5. Post-deploy smoke test

```bash
curl https://arabclue.com/api/health
# → { ok: true, service: "arabclue" }

# Login as superadmin@arabclue.com
# → forced password change
# → /app → Admin → Users → verify 5 roles exist
# → Admin → Plans → verify quotas
# → Create test tender project, upload RFP, run agents, check compliance matrix
# → Test REVIEWER cannot POST /api/documents (403), cannot run agents
# → Test billing callback ownership
```

## 6. Operational status

**Current (shipped):**
- **Postgres:** Neon Postgres via `DATABASE_URL` (not SQLite)
- **Cron:** Vercel Cron hits `/api/cron/billing-reconcile` (every 6h) and `/api/cron/expiry-notifications` (daily 06:00 UTC). Protect with `CRON_SECRET` (≥16 chars). Cron Authorization header is set automatically by Vercel when `CRON_SECRET` is configured as the project cron secret.
- **Email:** Resend via `RESEND_API_KEY` + optional `EMAIL_FROM`. Without the key, expiry cron logs + writes `ExpiryNotificationLog` but does not send mail (in-app cert notifications still work).
- **PDF on Vercel:** `@sparticuz/chromium` + `playwright-core`. Set `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` in the Vercel project env.

**Required for production uploads on Vercel:**
- `BLOB_READ_WRITE_TOKEN` — without it `/api/ready` reports storage degraded (`ephemeral_/tmp`) and readiness fails on Vercel.

**Optional hardening:**
- `REDIS_URL` (e.g. Upstash) for multi-instance rate limiting — otherwise in-memory

**Still deferred (product):**
- SSO (SAML/OIDC) for Enterprise
- Real Etimad API submission (currently export only)
- Live MyFatoorah charges without merchant credentials

## 7. Security headers

Configured in both `next.config.ts` and `vercel.json`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: **SAMEORIGIN** (required for in-app PDF/HTML iframe previews)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(self), microphone=(self), geolocation=()
- HSTS on Vercel (max-age=63072000)

## 8. Environment rotation

After first login, immediately:

1. Change SUPER_ADMIN password (forced)
2. Enable MFA via /app Settings → MFA
3. Rotate BOOTSTRAP_ADMIN_PASSWORD env var in Vercel (so old password invalid after seed)
4. Set strong NEXTAUTH_SECRET + ARABCLUE_ENC_KEY (32+ random)

---

Deploy command:

```bash
vercel --prod --yes
# or git push to main if connected
```
