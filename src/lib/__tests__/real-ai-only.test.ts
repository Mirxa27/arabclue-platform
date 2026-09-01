/**
 * The flag that decides whether this product actually does AI work.
 *
 * `AUTONOMY_REAL_AI_ONLY` used to default to permissive, which meant a deploy
 * that forgot the variable served keyword/template output that is
 * indistinguishable from a model's answer — same shape, same fields, no marker
 * anywhere in the response saying which one the user got. Production had the
 * variable set, so nothing looked wrong; the next fresh environment would have
 * shipped fake AI silently.
 *
 * These tests pin the inverted default and the narrow opt-out that goes with
 * it. The asymmetry is the whole design: a wrong "strict" is a visible provider
 * error, a wrong "permissive" is a lie nobody can see.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isRealAiOnlyStrict } from "@/lib/real-ai-only";

const ORIGINAL = process.env.AUTONOMY_REAL_AI_ONLY;

function setFlag(value: string | undefined): void {
  if (value === undefined) delete process.env.AUTONOMY_REAL_AI_ONLY;
  else process.env.AUTONOMY_REAL_AI_ONLY = value;
}

beforeEach(() => setFlag(undefined));
afterEach(() => setFlag(ORIGINAL));

describe("isRealAiOnlyStrict", () => {
  test("strict when the flag is unset — a deploy that forgets it must not ship fake AI", () => {
    expect(isRealAiOnlyStrict()).toBe(true);
  });

  test("strict when the value is blank — a blanked variable is misconfiguration, not consent", () => {
    for (const value of ["", " ", "\t\n"]) {
      setFlag(value);
      expect(isRealAiOnlyStrict()).toBe(true);
    }
  });

  test("only an explicit refusal opts out", () => {
    for (const value of ["0", "false", "FALSE", "no", "off", "  Off  "]) {
      setFlag(value);
      expect(isRealAiOnlyStrict()).toBe(false);
    }
  });

  test("an unrecognised value stays strict rather than guessing", () => {
    for (const value of ["1", "true", "on", "yes", "maybe", "1;", "nope"]) {
      setFlag(value);
      expect(isRealAiOnlyStrict()).toBe(true);
    }
  });
});
