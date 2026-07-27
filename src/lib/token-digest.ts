import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";
import { systemUtcClock, utcNow, type UtcClock } from "./time";

export const CURRENT_TOKEN_DIGEST_VERSION = 1 as const;
export const LEGACY_TOKEN_DIGEST_VERSION = 0 as const;
export const MAX_RAW_TOKEN_LENGTH = 512;
export const MAX_LEGACY_TOKEN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_PREFIX = "ac";
const TOKEN_VERSION_SEGMENT = "v1";
const DEFAULT_SECRET_BYTES = 32;
const DEFAULT_SALT_BYTES = 32;
const MIN_RANDOM_BYTES = 16;
const MAX_RANDOM_BYTES = 64;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/u;

export interface CryptographicRandomSource {
  randomBytes(length: number): Uint8Array;
}

export const nodeCryptographicRandomSource: CryptographicRandomSource =
  Object.freeze({
    randomBytes: (length) => nodeRandomBytes(length),
  });

export type IssuedTokenDigest = Readonly<{
  rawToken: string;
  tokenHash: string;
  hashSalt: string;
  hashVersion: typeof CURRENT_TOKEN_DIGEST_VERSION;
}>;

export type StoredTokenDigest = Readonly<{
  tokenHash: string;
  hashSalt?: string | null;
  hashVersion?: number | null;
  createdAt?: Date;
  expiresAt?: Date;
}>;

export type TokenDigestLookup =
  | Readonly<{
      kind: "versioned";
      tokenHash: string;
      hashSalt: string;
      hashVersion: typeof CURRENT_TOKEN_DIGEST_VERSION;
    }>
  | Readonly<{
      kind: "legacy";
      tokenHash: string;
      hashSalt: null;
      hashVersion: typeof LEGACY_TOKEN_DIGEST_VERSION;
    }>;

export interface LegacyTokenReadPolicy {
  /** The original maximum lifetime for this token class. Never above seven days. */
  readonly maxAgeMs: number;
  /** Optional rollout sunset; both verification and record expiry must precede it. */
  readonly readUntil?: Date;
}

export interface VerifyTokenDigestOptions {
  readonly clock?: UtcClock;
  readonly legacy?: LegacyTokenReadPolicy;
}

export function createTokenDigest(options: {
  readonly randomness?: CryptographicRandomSource;
  readonly secretBytes?: number;
  readonly saltBytes?: number;
} = {}): IssuedTokenDigest {
  const randomness = options.randomness ?? nodeCryptographicRandomSource;
  const secretBytes = validateRandomLength(
    options.secretBytes ?? DEFAULT_SECRET_BYTES,
    "token secret"
  );
  const saltBytes = validateRandomLength(
    options.saltBytes ?? DEFAULT_SALT_BYTES,
    "token salt"
  );
  const salt = readRandomBytes(randomness, saltBytes, "token salt");
  const secret = readRandomBytes(randomness, secretBytes, "token secret");
  const hashSalt = salt.toString("base64url");
  const rawToken = [
    TOKEN_PREFIX,
    TOKEN_VERSION_SEGMENT,
    hashSalt,
    secret.toString("base64url"),
  ].join(".");

  return Object.freeze({
    rawToken,
    tokenHash: digestVersionOne(secret, salt),
    hashSalt,
    hashVersion: CURRENT_TOKEN_DIGEST_VERSION,
  });
}

/** Alias emphasizing that issuance returns persistence metadata plus the raw token. */
export const issueTokenDigest = createTokenDigest;

/**
 * Derive the indexed digest candidate without reading persistence. Unknown or
 * malformed versioned tokens are rejected rather than downgraded to legacy.
 */
export function getTokenDigestLookup(
  rawToken: string
): TokenDigestLookup | null {
  if (!isBoundedRawToken(rawToken)) return null;
  const parsed = parseVersionOneToken(rawToken);
  if (parsed) {
    return Object.freeze({
      kind: "versioned" as const,
      tokenHash: digestVersionOne(parsed.secret, parsed.salt),
      hashSalt: parsed.hashSalt,
      hashVersion: CURRENT_TOKEN_DIGEST_VERSION,
    });
  }
  if (rawToken.startsWith(`${TOKEN_PREFIX}.`)) return null;
  return Object.freeze({
    kind: "legacy" as const,
    tokenHash: hashLegacyToken(rawToken),
    hashSalt: null,
    hashVersion: LEGACY_TOKEN_DIGEST_VERSION,
  });
}

