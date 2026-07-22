/**
 * Password hashing via Node crypto scrypt (portable across Node/Bun).
 */

import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb);

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  if (hash.startsWith("$argon2id$demo$") || hash.includes("placeholder")) {
    return false;
  }
  if (hash.startsWith("scrypt$")) {
    const [, salt, hex] = hash.split("$");
    if (!salt || !hex) return false;
    const derived = (await scrypt(plain, salt, 64)) as Buffer;
    const expected = Buffer.from(hex, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }
  return false;
}

/**
 * Bootstrap admin password — ONLY from env. Never hardcode production secrets.
 * Local/dev: set BOOTSTRAP_ADMIN_PASSWORD in .env
 */
export function getBootstrapAdminPassword(): string | null {
  const pwd = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!pwd || pwd.length < 8) return null;
  return pwd;
}
