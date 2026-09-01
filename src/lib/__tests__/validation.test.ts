import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  agentRunBodySchema,
  emailSchema,
  passwordChangeSchema,
  parseJsonBody,
  profileUpdateSchema,
  projectCreateSchema,
  documentPatchSchema,
  zodErrorResponse,
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

  test("profileUpdate requires a field and password for email", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      profileUpdateSchema.safeParse({ name: "Khalid Al-Otaibi" }).success
    ).toBe(true);
    expect(
      profileUpdateSchema.safeParse({ email: "new@arabclue.com" }).success
    ).toBe(false);
    expect(
      profileUpdateSchema.safeParse({
        email: "new@arabclue.com",
        currentPassword: "secret-pass",
      }).success
    ).toBe(true);
  });
});

/**
 * The two failure bodies this module builds for 38 routes.
 *
 * A rejected body is the single most common failure any of them returns, and
 * both replies were assembled here rather than by the bilingual mapper — so
 * `agents/run`, `auth/password`, `projects`, and 35 more answered an
 * Arabic-first bidder in English no matter how carefully their own handlers
 * were written. The route ratchet never saw it: these literals live in
 * `src/lib`, and the scan stopped at `src/app/api`.
 *
 * It reaches further than a mistranslation on the agent surface. The chat
 * transport throws `new Error(await response.text())`, so the reader gets the
 * raw JSON body rendered as a sentence.
 */
describe("validation failures answer through the bilingual contract", () => {
  const emailBody = z.object({ email: z.email() });

  const post = (body: string) =>
    new Request("https://arabclue.com/api/test", { method: "POST", body });

  test("malformed JSON is rejected as INVALID_JSON_BODY", async () => {
    const result = await parseJsonBody(post("{not json"), emailBody);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.code).toBe("INVALID_JSON_BODY");
    // Anti-vacuous: a body that echoed one language into both slots would
    // satisfy every "is it present" assertion while still being untranslated.
    expect(body.message.ar).not.toBe(body.message.en);
    expect(body.message.ar.length).toBeGreaterThan(0);
  });

  test("a schema rejection names the offending field bilingually", () => {
    const parsed = emailBody.safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("unreachable");

    const response = zodErrorResponse(parsed.error);
    expect(response.status).toBe(400);
  });

  test("the schema rejection body carries the field path, not a bare string", async () => {
    const parsed = emailBody.safeParse({ email: "not-an-email" });
    if (parsed.success) throw new Error("unreachable");

    const body = await zodErrorResponse(parsed.error).json();
    expect(body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(body.message.ar).not.toBe(body.message.en);
    // `issues` went away, so the field has to survive in the sentence itself —
    // otherwise this trades an English message for a useless bilingual one.
    expect(body.message.en).toContain("email");
    expect(body.message.ar).toContain("email");
  });

  test("a valid body still parses", async () => {
    const result = await parseJsonBody(
      post(JSON.stringify({ email: "bidder@arabclue.com" })),
      emailBody
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.email).toBe("bidder@arabclue.com");
  });
});
