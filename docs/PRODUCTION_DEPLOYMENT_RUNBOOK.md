# Production Deployment and Secret Incident Runbook

## Current release status

**Blocked as of 2026-07-24.** The sensitive `.env` file has been removed from
the current Git index but remains in three public historical commits. A fixed
development administrator identity and five generated role credential rows
also appeared in public history. Their current-tree removal does not revoke the
live credentials or erase Git history.

Do not create a Preview or Production deployment until the external remediation
owner has completed every item in the incident checklist and
`bun run deploy:safety` passes. This document intentionally never records a
secret value.

## Release invariants

- A build compiles application code and assets only. It never runs
  `prisma migrate`, `prisma db push`, or `prisma db reset`.
- Every Vercel Preview deployment uses a dedicated Neon branch. Preview and
  Production must not share a database URL or database role.
- Production schema changes are backward-compatible, tested on an isolated
  branch, backed up, and applied once in a separately approved release step.
- Secrets live in the provider secret store and are scoped to exactly one
  environment. Local environment files and generated credentials are never
  committed or uploaded.
- A known-good deployment and a tested rollback procedure exist before traffic
  moves.

## Secret incident response

These steps require repository-owner and provider-admin authority. They were
not performed by the code change that introduced this runbook.

1. Pause automatic deployments and restrict repository access while triage is
   active.
2. Inventory every credential named by the tracked environment file and Git
   history without copying values into tickets, chat, or logs.
3. Rotate or revoke each credential at its source provider. Include database
   roles, authentication and encryption secrets, administrator passwords, blob
   storage, email, billing, and model-provider keys where configured.
4. Revoke active application sessions after rotating authentication material.
   Disable every reserved development identity, reset all generated
   SUPER_ADMIN/ADMIN/BIDDER/REVIEWER/FINANCE credentials, revoke their active
   sessions, audit activity from first exposure, and require MFA before any
   account is re-enabled.
5. Review Neon, Vercel, GitHub, authentication, billing, storage, and email
   audit logs from the earliest exposed commit onward. Escalate to the security
   and legal owners if unauthorized access or personal-data exposure is
   suspected.
6. Record rotation completion by credential name, owner, timestamp, and
   provider—not by value.

## Git index and history remediation

History rewriting is destructive and requires an approved maintenance window.
Do not perform these actions from a dirty working checkout.

1. Back up the repository and freeze merges and deployments.
2. In a temporary mirror clone, remove `.env` from every ref with an approved
   history-rewrite tool.
3. In the normal checkout, remove `.env` from the index while keeping the local
   file. Verify `.env.example` remains tracked and contains placeholders only.
4. Have a repository owner force-update all affected protected refs.
5. Verify that no branch, tag, pull request ref, release artifact, cache, or
   deployment source bundle still contains the file.
6. Require every collaborator and automation runner to re-clone or reset to the
   rewritten history.
7. Re-enable protected branches only after secret scanning and
   `bun run deploy:safety` pass.

Rotating credentials is mandatory even after a perfect history rewrite because
old clones and caches may retain the original objects.

## Database release procedure

1. Create an isolated Neon branch from the intended base and point only the
   test environment at it.
2. Generate and commit migrations against the isolated development workflow;
   never use `prisma db push` against Preview or Production.
3. Apply the committed migration to a fresh isolated branch, then run the full
   application test suite and representative document-generation flows.
4. Confirm the migration is backward-compatible with the currently deployed
   application and document the forward-recovery plan.
5. Create or verify a Production restore point and obtain release approval.
6. Supply the Production migration connection from the secret manager and run
   `bun run db:migrate:deploy` exactly once from the controlled release job.
7. Verify migration status and application readiness before deploying code.

Vercel's `buildCommand` is `bun run build`, so neither Preview nor Production
builds can mutate the database.

## Pre-deployment gates

Run from a clean checkout of the exact commit to be released:

```bash
bun install --frozen-lockfile
bun run deploy:safety
bun run lint
bun run test
bun run build
```

For bilingual document releases, also run:

```bash
PLAYWRIGHT_CHROMIUM=1 bun run test:bilingual:visual
PLAYWRIGHT_CHROMIUM=1 bun run benchmark:bilingual
```

Before promoting a Preview deployment:

- Confirm its database hostname or branch identifier is different from
  Production without logging either connection string.
- Call `/api/health` and `/api/ready`.
- Complete login, authorization, upload, bilingual HTML preview, and PDF export
  smoke tests.
- Check that logs contain no secrets, database errors, or new 5xx responses.

## Production release and verification

After all approvals and gates pass, deploy the verified commit through the
normal Vercel production workflow. Record the commit SHA, deployment URL,
migration identifier, approver, and known-good rollback deployment.

Verify:

- `/api/health` and `/api/ready` return successful responses.
- The public domain and `www` redirect use HTTPS and expected security headers.
- Login and role restrictions behave correctly.
- A bilingual HTML document and its PDF export both render Arabic and English
  content correctly.
- Error rate, database activity, memory, and PDF latency remain normal through
  the observation window.

## Application rollback

If the release is unhealthy, restore the last known-good Vercel deployment:

```bash
vercel rollback <known-good-deployment-url>
vercel rollback status
```

Then re-run health, readiness, login, and document-export checks. A Vercel
rollback does not revert a database migration. Never use `prisma migrate reset`
in Production; use the documented forward fix or restore procedure approved
for that migration.

## Authoritative platform references

- [Vercel project build configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel environment scoping](https://vercel.com/docs/environment-variables)
- [Vercel production rollback](https://vercel.com/docs/deployments/rollback-production-deployment)
- [Neon database branching workflow](https://neon.com/docs/get-started-with-neon/workflow-primer)
