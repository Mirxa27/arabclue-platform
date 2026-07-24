# AGENTS.md

## Cursor Cloud specific instructions

Arabclue is a single Next.js 16 (App Router, Turbopack) B2B SaaS app. There is one service to run. `mini-services/` is empty and `examples/` is sample code. Standard scripts live in `package.json`; run them with **bun** because the repository uses `bun.lock`.

### Toolchain

- **bun** is the package manager/runtime. It is installed at `~/.bun/bin` and added to `PATH` through `~/.bashrc`. If it is unavailable in a fresh shell, use `~/.bun/bin/bun` or source `~/.bashrc`.
- Node 22 is preinstalled and used indirectly.

### Database (important)

- The local ignored environment points at remote Neon Postgres, and Prisma uses `provider = "postgresql"`. Never run `prisma migrate`, `prisma db push`, or reset commands against the shared database as part of setup.
- There is no local Postgres by default. Shared seed/user data persists across sessions; use read-only checks unless a task explicitly authorizes a controlled mutation.

### Running and verification

- Dev server: `bun run dev` on port 3000. `GET /api/health` returns the liveness result.
- Lint: `bun run lint`. Tests: `bun run test`. Build: `bun run build`.
- Do not run `bun run build` and `bun run dev` simultaneously because both write to `.next`.

### Login and test identities

- Never store login credentials in this file, source code, documentation, or Git history.
- Production rejects reserved development identities. Development test accounts must be supplied through an approved local secret source and must never be created in a shared or production database.
- Bootstrap only creates the initial administrator when the default workspace/user does not exist; it does not reset existing passwords.

### UI navigation gotchas

- `/app` is a client-rendered Zustand view switcher. There are no per-view routes such as `/app/projects`; use the sidebar buttons.
- Locale defaults to Arabic (RTL), persisted in `localStorage["arabclue-locale"]`. Toggle English through the language button.

### Optional features

- Local PDF/proposal export uses Playwright (`bun run setup:pdf`). Vercel uses `playwright-core` with `@sparticuz/chromium`; set `AWS_LAMBDA_JS_RUNTIME=nodejs22.x`. Optional smoke: `PLAYWRIGHT_CHROMIUM=1 bun run test:pdf`.
- LLM and billing keys are optional for local drafting. Agent drafting uses deterministic fallback logic when providers are not configured.
