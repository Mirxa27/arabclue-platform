# Deployment

## Local

```bash
bun install
cp .env.example .env
# Set DATABASE_URL (Postgres), NEXTAUTH_SECRET, ARABCLUE_ENC_KEY, BOOTSTRAP_ADMIN_PASSWORD
bun run dev
```

The committed development URL points to a shared Neon database whose schema is
already migrated. `bun run dev:setup` is safe because it only creates local
folders and generates Prisma Client. Do not run `prisma db push` or Prisma
migration commands against that shared URL.

Health: call the `/api/health` route on your local app port.

## Production (Vercel)

1. Resolve every blocking item in the
   [production deployment runbook](PRODUCTION_DEPLOYMENT_RUNBOOK.md).
2. Give Preview deployments their own Neon branch and Preview-scoped
   `DATABASE_URL`; never reuse the Production database.
3. Set the Production `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
   `ARABCLUE_ENC_KEY`, bootstrap administrator values, and
   `BLOB_READ_WRITE_TOKEN` through Vercel's sensitive environment settings.
   Set `REDIS_URL` to a production Redis service as well; authenticated
   document-export limits must be shared across serverless instances.
4. Validate a committed migration on an isolated Neon branch, then run
   `bun run db:migrate:deploy` once as a separately approved Production release
   step.
5. Run `bun run deploy:check`. The Vercel build command is `bun run build` and
   is intentionally database-read-only.

See `DEPLOY_ARABCLUE_COM.md`.

## MyFatoorah

### Sandbox

1. Admin → Payments → MyFatoorah
2. Mode: **sandbox**
3. Paste API token + webhook secret (write-only)
4. Run **Connection test** and **Webhook signature test**
5. Configure portal webhook URL to `https://<host>/api/billing/webhook` (Webhook V2)

### Production

1. Mode: **production_sa** → official Saudi MyFatoorah API host (`api-sa.myfatoorah.com`)
2. Rotate API token and webhook secret (never reuse sandbox identifiers)
3. Country SAU, currency SAR
4. Confirm recurring availability via connection test; if unavailable use manual renewal invoices

### Credential rotation

Use Admin → MyFatoorah save action. Secrets are encrypted in `EnvSetting` and never returned in GET responses.
