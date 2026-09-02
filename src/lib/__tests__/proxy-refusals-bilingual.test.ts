/**
 * Two refusals in the middleware were English-only literals while every
 * other refusal in the same file went through `bilingualFailureBody`:
 * `{ error: "Password change required", code: "MUST_CHANGE_PASSWORD" }` for
 * a session that must rotate its password, and `{ error: "Forbidden" }` for
 * a non-administrator on an admin API — the latter with no `code` at all,
 * so a client could only match the English word.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiFailure, resolveFailureStatus } from "../api-failure";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const src = readFileSync(join(REPO_ROOT, "src/proxy.ts"), "utf8");

describe("MUST_CHANGE_PASSWORD is a registered bilingual code", () => {
  test("both languages, 403", () => {
    const body = apiFailure("MUST_CHANGE_PASSWORD");
    expect(/[؀-ۿ]/.test(body.message.ar)).toBe(true);
    expect(body.message.en.toLowerCase()).toContain("password");
    expect(resolveFailureStatus("MUST_CHANGE_PASSWORD")).toBe(403);
  });
});

describe("the middleware answers through the bilingual body", () => {
  test("no English-only literals remain", () => {
    expect(/error:\s*"Password change required"/.test(src)).toBe(false);
    expect(/\{\s*error:\s*"Forbidden"\s*\}/.test(src)).toBe(false);
    expect(/bilingualFailureBody\("MUST_CHANGE_PASSWORD"\)/.test(src)).toBe(true);
    expect(/bilingualFailureBody\("FORBIDDEN"\)/.test(src)).toBe(true);
  });
});
