import { describe, expect, test } from "bun:test";
import {
  assertProjectHasDocuments,
  NO_DOCUMENTS_PREFLIGHT,
} from "../agents/run-preflight";

describe("assertProjectHasDocuments", () => {
  test("allows runs when at least one document exists", () => {
    expect(assertProjectHasDocuments(1)).toEqual({ ok: true });
    expect(assertProjectHasDocuments(12)).toEqual({ ok: true });
  });

  test("blocks runs when document count is zero", () => {
    expect(assertProjectHasDocuments(0)).toEqual({
      ok: false,
      code: NO_DOCUMENTS_PREFLIGHT.code,
      error: NO_DOCUMENTS_PREFLIGHT.error,
    });
  });

  test("blocks invalid counts", () => {
    expect(assertProjectHasDocuments(-1).ok).toBe(false);
    expect(assertProjectHasDocuments(Number.NaN).ok).toBe(false);
    expect(assertProjectHasDocuments(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});