export function verifyTokenDigest(
  rawToken: string,
  stored: StoredTokenDigest,
  options: VerifyTokenDigestOptions = {}
): boolean {
  const lookup = getTokenDigestLookup(rawToken);
  if (!lookup || typeof stored.tokenHash !== "string") return false;

  const now = utcNow(options.clock ?? systemUtcClock);
  if (stored.expiresAt) {
    const expiresAt = stored.expiresAt.getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  }

  if (lookup.kind === "versioned") {
    if (
      stored.hashVersion !== CURRENT_TOKEN_DIGEST_VERSION ||
      typeof stored.hashSalt !== "string"
    ) {
      return false;
    }
    return (
      constantTimeTextEqual(lookup.hashSalt, stored.hashSalt) &&
      constantTimeTextEqual(lookup.tokenHash, stored.tokenHash)
    );
  }

  if (
    (stored.hashVersion ?? LEGACY_TOKEN_DIGEST_VERSION) !==
      LEGACY_TOKEN_DIGEST_VERSION ||
    (stored.hashSalt ?? null) !== null ||
    !legacyReadAllowed(stored, now, options.legacy)
  ) {
    return false;
  }
  return constantTimeTextEqual(lookup.tokenHash, stored.tokenHash);
}

export function hashLegacyToken(rawToken: string): string {
  if (!isBoundedRawToken(rawToken)) {
    throw new RangeError("Legacy token is empty or exceeds the supported length.");
  }
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function digestVersionOne(secret: Buffer, salt: Buffer): string {
  return createHmac("sha256", salt)
    .update("arabclue:token-digest:v1\0", "utf8")
    .update(secret)
    .digest("hex");
}

function parseVersionOneToken(rawToken: string): {
  readonly hashSalt: string;
  readonly salt: Buffer;
  readonly secret: Buffer;
} | null {
  const segments = rawToken.split(".");
  if (
    segments.length !== 4 ||
    segments[0] !== TOKEN_PREFIX ||
    segments[1] !== TOKEN_VERSION_SEGMENT
  ) {
    return null;
  }
  const salt = decodeBase64Url(segments[2]);
  const secret = decodeBase64Url(segments[3]);
  if (
    !salt ||
    !secret ||
    salt.length < MIN_RANDOM_BYTES ||
    salt.length > MAX_RANDOM_BYTES ||
    secret.length < MIN_RANDOM_BYTES ||
    secret.length > MAX_RANDOM_BYTES
  ) {
    return null;
  }
  return { hashSalt: segments[2], salt, secret };
}

function decodeBase64Url(value: string): Buffer | null {
  if (!BASE64URL_RE.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function legacyReadAllowed(
  stored: StoredTokenDigest,
  now: Date,
  policy: LegacyTokenReadPolicy | undefined
): boolean {
  if (!policy || !stored.createdAt || !stored.expiresAt) return false;
  if (
    !Number.isSafeInteger(policy.maxAgeMs) ||
    policy.maxAgeMs < 1 ||
    policy.maxAgeMs > MAX_LEGACY_TOKEN_AGE_MS
  ) {
    return false;
  }
  const createdAt = stored.createdAt.getTime();
  const expiresAt = stored.expiresAt.getTime();
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    now.getTime() < createdAt ||
    expiresAt <= createdAt ||
    expiresAt - createdAt > policy.maxAgeMs ||
    now.getTime() >= expiresAt
  ) {
    return false;
  }
  if (policy.readUntil) {
    const readUntil = policy.readUntil.getTime();
    if (
      !Number.isFinite(readUntil) ||
      now.getTime() > readUntil ||
      expiresAt > readUntil
    ) {
      return false;
    }
  }
  return true;
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function readRandomBytes(
  randomness: CryptographicRandomSource,
  length: number,
  label: string
): Buffer {
  const value = randomness.randomBytes(length);
  if (!(value instanceof Uint8Array) || value.byteLength !== length) {
    throw new TypeError(`Cryptographic randomness returned an invalid ${label}.`);
  }
  return Buffer.from(value);
}

function validateRandomLength(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_RANDOM_BYTES ||
    value > MAX_RANDOM_BYTES
  ) {
    throw new RangeError(
      `${label} length must be between ${MIN_RANDOM_BYTES} and ${MAX_RANDOM_BYTES} bytes.`
    );
  }
  return value;
}

function isBoundedRawToken(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_RAW_TOKEN_LENGTH
  );
}
