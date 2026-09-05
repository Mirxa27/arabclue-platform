/**
 * The one tolerant reader for model JSON. What it must accept: the wrappings
 * models put around an otherwise valid object. What it must refuse: anything
 * that would have to be guessed at — a truncated object, a top-level array,
 * an object that does not fit the caller's schema. The refusal shape is what
 * every generator hands to `guardOrThrow`, so it is pinned here too.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  extractJsonObject,
  parseJsonWithSchema,
  repairJsonCandidate,
  schemaRejection,
  stripCodeFences,
} from "../../ai/json-output";

describe("extractJsonObject", () => {
  test("reads a plain object", () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  test("reads an object inside a code fence, with or without a language tag", () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('```\n{"a": "b"}\n```')).toEqual({ a: "b" });
  });

  test("reads an object wrapped in prose before and after", () => {
    const text =
      'Sure — here is the analysis you asked for:\n{"findings": [{"controlId": "ECC-1.1"}]}\nLet me know if you need more.';
    expect(extractJsonObject(text)).toEqual({ findings: [{ controlId: "ECC-1.1" }] });
  });

  test("repairs trailing commas before a closing brace or bracket", () => {
    expect(extractJsonObject('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({
      a: [1, 2],
      b: { c: 3 },
    });
  });

  test("repairs a raw newline inside a string literal", () => {
    expect(extractJsonObject('{"text": "line one\nline two"}')).toEqual({
      text: "line one\nline two",
    });
  });

  test("leaves commas and braces inside strings alone", () => {
    const object = extractJsonObject('{"quote": "a, ]", "brace": "}", "list": [1, "x}"]}');
    expect(object).toEqual({ quote: "a, ]", brace: "}", list: [1, "x}"] });
  });

  test("skips a brace in prose and finds the real object after it", () => {
    expect(extractJsonObject('Some prose { not json } then {"ok": true}')).toEqual({ ok: true });
  });

  test("refuses a truncated object rather than salvaging a prefix of it", () => {
    expect(extractJsonObject('{"findings": [{"controlId": "ECC-1.1", "status": "PA')).toBeNull();
    expect(extractJsonObject('```json\n{"a": [1, 2')).toBeNull();
  });

  test("refuses a top-level array, an empty answer, and prose with no object", () => {
    expect(extractJsonObject("[1, 2, 3]")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("I cannot produce that.")).toBeNull();
    expect(extractJsonObject('"just a string"')).toBeNull();
  });

  test("Arabic content survives intact", () => {
    const object = extractJsonObject('```json\n{"evidenceAr": "تُطبَّق غرامة التأخير 2% أسبوعياً"}\n```');
    expect(object).toEqual({ evidenceAr: "تُطبَّق غرامة التأخير 2% أسبوعياً" });
  });
});

describe("stripCodeFences", () => {
  test("keeps the fenced bodies and drops the surrounding prose", () => {
    expect(stripCodeFences('Here:\n```json\n{"a":1}\n```\nDone.')).toBe('{"a":1}');
  });

  test("an unterminated fence is opened and the rest kept", () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  test("text without fences is only trimmed", () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe("repairJsonCandidate", () => {
  test("is a no-op on valid JSON", () => {
    const valid = '{"a": [1, 2], "b": "x, y", "c": {"d": null}}';
    expect(repairJsonCandidate(valid)).toBe(valid);
  });

  test("escapes raw control characters only inside strings", () => {
    expect(repairJsonCandidate('{"a": "x\ty",\n"b": 1}')).toBe('{"a": "x\\ty",\n"b": 1}');
  });
});

describe("parseJsonWithSchema", () => {
  const schema = z.object({
    findings: z.array(z.object({ controlId: z.string(), status: z.enum(["PASS", "FAIL"]) })),
  });

  test("returns the typed data when the object fits", () => {
    const result = parseJsonWithSchema(
      '```json\n{"findings": [{"controlId": "ECC-1.1", "status": "PASS"}]}\n```',
      schema
    );
    expect(result).toEqual({
      ok: true,
      data: { findings: [{ controlId: "ECC-1.1", status: "PASS" }] },
    });
  });

  test("names the failing path when the shape is wrong", () => {
    const result = parseJsonWithSchema('{"findings": "not-an-array"}', schema);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/^findings: /);
  });

  test("names the element and field when one item is off", () => {
    const result = parseJsonWithSchema(
      '{"findings": [{"controlId": "ECC-1.1", "status": "MAYBE"}]}',
      schema
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues[0]).toMatch(/^findings\.0\.status: /);
  });

  test("reports no_json_object when nothing parseable was found", () => {
    expect(parseJsonWithSchema("no json here", schema)).toEqual({
      ok: false,
      issues: ["no_json_object"],
    });
  });

  test("a partial object is never accepted as a whole one", () => {
    // The old parsers turned this into a finding with empty strings.
    const result = parseJsonWithSchema('{"findings": [{"controlId": "ECC-1.1"}]}', schema);
    expect(result.ok).toBe(false);
  });
});

describe("schemaRejection", () => {
  test("is shaped like the LLM layer's own guardrail rejection", () => {
    const rejected = schemaRejection({ provider: "openai" }, ["findings: expected array"]);
    expect(rejected.fallback).toBe(true);
    expect(rejected.failureKind).toBe("guardrail_rejected");
    expect(rejected.provider).toBe("openai");
    expect(rejected.guardrailReasons).toEqual(["schema_mismatch", "findings: expected array"]);
    expect(rejected.failureDetail).toContain("findings: expected array");
  });
});
