# Implementation Plan

[Overview]
Verify ArabClue readiness, commit the full platform-completion workspace, push to GitHub, apply the pending Production schema migration in a controlled step, then promote the verified commit to arabclue.com on Vercel.

This is an operational release plan, not a feature design. Live production is already serving `arabclue.com` and reports healthy liveness/readiness, but local work on `cursor/e2e-completion-ab64` is 14 commits ahead of `main` plus a large dirty tree (≈180 paths) covering platform completion, account flows, extension Etimad agents, and migration tooling. Production must not receive partial, failing, or secret-bearing state.

Release path: inventory → safety/env gates → static verification (`lint`/`test`/`build`) → clean commit of product code only → push branch → merge to `main` → run `prisma migrate deploy` once against Production with an explicit unpooled URL → `vercel --prod` → smoke `/api/health` and `/api/ready` → record rollback target.

[Types]
No application type system changes are required for the release procedure itself.

Operational state objects used during verification:

```ts
type GateResult = {
  name: "deploy:safety" | "lint" | "test" | "build" | "migrate" | "smoke";
  ok: boolean;
  detail?: string;
};

type ReleaseRecord = {
  commitSha: string;
  branch: string;
  migrationIds: string[];
  productionUrl: string;
  knownGoodDeploymentUrl: string;
  approver: string;
  startedAt: string;
  finishedAt?: string;
};
```

[Files]
This release touches repository state and host/provider configuration, not a single feature module.

### Commit candidates (product)
- Modified app/API/lib/component files under `src/`
- `prisma/schema.prisma` and `prisma/migrations/20260726000000_platform_completion/`
- `package.json`, `bun.lock`, `tsconfig.json`
- `scripts/check-deployment-safety.mjs`, `scripts/predeploy-build-gate.mjs`, `scripts/sync-migration-runbook.mjs`
- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`, `docs/platform-completion-migrations.md`
- Extension under `extensions/arabclue-agent/` (source + built assets intended for packaging)
- `.env.example` (placeholders only)

### Do not commit
- `.env`, `.env.*` (except `.env.example`)
- `.vercel/`, `.next/`, `node_modules/`, `uploads/`, logs, screenshots unless already policy-tracked
- Local IDE noise when not needed: prefer excluding `.vscode/` unless team-shared settings are intentional
- Generated secrets / admin credential dumps

### Operational notes only (may remain untracked or be deleted after success)
- `MIGRATION_REQUIRED.md` — delete after migrate succeeds
- `docs/PRE_PRODUCTION_SECURITY_TASKS.md` — keep if documenting residual history work

[Functions]
No new runtime functions are required for the release flow. Existing scripts are the interface:

- `bun run deploy:safety` → `scripts/check-deployment-safety.mjs`
- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run db:migrate:deploy` → `prisma migrate deploy` (Production-only, explicit approval)
- `vercel --prod --yes`
- smoke: `GET https://arabclue.com/api/health`, `GET https://arabclue.com/api/ready`

Expected known `deploy:safety` failures until history remediation:
1. Sensitive `.env` objects remain in Git history
2. Historical embedded development identities in `AGENTS.md`, `scripts/ensure-devtest.ts`, `DEPLOY_ARABCLUE_COM.md`
3. Local shell missing `REDIS_URL` / `CRON_SECRET` even if Vercel Production already has `CRON_SECRET`

Release decision:
- History secret exposure must be treated as a security debt item and **credential rotation** is mandatory; full history rewrite is a separate maintenance window and is **not** silently performed in this push.
- Production currently reports `rateLimit: memory_vercel` without Redis. Deploy proceeds only if product owner accepts single-node memory limits; otherwise provision Upstash/Redis first.
- Shared Neon `DATABASE_URL` across Production/Preview/Development is a latent risk; Preview should eventually use a dedicated Neon branch. Do not block this release solely on that if the user explicitly wants Production updated, but record it.

[Classes]
No class changes. Migration registry and readiness probe already encode schema gates:

- `src/lib/migration-registry.ts` — ordered migration ledger including `20260726000000_platform_completion`
- `/api/ready` — returns not-ready / `SCHEMA_MIGRATION_PENDING` if Production lacks that migration after code that depends on new columns/tables is deployed

Critical ordering invariant:
1. Apply migration before (or atomically with) code that requires `User.emailVerified` and new platform-completion tables.
2. Never run `prisma migrate` / `db push` inside Vercel build.
3. Never run `prisma migrate reset` on Production.

[Dependencies]
No new packages required for release. Runtime/tooling assumptions:

- `bun` package manager and lockfile
- Node 22.x (engines field); Vercel project may show Node 24.x — confirm build still passes
- Vercel CLI authenticated as `mirxa27`
- GitHub `origin` = `https://github.com/Mirxa27/arabclue-platform.git`
- Linked Vercel project `arabclue-platform` → `https://arabclue.com`
- Neon Production `DATABASE_URL` + preferably `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` for migrate deploy

[Testing]
Release verification ladder (stop on first hard fail):

1. `git status` / `git diff` — ensure no secrets staged
2. `bun run deploy:safety` — record residual security debt; do not invent a bypass in code
3. `bun run lint`
4. `bun run test` (or at least `bun run test:completion` + critical suites if full suite is too long)
5. `bun run build`
6. After Production migrate: `bunx prisma migrate status` against Production connection (values never printed)
7. Post-deploy smoke:
   - `/api/health` → `ok: true`
   - `/api/ready` → `ready: true` and database check ok
   - Landing HTTPS + security headers present
   - Login path loads (no credential automation against prod)

If build or tests fail, do not push to `main` / do not `vercel --prod`.

[Implementation Order]
Execute release steps in this exact sequence.

1. Freeze scope: confirm working tree contents and exclude secret/local artifacts from staging.
2. Run verification gates (`deploy:safety` inventory, lint, test, build).
3. Create a single cohesive release commit (or small series) on `cursor/e2e-completion-ab64` with a clear message covering platform completion + deploy readiness.
4. Push branch to `origin`.
5. Fast-forward or merge into `main` after checks pass (prefer PR if protection requires it; otherwise direct merge with explicit user authority).
6. Record current known-good Production deployment URL for rollback (`vercel ls` / dashboard).
7. Apply `bun run db:migrate:deploy` once against Production using the non-pooling URL from Vercel secret store / local approved env (never log the URL).
8. Confirm migrate status includes `20260726000000_platform_completion`.
9. Deploy Production: `vercel --prod --yes` from the verified commit (or GitHub production deploy if auto-deploy is wired to `main`).
10. Smoke arabclue.com health/ready; if unhealthy, `vercel rollback <known-good-url>`.
11. Document residual security work: Git history purge + full credential rotation + Redis provisioning if accepted later.
12. Delete `MIGRATION_REQUIRED.md` only after migrate verified.

### Explicit non-goals for this release pass
- Rewriting public Git history with BFG/filter-repo (requires separate maintenance window and collaborator re-clone)
- Changing production secrets in chat/logs
- Running destructive DB commands (`reset`, `db push` against shared Neon)
- Deploying with known failing TypeScript/build errors
