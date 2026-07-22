# Arabclue (أراب كلاو)

B2B SaaS for Saudi Etimad tender proposal generation — Next.js App Router, Prisma, NextAuth, multi-agent drafting pipeline.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind/shadcn
- **Prisma** — SQLite for local/dev; Postgres-ready schema notes below
- **NextAuth** credentials + JWT, optional TOTP MFA
- **Agents** — in-process pipeline (ingest → compliance → technical RAG → financial → draft)
- **Artifacts** — Playwright PDF, ExcelJS, ZIP bid packages

## Quick start (local)

```bash
cp .env.example .env
# Edit .env — set BOOTSTRAP_ADMIN_PASSWORD, NEXTAUTH_SECRET, ARABCLUE_ENC_KEY

bun install
bun run db:generate
bun run db:push:dev          # SQLite local only
bun run dev                  # http://localhost:3000
```

Open `/login`. First bootstrap admin (from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`) must change password on first login when `mustChangePassword` is set.

Health check: `GET /api/health`

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | yes | `file:./db/custom.db` for local SQLite |
| `NEXTAUTH_SECRET` | yes (prod) | Long random string |
| `NEXTAUTH_URL` | yes | e.g. `http://localhost:3000` |
| `BOOTSTRAP_ADMIN_PASSWORD` | yes (first seed) | Min 8 chars; never commit |
| `BOOTSTRAP_ADMIN_EMAIL` | no | Default `admin@arabclue.sa` |
| `ARABCLUE_ENC_KEY` | yes (prod) | Encrypts admin env settings |

See `.env.example`.

## Database

### Local (SQLite)

```bash
bun run db:push:dev    # prisma db push — acceptable for local iteration
bun run db:generate
```

Do **not** use `--accept-data-loss` in production.

### Production (Postgres recommended)

1. Set `DATABASE_URL` to a Postgres connection string.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` → `provider = "postgresql"` (and adjust any SQLite-only types if needed).
3. Create and apply migrations:

```bash
bunx prisma migrate dev --name init   # first time / schema evolution
bunx prisma migrate deploy            # CI/production apply
```

SQLite remains the default for local development only.

## Auth & tenancy

- Sessions are JWT with server-side `UserSession` rows; logout revokes the token.
- Login is rate-limited (10 attempts / 15 min per email).
- Tenant APIs resolve workspace via **membership** (`getTenantContext`), not a shared global default for reads/writes.
- `REVIEWER` role is read-only on write endpoints (`requireWriter`).
- Uploads and agent runs require an explicit `projectId` (active project).

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Dev server |
| `bun run build` / `start` | Production standalone |
| `bun run test` | Unit tests |
| `bun run lint` | ESLint |
| `bun run db:migrate` | `prisma migrate dev` |
| `bun run db:push:dev` | Local SQLite push (dev only) |

## Billing

Self-serve checkout via **MyFatoorah** (`/api/billing/checkout`, callback, webhook). Plan quotas (`maxDocuments` / `maxProposals`) are enforced before upload and agent run. Admin can also manage plans and ledger.

## Ops notes

- Ignore `db/*.db` and `.env` in git.
- Uploads live under `uploads/`.
- Agents run in-process with cancel + single active run per project (no Redis queue yet).
