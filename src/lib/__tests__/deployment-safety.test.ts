import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  SCHEMA_GUARDED_SCRIPT_NAMES,
  containsDatabaseMutation,
  containsEmbeddedDevelopmentIdentity,
  containsEmbeddedRoleCredential,
  isSensitiveEnvironmentFile,
  resolveScriptCommands,
  schemaMutatingScriptFindings,
  schemaMutatingScripts,
  sensitiveEnvironmentPathsFromGitObjectList,
} from "../../../scripts/check-deployment-safety.mjs";

describe("deployment safety policy", () => {
  test("recognizes sensitive environment filenames without blocking the template", () => {
    expect(isSensitiveEnvironmentFile(".env")).toBe(true);
    expect(isSensitiveEnvironmentFile(".env.production.local")).toBe(true);
    expect(isSensitiveEnvironmentFile("services/api/.env.preview")).toBe(true);
    expect(isSensitiveEnvironmentFile(".env.example")).toBe(false);
  });

  test("rejects database mutations in a deployment build command", () => {
    expect(containsDatabaseMutation("bun run build")).toBe(false);
    expect(containsDatabaseMutation("prisma generate && next build")).toBe(
      false,
    );
    expect(
      containsDatabaseMutation("prisma migrate deploy && next build"),
    ).toBe(true);
    expect(containsDatabaseMutation("bun run db:push && next build")).toBe(
      true,
    );
  });

  test("keeps local setup and launcher paths schema-read-only", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };
    const launcher = readFileSync(
      new URL("../../../start-dev.sh", import.meta.url),
      "utf8",
    );

    expect(containsDatabaseMutation(packageJson.scripts?.["dev:setup"] ?? "")).toBe(
      false,
    );
    expect(containsDatabaseMutation(packageJson.scripts?.["dev:clean"] ?? "")).toBe(
      false,
    );
    expect(containsDatabaseMutation(launcher)).toBe(false);
    expect(launcher).not.toContain("db:push");
    expect(launcher).not.toContain("prisma db push");
  });

  test("recognizes embedded generated role credentials", () => {
    expect(
      containsEmbeddedRoleCredential(
        "# SUPER_ADMIN: administrator@example.invalid / generated-value",
      ),
    ).toBe(true);
    expect(
      containsEmbeddedRoleCredential(
        "# Credential values are delivered through the secret manager.",
      ),
    ).toBe(false);
  });

  test("recognizes a hard-coded reserved development identity", () => {
    expect(
      containsEmbeddedDevelopmentIdentity(
        "login: developer@arabclue.local",
      ),
    ).toBe(true);
    expect(
      containsEmbeddedDevelopmentIdentity(
        "DEVTEST_EMAIL is supplied by the local secret store",
      ),
    ).toBe(false);
  });

  test("detects sensitive environment paths in historical object listings", () => {
    expect(
      sensitiveEnvironmentPathsFromGitObjectList(
        [
          "1111111111111111111111111111111111111111 .env",
          "2222222222222222222222222222222222222222 services/api/.env.production",
          "3333333333333333333333333333333333333333 .env.example",
          "4444444444444444444444444444444444444444 src/index.ts",
          "5555555555555555555555555555555555555555 .env",
        ].join("\n"),
      ),
    ).toEqual([".env", "services/api/.env.production"]);
  });
});

describe("Requirement 16.5: every schema-mutating command form is rejected", () => {
  const mutating = [
    "prisma migrate deploy",
    "prisma migrate dev --name x",
    "prisma migrate reset --force",
    "prisma migrate resolve --applied 20260726000000_platform_completion",
    "prisma db push",
    "prisma db push --accept-data-loss",
    "prisma db reset",
    "prisma db execute --file ./ddl.sql",
    "bunx prisma migrate deploy && next build",
    "bun run db:migrate",
    "bun run db:migrate:deploy",
    "bun run db:push:dev",
    "bun run db:reset",
  ];

  for (const command of mutating) {
    test(`rejects \`${command}\``, () => {
      expect(containsDatabaseMutation(command)).toBe(true);
    });
  }

  const readOnly = [
    "bun run build",
    "prisma generate && next build",
    "next dev -p 3000",
    "next start",
    "prisma validate",
    "prisma studio",
    "bun run db:ensure && bun run db:generate",
    "mkdir -p db uploads && touch db/.gitkeep",
  ];

  for (const command of readOnly) {
    test(`accepts \`${command}\``, () => {
      expect(containsDatabaseMutation(command)).toBe(false);
    });
  }
});

describe("Requirement 16.5/16.9: build, dev, and start scripts issue no DDL", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  test("every guarded script is declared so the gate can verify it", () => {
    const missing = SCHEMA_GUARDED_SCRIPT_NAMES.filter(
      (name: string) => typeof scripts[name] !== "string",
    );
    expect(missing).toEqual([]);
  });

  test("the guarded set covers the build, development, and start scripts", () => {
    for (const name of ["build", "dev", "start"]) {
      expect(SCHEMA_GUARDED_SCRIPT_NAMES).toContain(name);
    }
  });

  test("no guarded script mutates the schema, directly or through another script", () => {
    expect(schemaMutatingScripts(scripts)).toEqual([]);
  });

  test("resolves the scripts a guarded script invokes", () => {
    const resolved = resolveScriptCommands(
      { a: "bun run b && next build", b: "npm run c", c: "echo done" },
      "a",
    ).map((entry: { script: string }) => entry.script);
    expect(resolved).toEqual(["a", "b", "c"]);
  });

  test("terminates on a cyclic script reference", () => {
    const resolved = resolveScriptCommands(
      { a: "bun run b", b: "bun run a" },
      "a",
    ).map((entry: { script: string }) => entry.script);
    expect(resolved).toEqual(["a", "b"]);
  });

  test("names the offending script and command for a direct mutation", () => {
    const findings = schemaMutatingScriptFindings(
      { build: "prisma migrate deploy && next build" },
      ["build"],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].script).toBe("build");
    expect(findings[0].offendingScript).toBe("build");
    expect(findings[0].command).toContain("prisma migrate deploy");
    expect(schemaMutatingScripts({ build: "prisma migrate deploy" }, ["build"])).toEqual([
      "build",
    ]);
  });

  test("names both scripts for an indirect mutation", () => {
    const offenders = schemaMutatingScripts(
      { start: "bun run db:sync && next start", "db:sync": "prisma db push" },
      ["start"],
    );
    expect(offenders).toEqual(["start -> db:sync"]);
  });

  test("rejects a schema mutation reached through the development script", () => {
    const offenders = schemaMutatingScripts(
      {
        dev: "bun run db:ensure && next dev -p 3000",
        "db:ensure": "prisma migrate dev --name local",
      },
      ["dev"],
    );
    expect(offenders).toEqual(["dev -> db:ensure"]);
  });

  test("ignores schema-mutating commands in explicitly operator-only scripts", () => {
    expect(
      schemaMutatingScripts({
        build: "next build",
        dev: "next dev",
        start: "next start",
        "db:migrate:deploy": "prisma migrate deploy",
        "db:reset": "prisma migrate reset",
      }),
    ).toEqual([]);
  });
});
