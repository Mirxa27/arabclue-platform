#!/usr/bin/env bun

/**
 * The only sanctioned way to run `prisma migrate diff --from-migrations` here.
 *
 * `--from-migrations` RESETS the shadow database and replays the migration
 * folder into it. On 2026-09-06 the live Neon connection string was passed as
 * `--shadow-database-url`, which dropped the production schema and every row
 * with it; the Free plan's six-hour history window closed before anyone could
 * restore. That command form is therefore never typed by hand again — this
 * wrapper is the gate.
 *
 * Rules, all enforced before Prisma is spawned:
 *  1. `SHADOW_DATABASE_URL` must be set explicitly; there is no fallback.
 *  2. Its host must not be any host the deployment connects to (every
 *     `DATABASE_URL*` / `POSTGRES_*` / `PG*` variable in the environment).
 *  3. Its host must not look like a Neon compute or pooler endpoint at all
 *     unless `SHADOW_DATABASE_ALLOW_NEON=1` — a scratch branch is fine, but
 *     that is a deliberate choice, not a default.
 *  4. Its database name must not be the production database name.
 *
 *   SHADOW_DATABASE_URL=postgresql://localhost:5432/arabclue_shadow \
 *     bun run db:diff
 */
import { spawnSync } from "node:child_process";

const LIVE_ENV_KEYS = Object.keys(process.env).filter((key) =>
  /^(DATABASE_URL|POSTGRES_|PG)/u.test(key),
);

function hostOf(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function databaseOf(value) {
  try {
    return new URL(String(value)).pathname.replace(/^\//u, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Hosts a deployment connects to, from every connection-string variable plus
 * bare host variables (`PGHOST`, `PGHOST_UNPOOLED`, `POSTGRES_HOST`).
 */
export function liveDatabaseHosts(env = process.env) {
  const hosts = new Set();
  for (const key of Object.keys(env)) {
    if (!/^(DATABASE_URL|POSTGRES_|PG)/u.test(key)) continue;
    const value = String(env[key] ?? "").trim();
    if (!value) continue;
    const fromUrl = hostOf(value);
    if (fromUrl) hosts.add(fromUrl);
    else if (/^(PGHOST|POSTGRES_HOST)/u.test(key)) hosts.add(value.toLowerCase());
  }
  return hosts;
}

export function liveDatabaseNames(env = process.env) {
  const names = new Set();
  for (const key of Object.keys(env)) {
    if (!/^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL)/u.test(key)) continue;
    const name = databaseOf(env[key]);
    if (name) names.add(name);
  }
  for (const key of ["PGDATABASE", "POSTGRES_DATABASE"]) {
    const name = String(env[key] ?? "").trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/** Neon computes and poolers: `ep-*.<region>.aws.neon.tech`. */
export function looksLikeNeonHost(host) {
  return /\.neon\.tech$/iu.test(host);
}

/**
 * Null when the shadow URL is safe to reset; otherwise the reason it is not.
 */
export function shadowDatabaseRefusal(shadowUrl, env = process.env) {
  const value = String(shadowUrl ?? "").trim();
  if (!value) return "SHADOW_DATABASE_URL is not set; a shadow database must be named explicitly.";
  const host = hostOf(value);
  if (!host) return "SHADOW_DATABASE_URL is not a valid PostgreSQL URL.";
  const liveHosts = liveDatabaseHosts(env);
  if (liveHosts.has(host)) {
    return `SHADOW_DATABASE_URL points at ${host}, which is a live database host in this environment. migrate diff would reset it.`;
  }
  // The pooler and the direct compute of one Neon branch share the prefix.
  const branchPrefix = host.replace(/-pooler(?=\.)/u, "");
  for (const live of liveHosts) {
    if (live.replace(/-pooler(?=\.)/u, "") === branchPrefix) {
      return `SHADOW_DATABASE_URL points at ${host}, the same Neon branch as live host ${live}.`;
    }
  }
  if (looksLikeNeonHost(host) && env.SHADOW_DATABASE_ALLOW_NEON !== "1") {
    return `SHADOW_DATABASE_URL points at a Neon endpoint (${host}). Use a local Postgres, or set SHADOW_DATABASE_ALLOW_NEON=1 for a scratch branch you created for this purpose.`;
  }
  const dbName = databaseOf(value);
  if (dbName && liveDatabaseNames(env).has(dbName)) {
    return `SHADOW_DATABASE_URL names database "${dbName}", the production database name. Use a dedicated shadow database.`;
  }
  return null;
}

function main() {
  const refusal = shadowDatabaseRefusal(process.env.SHADOW_DATABASE_URL);
  if (refusal) {
    console.error(`db:diff refused: ${refusal}`);
    return 2;
  }
  const extra = process.argv.slice(2);
  const result = spawnSync(
    "bunx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--shadow-database-url",
      process.env.SHADOW_DATABASE_URL,
      ...extra,
    ],
    { stdio: "inherit" },
  );
  return result.status ?? 1;
}

if (import.meta.main) {
  process.exitCode = main();
}
