# Arabclue (أراب كلاو) — Bilingual procurement document platform

Arabclue is a Next.js 16 B2B SaaS application for preparing structured Arabic
and English procurement documents. It combines tenant-scoped source evidence,
human review workflows, bilingual HTML/PDF generation, proposal exports, and
auditable artifact manifests.

Generated content remains a draft until the configured reviewers approve the
exact immutable snapshot. Contract templates are explicitly unreviewed,
non-executable starting points and require qualified legal review.

---

## ✨ What's new (SaaS polish)

- **Landing `/`** — dark aurora hero, interactive dashboard mock (pipeline agents, matrix, export), trust strip (Etimad/NCA/PDPL/ZATCA/Vision2030), problem→solution, bento features, how-it-works, pricing teaser with monthly/yearly, FAQ, final CTA — all **AR/EN smooth**.
- **Pricing `/pricing`** — transparent packages (Starter/Pro/Enterprise) in SAR, monthly/yearly toggle, limits grid, full feature comparison table, billing FAQ.
- **For Owners `/for-owners`** and **Compliance `/compliance`** — redesigned with same futuristic system, KPI cards, live matrix sample.
- **Login `/login`** — two-column SaaS login (left marketing aurora panel, right glass form) + MFA + forced password change.
- **Design system** — `aurora`, `grid-bg`, `dot-bg`, `glass`, `gradient-mesh`, `text-gradient`, `glow-ring`, futuristic animations in `globals.css`.
- **Marketing shell** — sticky blurred header, locale toggle persisting to `arabclue-marketing-locale`, bilingual `dir/lang` sync, footer with badges.
- **Local DX** — `proxy.ts` (not deprecated `middleware.ts`), `turbopack.root` to silence warning, portable `start-dev.sh`, `db:ensure` script, improved `.env.example`.
- **Document engine** — synchronized AR/EN HTML and PDF, local embedded Arabic
  fonts, proposal layouts and PPTX export, data tables/charts, contract draft
  persistence, and capability statements.

---

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui + Framer Motion
- **Prisma** — PostgreSQL; managed checkouts currently use Neon
- **NextAuth** credentials + JWT + server-side `UserSession` revocation + optional TOTP MFA
- **Multi-agent** — in-process pipeline: `ingestion → compliance → technical RAG → financial → drafting` with cancel & single active run per project
- **Artifacts** — bilingual HTML/PDF, PPTX, ExcelJS, ZIP bid packages, and
  integrity manifests

---

## Quick start

```bash
# The repository is locked and tested with Bun.
bun install

# Preserve an existing managed .env. For a new checkout, copy the template and
# configure an isolated PostgreSQL/Neon branch plus local-only secrets.
test -f .env || cp .env.example .env
# Stop here and configure .env if the template was just copied.

# Creates local folders and generates Prisma Client. It never changes schema.
bun run dev:setup

bun run dev
# http://localhost:3000

# Optional daemon:
./start-dev.sh --daemon
# logs in dev.log, pid in dev.pid
```

**First login**

- Open `http://localhost:3000/login`
- Use an account provisioned for the selected isolated environment.
- Bootstrap credentials are read from environment variables only when the
  initial workspace/user does not already exist; setup does not reset an
  existing password.
- Then `/app` dashboard.

**Health**: `GET http://localhost:3000/api/health` → `{ ok: true, service: "arabclue" }`

---

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Next dev (ensures db/uploads exist via `db:ensure`) |
| `bun run dev:log` | Dev + tee to `dev.log` |
| `bun run dev:setup` | Ensure local folders and generate Prisma Client; no schema mutation |
| `bun run dev:clean` | Remove local Next/log output and regenerate Prisma Client |
| `bun run build` | Pack extension, generate Prisma Client, build Next.js, and verify PDF font traces |
| `bun run build:standalone` | Standalone output for Docker/VPS |
| `bun run start` | Start standalone prod |
| `bun run lint` | ESLint |
| `bun run test` | `bun test src/lib/__tests__` |
| `bun run quality:documents` | Document-generation TypeScript, lint, tests, and coverage gate |
| `bun run deploy:safety` | Fail-closed secret-history and production-infrastructure gate |
| `bun run db:generate / db:studio` | Read-safe Prisma client and inspection helpers |
| `bun run db:push:dev / db:migrate / db:migrate:deploy` | Explicit schema-changing commands; isolated/approved environments only |

