import { TextDecoder } from "node:util";
import { canonicalJson } from "./canonical-json";

export const KEYSET_CURSOR_VERSION = 1 as const;
export const MAX_KEYSET_CURSOR_LENGTH = 4096;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/u;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const RESOURCE_RE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const MAX_CURSOR_FIELDS = 16;
const MAX_CURSOR_STRING_LENGTH = 1024;

export type CursorScalar = string | number | boolean | null;
export type CursorRecord = Readonly<Record<string, CursorScalar>>;

export interface CursorSchema<T extends object> {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error?: unknown };
}

export type KeysetCursorPayload<
  Scope extends object,
  Sort extends object,
> = Readonly<{
  resource: string;
  scope: Scope;
  sort: Sort;
}>;

export interface DecodeKeysetCursorOptions<
  Scope extends object,
  Sort extends object,
> {
  readonly resource: string;
  readonly scope: Scope;
  readonly scopeSchema: CursorSchema<Scope>;
  readonly sortSchema: CursorSchema<Sort>;
  readonly maxLength?: number;
}

export type KeysetCursorFailure =
  | "MALFORMED"
  | "UNSUPPORTED_VERSION"
  | "RESOURCE_MISMATCH"
  | "SCOPE_MISMATCH"
  | "SCHEMA_MISMATCH";

export class KeysetCursorError extends Error {
  readonly code = "INVALID_KEYSET_CURSOR" as const;

  constructor(public readonly reason: KeysetCursorFailure) {
    super("The keyset cursor is invalid for this resource.");
    this.name = "KeysetCursorError";
  }
}

export function encodeKeysetCursor<
  Scope extends object,
  Sort extends object,
>(payload: KeysetCursorPayload<Scope, Sort>): string {
  const resource = validateResource(payload.resource);
  const scope = validateCursorRecord(payload.scope, "scope");
  const sort = validateCursorRecord(payload.sort, "sort");
  const serialized = canonicalJson({
    v: KEYSET_CURSOR_VERSION,
    resource,
    scope,
    sort,
  });
  const encoded = Buffer.from(serialized, "utf8").toString("base64url");
  if (encoded.length > MAX_KEYSET_CURSOR_LENGTH) {
    throw new KeysetCursorError("MALFORMED");
  }
  return encoded;
}

export function decodeKeysetCursor<
  Scope extends object,
  Sort extends object,
>(
  cursor: string,
  options: DecodeKeysetCursorOptions<Scope, Sort>
): Readonly<{ scope: Scope; sort: Sort }> {
  const maxLength = options.maxLength ?? MAX_KEYSET_CURSOR_LENGTH;
  if (
    !Number.isSafeInteger(maxLength) ||
    maxLength < 1 ||
    maxLength > MAX_KEYSET_CURSOR_LENGTH ||
    cursor.length < 1 ||
    cursor.length > maxLength ||
    !BASE64URL_RE.test(cursor)
  ) {
    throw new KeysetCursorError("MALFORMED");
  }

  const envelope = decodeEnvelope(cursor);
  if (envelope.v !== KEYSET_CURSOR_VERSION) {
    throw new KeysetCursorError("UNSUPPORTED_VERSION");
  }
  const resource = validateResource(options.resource);
  if (envelope.resource !== resource) {
    throw new KeysetCursorError("RESOURCE_MISMATCH");
  }

  const decodedScope = parseStrictSchema(
    options.scopeSchema,
    envelope.scope,
    "scope"
  );
  const expectedScope = parseStrictSchema(
    options.scopeSchema,
    options.scope,
    "scope"
  );
  if (canonicalJson(decodedScope) !== canonicalJson(expectedScope)) {
    throw new KeysetCursorError("SCOPE_MISMATCH");
  }
  const sort = parseStrictSchema(options.sortSchema, envelope.sort, "sort");
  return Object.freeze({ scope: decodedScope, sort });
}

export function createKeysetCursorCodec<
  Scope extends object,
  Sort extends object,
