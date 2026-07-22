# Deploy to arabclue.com — Checklist

Domain: **arabclue.com** (primary), www.arabclue.com → redirect to apex.

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

- Build command: `prisma generate && next build` (already in vercel.json)
- Install command: `bun install` or `npm install`

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

# Credentials (example from last local generation — DO NOT USE IN PROD, regenerate):
# SUPER_ADMIN: superadmin@arabclue.com / DVQw^SNCk#7kySsWiG2E
# ADMIN: admin@arabclue.com / _a2kmKez6Jk9$qv=2?Fz
# BIDDER: bidder@arabclue.com / *3D*qFF6eLn2zpeWw?Rr
# REVIEWER: reviewer@arabclue.com / GZmkR*Dtd*k7kH6tw%QC
# FINANCE: finance@arabclue.com / b8UrA^GH&y-Rjp?Ra9fg

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

## 6. Operational gaps still to improve (for future)

- Postgres for prod persistence (SQLite is ephemeral on Vercel)
- S3 / Vercel Blob for uploads (currently /tmp loses files on cold start)
- Redis for rate-limit distributed (currently in-memory Map)
- Cron for subscription expiry / certificate expiry emails
- SSO (SAML/OIDC) for Enterprise
- Real Etimad API submission (currently export only)

## 7. Security headers

Configured in both `next.config.ts` and `vercel.json`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
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
