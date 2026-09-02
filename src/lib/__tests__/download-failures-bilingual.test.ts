/**
 * The download button's refusals were English-only, hand-rolled bodies.
 *
 * Live, 2026-09-02: `GET /api/proposals/:id/download?format=pdf` answered
 * `{"error":"Final export requires an approved proposal…","code":"approval_required"}`
 * and, for the validation gate, `{"error":"Export blocked by validation gate:
 * …","code":"validation_blocked"}` — while every other refusal in the
 * product speaks both languages through `apiFailure`. The client then showed
 * the English string to an Arabic reader. The 500 fallback did the same with
 * a redacted provider message.
 *
 * Three registered codes now carry the refusals, the validation findings ride
 * alongside as data, and the download client reads the bilingual body.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiFailure, resolveFailureStatus } from "../api-failure";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("the export refusal codes", () => {
  test("carry both languages and the right statuses", () => {
    const approval = apiFailure("EXPORT_APPROVAL_REQUIRED");
    expect(approval.message.ar.length).toBeGreaterThan(10);
    expect(approval.message.en).toContain("approv");
    expect(resolveFailureStatus("EXPORT_APPROVAL_REQUIRED")).toBe(409);

    const blocked = apiFailure("EXPORT_VALIDATION_BLOCKED");
    expect(/[؀-ۿ]/.test(blocked.message.ar)).toBe(true);
    expect(resolveFailureStatus("EXPORT_VALIDATION_BLOCKED")).toBe(422);

    const failed = apiFailure("DOWNLOAD_FAILED");
    expect(failed.message.en.length).toBeGreaterThan(10);
    expect(resolveFailureStatus("DOWNLOAD_FAILED")).toBe(500);
  });
});

describe("the download route answers through them", () => {
  const src = read("src/app/api/proposals/[id]/download/route.ts");
  test("no hand-rolled English refusal remains", () => {
    expect(/error:\s*policyResult\.error/.test(src)).toBe(false);
    expect(/code:\s*policyResult\.code/.test(src)).toBe(false);
    expect(/apiFailure\("EXPORT_APPROVAL_REQUIRED"\)/.test(src)).toBe(true);
    expect(/apiFailure\("EXPORT_VALIDATION_BLOCKED"\)/.test(src)).toBe(true);
    expect(/apiFailure\("DOWNLOAD_FAILED"\)/.test(src)).toBe(true);
  });
  test("the validation findings still travel as data", () => {
    expect(/validation:\s*gateReport/.test(src)).toBe(true);
  });
});

describe("the download client reads a bilingual body", () => {
  test("it prefers the mapped message and keeps the gate's issue codes", () => {
    const src = read("src/lib/download-artifact.ts");
    expect(/selectApiFailureMessage\(/.test(src)).toBe(true);
    expect(/issues/.test(src)).toBe(true);
  });
});
