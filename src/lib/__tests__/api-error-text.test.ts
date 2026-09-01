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
import { apiErrorText, sdkErrorText } from "@/lib/api-failure-message";

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

function scanFiles(
  files: readonly string[],
  patterns: readonly RegExp[]
): string[] {
  return files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return patterns.flatMap((pattern) =>
      (source.match(pattern) ?? []).map(
        (hit) =>
          `${file.slice(REPO_ROOT.length + 1)}: ${hit.replace(/\s+/g, " ")}`
      )
    );
  });
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

/**
 * The guard form: `typeof payload.error === "string" ? payload.error : fallback`.
 *
 * Nothing above matches it — there is no `new Error(body.error)` and no `??`.
 * And it does not produce "[object Object]" either, which is why it survived the
 * sweep that found the other fifty-five: the bilingual object simply fails the
 * `typeof` test, the ternary takes the other branch, and the reader gets the
 * fallback. The server sent a translated sentence and the client threw it away.
 *
 * `ai-assist-actions.tsx` did this on all four AI actions, and the branch was
 * reachable: `checkAiRateLimit` answers with `jsonApiFailure` (ai-rate-limit.ts:41),
 * so a workspace over its LLM budget read the literal text "HTTP 429".
 *
 * Every pattern here scans raw file text, comments included, so a docblock that
 * quotes one of these shapes to explain a fix trips the ratchet it documents.
 * Describe the old form, do not spell it.
 */
const GUARDED_BODY_STRING =
  /typeof\s+[a-zA-Z_$][\w$]*\??\.(error|message)\s*===\s*"string"/g;

/**
 * The other half of the same bug, one layer up.
 *
 * Localizing what `postAiJson` throws achieves nothing if the component then
 * renders a constant instead. All four AI actions did exactly that —
 * `error={mutation.isError ? tr("ai_assist_failed", locale) : null}` — so the
 * reader got "AI assist failed" whether they were over quota, unauthenticated,
 * or had sent a document too long for the model. Three different fixes, one
 * message, and no way to tell which applied.
 *
 * Only the truthiness of the failure is read here, never its content, which is
 * why no test above catches it: the fetch layer can be perfectly correct and
 * the screen still says nothing.
 */
const CONSTANT_ERROR_RENDER = /error=\{[^}]*\bisError\b[^}]*\btr\(/g;

describe("no client treats a parsed failure body as a string", () => {
  const files = [
    ...sourceFiles(join(REPO_ROOT, "src", "components")),
    ...sourceFiles(join(REPO_ROOT, "src", "hooks")),
    // Pages are clients too, and this scan did not reach them until two live
    // defects were found sitting there — including one on the forced
    // password change, where the bilingual object landed in `useState<string
    // | null>` and rendered as a bare child, which React does not tolerate.
    //
    // `.tsx` only: `route.ts` shares this tree and is the server half, which
    // legitimately builds the very bodies these patterns hunt on receipt.
    ...sourceFiles(join(REPO_ROOT, "src", "app")).filter((file) =>
      file.endsWith(".tsx")
    ),
  ];

  test("the scan covers the client tree", () => {
    expect(files.length).toBeGreaterThan(50);
    // A scan scoped to a directory measures the directory, not the surface.
    expect(files.some((file) => file.includes(join("app", "login")))).toBe(
      true
    );
  });

  const scan = (patterns: readonly RegExp[]) => scanFiles(files, patterns);

  test("no call site stringifies a bilingual failure object", () => {
    expect(scan([RAW_BODY_THROW])).toEqual([]);
  });

  test("no call site uses a failure body as a string fallback", () => {
    expect(scan(RAW_BODY_FALLBACK)).toEqual([]);
  });

  test("no call site discards a bilingual body behind a typeof guard", () => {
    expect(scan([GUARDED_BODY_STRING])).toEqual([]);
  });

  test("the constant-render pattern matches the shape it was written for", () => {
    // Anti-vacuous. A pattern that matches nothing passes the scan below
    // forever, and reads exactly like the surface being clean.
    expect(
      'error={mutation.isError ? tr("ai_assist_failed", locale) : null}'.match(
        CONSTANT_ERROR_RENDER
      )
    ).not.toBeNull();
    // And it must not fire on the fix that replaced it.
    expect(
      "error={mutation.error ? mutation.error.message : null}".match(
        CONSTANT_ERROR_RENDER
      )
    ).toBeNull();
  });

  test("no component renders a constant in place of the failure message", () => {
    expect(scan([CONSTANT_ERROR_RENDER])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The agent surface                                                          */
/* -------------------------------------------------------------------------- */

describe("sdkErrorText", () => {
  test("localizes the failure body the AI SDK hides inside error.message", () => {
    const body = apiFailure("AI_RATE_LIMITED", { retryAfterSeconds: 30 });
    const thrown = new Error(JSON.stringify(body));
    expect(sdkErrorText(thrown, "ar")).toBe(body.message.ar);
    expect(sdkErrorText(thrown, "en")).toBe(body.message.en);
  });

  test("never shows the reader a raw JSON body", () => {
    const thrown = new Error(
      JSON.stringify(apiFailure("AUTHENTICATION_REQUIRED"))
    );
    expect(sdkErrorText(thrown, "en")).not.toContain("{");
    expect(sdkErrorText(thrown, "ar")).not.toContain("{");
  });

  test("falls back rather than surfacing a transport string", () => {
    // A dropped connection yields "Failed to fetch": untranslated, and
    // meaningless to a reader. `onError` keeps it in the console; the reader
    // gets a sentence.
    expect(sdkErrorText(new Error("Failed to fetch"), "en")).toBe(
      "Request failed"
    );
    expect(sdkErrorText(new Error("Failed to fetch"), "ar")).toBe(
      "تعذر إكمال الطلب"
    );
  });

  test("falls back for a value that is not an Error at all", () => {
    expect(sdkErrorText(undefined, "en", "Agent unavailable")).toBe(
      "Agent unavailable"
    );
  });
});

/**
 * The chat transport throws `new Error(await response.text())` on a non-OK
 * response (ai/dist/index.js:16385), and the console renders that text. So a
 * hand-rolled `Response.json({ error: "Unauthorized" })` in an agent route
 * reaches an Arabic reader as the literal string `{"error":"Unauthorized"}`.
 *
 * Every failure on this surface must therefore be built by the bilingual
 * mapper (`jsonApiFailure` / `jsonFailure`), never assembled inline.
 */
const HANDROLLED_FAILURE_BODY =
  /(?:Next)?Response\.json\(\s*\{[^}]*\berror\b\s*:/g;

describe("the agent surface returns only mapped bilingual failures", () => {
  const files = [
    ...sourceFiles(join(REPO_ROOT, "src", "app", "api", "platform-agent")),
    join(REPO_ROOT, "src", "lib", "ai-rate-limit.ts"),
  ];

  test("the scan covers the agent routes", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  test("no agent route hand-rolls a failure body", () => {
    expect(scanFiles(files, [HANDROLLED_FAILURE_BODY])).toEqual([]);
  });
});
