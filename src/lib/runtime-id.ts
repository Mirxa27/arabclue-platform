export type RandomUuid = () => string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function systemRandomUuid(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid !== "function") {
    throw new Error("Cryptographic UUID generation is unavailable.");
  }
  return randomUuid.call(globalThis.crypto);
}

/**
 * Generate a runtime identifier from cryptographic randomness.
 * Persistence-owned identifiers should continue to use their database defaults.
 */
export function createRuntimeId(
  prefix?: string,
  randomUuid: RandomUuid = systemRandomUuid
): string {
  if (prefix !== undefined && !PREFIX_RE.test(prefix)) {
    throw new TypeError("Runtime identifier prefix is invalid.");
  }
  const uuid = randomUuid();
  if (!UUID_RE.test(uuid)) {
    throw new TypeError("Runtime identifier source did not return a UUID.");
  }
  return prefix ? `${prefix}_${uuid}` : uuid;
}