>(config: {
  readonly resource: string;
  readonly scopeSchema: CursorSchema<Scope>;
  readonly sortSchema: CursorSchema<Sort>;
  readonly maxLength?: number;
}): Readonly<{
  encode(payload: Readonly<{ scope: Scope; sort: Sort }>): string;
  decode(cursor: string, expectedScope: Scope): Readonly<{
    scope: Scope;
    sort: Sort;
  }>;
}> {
  const resource = validateResource(config.resource);
  return Object.freeze({
    encode: ({ scope, sort }) =>
      encodeKeysetCursor({
        resource,
        scope: parseStrictSchema(config.scopeSchema, scope, "scope"),
        sort: parseStrictSchema(config.sortSchema, sort, "sort"),
      }),
    decode: (cursor, expectedScope) =>
      decodeKeysetCursor(cursor, {
        resource,
        scope: expectedScope,
        scopeSchema: config.scopeSchema,
        sortSchema: config.sortSchema,
        maxLength: config.maxLength,
      }),
  });
}

function decodeEnvelope(cursor: string): {
  readonly v: unknown;
  readonly resource: unknown;
  readonly scope: unknown;
  readonly sort: unknown;
} {
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) {
      throw new KeysetCursorError("MALFORMED");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (!isPlainRecord(parsed)) throw new KeysetCursorError("MALFORMED");
    assertExactKeys(parsed, ["resource", "scope", "sort", "v"], "MALFORMED");
    if (typeof parsed.resource !== "string") {
      throw new KeysetCursorError("MALFORMED");
    }
    return {
      v: parsed.v,
      resource: parsed.resource,
      scope: parsed.scope,
      sort: parsed.sort,
    };
  } catch (error) {
    if (error instanceof KeysetCursorError) throw error;
    throw new KeysetCursorError("MALFORMED");
  }
}

function parseStrictSchema<T extends object>(
  schema: CursorSchema<T>,
  value: unknown,
  label: "scope" | "sort"
): T {
  if (!isPlainRecord(value)) {
    throw new KeysetCursorError("SCHEMA_MISMATCH");
  }
  const result = schema.safeParse(value);
  if (!result.success || !isPlainRecord(result.data)) {
    throw new KeysetCursorError("SCHEMA_MISMATCH");
  }
  assertExactKeys(
    value,
    Object.keys(result.data),
    "SCHEMA_MISMATCH"
  );
  validateCursorRecord(result.data, label);
  return result.data;
}

function validateCursorRecord(
  value: object,
  label: "scope" | "sort"
): CursorRecord {
  if (!isPlainRecord(value)) {
    throw new KeysetCursorError("SCHEMA_MISMATCH");
  }
  const keys = Object.keys(value);
  if (keys.length < 1 || keys.length > MAX_CURSOR_FIELDS) {
    throw new KeysetCursorError("SCHEMA_MISMATCH");
  }
  const result: Record<string, CursorScalar> = {};
  for (const key of keys) {
    if (!KEY_RE.test(key)) {
      throw new KeysetCursorError("SCHEMA_MISMATCH");
    }
    const field = value[key];
    if (
      field !== null &&
      typeof field !== "string" &&
      typeof field !== "number" &&
      typeof field !== "boolean"
    ) {
      throw new KeysetCursorError("SCHEMA_MISMATCH");
    }
    if (typeof field === "number" && !Number.isFinite(field)) {
      throw new KeysetCursorError("SCHEMA_MISMATCH");
    }
    if (
      typeof field === "string" &&
      (field.length < 1 || field.length > MAX_CURSOR_STRING_LENGTH)
    ) {
      throw new KeysetCursorError("SCHEMA_MISMATCH");
    }
    result[key] = field;
  }
  if (label === "scope" && keys.every((key) => result[key] === null)) {
    throw new KeysetCursorError("SCHEMA_MISMATCH");
  }
  return Object.freeze(result);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  reason: KeysetCursorFailure
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new KeysetCursorError(reason);
  }
}

function validateResource(value: string): string {
  if (!RESOURCE_RE.test(value)) {
    throw new TypeError("Keyset cursor resource is invalid.");
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
