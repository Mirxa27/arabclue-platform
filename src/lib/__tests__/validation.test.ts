import { describe, expect, test } from "bun:test";
import {
  agentRunBodySchema,
  emailSchema,
  passwordChangeSchema,
  projectCreateSchema,
  documentPatchSchema,
} from "../validation";

describe("Zod validation contracts", () => {
  test("z.email accepts valid addresses", () => {
    expect(emailSchema.safeParse("admin@arabclue.sa").success).toBe(true);
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  test("agentRunBody requires projectId", () => {
    expect(agentRunBodySchema.safeParse({}).success).toBe(false);
    expect(
      agentRunBodySchema.safeParse({ projectId: "p1", locale: "ar" }).success
    ).toBe(true);
    expect(
      agentRunBodySchema.safeParse({ projectId: "p1", locale: "xx" }).success
    ).toBe(false);
  });

  test("projectCreate requires title", () => {
    expect(projectCreateSchema.safeParse({}).success).toBe(false);
    expect(
      projectCreateSchema.safeParse({ title: "National Portal" }).success
    ).toBe(true);
  });

  test("passwordChange enforces min length", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "old",
        newPassword: "short",
      }).success
    ).toBe(false);
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: "old-password",
        newPassword: "long-enough-pass",
      }).success
    ).toBe(true);
  });

  test("documentPatch rejects empty patch", () => {
    expect(documentPatchSchema.safeParse({}).success).toBe(false);
    expect(
      documentPatchSchema.safeParse({ docCategory: "RFP" }).success
    ).toBe(true);
  });
});
