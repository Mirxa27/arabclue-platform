/**
 * Every reason a bid download can be refused must be sayable in Arabic.
 *
 * The download route is the last step before a bidder submits to Etimad, and
 * it is the route with the most ways to say no: wrong format, missing
 * structured snapshot, snapshot that no longer matches tenant records,
 * evidence that lost its approval, an incomplete approval chain. Each one has
 * a different fix, and each one was an English-only sentence hardcoded in the
 * route — so an Arabic-speaking bid manager got either nothing they could read
 * or, once the literal was replaced by an unregistered code, the generic
 * "an internal error" that hides the fix entirely.
 *
 * `validatePersistedContractRenderSnapshot` and
 * `validatePersistedProposalSnapshot` both hand their `code` straight to the
 * response, so their whole failure union is part of this surface even though
 * no literal for it appears in the route.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiFailure } from "@/lib/api-failure";
import type { CompletionErrorCode } from "@/lib/i18n";

/** Every code `GET /api/proposals/[id]/download` can put in a failure body. */
const DOWNLOAD_FAILURE_CODES = [
  "UNAUTHORIZED",
  "EMAIL_VERIFICATION_REQUIRED",
  "UNSUPPORTED_EXPORT_FORMAT",
  "PROPOSAL_NOT_FOUND",
  "STRUCTURED_SNAPSHOT_REQUIRED",
  "STRUCTURED_EXPORT_FORMAT_UNSUPPORTED",
  "STRUCTURED_IDENTITY_MISMATCH",
  "STRUCTURED_EVIDENCE_NOT_APPROVED",
  "STRUCTURED_SNAPSHOT_TYPE_MISMATCH",
  "STRUCTURED_SNAPSHOT_REQUIRED_FOR_XLSX",
  "FINAL_REVIEW_BINDING_INVALID",
  "EXPORT_STATE_CHANGED",
  "STRUCTURED_EXPORT_BLOCKED",
  "PDF_UNAVAILABLE",
  // validatePersistedProposalSnapshot
  "INVALID_SNAPSHOT_SHAPE",
  "INVALID_SNAPSHOT_IDENTITY",
  "INVALID_SNAPSHOT_REVISION",
  "INVALID_SNAPSHOT_CONTENT",
  "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
  // validatePersistedContractRenderSnapshot
  "CONTRACT_RENDER_SNAPSHOT_REQUIRED",
  "CONTRACT_RENDER_SNAPSHOT_INVALID",
  "CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH",
  "CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH",
  "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH",
  "CONTRACT_RENDER_SNAPSHOT_TOO_LARGE",
  // The three refusals the route used to hand-roll in English.
  "EXPORT_APPROVAL_REQUIRED",
  "EXPORT_VALIDATION_BLOCKED",
  "DOWNLOAD_FAILED",
] as const satisfies readonly CompletionErrorCode[];

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/** `code: "SOME_CODE"` and `apiFailure("SOME_CODE")` literals in a source file. */
function emittedCodes(source: string): string[] {
  const found = new Set<string>();
  for (const [, code] of source.matchAll(/code: "([A-Z][A-Z_]+)"/g)) {
    found.add(code);
  }
  for (const [, code] of source.matchAll(/apiFailure\("([A-Z][A-Z_]+)"\)/g)) {
    found.add(code);
  }
  return [...found];
}

describe("every download refusal is bilingual and specific", () => {
  test("each code has its own Arabic and English wording", () => {
    const generic = apiFailure("INTERNAL_ERROR").message;
    for (const code of DOWNLOAD_FAILURE_CODES) {
      const { message } = apiFailure(code);
      expect(message.ar.trim().length, `${code} has no Arabic`).toBeGreaterThan(
        0,
      );
      expect(
        message.en.trim().length,
        `${code} has no English`,
      ).toBeGreaterThan(0);
      expect(message.ar, `${code} falls back to the generic message`).not.toBe(
        generic.ar,
      );
      expect(message.en, `${code} falls back to the generic message`).not.toBe(
        generic.en,
      );
    }
  });

  test("no two refusals read the same", () => {
    // Distinct wording is the whole point: "reload the snapshot" and "get the
    // chain approved" are different jobs for the bidder.
    const english = DOWNLOAD_FAILURE_CODES.map((c) => apiFailure(c).message.en);
    expect(new Set(english).size).toBe(DOWNLOAD_FAILURE_CODES.length);
  });

  test("the list covers every code the route and its validators emit", () => {
    // Anti-vacuous: without this, a new refusal added to the route or to
    // either snapshot validator would ship unregistered and the assertions
    // above would keep passing by never seeing it.
    const sources = [
      "src/app/api/proposals/[id]/download/route.ts",
      "src/lib/proposal-snapshot-persistence.ts",
      "src/lib/contract-render-snapshot.ts",
    ];
    const covered = new Set<string>(DOWNLOAD_FAILURE_CODES);
    const uncovered = sources.flatMap((path) =>
      emittedCodes(read(path))
        .filter((code) => !covered.has(code))
        .map((code) => `${path}: ${code}`),
    );
    expect(
      uncovered,
      `register these and add them to DOWNLOAD_FAILURE_CODES:\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });

  test("the scan actually found codes to check", () => {
    // Guards the guard: a renamed file or a changed literal shape would make
    // `uncovered` empty for the wrong reason.
    const routeCodes = emittedCodes(
      read("src/app/api/proposals/[id]/download/route.ts"),
    );
    expect(routeCodes.length).toBeGreaterThan(5);
    expect(emittedCodes(read("src/lib/contract-render-snapshot.ts"))).toContain(
      "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH",
    );
  });
});
