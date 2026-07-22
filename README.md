# Arabclue (أراب كلاو) — Futuristic SaaS

**B2B SaaS for Saudi Etimad tender proposal generation** — Next.js 16 App Router, Prisma, NextAuth, multi-agent drafting pipeline, futuristic glassmorphism UI with full AR/EN.

> Turn 400+ page RFP bundles into **Technical + Financial Structure + Compliance Matrix** — Arabic & English, branded, auditable — in **hours, not weeks**.

---

## ✨ What's new (SaaS polish)

- **Landing `/`** — dark aurora hero, interactive dashboard mock (pipeline agents, matrix, export), trust strip (Etimad/NCA/PDPL/ZATCA/Vision2030), problem→solution, bento features, how-it-works, pricing teaser with monthly/yearly, FAQ, final CTA — all **AR/EN smooth**.
- **Pricing `/pricing`** — transparent packages (Starter/Pro/Enterprise) in SAR, monthly/yearly toggle, limits grid, full feature comparison table, billing FAQ.
- **For Owners `/for-owners`** and **Compliance `/compliance`** — redesigned with same futuristic system, KPI cards, live matrix sample.
- **Login `/login`** — two-column SaaS login (left marketing aurora panel, right glass form) + MFA + forced password change.
- **Design system** — `aurora`, `grid-bg`, `dot-bg`, `glass`, `gradient-mesh`, `text-gradient`, `glow-ring`, futuristic animations in `globals.css`.
- **Marketing shell** — sticky blurred header, locale toggle persisting to `arabclue-marketing-locale`, bilingual `dir/lang` sync, footer with badges.
- **Local DX** — `proxy.ts` (not deprecated `middleware.ts`), `turbopack.root` to silence warning, portable `start-dev.sh`, `db:ensure` script, improved `.env.example`.

---

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui + Framer Motion
- **Prisma** — SQLite local/dev; Postgres-ready for prod
- **NextAuth** credentials + JWT + server-side `UserSession` revocation + optional TOTP MFA
- **Multi-agent** — in-process pipeline: `ingestion → compliance → technical RAG → financial → drafting` with cancel & single active run per project
- **Artifacts** — PDF (Playwright), ExcelJS, ZIP bid packages, branded exports

---

## Quick start (local) — 2 minutes

```bash
# 1) clone & install
bun install
# or npm install

# 2) env — copy and fill at least 3 secrets
cp .env.example .env
# Edit .env:
#   DATABASE_URL="file:../db/custom.db"  # relative to prisma/ => root/db
#   NEXTAUTH_SECRET=openssl rand -base64 32
#   ARABCLUE_ENC_KEY=openssl rand -base64 32
#   BOOTSTRAP_ADMIN_PASSWORD=StrongPass123!

# 3) one-time setup (creates db, uploads folders, prisma client, pushes schema)
bun run dev:setup
# → mkdir -p db uploads
# → prisma generate
# → prisma db push

# 4) dev
bun run dev
# http://localhost:3000

# Optional daemon:
./start-dev.sh --daemon
# logs in dev.log, pid in dev.pid
```

**First login**
- Open `http://localhost:3000/login`
- Bootstrap admin = `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env`
- On first login `mustChangePassword=true` — you’ll be asked to set a new 10+ char password.
- Then `/app` dashboard.

**Health**: `GET http://localhost:3000/api/health` → `{ ok: true, service: "arabclue" }`

---

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run dev` | Next dev (ensures db/uploads exist via `db:ensure`) |
| `bun run dev:log` | Dev + tee to `dev.log` |
| `bun run dev:setup` | Full local bootstrap: ensure folders + generate + push |
| `bun run dev:clean` | Nuke `.next` & `db/custom.db`, recreate |
| `bun run build` | `prisma generate && next build` |
| `bun run build:standalone` | Standalone output for Docker/VPS |
| `bun run start` | Start standalone prod |
| `bun run lint` | ESLint |
| `bun run test` | `bun test src/lib/__tests__` |
| `bun run db:generate / db:push:dev / db:migrate / db:studio` | Prisma helpers |

---

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `file:../db/custom.db` (prisma-relative) for local SQLite; Postgres URL prod |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | `http://localhost:3000` local; `https://arabclue.com` production |
| `NEXT_PUBLIC_APP_URL` | no | canonical URL for SEO (`https://arabclue.com`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | yes (first seed) | min 10 chars; never commit |
| `BOOTSTRAP_ADMIN_EMAIL` | no | default `admin@arabclue.sa` |
| `ARABCLUE_ENC_KEY` | yes (prod) | encrypts admin EnvSettings (AES-256-GCM) |

Optional LLM / Billing:

```
OPENAI_API_KEY / ANTHROPIC_API_KEY / ZAI_API_KEY / GROQ_API_KEY / ...
MYFATOORAH_API_KEY, MYFATOORAH_API_URL (apitest.myfatoorah.com or api-sa.myfatoorah.com), MYFATOORAH_WEBHOOK_SECRET
```

See `.env.example` for full catalog.

---

## Local troubleshooting

- **Port 3000 busy**: `lsof -i :3000 -t | xargs kill -9` or `bun run dev` kills automatically via `start-dev.sh`
- **DB not found**: `bun run db:ensure && bun run db:push:dev`
- **Old .env absolute path**: Ensure `DATABASE_URL="file:../db/custom.db"` (relative to prisma/) not `/Users/.../workspace-...`. Fixed to relative.
- **Turbopack warning about workspace root**: Fixed via `next.config.ts` → `turbopack.root = __dirname`
- **Middleware deprecated warning**: Migrated to `src/proxy.ts` (Next 16 style), removed `middleware.ts`
- **Prisma client not generated**: `bun run db:generate`
- **Login fails after seed**: Check `BOOTSTRAP_ADMIN_PASSWORD` length (≥10) and `db/custom.db` exists; try `bun run dev:clean`

---

## Database

**Local SQLite**:
```bash
bun run db:ensure
bun run db:generate
bun run db:push:dev
```

Do **not** use `--accept-data-loss` in prod.

**Prod Postgres**:
1. Set `DATABASE_URL` to Postgres URL
2. In `prisma/schema.prisma` change `provider = "sqlite"` → `postgresql`
3. `bunx prisma migrate dev --name init` then `migrate deploy`

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

- **Vercel**: Postgres `DATABASE_URL` (Neon), `BLOB_READ_WRITE_TOKEN`, secrets, then `prisma migrate deploy` in build. Domains: `arabclue.com`.
- **Self-hosted**: `bun run build:standalone` then `bun .next/standalone/server.js` or Docker uses `standalone`.

Ignore `db/*.db`, `.env`, `uploads/`, `.next/` in git (already in `.gitignore`).

---

## License

Private — Arabclue SaaS.
