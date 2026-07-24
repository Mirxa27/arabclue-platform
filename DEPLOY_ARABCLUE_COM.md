# Deploy to arabclue.com — Checklist

Domain: **arabclue.com** (primary), www.arabclue.com → redirect to apex.

> **DEPLOYMENT BLOCKED:** `.env` is now gitignored, but it remains present in
> earlier public commits. Do not deploy until every exposed credential has been
> rotated, the Git history remediation has been completed and verified from a
> clean clone, and `bun run deploy:safety` passes. Keep replacement secrets only
> in Vercel Project → Settings → Environment Variables. See
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
vercel env add REDIS_URL
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add CRON_SECRET
vercel env add AWS_LAMBDA_JS_RUNTIME
```

### Required env vars (Production)

```
DATABASE_URL=postgresql://<neon-pooled-connection>?sslmode=require
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://arabclue.com
NEXT_PUBLIC_APP_URL=https://arabclue.com
ARABCLUE_ENC_KEY=<openssl rand -base64 32>
BOOTSTRAP_ADMIN_EMAIL=admin@arabclue.com
BOOTSTRAP_ADMIN_PASSWORD=<strong 16+ chars, rotate after first login>
REDIS_URL=rediss://<production-redis>
BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
CRON_SECRET=<openssl rand -base64 32>
AWS_LAMBDA_JS_RUNTIME=nodejs22.x
# Optional LLM
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
# Optional billing
MYFATOORAH_API_KEY=
MYFATOORAH_API_URL=https://api-sa.myfatoorah.com   # NOT apitest in prod!
MYFATOORAH_WEBHOOK_SECRET=
```

> **Important**: The repository already uses PostgreSQL and the shared
> production database is remote Neon. Do not run `prisma migrate` or
> `prisma db push` during Vercel builds. Apply reviewed migrations in a
> separate, approved release step before deploying code that depends on them.

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

After the forced bootstrap-password change, create required role accounts
through the authenticated administrator UI. Generate one-time credentials in
the approved secret manager, deliver them out of band, require MFA, and revoke
all bootstrap sessions. Never run local account-generation scripts against
Production or print passwords to a terminal/build log.

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
- **Cron (hybrid):** Primary schedules run from **Hostinger account crons** (no Hobby daily cap) via `curl` + `Authorization: Bearer $CRON_SECRET` against `https://arabclue.com/api/cron/*`. Vercel Cron entries in `vercel.json` remain as a secondary path (Hobby: ≤1 run/day per job). Keep the same `CRON_SECRET` in Vercel Project → Environment Variables and in the Hostinger cron commands. `/api/cron/*` is excluded from session auth in `proxy.ts` and authorized only by `CRON_SECRET`.
- **Email:** Resend via `RESEND_API_KEY` + optional `EMAIL_FROM`. Without the key, expiry cron logs + writes `ExpiryNotificationLog` but does not send mail (in-app cert notifications still work).
- **PDF on Vercel:** `@sparticuz/chromium` + `playwright-core`. Set `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` in the Vercel project env.
- **Hosting note:** Full Next.js hosting on Hostinger was attempted; Node builds succeeded but the managed runtime did not stay healthy. Production DNS stays on Vercel (`ns1/ns2.vercel-dns.com`). Hostinger is used for cron triggers only until a clean Node.js Web App recreate is validated.

**Required production infrastructure:**
- `BLOB_READ_WRITE_TOKEN` — without it `/api/ready` reports storage degraded (`ephemeral_/tmp`) and readiness fails on Vercel.
- `REDIS_URL` (optional but recommended, e.g. Upstash) — when unset, rate limiting uses in-memory (fine on Vercel Hobby / single-node). When set, limits are Redis-backed and fail closed if Redis is unreachable.
- `CRON_SECRET` (minimum 16 characters) — scheduled billing and expiry jobs fail authentication without it, and production readiness returns `503`.

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
