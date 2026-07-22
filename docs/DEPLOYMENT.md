# Deployment

## Local

```bash
bun install
cp .env.example .env
# Set DATABASE_URL (Postgres), NEXTAUTH_SECRET, ARABCLUE_ENC_KEY, BOOTSTRAP_ADMIN_PASSWORD
bun run dev:setup   # generate + push schema if needed
bunx prisma migrate deploy
bun run dev
```

Health: call the `/api/health` route on your local app port.

## Production (Vercel)

1. Postgres `DATABASE_URL` (Neon pooled)
2. Set `NEXTAUTH_URL` to the public site origin
3. `NEXTAUTH_SECRET`, `ARABCLUE_ENC_KEY`, bootstrap admin
4. `BLOB_READ_WRITE_TOKEN` for uploads
5. Build: `prisma generate && prisma migrate deploy && next build` (`build:vercel`)

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
