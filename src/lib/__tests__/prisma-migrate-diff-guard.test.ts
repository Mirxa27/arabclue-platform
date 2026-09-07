/**
 * `prisma migrate diff --from-migrations` resets its shadow database. On
 * 2026-09-06 that shadow URL was the production Neon connection string and the
 * production schema — with every row — was dropped. The wrapper in
 * scripts/prisma-migrate-diff.mjs is the only path to that command now; these
 * tests pin what it refuses.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  liveDatabaseHosts,
  liveDatabaseNames,
  looksLikeNeonHost,
  shadowDatabaseRefusal,
} from "../../../scripts/prisma-migrate-diff.mjs";

const PROD_POOLED =
  "postgresql://u:p@ep-quiet-breeze-avigwtu6-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require";
const PROD_DIRECT =
  "postgresql://u:p@ep-quiet-breeze-avigwtu6.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require";

const productionEnv = {
  DATABASE_URL: PROD_POOLED,
  DATABASE_URL_UNPOOLED: PROD_DIRECT,
  POSTGRES_PRISMA_URL: PROD_POOLED,
  PGHOST: "ep-quiet-breeze-avigwtu6-pooler.c-11.us-east-1.aws.neon.tech",
  PGDATABASE: "neondb",
};

describe("shadow database refusal", () => {
  test("collects every live host and database name from the environment", () => {
    expect([...liveDatabaseHosts(productionEnv)].sort()).toEqual([
      "ep-quiet-breeze-avigwtu6-pooler.c-11.us-east-1.aws.neon.tech",
      "ep-quiet-breeze-avigwtu6.c-11.us-east-1.aws.neon.tech",
    ]);
    expect([...liveDatabaseNames(productionEnv)]).toEqual(["neondb"]);
  });

  test("refuses an unset shadow URL — there is no fallback to DATABASE_URL", () => {
    expect(shadowDatabaseRefusal(undefined, productionEnv)).toMatch(/not set/);
    expect(shadowDatabaseRefusal("", productionEnv)).toMatch(/not set/);
  });

  test("refuses the exact command that destroyed production", () => {
    expect(shadowDatabaseRefusal(PROD_DIRECT, productionEnv)).toMatch(/live database host/);
    expect(shadowDatabaseRefusal(PROD_POOLED, productionEnv)).toMatch(/live database host/);
  });

  test("refuses the other endpoint of the same Neon branch even when only one is configured", () => {
    const env = { DATABASE_URL: PROD_POOLED };
    expect(shadowDatabaseRefusal(PROD_DIRECT, env)).toMatch(/same Neon branch/);
  });

  test("refuses any Neon endpoint by default, allows a scratch branch on explicit opt-in", () => {
    const scratch = "postgresql://u:p@ep-scratch-branch-123456.c-11.us-east-1.aws.neon.tech/shadow";
    expect(shadowDatabaseRefusal(scratch, productionEnv)).toMatch(/Neon endpoint/);
    expect(shadowDatabaseRefusal(scratch, { ...productionEnv, SHADOW_DATABASE_ALLOW_NEON: "1" })).toBeNull();
    expect(looksLikeNeonHost("ep-x.c-11.us-east-1.aws.neon.tech")).toBe(true);
    expect(looksLikeNeonHost("localhost")).toBe(false);
  });

  test("refuses the production database name on any host", () => {
    expect(shadowDatabaseRefusal("postgresql://u:p@localhost:5432/neondb", productionEnv)).toMatch(/production database name/);
  });

  test("accepts a local shadow database", () => {
    expect(shadowDatabaseRefusal("postgresql://u:p@localhost:5432/arabclue_shadow", productionEnv)).toBeNull();
    expect(shadowDatabaseRefusal("postgresql://u:p@127.0.0.1:5432/arabclue_shadow", {})).toBeNull();
  });

  test("rejects a malformed URL rather than passing it through", () => {
    expect(shadowDatabaseRefusal("not a url", productionEnv)).toMatch(/not a valid/);
  });
});

describe("package scripts", () => {
  const scripts = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ).scripts as Record<string, string>;

  test("the destructive shortcuts are gone and the guarded diff is the only diff", () => {
    expect(scripts["db:reset"]).toBeUndefined();
    expect(scripts["db:push"]).toBeUndefined();
    expect(scripts["db:push:dev"]).toBeUndefined();
    expect(scripts["db:migrate"]).toBeUndefined();
    expect(scripts["db:diff"]).toBe("bun scripts/prisma-migrate-diff.mjs");
    expect(scripts["db:backup"]).toBe("bun scripts/backup-database.ts");
  });

  test("no package script invokes migrate diff with a shadow database directly", () => {
    for (const [name, command] of Object.entries(scripts)) {
      if (name === "db:diff") continue;
      expect(command).not.toMatch(/migrate\s+diff/);
      expect(command).not.toMatch(/shadow-database-url/);
    }
  });
});