---

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | PostgreSQL URL; use a separate Neon branch/database for each environment |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | `http://localhost:3000` local; `https://arabclue.com` production |
| `NEXT_PUBLIC_APP_URL` | no | canonical URL for SEO (`https://arabclue.com`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | yes (first seed) | min 10 chars; never commit |
| `BOOTSTRAP_ADMIN_EMAIL` | yes (first seed) | environment-specific; never hard-code a development identity in Production |
| `ARABCLUE_ENC_KEY` | yes (prod) | encrypts admin EnvSettings (AES-256-GCM) |
| `REDIS_URL` | yes (prod) | shared rate limiting and export admission; Production fails closed without it |
| `CRON_SECRET` | yes (prod) | random secret of at least 16 characters for cron endpoints |

Optional LLM / Billing:

```
OPENAI_API_KEY / ANTHROPIC_API_KEY / ZAI_API_KEY / GROQ_API_KEY / ...
MYFATOORAH_API_KEY, MYFATOORAH_API_URL (apitest.myfatoorah.com or api-sa.myfatoorah.com), MYFATOORAH_WEBHOOK_SECRET
```

See `.env.example` for full catalog.

---

## Local troubleshooting

- **Port 3000 busy**: stop the owning process explicitly; `start-dev.sh`
  refuses to kill unrelated processes.
- **Database connection fails**: verify the environment-specific PostgreSQL
  URL and branch. Do not repair a shared database with `db push`.
- **Turbopack warning about workspace root**: Fixed via `next.config.ts` → `turbopack.root = __dirname`
- **Middleware deprecated warning**: Migrated to `src/proxy.ts` (Next 16 style), removed `middleware.ts`
- **Prisma client not generated**: `bun run db:generate`
- **Login fails after seed**: bootstrap does not reset existing passwords. Use
  the environment's account-recovery process or provision a separate local
  identity.

---

## Database

**Development database**:

The committed development configuration targets a shared Neon Postgres
database whose schema is already migrated. Generate the client, but do not push
or migrate the shared schema:

```bash
bun run db:generate
```

**Prod Postgres**:

1. Validate committed migrations against an isolated Neon branch.
2. Create or verify a Production restore point.
3. Run `bun run db:migrate:deploy` once in an approved release step.
4. Build and deploy the application separately.

Never use `prisma db push`, `prisma migrate reset`, or
`--accept-data-loss` against Preview or Production.

---

## Auth & tenancy

- Sessions JWT + server-side `UserSession` rows; logout revokes token
- Login rate-limited 10/15min per email
- Tenant APIs resolve via `getTenantContext` (membership), not global default
- `REVIEWER` read-only on write endpoints (`requireWriter`)
- Uploads & agent runs require explicit `projectId`

---

## Packages / Billing

Marketing packages defined in `src/lib/marketing-copy.ts` (`pricingPlans`, `pricingComparison`) and backend quotas in `src/lib/constants.ts` (`DEFAULT_PLANS`).

Self-serve checkout via **MyFatoorah** (`/api/billing/checkout`, `/api/billing/callback`, webhook). Quotas (`maxDocuments`/`maxProposals`) enforced before upload and agent run. Admin can manage plans/ledger at `/app` → Admin → Billing.

---

## Project structure

```
src/
  app/
    page.tsx (futuristic landing)
    pricing/, for-owners/, compliance/, login/
    (app)/app/ (dashboard)
  components/
    marketing/public-shell.tsx (SaaS header/footer + locale)
    dashboard/* (app shell, file ingestion, matrix, etc)
  lib/
    marketing-copy.ts (all AR/EN marketing dict)
    constants.ts (agents, compliance frameworks, plans)
    bootstrap.ts (seed default workspace + admin + plans)
```

---

## Deploy

- **Vercel**: Builds run `bun run build` and never mutate a database. Scope a
  dedicated Neon branch to Preview and apply Production migrations through the
  separately approved release step.
- **Self-hosted**: `bun run build:standalone` then `bun .next/standalone/server.js` or Docker uses `standalone`.

Ignore `db/*.db`, `.env`, `uploads/`, `.next/` in git (already in `.gitignore`).
Before any release, follow
[`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`](docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md).

---

## License

Private — Arabclue SaaS.
