/**
 * Guard test: a client must never construct an Error from a parsed failure body.
 *
 * Every route built on `api-controller.ts` returns `error` as a bilingual
 * `{ ar, en }` object (see `apiFailure`, api-failure.ts). Fifty-five client
 * call sites did `throw new Error(body.error ?? "Failed")`, and `new Error`
 * stringifies an object — so the toast a user actually saw on a wrong password,
 * an oversized avatar, or a failed proposal save was the literal text
 * "[object Object]".
 *
 * `selectApiFailureMessage` already reads the bilingual shape correctly; the
 * call sites simply were not using it. `apiErrorText` is the one-argument form
 * that always yields displayable text.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { apiFailure } from "@/lib/api-failure";
import { apiErrorText } from "@/lib/api-failure-message";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("the regression this guards", () => {
  test("a real failure body stringifies to [object Object] via new Error", () => {
    const body = apiFailure("RESOURCE_NOT_FOUND");
    expect(new Error(body.error as unknown as string).message).toBe(
      "[object Object]"
    );
  });
});

describe("apiErrorText", () => {
  test("reads the locale-appropriate text from a real failure body", () => {
    const body = apiFailure("RESOURCE_NOT_FOUND");
    expect(apiErrorText(body, "en")).toBe(body.message.en);
    expect(apiErrorText(body, "ar")).toBe(body.message.ar);
  });

  test("never returns an object stringification", () => {
    const body = apiFailure("RESOURCE_NOT_FOUND");
    expect(apiErrorText(body, "en")).not.toBe("[object Object]");
  });

  test("reads a legacy plain-string error body", () => {
    expect(apiErrorText({ error: "rate_limited" }, "en")).toBe("rate_limited");
  });

  test("falls back bilingually when the body carries no message", () => {
    expect(apiErrorText({}, "en")).toBe("Request failed");
    expect(apiErrorText({}, "ar")).toBe("تعذر إكمال الطلب");
  });

  test("falls back for a body that is not an object at all", () => {
    expect(apiErrorText(undefined, "en")).toBe("Request failed");
    expect(apiErrorText(null, "ar")).toBe("تعذر إكمال الطلب");
  });

  test("prefers a caller fallback over the generic one", () => {
    expect(apiErrorText({}, "en", "PDF failed (502)")).toBe("PDF failed (502)");
  });

  test("ignores the caller fallback when the body has a message", () => {
    const body = apiFailure("RESOURCE_NOT_FOUND");
    expect(apiErrorText(body, "en", "PDF failed (502)")).toBe(body.message.en);
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `new Error(body.error ...)` / `new Error(payload?.message ...)`. */
const RAW_BODY_THROW = /new Error\(\s*[a-zA-Z_$][\w$]*\??\.(error|message)\b/g;

/**
 * The same object reaching a string slot by another route: `body.error ||
 * "Failed"`, `err.error ?? fallback`.
 *
 * Receivers are restricted to names used for a parsed response body, since a
 * nested `.error` elsewhere can be a genuine string — `exportBlocker.error`
 * (contract-review.ts:41) is one. `.message` takes the narrower receiver list
 * because `err.message` overwhelmingly means a caught `Error`, whose message
 * is already a string.
 */
const RAW_BODY_FALLBACK = [
  /\b(body|json|payload|data|err|response)\??\.error\s*(\?\?|\|\|)/g,
  /\b(body|json|payload|response)\??\.message\s*(\?\?|\|\|)/g,
  // Reading the field straight off the parse or an inline cast — the shape that
  // hid the bug in the onboarding wizard, where the receiver has no name for
  // the patterns above to match. `as Error).message` is a caught Error, whose
  // message is already a string.
  /(?<!as Error)\)\s*\.(error|message)\b/g,
];

describe("no client treats a parsed failure body as a string", () => {
  const files = [
    ...sourceFiles(join(REPO_ROOT, "src", "components")),
    ...sourceFiles(join(REPO_ROOT, "src", "hooks")),
  ];

  test("the scan covers the client tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  const scan = (patterns: readonly RegExp[]) =>
    files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return patterns.flatMap((pattern) =>
        (source.match(pattern) ?? []).map(
          (hit) => `${file.slice(REPO_ROOT.length + 1)}: ${hit}`
        )
      );
    });

  test("no call site stringifies a bilingual failure object", () => {
    expect(scan([RAW_BODY_THROW])).toEqual([]);
  });

  test("no call site uses a failure body as a string fallback", () => {
    expect(scan(RAW_BODY_FALLBACK)).toEqual([]);
  });
});
