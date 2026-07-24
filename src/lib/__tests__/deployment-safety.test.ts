import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  containsDatabaseMutation,
  containsEmbeddedDevelopmentIdentity,
  containsEmbeddedRoleCredential,
  isSensitiveEnvironmentFile,
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
