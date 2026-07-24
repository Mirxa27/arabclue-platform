import { describe, expect, test } from "bun:test";
import {
  containsDatabaseMutation,
  containsEmbeddedRoleCredential,
  isSensitiveEnvironmentFile,
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
});
