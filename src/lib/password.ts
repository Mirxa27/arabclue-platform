/**
 * Password hashing via Node crypto scrypt (portable across Node/Bun).
 *
 * Current hashes encode the cost parameters so a future bump can rehash on
 * login. Legacy `scrypt$salt$hash` rows (Node defaults, parameters omitted)
 * still verify and are flagged for upgrade.
 */

import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "crypto";

export const SCRYPT_N = 16_384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SCHEME = "scrypt";

export type ScryptParams = Readonly<{
  N: number;
  r: number;
  p: number;
  keylen: number;
}>;

export const CURRENT_SCRYPT_PARAMS: ScryptParams = Object.freeze({
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keylen: SCRYPT_KEYLEN,
});

type ParsedScryptHash =
  | Readonly<{ kind: "parameterized"; params: ScryptParams; salt: string; hex: string }>
  | Readonly<{ kind: "legacy"; params: ScryptParams; salt: string; hex: string }>;

function scryptAsync(
  plain: string,
  salt: string,
  params: ScryptParams
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      plain,
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      }
    );
  });
}

export function parseScryptHash(hash: string): ParsedScryptHash | null {
  if (!hash.startsWith(`${SCRYPT_SCHEME}$`)) return null;
  const parts = hash.split("$");
  if (parts.length === 3) {
    const [, salt, hex] = parts;
    if (!salt || !hex) return null;
    return {
      kind: "legacy",
      params: CURRENT_SCRYPT_PARAMS,
      salt,
      hex,
    };
  }
  if (parts.length === 7) {
    const [, nRaw, rRaw, pRaw, keylenRaw, salt, hex] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    const keylen = Number(keylenRaw);
    if (!salt || !hex) return null;
    if (![N, r, p, keylen].every((n) => Number.isSafeInteger(n) && n > 0)) {
      return null;
    }
    return { kind: "parameterized", params: { N, r, p, keylen }, salt, hex };
  }
  return null;
}

export function passwordNeedsRehash(hash: string): boolean {
  const parsed = parseScryptHash(hash);
  if (!parsed) return false;
  if (parsed.kind === "legacy") return true;
  const { params } = parsed;
  return (
    params.N !== CURRENT_SCRYPT_PARAMS.N ||
    params.r !== CURRENT_SCRYPT_PARAMS.r ||
    params.p !== CURRENT_SCRYPT_PARAMS.p ||
    params.keylen !== CURRENT_SCRYPT_PARAMS.keylen
  );
}

function encodeScryptHash(salt: string, hex: string, params: ScryptParams): string {
  return [
    SCRYPT_SCHEME,
    params.N,
    params.r,
    params.p,
    params.keylen,
    salt,
    hex,
  ].join("$");
}

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 10) {
    throw new Error("Password must be at least 10 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(plain, salt, CURRENT_SCRYPT_PARAMS);
  return encodeScryptHash(salt, derived.toString("hex"), CURRENT_SCRYPT_PARAMS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  if (hash.startsWith("$argon2id$demo$") || hash.includes("placeholder")) {
    return false;
  }
  const parsed = parseScryptHash(hash);
  if (!parsed) return false;
  const derived = await scryptAsync(plain, parsed.salt, parsed.params);
  const expected = Buffer.from(parsed.hex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Bootstrap admin password — ONLY from env. Never hardcode production secrets.
 * Local/dev: set BOOTSTRAP_ADMIN_PASSWORD in .env
 */
export function getBootstrapAdminPassword(): string | null {
  const pwd = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!pwd || pwd.length < 10) return null;
  return pwd;
}
