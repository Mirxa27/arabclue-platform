import { randomBytes } from "node:crypto";
import {
  hashLegacyToken,
  nodeCryptographicRandomSource,
  type CryptographicRandomSource,
} from "./token-digest";
import {
  createRuntimeId,
  systemRandomUuid,
  type RandomUuid,
} from "./runtime-id";

/** Legacy raw-token generator retained for rollout compatibility. */
export function generateRawToken(
  bytes = 32,
  randomness: CryptographicRandomSource = nodeCryptographicRandomSource
): string {
  if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new RangeError("Token length must be between 16 and 64 bytes.");
  }
  const value = randomness.randomBytes(bytes);
  if (!(value instanceof Uint8Array) || value.byteLength !== bytes) {
    throw new TypeError("Cryptographic randomness returned invalid token bytes.");
  }
  return Buffer.from(value).toString("hex");
}

/** @deprecated New token records must use createTokenDigest from token-digest.ts. */
export function hashToken(raw: string): string {
  return hashLegacyToken(raw);
}

export function slugify(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const replaced = trimmed
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-+/g, "-");
  const ascii = replaced
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.length >= 2 ? ascii : "ws";
}

export function randomSuffix(
  len = 8,
  randomness: CryptographicRandomSource = {
    randomBytes: (length) => randomBytes(length),
  }
): string {
  if (!Number.isSafeInteger(len) || len < 1 || len > 64) {
    throw new RangeError("Random suffix length must be between 1 and 64.");
  }
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const buf = randomness.randomBytes(len);
  if (!(buf instanceof Uint8Array) || buf.byteLength !== len) {
    throw new TypeError("Cryptographic randomness returned invalid suffix bytes.");
  }
  let suffix = "";
  for (let index = 0; index < len; index++) {
    suffix += chars[buf[index] % chars.length];
  }
  return suffix;
}

export function buildWorkspaceSlug(
  workspaceName: string,
  randomUuid: RandomUuid = systemRandomUuid
): string {
  return `${slugify(workspaceName)}-${createRuntimeId(undefined, randomUuid)}`;
}

export function getAppBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return fromEnv.replace(/\/$/, "");
}
