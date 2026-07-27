import { createHash } from "node:crypto";

/** Canonical JSON keeps array order while sorting every plain-object key. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

/** SHA-256 over canonical UTF-8 JSON, encoded for persisted integrity fields. */
export function canonicalJsonHash(value: unknown): `sha256:${string}` {
  const canonical = canonicalJson(value);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** SHA-256 for already-serialized text or bytes. */
export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical content cannot contain non-finite numbers.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical content cannot contain circular references.");
    }
    ancestors.add(value);
    const result = `[${value
      .map((item) => canonicalize(item, ancestors))
      .join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `Canonical content cannot contain values of type ${typeof value}.`
    );
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical content must contain plain objects only.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical content cannot contain circular references.");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Canonical content cannot contain symbol keys.");
  }

  ancestors.add(value);
  const entries: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      throw new TypeError("Canonical content cannot contain accessors.");
    }
    entries.push(
      `${JSON.stringify(key)}:${canonicalize(descriptor.value, ancestors)}`
    );
  }
  ancestors.delete(value);
  return `{${entries.join(",")}}`;
}
