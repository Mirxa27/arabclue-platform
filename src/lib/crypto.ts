import crypto from "crypto";

// AES-256-GCM encryption for EnvSetting values.
// The master key is derived from ARABCLUE_ENC_KEY (or a dev fallback).
// In production, this key MUST be provisioned via a KMS / vault (e.g. STC Cloud KMS).

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit IV recommended for GCM

function getMasterKey(): Buffer {
  const raw = process.env.ARABCLUE_ENC_KEY || "arabclue-dev-encryption-key-change-in-prod-32b";
  // Derive a 32-byte key via SHA-256 so any-length passphrase works
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptValue(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // format: iv:authTag:ciphertext (all base64)
  return [iv.toString("base64"), authTag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptValue(ciphertext: string): string {
  try {
    const [ivB64, authTagB64, dataB64] = ciphertext.split(":");
    if (!ivB64 || !authTagB64 || !dataB64) return "";
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

// Mask a secret for UI display — shows first 2 and last 2 chars only
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.max(8, value.length - 4))}${value.slice(-2)}`;
}

// Generate a rotation: re-encrypt with fresh IV (used when lastRotatedAt updates)
export function rotateEncryption(ciphertext: string): string {
  return encryptValue(decryptValue(ciphertext));
}
