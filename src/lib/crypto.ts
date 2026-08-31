import crypto from "crypto";

// AES-256-GCM encryption for EnvSetting values.
// Master key MUST come from ARABCLUE_ENC_KEY (provision via vault/KMS in production).

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getMasterKey(): Buffer {
  const raw = process.env.ARABCLUE_ENC_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ARABCLUE_ENC_KEY is required in production");
    }
    // Dev-only ephemeral fallback — never use in production
    console.warn(
      "[crypto] ARABCLUE_ENC_KEY missing — using insecure dev fallback. Set ARABCLUE_ENC_KEY in .env"
    );
    return crypto.createHash("sha256").update("arabclue-insecure-dev-only").digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptValue(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), enc.toString("base64")].join(":");
}

/** A stored ciphertext could not be opened with the current master key. */
export class SecretDecryptionError extends Error {
  constructor() {
    super("Stored secret could not be decrypted with the current master key");
    this.name = "SecretDecryptionError";
  }
}

function openSealed(ciphertext: string): string {
  const parts = ciphertext.split(":");
  // AES-GCM of "" is zero bytes, so a legitimately sealed empty value ends in
  // an empty payload segment. Requiring one made every never-set row — the
  // whole seeded catalog — look like a row sealed by a superseded master key.
  // The authentication tag below is what actually separates the two.
  if (parts.length !== 3) throw new SecretDecryptionError();
  const [ivB64, authTagB64, dataB64] = parts;
  if (!ivB64 || !authTagB64) throw new SecretDecryptionError();
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    // Node reports a failed authentication tag as a generic state error. The
    // only actionable reading is that this key cannot open this row.
    throw new SecretDecryptionError();
  }
}

/**
 * Whether the current master key can open this ciphertext. Reveals nothing
 * about the value, so it is safe to run across stored rows for diagnostics.
 */
export function canOpenSealed(ciphertext: string): boolean {
  try {
    openSealed(ciphertext);
    return true;
  } catch {
    return false;
  }
}

export function decryptValue(ciphertext: string): string {
  try {
    return openSealed(ciphertext);
  } catch {
    // Callers read "" as "not configured" and degrade, so a wrong master key
    // looks exactly like a blank settings table — every provider key, payment
    // credential, and MFA secret at once. Say it here or nobody ever learns.
    if (ciphertext) {
      console.warn(
        "[crypto] a stored secret could not be decrypted — verify ARABCLUE_ENC_KEY matches the key that sealed it"
      );
    }
    return "";
  }
}

/**
 * Fixed-width mask revealing only the last four characters.
 *
 * The width is constant on purpose: a mask that grew with the value published
 * the credential's exact length, which fingerprints the key type, and the old
 * leading two characters published the format prefix, which names the provider
 * and often the account. The tail is kept because the masked view exists so an
 * operator can tell the key they just pasted from the one it replaced.
 */
export function maskSecret(value: string): string {
  // Four of eight characters is half the secret, so a short value keeps nothing.
  if (value.length <= 8) return "••••••••••••";
  return `••••••••${value.slice(-4)}`;
}

/**
 * Re-seal a stored value under a fresh IV.
 *
 * Reads strictly: re-encrypting a failed read would persist the encryption of
 * an empty string over the real credential, which is unrecoverable.
 */
export function rotateEncryption(ciphertext: string): string {
  return encryptValue(openSealed(ciphertext));
}

/** Fail fast at boot when required secrets missing in production */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!process.env.NEXTAUTH_SECRET?.trim()) missing.push("NEXTAUTH_SECRET");
  if (!process.env.ARABCLUE_ENC_KEY?.trim()) missing.push("ARABCLUE_ENC_KEY");
  if (missing.length) {
    throw new Error(`Missing required production secrets: ${missing.join(", ")}`);
  }
}
