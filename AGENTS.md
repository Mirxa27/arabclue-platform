# AGENTS.md

## Cursor Cloud specific instructions

Arabclue is a single Next.js 16 (App Router, Turbopack) B2B SaaS app — there is one service to run. `mini-services/` is empty and `examples/` is only sample code. Standard scripts live in `package.json`; run them with **bun** (the repo uses `bun.lock`, not npm).

### Toolchain
- **bun** is the package manager/runtime. It is installed at `~/.bun/bin` and added to `PATH` via `~/.bashrc`. The startup update script installs it if missing and runs `bun install` (which triggers the `postinstall` → `prisma generate`). If `bun` is ever not found in a fresh shell, use the absolute path `~/.bun/bin/bun` or `source ~/.bashrc`.
- Node 22 is preinstalled; only used indirectly.

### Database (important)
- The committed `.env` points `DATABASE_URL` at a **remote Neon Postgres** instance, and the Prisma schema is `provider = "postgresql"`. The schema is already migrated on that DB — do **not** run `prisma migrate`/`db push` as part of setup. There is **no local Postgres**; nothing to start.
- Because the DB is remote and shared, seed/user data persists across VM sessions and is visible to anyone using this `.env`.

### Running / verifying
- Dev server: `bun run dev` (foreground, listens on port 3000; it auto-runs `db:ensure` to create `db/` + `uploads/`). Health check: `GET /api/health` on that port → `{"ok":true,...}`.
- Lint: `bun run lint`. Tests: `bun run test` (bun test over `src/lib/__tests__`). Build: `bun run build`.
- Avoid running `bun run build` and `bun run dev` at the same time — both write to `.next`.

### Login / test account
- Bootstrap only seeds the initial admin when the default workspace/user does **not** exist; it will **not** reset passwords for existing users, and the existing users' passwords are unknown here.
- A dedicated dev SUPER_ADMIN is seeded into the `default-workspace`: **`devtest@arabclue.local` / `DevTest2026!`** (member OWNER, `mustChangePassword=false`). Use it to log in at `/login`. To re-create/reset it, upsert the user with `hashPassword()` from `src/lib/password.ts` (scrypt) — plain `UPDATE`s won't match the app's hash format.

### UI navigation gotchas
- The dashboard at `/app` is a single client-rendered **view switcher** (Zustand). There are no per-view routes — e.g. `/app/projects` returns 404. Change views only via the left sidebar buttons.
- Locale defaults to **Arabic (RTL)**, persisted in `localStorage["arabclue-locale"]`. Toggle to English via the languages button in the top bar. Sidebar item order (top→bottom): Dashboard, Projects, Documents, Proposals, Compliance, Agents, History, Account, Reviews, Billing, Settings. In Arabic, "المطالبات"/"المراجعات" are Claims/Reviews — not Projects (المشاريع).

### Optional features
- PDF/proposal export uses Playwright; browser binaries are **not** installed by default. Run `bunx playwright install chromium` only if you need to exercise export flows.
- LLM/billing keys (OpenAI/Anthropic/MyFatoorah, etc.) are optional and unset; agent drafting falls back to deterministic local logic without them.
